/**
 * WHY: Zod schema for the Mindmap Generator Agent output (MindmapTreeOutput).
 *
 * Tasur uses TWO separate data structures for mindmaps:
 *   1. StudentGraph (flat nodes + edges + confidence) — orchestrator's internal model.
 *   2. MindmapTreeOutput (hierarchical tree, Freeplane-style) — what students see.
 *
 * This schema defines structure 2. The recursive children[] nesting allows 3-4 levels
 * of detail (fast mode = shallower, steady mode = deeper). The `concept_id` field on
 * branch nodes links the visual tree back to the knowledge graph so the orchestrator
 * can validate coverage against parsed concepts using `metadata.concept_ids_covered`.
 *
 * Frontend rendering: collapsible tree (markmap / react-flow tree layout / custom).
 * NOT a flat force-directed graph — expand/collapse is the primary interaction.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { z } from 'zod';

// ── Recursive node type (must be declared before the Zod schema) ────────────

/**
 * A single node in the visual mindmap tree.
 *
 * Branch nodes (topic/subtopic level) typically have `concept_id`, `content`,
 * and `study_cue`. Leaf nodes are pure detail bullets — they have only `label`
 * and no `concept_id` because they don't map to trackable knowledge-graph concepts.
 */
export type MindmapNode = {
  id?: string;            // stable identifier for branch nodes; absent on leaf bullets
  label: string;          // always present — the visible text in the mindmap
  concept_id?: string;    // links this node back to the StudentGraph; absent on leaf nodes
  content?: string;       // short description shown under the label on expand
  study_cue?: string;     // memory aid / visual metaphor (shown on hover)
  children?: MindmapNode[];
};

// ── Recursive Zod schema ────────────────────────────────────────────────────
//
// z.lazy() breaks the circular reference. The explicit z.ZodType<MindmapNode>
// annotation is required for TypeScript to resolve the self-reference correctly.

const mindmapNodeSchema: z.ZodType<MindmapNode> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    label: z.string(),
    concept_id: z.string().optional(),
    content: z.string().optional(),
    study_cue: z.string().optional(),
    children: z.array(mindmapNodeSchema).optional(),
  }),
);

export { mindmapNodeSchema };

// ── Top-level schema ────────────────────────────────────────────────────────

export const mindmapTreeOutputSchema = z.object({
  /** Human-readable title for the mindmap (matches document title from parser). */
  title: z.string(),

  /** Subject domain — e.g. "DBMS", "Operating Systems". */
  subject: z.string(),

  /** Top-level branches of the tree. */
  children: z.array(mindmapNodeSchema),

  /**
   * Summary used by the orchestrator's validation gate.
   * `concept_ids_covered` must overlap >80% with the parser's concept list
   * or the orchestrator requests a regeneration pass.
   */
  metadata: z.object({
    total_nodes: z.number().int().nonnegative(),
    max_depth: z.number().int().nonnegative(),
    concept_ids_covered: z.array(z.string()),
  }),
});

export type MindmapTreeOutput = z.infer<typeof mindmapTreeOutputSchema>;
