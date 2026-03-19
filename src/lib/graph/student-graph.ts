/**
 * WHY: In-memory knowledge graph for one student session.
 *
 * The orchestrator queries this graph on every decision turn to answer:
 *   "What does the student know? What's blocked? What should come next?"
 *
 * Design choices:
 * - Dual adjacency maps (adjacency + reverseAdjacency) so prerequisite lookup
 *   and dependent lookup are both O(degree) not O(edges).
 * - All query methods are synchronous and sub-millisecond — the orchestrator
 *   calls them inside tight LLM decision loops and cannot afford async overhead.
 * - `dirty` flag tracks whether any mutation has occurred since the last
 *   Supabase sync, allowing sync.ts to skip no-op writes.
 * - Static `fromState` factory is the only way to reconstruct the graph from a
 *   Supabase snapshot — keeps deserialization logic in one place.
 *
 * DEFAULT_MASTERY_THRESHOLD = 0.6 is the canonical cut-off for "mastered".
 * Fast mode uses 0.5, steady mode uses 0.7 (passed as arguments, not hardcoded).
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { ConceptNode, ConceptEdge } from '@/types/concepts';
import type { StudentGraphState } from '@/types/graph';
import {
  bfs,
  connectedComponents,
  shortestPath,
  topologicalSort,
  type AdjacencyMap,
} from './traversal';

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_MASTERY_THRESHOLD = 0.6;

// ── Progress shape ────────────────────────────────────────────────────────────

export interface GraphProgress {
  total: number;
  mastered: number;
  inProgress: number;
  notStarted: number;
  averageConfidence: number;
}

// ── StudentGraph ──────────────────────────────────────────────────────────────

export class StudentGraph {
  /** Primary node store — O(1) lookup by concept id */
  readonly nodes: Map<string, ConceptNode>;

  /** All directed edges (stored flat for serialization) */
  readonly edges: ConceptEdge[];

  /**
   * adjacency[A] = [B, C] means A has outgoing edges to B and C.
   * In prerequisite terms: A is a prerequisite of B and C
   * (i.e., you need to know A before studying B or C).
   *
   * Edge direction: `from` → `to` means `from` must be learned first.
   */
  readonly adjacency: AdjacencyMap;

  /**
   * reverseAdjacency[B] = [A] means B has A as an incoming node.
   * In prerequisite terms: B requires A.
   */
  readonly reverseAdjacency: AdjacencyMap;

  readonly sessionId: string;

  /** True whenever a mutation has occurred since the last sync to Supabase. */
  dirty: boolean;

  // ── Constructor (private — use fromState or build manually) ──────────────

  constructor(
    nodes: Map<string, ConceptNode>,
    edges: ConceptEdge[],
    sessionId: string,
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.sessionId = sessionId;
    this.dirty = false;

    this.adjacency = new Map();
    this.reverseAdjacency = new Map();

    // Initialise every known node in both maps (even if it has no edges)
    for (const id of nodes.keys()) {
      this.adjacency.set(id, []);
      this.reverseAdjacency.set(id, []);
    }

    // Populate edges
    for (const edge of edges) {
      if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, []);
      if (!this.reverseAdjacency.has(edge.to))
        this.reverseAdjacency.set(edge.to, []);

      this.adjacency.get(edge.from)!.push(edge.to);
      this.reverseAdjacency.get(edge.to)!.push(edge.from);

      if (edge.bidirectional) {
        if (!this.adjacency.has(edge.to)) this.adjacency.set(edge.to, []);
        if (!this.reverseAdjacency.has(edge.from))
          this.reverseAdjacency.set(edge.from, []);

        this.adjacency.get(edge.to)!.push(edge.from);
        this.reverseAdjacency.get(edge.from)!.push(edge.to);
      }
    }
  }

  // ── Static factory ────────────────────────────────────────────────────────

  /**
   * Reconstructs a StudentGraph from a serialized `StudentGraphState`.
   * This is the canonical way to hydrate the graph from a Supabase snapshot.
   */
  static fromState(state: StudentGraphState): StudentGraph {
    const nodes = new Map<string, ConceptNode>(
      state.nodes.map((n) => [n.id, n]),
    );
    return new StudentGraph(nodes, state.edges, state.sessionId);
  }

  // ── Query: unmastered concepts ────────────────────────────────────────────

  /**
   * Returns all concept ids where `studentState.confidence < threshold`.
   *
   * @param threshold  Mastery cut-off. Defaults to DEFAULT_MASTERY_THRESHOLD.
   */
  getUnmastered(threshold = DEFAULT_MASTERY_THRESHOLD): string[] {
    const result: string[] = [];
    for (const [id, node] of this.nodes) {
      if (node.studentState.confidence < threshold) result.push(id);
    }
    return result;
  }

  // ── Query: prerequisites ──────────────────────────────────────────────────

  /**
   * Returns the *direct* prerequisite concept ids for a given concept.
   * These are the nodes with edges pointing *into* `conceptId`.
   */
  getPrerequisites(conceptId: string): string[] {
    return this.reverseAdjacency.get(conceptId) ?? [];
  }

  // ── Query: unblocked concepts ─────────────────────────────────────────────

  /**
   * Returns concept ids that are "ready to study": all their prerequisites
   * are mastered (confidence ≥ threshold) but the concept itself is not.
   *
   * A concept with no prerequisites is always unblocked (if not yet mastered).
   *
   * @param threshold  Mastery cut-off. Defaults to DEFAULT_MASTERY_THRESHOLD.
   */
  getUnblockedConcepts(threshold = DEFAULT_MASTERY_THRESHOLD): string[] {
    const unblocked: string[] = [];

    for (const [id, node] of this.nodes) {
      // Skip already-mastered concepts
      if (node.studentState.confidence >= threshold) continue;

      // Check all prerequisites are mastered
      const prerequisites = this.getPrerequisites(id);
      const allPrereqsMet = prerequisites.every((prereqId) => {
        const prereq = this.nodes.get(prereqId);
        return prereq !== undefined && prereq.studentState.confidence >= threshold;
      });

      if (allPrereqsMet) unblocked.push(id);
    }

    return unblocked;
  }

  // ── Query: weakest cluster ────────────────────────────────────────────────

  /**
   * Finds the connected component (undirected) with the lowest average
   * confidence and returns its concept ids.
   *
   * "Weakest" is useful for choosing which topic area to focus on next in
   * a holistic session — rather than cherry-picking individual concepts.
   */
  getWeakestCluster(): string[] {
    const components = connectedComponents(this.adjacency);

    if (components.length === 0) return [];

    let weakestComponent: string[] = [];
    let lowestAvg = Infinity;

    for (const component of components) {
      const avg = this.averageConfidence(component);
      if (avg < lowestAvg) {
        lowestAvg = avg;
        weakestComponent = component;
      }
    }

    return weakestComponent;
  }

  // ── Query: next recommended concept ──────────────────────────────────────

  /**
   * Picks the single best concept for the student to study next.
   *
   * - "fast" mode: among unblocked concepts, favour the one with the highest
   *   `examPriority` score (covers the most marks quickly).
   * - "steady" mode: among unblocked concepts, favour the one with the
   *   lowest current confidence (deepest gap first).
   *
   * Returns `null` if all concepts are mastered.
   *
   * Thresholds:
   *   fast   → 0.5 (more lenient — student is cramming)
   *   steady → 0.7 (stricter — student is building deep understanding)
   */
  getNextRecommended(mode: 'fast' | 'steady'): ConceptNode | null {
    const threshold = mode === 'fast' ? 0.5 : 0.7;
    const unblocked = this.getUnblockedConcepts(threshold);

    if (unblocked.length === 0) return null;

    const candidates = unblocked
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);

    if (mode === 'fast') {
      // Highest exam priority wins; fall back to lowest confidence on tie
      return candidates.sort((a, b) => {
        const prioDiff =
          (b.metadata.examPriority ?? 0) - (a.metadata.examPriority ?? 0);
        if (prioDiff !== 0) return prioDiff;
        return a.studentState.confidence - b.studentState.confidence;
      })[0];
    } else {
      // Lowest confidence (deepest gap) wins
      return candidates.sort(
        (a, b) => a.studentState.confidence - b.studentState.confidence,
      )[0];
    }
  }

  // ── Query: path to target ─────────────────────────────────────────────────

  /**
   * Returns the shortest prerequisite path from the student's current
   * knowledge frontier to a target concept.
   *
   * "Current frontier" is defined as the set of mastered concepts (confidence
   * ≥ DEFAULT_MASTERY_THRESHOLD). We try each mastered concept as a source
   * and return the shortest path found.
   *
   * Returns `[]` if the target is already mastered or is unreachable.
   */
  getPathTo(targetConceptId: string): string[] {
    const target = this.nodes.get(targetConceptId);
    if (!target) return [];

    // Already mastered
    if (target.studentState.confidence >= DEFAULT_MASTERY_THRESHOLD) return [];

    const mastered = Array.from(this.nodes.keys()).filter(
      (id) =>
        (this.nodes.get(id)?.studentState.confidence ?? 0) >=
        DEFAULT_MASTERY_THRESHOLD,
    );

    if (mastered.length === 0) {
      // No mastered concepts — return the topological order as a learning path
      return topologicalSort(this.adjacency);
    }

    let bestPath: string[] = [];
    for (const sourceId of mastered) {
      const path = shortestPath(this.adjacency, sourceId, targetConceptId);
      if (
        path.length > 0 &&
        (bestPath.length === 0 || path.length < bestPath.length)
      ) {
        bestPath = path;
      }
    }

    return bestPath;
  }

  // ── Query: progress summary ───────────────────────────────────────────────

  /**
   * Returns a summary of the student's overall progress across all concepts.
   *
   * - mastered   : confidence ≥ DEFAULT_MASTERY_THRESHOLD
   * - inProgress : 0 < confidence < DEFAULT_MASTERY_THRESHOLD
   * - notStarted : confidence === 0 AND exposureCount === 0
   */
  getProgress(): GraphProgress {
    const total = this.nodes.size;
    let mastered = 0;
    let inProgress = 0;
    let notStarted = 0;
    let confidenceSum = 0;

    for (const node of this.nodes.values()) {
      const c = node.studentState.confidence;
      confidenceSum += c;

      if (c >= DEFAULT_MASTERY_THRESHOLD) {
        mastered++;
      } else if (c === 0 && node.studentState.exposureCount === 0) {
        notStarted++;
      } else {
        inProgress++;
      }
    }

    return {
      total,
      mastered,
      inProgress,
      notStarted,
      averageConfidence: total > 0 ? confidenceSum / total : 0,
    };
  }

  // ── Mutation: update confidence ───────────────────────────────────────────

  /**
   * Updates a concept's confidence score and increments its exposure count.
   *
   * @param conceptId   The concept to update.
   * @param score       New confidence value (0.0 – 1.0). Clamped to [0, 1].
   * @param method      The modality used (e.g. 'flashcard', 'explanation').
   */
  updateConfidence(conceptId: string, score: number, method: string): void {
    const node = this.nodes.get(conceptId);
    if (!node) return;

    const clampedScore = Math.max(0, Math.min(1, score));

    node.studentState.confidence = clampedScore;
    node.studentState.exposureCount += 1;
    node.studentState.lastAssessed = new Date().toISOString();

    // Track the modality if it improved confidence
    if (
      clampedScore > 0 &&
      !node.studentState.effectiveModalities.includes(method)
    ) {
      node.studentState.effectiveModalities.push(method);
    }

    this.dirty = true;
  }

  // ── Mutation: add concepts ────────────────────────────────────────────────

  /**
   * Merges new concept nodes and edges into the graph.
   *
   * Existing nodes are *not* overwritten — only new ids are added.
   * New edges are appended and adjacency maps are updated.
   *
   * Used when the Document Parser returns additional concepts mid-session.
   */
  addConcepts(newNodes: ConceptNode[], newEdges: ConceptEdge[]): void {
    for (const node of newNodes) {
      if (this.nodes.has(node.id)) continue; // preserve existing state
      this.nodes.set(node.id, node);
      this.adjacency.set(node.id, []);
      this.reverseAdjacency.set(node.id, []);
    }

    for (const edge of newEdges) {
      this.edges.push(edge);

      if (!this.adjacency.has(edge.from)) this.adjacency.set(edge.from, []);
      if (!this.reverseAdjacency.has(edge.to))
        this.reverseAdjacency.set(edge.to, []);

      this.adjacency.get(edge.from)!.push(edge.to);
      this.reverseAdjacency.get(edge.to)!.push(edge.from);

      if (edge.bidirectional) {
        if (!this.adjacency.has(edge.to)) this.adjacency.set(edge.to, []);
        if (!this.reverseAdjacency.has(edge.from))
          this.reverseAdjacency.set(edge.from, []);

        this.adjacency.get(edge.to)!.push(edge.from);
        this.reverseAdjacency.get(edge.from)!.push(edge.to);
      }
    }

    this.dirty = true;
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  /**
   * Serializes the graph to a `StudentGraphState` snapshot.
   * Used by `sync.ts` to persist to Supabase.
   */
  serialize(): StudentGraphState {
    return {
      sessionId: this.sessionId,
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Computes the average confidence across a list of concept ids.
   * Returns 0 for empty arrays.
   */
  private averageConfidence(conceptIds: string[]): number {
    if (conceptIds.length === 0) return 0;
    const sum = conceptIds.reduce((acc, id) => {
      return acc + (this.nodes.get(id)?.studentState.confidence ?? 0);
    }, 0);
    return sum / conceptIds.length;
  }

  /**
   * Returns concept ids reachable from `startId` via BFS on the
   * prerequisite graph, excluding `startId` itself.
   */
  getDependents(startId: string): string[] {
    return bfs(this.adjacency, startId).slice(1);
  }
}
