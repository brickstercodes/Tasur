/**
 * WHY: Tests for the Supabase sync layer.
 *
 * sync.ts makes real Supabase calls so we mock the entire supabase module.
 * The tests verify:
 *   - loadFromSupabase returns null when no row exists
 *   - loadFromSupabase reconstructs a StudentGraph from stored JSON
 *   - syncToSupabase is a no-op when dirty = false
 *   - syncToSupabase upserts the graph and clears dirty when dirty = true
 *   - Both functions surface Supabase errors as thrown Errors
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ConceptEdge, ConceptNode } from '../../src/types/concepts';
import { StudentGraph } from '../../src/lib/graph/student-graph';

// ── Supabase mock ─────────────────────────────────────────────────────────────

// We must mock the module before importing sync.ts so the mock is in place
// when the module is first evaluated.
vi.mock('../../src/lib/supabase', () => {
  const mockFrom = vi.fn();
  return {
    createServerClient: () => ({ from: mockFrom }),
    __mockFrom: mockFrom,
  };
});

// Import after mock is set up
const { loadFromSupabase, syncToSupabase } = await import(
  '../../src/lib/graph/sync'
);
const { __mockFrom } = await import('../../src/lib/supabase' as any);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, confidence: number): ConceptNode {
  return {
    id,
    name: id,
    domain: 'dbms',
    content: { raw: `Content for ${id}` },
    complexity: 'foundational',
    keywords: [],
    studentState: {
      confidence,
      exposureCount: 0,
      effectiveModalities: [],
      modePerformance: { fast: 0, steady: 0 },
      lastAssessed: null,
    },
    metadata: {},
  };
}

function makeEdge(from: string, to: string): ConceptEdge {
  return { from, to, type: 'prerequisite', weight: 1.0 };
}

function buildMinimalGraph(): StudentGraph {
  const nodes = new Map([
    ['a', makeNode('a', 0.8)],
    ['b', makeNode('b', 0.3)],
  ]);
  return new StudentGraph(nodes, [makeEdge('a', 'b')], 'session-test');
}

// ── Helper to build chainable Supabase mock ───────────────────────────────────

type MockChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

function buildSelectChain(resolveValue: { data: unknown; error: unknown }): MockChain {
  const maybeSingle = vi.fn().mockResolvedValue(resolveValue);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const upsert = vi.fn();
  return { select, eq, maybeSingle, upsert };
}

function buildUpsertChain(resolveValue: { error: unknown }): MockChain {
  const upsert = vi.fn().mockResolvedValue(resolveValue);
  const select = vi.fn();
  const eq = vi.fn();
  const maybeSingle = vi.fn();
  return { select, eq, maybeSingle, upsert };
}

// ── loadFromSupabase ──────────────────────────────────────────────────────────

describe('loadFromSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no row exists for the session', async () => {
    const chain = buildSelectChain({ data: null, error: null });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const result = await loadFromSupabase('session-new');
    expect(result).toBeNull();
  });

  it('reconstructs a StudentGraph from stored state', async () => {
    const graph = buildMinimalGraph();
    const state = graph.serialize();

    const chain = buildSelectChain({ data: { graph_state: state }, error: null });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const loaded = await loadFromSupabase('session-test');
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes.size).toBe(2);
    expect(loaded!.sessionId).toBe('session-test');
  });

  it('throws when Supabase returns an error', async () => {
    const chain = buildSelectChain({ data: null, error: { message: 'DB error' } });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await expect(loadFromSupabase('session-err')).rejects.toThrow('DB error');
  });
});

// ── syncToSupabase ────────────────────────────────────────────────────────────

describe('syncToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when graph.dirty is false', async () => {
    const graph = buildMinimalGraph();
    // dirty starts as false
    expect(graph.dirty).toBe(false);

    await syncToSupabase(graph);

    // from() should never have been called
    expect(__mockFrom).not.toHaveBeenCalled();
  });

  it('upserts the graph state when dirty is true', async () => {
    const graph = buildMinimalGraph();
    graph.updateConfidence('b', 0.6, 'flashcard'); // sets dirty = true

    const chain = buildUpsertChain({ error: null });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await syncToSupabase(graph);

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 'session-test' }),
      expect.objectContaining({ onConflict: 'session_id' }),
    );
  });

  it('clears dirty after a successful sync', async () => {
    const graph = buildMinimalGraph();
    graph.updateConfidence('b', 0.6, 'flashcard');

    const chain = buildUpsertChain({ error: null });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await syncToSupabase(graph);

    expect(graph.dirty).toBe(false);
  });

  it('throws and does not clear dirty when Supabase returns an error', async () => {
    const graph = buildMinimalGraph();
    graph.updateConfidence('b', 0.5, 'test');

    const chain = buildUpsertChain({ error: { message: 'Write failed' } });
    (__mockFrom as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    await expect(syncToSupabase(graph)).rejects.toThrow('Write failed');
    // dirty should still be true since the write failed
    expect(graph.dirty).toBe(true);
  });
});
