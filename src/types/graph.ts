/**
 * WHY: Serializable graph snapshot for Supabase persistence and orchestrator input.
 *
 * The in-memory StudentGraph needs to survive session breaks (written to Supabase
 * on state changes, read back at session resume) and be passed to the orchestrator
 * on every decision call. StudentGraphState is that serializable form — a flat
 * nodes+edges snapshot that can round-trip through JSON without any special handling.
 */

import type { ConceptNode, ConceptEdge } from './concepts';

/**
 * Serializable snapshot of the in-memory StudentGraph.
 * This is what gets written to Supabase on state changes and
 * read back to reconstruct the graph at session resume.
 */
export interface StudentGraphState {
  sessionId: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  lastSyncedAt: string; // ISO timestamp
}
