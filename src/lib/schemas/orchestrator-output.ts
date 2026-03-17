/**
 * WHY: Zod schema for the Orchestrator Agent decision output.
 *
 * The orchestrator is the brain of every Tasur session — it never teaches directly
 * but decides which agent to invoke next and updates the student's confidence model.
 * Every orchestrator call produces one of these validated objects so the API layer
 * can safely destructure `next_action` and dispatch without any runtime surprises.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

export const orchestratorOutputSchema = z.object({
  /**
   * Confidence update for the concept most recently assessed.
   * Null if this orchestrator call is for session init or mode switches
   * where no student response was involved.
   */
  understanding_update: z
    .object({
      concept_id: z.string(),
      new_confidence: z.number().min(0).max(1),
      evidence: z.string(), // short explanation of why confidence changed
    })
    .nullable(),

  /**
   * The next agent action the orchestrator wants to take.
   * The API layer resolves `agent` to a registry entry and calls `.execute(params)`.
   */
  next_action: z.object({
    agent: z.enum([
      'document-parser',
      'web-search',
      'mindmap-generator',
      'concept-explainer',
      'flashcard-generator',
      'orchestrator',
      'session_complete', // special signal — no agent call, just end the session
    ]),
    params: z.record(z.string(), z.unknown()),
  }),

  /** Short explanation of why the orchestrator made this routing decision. */
  reasoning: z.string(),
});

export type OrchestratorOutputSchema = z.infer<typeof orchestratorOutputSchema>;
