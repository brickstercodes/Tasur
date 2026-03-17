/**
 * WHY: Zod schema for the Mindmap Generator Agent output.
 *
 * The mindmap is Phase 1's "wow moment" — the first thing a student sees after
 * uploading notes. This schema defines the exact node+edge structure that react-flow
 * consumes to render the interactive graph. Having it as a validated Zod schema means
 * the LLM output is checked before it ever reaches the frontend renderer.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

export const mindmapOutputSchema = z.object({
  /** Visual nodes — one per concept. */
  nodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(), // display name
      description: z.string(), // short summary
      visual_cue: z.string().optional(), // memory hook for the student
      depth: z.number().int().nonnegative(), // 0 = root, 1 = primary, etc.
      importance: z.enum(['foundational', 'intermediate', 'advanced']),
    }),
  ),

  /** Directed edges between nodes. */
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      label: z.string().optional(), // e.g. "builds on"
      type: z.enum(['prerequisite', 'related', 'contrasts_with', 'part_of', 'example_of']),
    }),
  ),

  /** Hint for the react-flow layout engine. */
  layout_hint: z.enum([
    'hierarchical_top_down',
    'hierarchical_left_right',
    'radial',
    'force_directed',
  ]),

  /** Suggested visual groupings for the mindmap. */
  suggested_clusters: z.array(
    z.object({
      name: z.string(),
      nodes: z.array(z.string()), // node ids belonging to this cluster
    }),
  ),
});

export type MindmapOutput = z.infer<typeof mindmapOutputSchema>;
