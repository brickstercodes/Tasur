/**
 * WHY: Shared framework-agnostic types for orchestrator I/O.
 *
 * The orchestrator is the brain of Tasur's learning session — this file defines
 * exactly what goes in (student state + last event) and what comes out (routing
 * decision + confidence update). Keeping these types framework-agnostic means
 * both Mastra and manual implementations share the same contract with zero glue.
 * snake_case is used for fields that map directly to LLM JSON output to avoid
 * manual key remapping. No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { StudentGraphState } from '@/types/graph';
import type { LearningMode } from '@/types/sessions';

// ── Agent name union ────────────────────────────────────────────────────────
// Defined here so both registry.ts and NextAction can use it without circular deps.

export type AgentName =
  | 'document-parser'
  | 'web-search'
  | 'mindmap-generator'
  | 'concept-explainer'
  | 'flashcard-generator'
  | 'orchestrator';

// ── Orchestrator I/O ────────────────────────────────────────────────────────

/**
 * Payload sent to the orchestrator at every decision point.
 * The orchestrator receives this and outputs a routing decision.
 */
export interface OrchestratorInput {
  studentState: StudentGraphState; // serialized in-memory graph
  mode: LearningMode;
  lastEvent: string; // e.g. "micro_assessment_complete", "session_start"
  domain: string; // e.g. "dbms"
}

/**
 * Confidence delta for a single concept, produced by the orchestrator
 * after evaluating a student response.
 */
export interface UnderstandingUpdate {
  concept_id: string;
  new_confidence: number; // 0.0 – 1.0
  evidence: string; // short explanation of the confidence change
}

/**
 * The orchestrator's routing decision: which agent to call next and with what params.
 * `agent` must be one of the 6 registered agents or the special "session_complete" signal.
 */
export interface NextAction {
  agent: AgentName | 'session_complete';
  params: Record<string, unknown>;
}

/**
 * Full orchestrator output — one of these is produced at every decision point.
 * The API layer reads `next_action` and dispatches to the matching agent registry entry.
 */
export interface OrchestratorOutput {
  understanding_update: UnderstandingUpdate | null;
  next_action: NextAction;
  reasoning: string;
}
