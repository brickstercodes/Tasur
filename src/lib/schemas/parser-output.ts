/**
 * WHY: Zod schema for the Document Parser Agent output.
 *
 * Parsing is the entry point for every Tasur session — every downstream agent
 * (mindmap, flashcards, orchestrator) depends on the concept graph this agent
 * produces. The schema validates LLM output at the boundary so nothing downstream
 * ever sees a malformed concept list or missing relationship edges.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

const conceptComplexitySchema = z.enum(['foundational', 'intermediate', 'advanced']);

const relationshipTypeSchema = z.enum([
  'prerequisite',
  'related',
  'contrasts_with',
  'part_of',
  'example_of',
]);

export const documentParserOutputSchema = z.object({
  /** Human-readable title inferred from the document. */
  title: z.string(),

  /** Subject domain detection result. */
  subject_detection: z.object({
    primary: z.string(), // e.g. "DBMS"
    confidence: z.number().min(0).max(1),
    domain_template: z.string(), // e.g. "dbms_v1"
  }),

  /** Array of concepts extracted from the document. */
  concepts: z.array(
    z.object({
      id: z.string(), // e.g. "normalization_3NF"
      name: z.string(),
      raw_content: z.string(),
      prerequisites: z.array(z.string()), // concept ids
      complexity: conceptComplexitySchema,
      keywords: z.array(z.string()),
    }),
  ),

  /** Directed edges between extracted concepts. */
  concept_relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: relationshipTypeSchema,
    }),
  ),

  /**
   * Gaps detected in the uploaded material.
   * e.g. "BCNF mentioned but not explained — web augmentation recommended"
   */
  gaps_detected: z.array(z.string()),
});

export type DocumentParserOutput = z.infer<typeof documentParserOutputSchema>;
