/**
 * WHY: Converts a ParsedMindmap into MindmapTreeOutput for the frontend.
 *
 * The frontend renders MindmapTreeOutput — a recursive JSON tree of MindmapNode
 * objects. Rather than generating this with a separate LLM call (the old Mindmap
 * Generator agent), we now derive it deterministically from the .mm file.
 *
 * Mapping rules:
 * - Root MmNode → title + subject fields of MindmapTreeOutput
 * - TRACKABLE MmNode → MindmapNode with concept_id, label, content
 * - Non-TRACKABLE children of a TRACKABLE node → first one becomes `content`,
 *   additional ones become leaf MindmapNode children (label only, no concept_id)
 * - Non-TRACKABLE nodes at the top level (between root and first TRACKABLE)
 *   are treated the same as non-TRACKABLE children
 * - The [DIAGRAM TO STUDY:] leaf nodes become their own children with label
 *
 * This preserves the existing MindmapTreeOutput schema so the frontend rendering
 * code requires zero changes — only the producer changes from LLM to code.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { MindmapNode, MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { MmNode, ParsedMindmap } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max leaf nodes to promote to `content` vs. keep as children. */
const CONTENT_LEAF_LIMIT = 2;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Converts a ParsedMindmap into a MindmapTreeOutput ready for frontend rendering.
 *
 * The root MmNode becomes the title. Its direct children become the top-level
 * branches. Recursion handles all nested levels.
 *
 * @param tree     ParsedMindmap produced by parseMmXml().
 * @param subject  Optional subject label (e.g. "DBMS"). Defaults to the title.
 * @returns        MindmapTreeOutput matching the existing Zod schema.
 */
export function toMindmapTreeOutput(tree: ParsedMindmap, subject?: string): MindmapTreeOutput {
  const rootNode = tree.root;
  const topLevelBranches = rootNode.children.map((child) => convertMmNode(child));

  const allNodes = collectAllMindmapNodes(topLevelBranches);
  const conceptIdsCovered = allNodes
    .map((n) => n.concept_id)
    .filter((id): id is string => Boolean(id));

  return {
    title: rootNode.TEXT,
    subject: subject ?? rootNode.TEXT,
    children: topLevelBranches,
    metadata: {
      total_nodes: allNodes.length,
      max_depth: computeMaxMindmapDepth(topLevelBranches, 0),
      concept_ids_covered: conceptIdsCovered,
    },
  };
}

// ── Node conversion ───────────────────────────────────────────────────────────

/**
 * Converts a single MmNode (and its subtree) into a MindmapNode.
 *
 * For TRACKABLE nodes:
 * - `label` ← node.TEXT
 * - `concept_id` ← node.CONCEPT_ID
 * - `content` ← first 1-2 non-TRACKABLE child texts (the key teaching points)
 * - `children` ← TRACKABLE children (recursed) + remaining leaf texts as bullet nodes
 *
 * For non-TRACKABLE nodes (used when roots / intermediate non-trackable branches exist):
 * - `label` ← node.TEXT
 * - `children` ← all children recursed
 * - No concept_id
 */
function convertMmNode(node: MmNode): MindmapNode {
  const nonTrackableChildren = node.children.filter((c) => !c.TRACKABLE);
  const trackableChildren = node.children.filter((c) => c.TRACKABLE);

  const leafTexts = nonTrackableChildren
    .map((c) => c.TEXT)
    .filter((t) => t.length > 0);

  // First 1-2 leaf texts become the inline `content` field shown on expand
  const contentLeaves = leafTexts.slice(0, CONTENT_LEAF_LIMIT);
  const remainingLeaves = leafTexts.slice(CONTENT_LEAF_LIMIT);

  // Remaining leaf texts become bullet MindmapNodes (label only, no concept_id)
  const leafChildren: MindmapNode[] = remainingLeaves.map((text) => ({ label: text }));

  // Recursive TRACKABLE children
  const trackableChildNodes: MindmapNode[] = trackableChildren.map(convertMmNode);

  const children: MindmapNode[] = [...trackableChildNodes, ...leafChildren];

  const result: MindmapNode = {
    label: node.TEXT,
    children: children.length > 0 ? children : undefined,
  };

  if (node.TRACKABLE && node.CONCEPT_ID) {
    result.id = node.CONCEPT_ID;
    result.concept_id = node.CONCEPT_ID;
  }

  if (contentLeaves.length > 0) {
    result.content = contentLeaves.join(' ');
  }

  return result;
}

// ── Metadata helpers ──────────────────────────────────────────────────────────

/**
 * Flattens a MindmapNode tree into a single array for counting and id extraction.
 */
function collectAllMindmapNodes(nodes: MindmapNode[]): MindmapNode[] {
  const result: MindmapNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children) {
      result.push(...collectAllMindmapNodes(node.children));
    }
  }
  return result;
}

/**
 * Computes the maximum depth of the MindmapNode tree (root children = depth 1).
 */
function computeMaxMindmapDepth(nodes: MindmapNode[], currentDepth: number): number {
  if (nodes.length === 0) return currentDepth;
  const childDepths = nodes.map((n) =>
    n.children ? computeMaxMindmapDepth(n.children, currentDepth + 1) : currentDepth + 1,
  );
  return Math.max(...childDepths);
}
