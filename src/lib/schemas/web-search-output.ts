/**
 * WHY: Zod schema for the Web Search Augmentor Agent output.
 *
 * When the Document Parser detects knowledge gaps in the uploaded material,
 * this agent fills each gap with web-sourced content. The augmentations array
 * maps 1:1 to the gaps_detected list from DocumentParserOutput so the
 * orchestrator can merge retrieved knowledge into the student's graph without
 * guessing which gap each result addresses.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

export const webSearchOutputSchema = z.object({
  augmentations: z.array(
    z.object({
      /** The gap string this entry addresses (from DocumentParserOutput.gaps_detected). */
      gap: z.string(),

      /** Retrieved content that explains or fills the gap. */
      content: z.string(),

      /** URL of the source page, if available. */
      source_url: z.string().optional(),

      /** Human-readable title of the source, if available. */
      source_title: z.string().optional(),

      /** How relevant this result is to the gap (0.0 = irrelevant, 1.0 = exact match). */
      relevance_score: z.number().min(0).max(1),
    }),
  ),
});

export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;
