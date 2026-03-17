/**
 * WHY: Domain types for the Student Understanding Model.
 *
 * The understanding model is what makes Tasur adaptive rather than scripted —
 * the orchestrator uses per-concept confidence scores and assessment history to
 * decide what to teach next. These types are framework-agnostic so they can be
 * used in the in-memory graph, persisted to Supabase, and passed to LLM prompts
 * without any transformation.
 */

/** Floating point confidence score in [0.0, 1.0]. */
export type ConfidenceScore = number;

/** A single entry in a concept's assessment history. */
export interface AssessmentHistory {
  timestamp: string; // ISO timestamp
  score: number; // 0.0 – 1.0 normalised result
  method: string; // "micro_assessment" | "flashcard" | "teach_back" | etc.
}

/**
 * Per-user, per-session understanding state for one concept.
 * Persisted in the `understanding_state` table and loaded into
 * the in-memory StudentGraph at session start.
 */
export interface UnderstandingState {
  // identity
  id: string;
  userId: string;
  sessionId: string;
  conceptId: string;
  // state
  confidenceScore: ConfidenceScore;
  exposureCount: number;
  assessmentHistory: AssessmentHistory[];
  effectiveModalities: string[]; // modalities that correlated with high confidence
  // timestamps
  lastAssessedAt: string | null; // ISO timestamp
}
