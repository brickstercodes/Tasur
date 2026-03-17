/**
 * WHY: Zod schema for a single Concept Explainer Agent response turn.
 *
 * The explainer is the Phase 2 study-partner chat. Every message it returns must
 * conform to this schema so the frontend can style each turn differently (explanation
 * vs. analogy vs. micro-assessment) and so the orchestrator can reliably detect when
 * a concept handoff has occurred. The schema is validated at the framework boundary —
 * the explainer never returns raw text. No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

const difficultySchema = z.enum(['easy', 'intermediate', 'hard']);

export const explainerOutputSchema = z.object({
  /**
   * What kind of response this turn is.
   * The frontend can style each type differently.
   */
  message_type: z.enum(['explanation', 'analogy', 'example', 'micro_assessment', 'clarification']),

  /** The main text of the response — always present. */
  content: z.string(),

  /**
   * Optional structured visual to accompany the text.
   * The frontend renders this as a table, comparison card, etc.
   */
  visual_suggestion: z
    .object({
      type: z.enum(['diagram', 'table', 'comparison']),
      data: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),

  /**
   * Present on turns where the explainer wants to check understanding.
   * The student's answer is sent back to the orchestrator for evaluation.
   */
  micro_assessment: z
    .object({
      question: z.string(),
      expected_understanding: z.string(), // grading rubric (not shown to student)
      difficulty: difficultySchema,
    })
    .nullable()
    .optional(),

  /**
   * When true, the explainer has finished covering the concept and is ready
   * to hand off back to the orchestrator.
   */
  conversation_complete: z.boolean(),

  /**
   * Optional signal to the orchestrator about what should happen next.
   * e.g. "suggest_prerequisite_review", "ready_for_flashcards"
   */
  handoff_signal: z.string().nullable().optional(),
});

export type ExplainerOutput = z.infer<typeof explainerOutputSchema>;
