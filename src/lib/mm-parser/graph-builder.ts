/**
 * WHY: Derives ConceptEdge[] from DerivedConcept[] using tree structure alone.
 *
 * The .mm tree encodes the knowledge graph implicitly:
 * - Parent-child TRACKABLE pairs → prerequisite edges (the parent must be
 *   understood before the child sub-concept makes sense).
 * - Consecutive TRACKABLE siblings (same parentId) → sequential edges (within
 *   a topic, concepts build on each other left-to-right / top-to-bottom).
 *
 * This replaces the Document Parser's `concept_relationships` array, which
 * required an LLM to infer edges. Here the tree structure IS the graph.
 * No LLM call. No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { ConceptEdge } from '@/types/concepts';
import type { DerivedConcept } from './types';

// ── Edge weights (matches Document 4 specification) ───────────────────────────

const PREREQUISITE_WEIGHT = 1.0;
const SEQUENTIAL_WEIGHT = 0.5;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a ConceptEdge[] from the DerivedConcept array produced by extractConcepts().
 *
 * Two edge types are produced:
 *
 * **prerequisite** (weight 1.0):
 *   parent TRACKABLE → child TRACKABLE
 *   "Understanding 'Introduction' is a prerequisite for 'Clock Skew vs Drift'"
 *
 * **sequential** (weight 0.5):
 *   prev TRACKABLE sibling → next TRACKABLE sibling (same parentId)
 *   "Within 'Introduction', 'Challenges' is studied before 'Clock Skew'"
 *
 * @param concepts  DerivedConcept[] from extractConcepts() — must include positions.
 * @returns         Directed ConceptEdge[] for the StudentGraph.
 */
export function buildGraphEdges(concepts: DerivedConcept[]): ConceptEdge[] {
  const edges: ConceptEdge[] = [];

  edges.push(...buildPrerequisiteEdges(concepts));
  edges.push(...buildSequentialEdges(concepts));

  return edges;
}

// ── Edge builders ─────────────────────────────────────────────────────────────

/**
 * Produces one prerequisite edge for each parent→child TRACKABLE pair.
 *
 * We look up each concept's parentId — if a concept with that id exists
 * (i.e., the parent is also a TRACKABLE node, not the document root), we
 * emit a prerequisite edge from parent to child.
 */
function buildPrerequisiteEdges(concepts: DerivedConcept[]): ConceptEdge[] {
  const conceptIds = new Set(concepts.map((c) => c.id));

  return concepts
    .filter((concept) => concept.parentId !== null && conceptIds.has(concept.parentId))
    .map((concept) => ({
      from: concept.parentId!,
      to: concept.id,
      type: 'prerequisite' as const,
      weight: PREREQUISITE_WEIGHT,
      bidirectional: false,
    }));
}

/**
 * Produces one sequential edge between each consecutive pair of TRACKABLE siblings.
 *
 * Groups concepts by parentId. Within each group, sorts by position (already
 * assigned by extractConcepts), then pairs consecutive siblings:
 *   group[0] → group[1], group[1] → group[2], etc.
 *
 * This preserves the teaching order encoded in the .mm tree.
 */
function buildSequentialEdges(concepts: DerivedConcept[]): ConceptEdge[] {
  const siblingGroups = groupByParentId(concepts);
  const edges: ConceptEdge[] = [];

  for (const siblings of siblingGroups.values()) {
    const sorted = [...siblings].sort((a, b) => a.position - b.position);

    for (let i = 0; i < sorted.length - 1; i++) {
      edges.push({
        from: sorted[i].id,
        to: sorted[i + 1].id,
        type: 'sequential' as const,
        weight: SEQUENTIAL_WEIGHT,
        bidirectional: false,
      });
    }
  }

  return edges;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Groups DerivedConcept[] by parentId.
 *
 * Returns a Map where the key is parentId (or null for top-level concepts)
 * and the value is the list of sibling concepts sharing that parent.
 */
function groupByParentId(
  concepts: DerivedConcept[],
): Map<string | null, DerivedConcept[]> {
  const groups = new Map<string | null, DerivedConcept[]>();

  for (const concept of concepts) {
    const group = groups.get(concept.parentId) ?? [];
    group.push(concept);
    groups.set(concept.parentId, group);
  }

  return groups;
}
