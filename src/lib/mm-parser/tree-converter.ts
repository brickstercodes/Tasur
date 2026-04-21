/**
 * WHY: Converts a ParsedMindmap into MindmapTreeOutput for the frontend.
 *
 * The frontend renders MindmapTreeOutput — a recursive JSON tree of MindmapNode
 * objects. Rather than generating this with a separate LLM call (the old Mindmap
 * Generator agent), we now derive it deterministically from the .mm file.
 *
 * Mapping rules:
 * - Root MmNode → title + subject fields of MindmapTreeOutput
 * - TRACKABLE MmNode → MindmapNode with concept_id and label
 * - Non-TRACKABLE children (leaf or branch) → recursively converted to MindmapNode
 *   children, preserving full sub-tree depth at every level
 * - TRACKABLE children → recursively converted with concept_id
 * - Leaf MmNodes (no children) → label-only MindmapNode (visible tree leaf)
 *
 * This preserves the existing MindmapTreeOutput schema so the frontend rendering
 * code requires zero changes — only the producer changes from LLM to code.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { MindmapNode, MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { MmNode, ParsedMindmap } from './types';

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
 * Every child — TRACKABLE or not, leaf or branch — is recursively converted
 * into a visible MindmapNode. This preserves the full depth of the .mm XML
 * in the frontend tree.
 *
 * - TRACKABLE nodes get concept_id set; non-TRACKABLE nodes do not.
 * - Leaf MmNodes (no children) become label-only MindmapNodes.
 */
function convertMmNode(node: MmNode): MindmapNode {
  // Recursively convert all children, preserving their order and full sub-tree.
  const children: MindmapNode[] = node.children.map(convertMmNode);

  const result: MindmapNode = {
    label: node.TEXT,
    children: children.length > 0 ? children : undefined,
  };

  if (node.TRACKABLE && node.CONCEPT_ID) {
    result.id = node.CONCEPT_ID;
    result.concept_id = node.CONCEPT_ID;

    // Populate content from direct non-TRACKABLE leaf children (the teaching points).
    const leafTexts = node.children
      .filter((child) => !child.TRACKABLE && child.children.length === 0)
      .map((child) => child.TEXT);

    if (leafTexts.length > 0) {
      result.content = leafTexts.join(' ');
    }
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
