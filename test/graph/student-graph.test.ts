/**
 * WHY: Tests for the StudentGraph in-memory knowledge graph.
 *
 * Uses a deterministic 8-concept DBMS normalization graph so test assertions
 * are exact (not probabilistic). The graph is intentionally designed so that
 * known queries return known answers without depending on floating-point edge
 * cases:
 *
 *   Concept ids and confidence scores:
 *     functional_dep          0.9  (mastered)
 *     normalization_1NF       0.8  (mastered)
 *     normalization_2NF       0.5  (in-progress)
 *     normalization_3NF       0.3  (in-progress)
 *     normalization_BCNF      0.0  (not started)
 *     lossless_join           0.4  (in-progress)
 *     dependency_preservation 0.0  (not started)
 *     decomposition           0.7  (mastered at threshold ≥0.7, in-progress at ≥0.6)
 *
 *   Prerequisite edges (from → to):
 *     functional_dep    → normalization_1NF
 *     normalization_1NF → normalization_2NF
 *     normalization_2NF → normalization_3NF
 *     normalization_3NF → normalization_BCNF
 *     normalization_2NF → lossless_join
 *     normalization_2NF → dependency_preservation
 *     normalization_1NF → decomposition
 *
 *   getUnblocked(0.6):
 *     2NF  — prereq 1NF (0.8 ≥ 0.6) ✓
 *     decomposition — prereq 1NF (0.8 ≥ 0.6) ✓, conf 0.7 < 0.6? NO — decomposition IS mastered at 0.6
 *     So unblocked at 0.6: [normalization_2NF, lossless_join, dependency_preservation]
 *     Wait — lossless_join's prereq is 2NF (0.5 < 0.6) → blocked
 *     dependency_preservation's prereq is 2NF (0.5 < 0.6) → blocked
 *     decomposition's prereq is 1NF (0.8 ≥ 0.6) but decomposition itself is 0.7 ≥ 0.6 → MASTERED, skip
 *     So unblocked at 0.6: [normalization_2NF]
 *
 *   getNextRecommended('fast') at threshold 0.5:
 *     Unblocked: 2NF (prereq 1NF 0.8≥0.5), lossless_join (prereq 2NF 0.5≥0.5), dependency_preservation (prereq 2NF 0.5≥0.5)
 *     decomposition (0.7≥0.5 mastered at 0.5 threshold, skip)
 *     Fast mode picks highest examPriority — 2NF has 0.85
 *
 *   getNextRecommended('steady') at threshold 0.7:
 *     Mastered at 0.7: functional_dep (0.9), normalization_1NF (0.8)
 *     Unblocked: normalization_2NF (prereq 1NF 0.8≥0.7, conf 0.5<0.7)
 *       lossless_join — prereq 2NF 0.5<0.7 → blocked
 *       decomposition — prereq 1NF 0.8≥0.7, conf 0.7≥0.7 → mastered, skip
 *     Steady mode picks lowest confidence among unblocked → 2NF (0.5) only unblocked candidate
 *     But also dependency_preservation (0.0) has prereq 2NF (0.5<0.7) → blocked
 *     And 3NF has prereq 2NF (0.5<0.7) → blocked
 *     So steady unblocked: [normalization_2NF] — picks 2NF
 */

import { describe, expect, it } from 'vitest';

import type { ConceptEdge, ConceptNode } from '../../src/types/concepts';
import type { StudentGraphState } from '../../src/types/graph';
import {
  DEFAULT_MASTERY_THRESHOLD,
  StudentGraph,
} from '../../src/lib/graph/student-graph';

// ── DBMS fixture ──────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  confidence: number,
  examPriority?: number,
  exposureCount = 0,
): ConceptNode {
  return {
    id,
    name: id.replace(/_/g, ' '),
    domain: 'dbms',
    content: { raw: `Content for ${id}` },
    complexity: 'intermediate',
    keywords: [id],
    studentState: {
      confidence,
      exposureCount,
      effectiveModalities: [],
      modePerformance: { fast: 0, steady: 0 },
      lastAssessed: null,
    },
    metadata: {
      examPriority: examPriority ?? 0.5,
    },
  };
}

function makeEdge(from: string, to: string): ConceptEdge {
  return { from, to, type: 'prerequisite', weight: 1.0 };
}

function buildDbmsGraph(): StudentGraph {
  const nodes: ConceptNode[] = [
    makeNode('functional_dep', 0.9, 0.7),
    makeNode('normalization_1NF', 0.8, 0.75),
    makeNode('normalization_2NF', 0.5, 0.85),
    makeNode('normalization_3NF', 0.3, 0.8),
    makeNode('normalization_BCNF', 0.0, 0.9),
    makeNode('lossless_join', 0.4, 0.6),
    makeNode('dependency_preservation', 0.0, 0.65),
    makeNode('decomposition', 0.7, 0.55),
  ];

  const edges: ConceptEdge[] = [
    makeEdge('functional_dep', 'normalization_1NF'),
    makeEdge('normalization_1NF', 'normalization_2NF'),
    makeEdge('normalization_2NF', 'normalization_3NF'),
    makeEdge('normalization_3NF', 'normalization_BCNF'),
    makeEdge('normalization_2NF', 'lossless_join'),
    makeEdge('normalization_2NF', 'dependency_preservation'),
    makeEdge('normalization_1NF', 'decomposition'),
  ];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  return new StudentGraph(nodeMap, edges, 'test-session-001');
}

// ── Constructor and fromState ─────────────────────────────────────────────────

describe('StudentGraph construction', () => {
  it('builds adjacency and reverseAdjacency from edges', () => {
    const g = buildDbmsGraph();

    expect(g.adjacency.get('normalization_1NF')).toContain('normalization_2NF');
    expect(g.adjacency.get('normalization_1NF')).toContain('decomposition');
    expect(g.reverseAdjacency.get('normalization_2NF')).toContain(
      'normalization_1NF',
    );
  });

  it('starts with dirty = false', () => {
    expect(buildDbmsGraph().dirty).toBe(false);
  });

  it('round-trips through fromState correctly', () => {
    const original = buildDbmsGraph();
    const state = original.serialize();
    const restored = StudentGraph.fromState(state);

    expect(restored.nodes.size).toBe(original.nodes.size);
    expect(restored.edges).toHaveLength(original.edges.length);
    expect(restored.sessionId).toBe(original.sessionId);
  });
});

// ── getUnmastered ─────────────────────────────────────────────────────────────

describe('getUnmastered', () => {
  it('returns concepts below the default threshold (0.6)', () => {
    const g = buildDbmsGraph();
    const unmastered = g.getUnmastered();

    // confidence < 0.6: 2NF(0.5), 3NF(0.3), BCNF(0.0), lossless(0.4), dep_pres(0.0)
    expect(unmastered).toContain('normalization_2NF');
    expect(unmastered).toContain('normalization_3NF');
    expect(unmastered).toContain('normalization_BCNF');
    expect(unmastered).toContain('lossless_join');
    expect(unmastered).toContain('dependency_preservation');

    // confidence ≥ 0.6: functional_dep(0.9), 1NF(0.8), decomposition(0.7)
    expect(unmastered).not.toContain('functional_dep');
    expect(unmastered).not.toContain('normalization_1NF');
    expect(unmastered).not.toContain('decomposition');
  });

  it('respects a custom threshold', () => {
    const g = buildDbmsGraph();
    // At threshold 0.8, only functional_dep(0.9) and 1NF(0.8) are mastered
    const unmastered = g.getUnmastered(0.8);
    expect(unmastered).not.toContain('functional_dep');
    expect(unmastered).not.toContain('normalization_1NF');
    expect(unmastered).toContain('decomposition'); // 0.7 < 0.8
  });

  it('returns empty array when all concepts are mastered', () => {
    const nodes = new Map([
      ['a', makeNode('a', 1.0)],
      ['b', makeNode('b', 1.0)],
    ]);
    const g = new StudentGraph(nodes, [], 'session');
    expect(g.getUnmastered()).toEqual([]);
  });
});

// ── getPrerequisites ──────────────────────────────────────────────────────────

describe('getPrerequisites', () => {
  it('returns direct prerequisites for a concept', () => {
    const g = buildDbmsGraph();
    const prereqs = g.getPrerequisites('normalization_2NF');
    expect(prereqs).toEqual(['normalization_1NF']);
  });

  it('returns multiple prerequisites when a concept has several', () => {
    // Add a second edge to normalization_2NF
    const g = buildDbmsGraph();
    g.addConcepts([], [makeEdge('functional_dep', 'normalization_2NF')]);
    const prereqs = g.getPrerequisites('normalization_2NF');
    expect(prereqs).toContain('normalization_1NF');
    expect(prereqs).toContain('functional_dep');
  });

  it('returns empty array for a root concept', () => {
    const g = buildDbmsGraph();
    expect(g.getPrerequisites('functional_dep')).toEqual([]);
  });

  it('returns empty array for unknown concept id', () => {
    const g = buildDbmsGraph();
    expect(g.getPrerequisites('nonexistent')).toEqual([]);
  });
});

// ── getUnblockedConcepts ──────────────────────────────────────────────────────

describe('getUnblockedConcepts', () => {
  it('returns concepts whose prerequisites are all mastered (threshold 0.6)', () => {
    const g = buildDbmsGraph();
    const unblocked = g.getUnblockedConcepts(0.6);

    // 2NF: prereq 1NF(0.8≥0.6) ✓, 2NF itself 0.5<0.6 ✓
    expect(unblocked).toContain('normalization_2NF');

    // lossless_join: prereq 2NF(0.5<0.6) ✗ → blocked
    expect(unblocked).not.toContain('lossless_join');

    // decomposition: prereq 1NF(0.8≥0.6) ✓, but decomposition(0.7≥0.6) → already mastered
    expect(unblocked).not.toContain('decomposition');
  });

  it('returns root unmastered concepts (no prereqs) at default threshold', () => {
    const nodes = new Map([
      ['root', makeNode('root', 0.0)],
      ['child', makeNode('child', 0.0)],
    ]);
    const g = new StudentGraph(nodes, [makeEdge('root', 'child')], 'session');
    const unblocked = g.getUnblockedConcepts();

    // root has no prerequisites → always unblocked
    expect(unblocked).toContain('root');
    // child's prereq (root) is 0.0 < 0.6 → blocked
    expect(unblocked).not.toContain('child');
  });

  it('returns empty when all concepts are mastered', () => {
    const nodes = new Map([
      ['a', makeNode('a', 0.9)],
      ['b', makeNode('b', 0.9)],
    ]);
    const g = new StudentGraph(nodes, [makeEdge('a', 'b')], 'session');
    expect(g.getUnblockedConcepts()).toEqual([]);
  });
});

// ── getWeakestCluster ─────────────────────────────────────────────────────────

describe('getWeakestCluster', () => {
  it('returns the component with the lowest average confidence', () => {
    // Two disconnected clusters
    const nodes = new Map([
      ['a', makeNode('a', 0.8)], // cluster 1 avg = 0.75
      ['b', makeNode('b', 0.7)],
      ['c', makeNode('c', 0.2)], // cluster 2 avg = 0.1
      ['d', makeNode('d', 0.0)],
    ]);
    const edges = [makeEdge('a', 'b'), makeEdge('c', 'd')];
    const g = new StudentGraph(nodes, edges, 'session');

    const weakest = g.getWeakestCluster();
    expect(weakest).toContain('c');
    expect(weakest).toContain('d');
    expect(weakest).not.toContain('a');
  });

  it('returns all nodes when graph is fully connected', () => {
    const g = buildDbmsGraph();
    const cluster = g.getWeakestCluster();
    expect(cluster).toHaveLength(8);
  });

  it('returns empty array for empty graph', () => {
    const g = new StudentGraph(new Map(), [], 'session');
    expect(g.getWeakestCluster()).toEqual([]);
  });
});

// ── getNextRecommended ────────────────────────────────────────────────────────

describe('getNextRecommended', () => {
  it('fast mode picks the unblocked concept with highest examPriority', () => {
    const g = buildDbmsGraph();
    // Fast threshold = 0.5.
    // Mastered at 0.5 (confidence >= 0.5): functional_dep(0.9), 1NF(0.8), 2NF(0.5), decomposition(0.7)
    // Unblocked (prereqs mastered AND confidence < 0.5):
    //   3NF: prereq 2NF(0.5≥0.5) ✓, conf 0.3 → examPriority 0.80
    //   lossless_join: prereq 2NF(0.5≥0.5) ✓, conf 0.4 → examPriority 0.60
    //   dependency_preservation: prereq 2NF(0.5≥0.5) ✓, conf 0.0 → examPriority 0.65
    // Fast mode picks highest examPriority → normalization_3NF (0.80)
    const next = g.getNextRecommended('fast');
    expect(next).not.toBeNull();
    expect(next!.id).toBe('normalization_3NF'); // highest examPriority among unblocked
  });

  it('steady mode picks the unblocked concept with lowest confidence', () => {
    const g = buildDbmsGraph();
    // Steady threshold = 0.7
    // Mastered at 0.7: functional_dep(0.9), 1NF(0.8), decomposition(0.7)
    // Unblocked at 0.7: 2NF(prereq 1NF 0.8≥0.7, conf 0.5<0.7)
    // 3NF: prereq 2NF(0.5<0.7) → blocked
    // lossless/dep_pres: prereq 2NF → blocked
    const next = g.getNextRecommended('steady');
    expect(next).not.toBeNull();
    expect(next!.id).toBe('normalization_2NF');
  });

  it('returns null when all concepts are mastered', () => {
    const nodes = new Map([
      ['a', makeNode('a', 1.0)],
      ['b', makeNode('b', 1.0)],
    ]);
    const g = new StudentGraph(nodes, [], 'session');
    expect(g.getNextRecommended('fast')).toBeNull();
    expect(g.getNextRecommended('steady')).toBeNull();
  });
});

// ── getPathTo ─────────────────────────────────────────────────────────────────

describe('getPathTo', () => {
  it('returns a path from the nearest mastered concept to the target', () => {
    const g = buildDbmsGraph();
    // Mastered: functional_dep, 1NF. Target: normalization_3NF
    // Path: 1NF → 2NF → 3NF
    const path = g.getPathTo('normalization_3NF');
    expect(path).toContain('normalization_3NF');
    expect(path.length).toBeGreaterThan(1);
    const idx3NF = path.indexOf('normalization_3NF');
    const idx2NF = path.indexOf('normalization_2NF');
    expect(idx2NF).toBeLessThan(idx3NF);
  });

  it('returns empty array if target is already mastered', () => {
    const g = buildDbmsGraph();
    expect(g.getPathTo('functional_dep')).toEqual([]); // confidence 0.9
  });

  it('returns empty array for unknown target', () => {
    const g = buildDbmsGraph();
    expect(g.getPathTo('unknown_concept')).toEqual([]);
  });
});

// ── getProgress ───────────────────────────────────────────────────────────────

describe('getProgress', () => {
  it('returns correct totals for the DBMS graph at default threshold', () => {
    const g = buildDbmsGraph();
    const progress = g.getProgress();

    expect(progress.total).toBe(8);
    // Mastered (≥0.6): functional_dep(0.9), 1NF(0.8), decomposition(0.7) = 3
    expect(progress.mastered).toBe(3);
    // notStarted (confidence=0 AND exposureCount=0): BCNF, dependency_preservation = 2
    expect(progress.notStarted).toBe(2);
    // inProgress: 2NF(0.5), 3NF(0.3), lossless_join(0.4) = 3
    expect(progress.inProgress).toBe(3);
    expect(progress.averageConfidence).toBeCloseTo(
      (0.9 + 0.8 + 0.5 + 0.3 + 0.0 + 0.4 + 0.0 + 0.7) / 8,
      5,
    );
  });

  it('returns zeros for an empty graph', () => {
    const g = new StudentGraph(new Map(), [], 'session');
    const progress = g.getProgress();
    expect(progress.total).toBe(0);
    expect(progress.averageConfidence).toBe(0);
  });
});

// ── updateConfidence ──────────────────────────────────────────────────────────

describe('updateConfidence', () => {
  it('updates the confidence score and sets dirty', () => {
    const g = buildDbmsGraph();
    g.updateConfidence('normalization_2NF', 0.8, 'steady', 'flashcard');

    expect(g.nodes.get('normalization_2NF')!.studentState.confidence).toBe(0.8);
    expect(g.dirty).toBe(true);
  });

  it('increments exposureCount on each call', () => {
    const g = buildDbmsGraph();
    g.updateConfidence('normalization_2NF', 0.6, 'steady', 'explanation');
    g.updateConfidence('normalization_2NF', 0.7, 'steady', 'explanation');

    expect(g.nodes.get('normalization_2NF')!.studentState.exposureCount).toBe(2);
  });

  it('clamps confidence to [0, 1]', () => {
    const g = buildDbmsGraph();
    g.updateConfidence('normalization_2NF', 1.5, 'steady', 'test');
    expect(g.nodes.get('normalization_2NF')!.studentState.confidence).toBe(1.0);

    g.updateConfidence('normalization_2NF', -0.5, 'steady', 'test');
    expect(g.nodes.get('normalization_2NF')!.studentState.confidence).toBe(0.0);
  });

  it('tracks effective modalities', () => {
    const g = buildDbmsGraph();
    g.updateConfidence('normalization_2NF', 0.7, 'steady', 'flashcard');
    g.updateConfidence('normalization_2NF', 0.8, 'steady', 'explanation');
    g.updateConfidence('normalization_2NF', 0.8, 'steady', 'flashcard'); // duplicate — not added twice

    const modalities =
      g.nodes.get('normalization_2NF')!.studentState.effectiveModalities;
    expect(modalities).toContain('flashcard');
    expect(modalities).toContain('explanation');
    expect(modalities.filter((m) => m === 'flashcard')).toHaveLength(1);
  });

  it('is a no-op for unknown concept ids', () => {
    const g = buildDbmsGraph();
    expect(() => g.updateConfidence('nonexistent', 0.5, 'steady', 'test')).not.toThrow();
    expect(g.dirty).toBe(false); // no mutation occurred
  });
});

// ── addConcepts ───────────────────────────────────────────────────────────────

describe('addConcepts', () => {
  it('adds new nodes and edges to the graph', () => {
    const g = buildDbmsGraph();
    const newNode = makeNode('multivalued_dep', 0.0, 0.5);
    const newEdge = makeEdge('normalization_3NF', 'multivalued_dep');

    g.addConcepts([newNode], [newEdge]);

    expect(g.nodes.has('multivalued_dep')).toBe(true);
    expect(g.adjacency.get('normalization_3NF')).toContain('multivalued_dep');
    expect(g.dirty).toBe(true);
  });

  it('does not overwrite an existing node', () => {
    const g = buildDbmsGraph();
    const original = g.nodes.get('normalization_2NF')!.studentState.confidence;
    const replacement = makeNode('normalization_2NF', 0.99); // different confidence

    g.addConcepts([replacement], []);

    // Should keep original value
    expect(g.nodes.get('normalization_2NF')!.studentState.confidence).toBe(
      original,
    );
  });
});

// ── serialize / fromState round-trip ─────────────────────────────────────────

describe('serialize', () => {
  it('produces a valid StudentGraphState', () => {
    const g = buildDbmsGraph();
    const state = g.serialize();

    expect(state.sessionId).toBe('test-session-001');
    expect(state.nodes).toHaveLength(8);
    expect(state.edges).toHaveLength(7);
    expect(typeof state.lastSyncedAt).toBe('string');
    // ISO timestamp
    expect(() => new Date(state.lastSyncedAt)).not.toThrow();
  });

  it('fromState reconstructs equivalent queries', () => {
    const original = buildDbmsGraph();
    const restored = StudentGraph.fromState(original.serialize());

    expect(restored.getProgress().mastered).toBe(
      original.getProgress().mastered,
    );
    expect(restored.getUnmastered()).toEqual(original.getUnmastered());
  });
});

// ── DEFAULT_MASTERY_THRESHOLD export ─────────────────────────────────────────

describe('DEFAULT_MASTERY_THRESHOLD', () => {
  it('is 0.6', () => {
    expect(DEFAULT_MASTERY_THRESHOLD).toBe(0.6);
  });
});
