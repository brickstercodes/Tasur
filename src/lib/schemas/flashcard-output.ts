/**
 * WHY: Zod schema for the Flashcard Generator Agent output.
 *
 * Flashcards are Phase 4 retrieval practice — the agent generates structured cards
 * that get stored in the `flashcards` table with an initial SM-2 state. The schema
 * enforces four card types (recall, application, explain_simply, compare_contrast)
 * because the orchestrator needs to vary retrieval formats, not just repeat one type.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

const cardTypeSchema = z.enum([
  'recall', // pure definition recall
  'application', // apply the concept to a scenario
  'explain_simply', // explain as if to a non-expert
  'compare_contrast', // compare two related concepts
]);

const difficultySchema = z.enum(['easy', 'intermediate', 'hard']);

export const flashcardOutputSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(), // e.g. "card_001"
      concept_id: z.string(), // e.g. "normalization_3NF"
      type: cardTypeSchema,
      front: z.string(), // question / prompt
      back: z.string(), // answer / explanation
      difficulty: difficultySchema,
      tags: z.array(z.string()), // e.g. ["normalization", "normal_forms"]
      hints: z.array(z.string()), // shown if the student is stuck
    }),
  ),
});

export type FlashcardOutput = z.infer<typeof flashcardOutputSchema>;
