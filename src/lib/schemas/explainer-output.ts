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
   * The frontend renders this as a table, comparison card, or diagram.
   *
   * `data` is a flat object with all possible fields optional — each `type`
   * uses a different subset so generateObject has concrete field names to fill:
   *   table      → populate headers + rows
   *   comparison → populate left + right + items
   *   diagram    → populate description + nodes + edges
   */
  visual_suggestion: z
    .object({
      type: z.enum(['diagram', 'table', 'comparison', 'mermaid']),
      data: z.object({
        // table fields
        headers: z.array(z.string()).optional(),
        rows: z.array(z.array(z.string())).optional(),
        // diagram fields
        description: z.string().optional(),
        nodes: z.array(z.string()).optional(),
        edges: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              label: z.string().optional(),
            }),
          )
          .optional(),
        // comparison fields
        left: z.string().optional(),
        right: z.string().optional(),
        items: z
          .array(
            z.object({
              attribute: z.string(),
              left: z.string(),
              right: z.string(),
            }),
          )
          .optional(),
        // mermaid fields
        chart: z.string().optional(),
      }),
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
      /**
       * Controls the input widget the frontend renders:
       *   self_check — a comprehension check the student grades themselves ("Got it / Not yet").
       *                Only appropriate when the question is a yes/no confidence check.
       *   open       — a specific-answer question requiring a typed response
       *                (factual recall, fill-in-the-blank, scenario analysis, etc.).
       *
       * Fast mode: use self_check for quick comprehension checks; use open for any
       *            question that has a specific correct answer the student must state.
       * Steady mode: always use open — self_check is too coarse for deep understanding.
       */
      question_type: z.enum(['self_check', 'open']),
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
