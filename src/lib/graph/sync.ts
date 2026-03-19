/**
 * WHY: Supabase persistence layer for the StudentGraph.
 *
 * The in-memory StudentGraph is ephemeral — it lives only for the duration of
 * a server request. `sync.ts` bridges the gap by reading the stored snapshot
 * from Supabase on session resume and writing changed nodes back on mutation.
 *
 * Design choices:
 * - `loadFromSupabase` reconstructs the full graph from a JSON column, not
 *   from normalised rows, to avoid a round-trip join on every session load.
 * - `syncToSupabase` only writes if `graph.dirty === true` and only upserts
 *   the full JSON snapshot (no per-node diffing) — the graph is small enough
 *   (dozens of concepts) that a full snapshot upsert is cheaper than diffing.
 * - `graph.dirty` is cleared after a successful sync so repeated calls to
 *   `syncToSupabase` are idempotent no-ops when nothing has changed.
 *
 * Table schema assumed:
 *   student_graphs (
 *     session_id TEXT PRIMARY KEY,
 *     graph_state JSONB NOT NULL,
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   )
 *
 * Uses the service-role client (server-side only — never call from a
 * browser component).
 */

import { createServerClient } from '@/lib/supabase';
import type { StudentGraphState } from '@/types/graph';
import { StudentGraph } from './student-graph';

const GRAPH_TABLE = 'student_graphs';

// The `student_graphs` table is not yet in the generated Database type
// (migration pending). Cast to `any` at the call sites so the rest of the
// codebase stays fully typed. Remove the cast once the migration has been
// applied and `supabase gen types` has been re-run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// ── Load ──────────────────────────────────────────────────────────────────────

/**
 * Loads a StudentGraph from Supabase for the given session.
 *
 * Returns `null` if no graph has been persisted for this session yet.
 * Throws if the Supabase query fails or the stored JSON is malformed.
 */
export async function loadFromSupabase(
  sessionId: string,
): Promise<StudentGraph | null> {
  const supabase = createServerClient() as AnySupabase;

  const { data, error } = await supabase
    .from(GRAPH_TABLE)
    .select('graph_state')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to load StudentGraph for session "${sessionId}": ${error.message}`,
    );
  }

  if (!data) return null;

  const state = data.graph_state as StudentGraphState;
  return StudentGraph.fromState(state);
}

// ── Sync ──────────────────────────────────────────────────────────────────────

/**
 * Persists the current graph state to Supabase.
 *
 * No-ops if `graph.dirty` is false (nothing has changed since last sync).
 * Clears `graph.dirty` after a successful upsert.
 *
 * Uses upsert (INSERT … ON CONFLICT UPDATE) so the first call creates the
 * row and subsequent calls update it.
 */
export async function syncToSupabase(graph: StudentGraph): Promise<void> {
  if (!graph.dirty) return;

  const supabase = createServerClient() as AnySupabase;
  const state = graph.serialize();

  const { error } = await supabase.from(GRAPH_TABLE).upsert(
    {
      session_id: graph.sessionId,
      graph_state: state,
      updated_at: state.lastSyncedAt,
    },
    { onConflict: 'session_id' },
  );

  if (error) {
    throw new Error(
      `Failed to sync StudentGraph for session "${graph.sessionId}": ${error.message}`,
    );
  }

  // Mark clean only after a confirmed successful write
  graph.dirty = false;
}
