/**
 * WHY: Custom balanced-tree layout algorithm for the Tasur mindmap.
 *
 * react-flow has no built-in tree layout with Freeplane's balanced left-right
 * split (first half of branches go right, second half go left, root centered).
 * dagre handles left-right layouts but not the bilateral split we need.
 *
 * This module does one thing: MindmapTreeOutput → react-flow Node[] + Edge[].
 *
 * Layout rules (ported from mm_to_pdf.py reference logic):
 *   1. Split top-level children: ceil(n/2) → right, floor(n/2) → left.
 *   2. Each side lays out independently: children expand outward from root.
 *   3. Each node is vertically centered within its subtree.
 *   4. Subtree height = sum of children subtree heights + (n-1) * VERTICAL_GAP.
 *      If a node is in collapsedNodes, its subtree height = its own height only.
 *   5. Branch color is assigned round-robin from BRANCH_PALETTE and propagated
 *      to all descendants.
 *
 * Coordinates: root centered at (0, 0). X grows right for right-side branches,
 * grows left (negative) for left-side branches.
 *
 * No LLM calls. No Supabase. No framework imports at runtime.
 */

import type { Node, Edge } from 'reactflow';
import type { MindmapTreeOutput, MindmapNode } from '@/lib/schemas/mindmap-tree-output';
import { BRANCH_PALETTE, lightenColor, getConfidenceColor, getStableNodeId } from '../color-utils';

// ── Layout constants ──────────────────────────────────────────────────────────

/** Estimated width of the root node in pixels. */
const ROOT_WIDTH = 180;

/** Estimated height of the root node in pixels. */
const ROOT_HEIGHT = 52;

/** Estimated width of all non-root nodes in pixels. */
const NODE_WIDTH = 200;

/** Vertical space between sibling subtrees in pixels. */
const VERTICAL_GAP = 18;

/** Horizontal space between a parent's edge and its children's nearest edge. */
const HORIZONTAL_GAP = 64;

/** Approximate chars that fit per line at NODE_WIDTH. Used for height estimation. */
const CHARS_PER_LINE = 22;

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Data attached to every react-flow node in the mindmap.
 * The node component reads these fields for rendering and interaction.
 */
export type FlowNodeData = {
  label: string;
  concept_id?: string;
  content?: string;
  study_cue?: string;
  depth: number;
  direction: 'root' | 'right' | 'left';
  branchColor: string;
  pastelColor: string;
  confidence?: number;
  isCollapsed: boolean;
  visibleChildCount: number;
  /** Undefined = no active search. True = matches query. False = does not match. */
  searchMatch?: boolean;
  /** True on the single node the graph recommends the student work on next. */
  isResumeTarget?: boolean;
  onToggleCollapse: (nodeId: string) => void;
  onConceptClick: (conceptId: string) => void;
};

/** Data attached to every react-flow edge in the mindmap. */
export type FlowEdgeData = {
  depth: number;
  branchColor: string;
  direction: 'right' | 'left';
};

// ── Internal layout context ───────────────────────────────────────────────────

type LayoutContext = {
  confidenceMap: Map<string, number>;
  collapsedNodes: Set<string>;
  onToggleCollapse: (nodeId: string) => void;
  onConceptClick: (conceptId: string) => void;
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
};

// ── Height estimation ─────────────────────────────────────────────────────────

/**
 * Estimates a node's rendered height based on its label length and depth.
 * Text wraps at CHARS_PER_LINE; height grows proportionally. This is an
 * approximation — the actual CSS renders correctly even if this is off by
 * a few pixels, since react-flow re-measures handles from the DOM.
 */
function estimateNodeHeight(label: string, depth: number): number {
  const lines = Math.max(1, Math.ceil(label.length / CHARS_PER_LINE));
  const lineHeightByDepth = [18, 15, 14, 13, 12];
  const lineH = lineHeightByDepth[Math.min(depth, 4)];
  const verticalPadding = 8;
  const minimumByDepth = [ROOT_HEIGHT, 40, 36, 32, 28];
  const minimum = minimumByDepth[Math.min(depth, 4)];
  return Math.max(minimum, lines * lineH + verticalPadding);
}

/**
 * Computes the total vertical height a node's subtree occupies, respecting
 * the collapsed state. A collapsed node's subtree height equals its own height
 * (children are hidden and don't contribute to the layout).
 */
function computeSubtreeHeight(
  node: MindmapNode,
  nodeId: string,
  depth: number,
  collapsedNodes: Set<string>,
): number {
  const nodeHeight = estimateNodeHeight(node.label, depth);

  const isCollapsed = collapsedNodes.has(nodeId);
  if (isCollapsed || !node.children || node.children.length === 0) {
    return nodeHeight;
  }

  const childHeights = node.children.map((child, index) => {
    const childId = getStableNodeId(child, nodeId, index);
    return computeSubtreeHeight(child, childId, depth + 1, collapsedNodes);
  });

  const totalChildHeight =
    childHeights.reduce((sum, h) => sum + h, 0) +
    (node.children.length - 1) * VERTICAL_GAP;

  return Math.max(nodeHeight, totalChildHeight);
}

// ── Recursive node positioning ────────────────────────────────────────────────

/**
 * Recursively positions a node and all its visible descendants, emitting
 * react-flow Node and Edge objects into ctx.nodes and ctx.edges.
 *
 * @param node         The MindmapNode to position.
 * @param subtreeTopY  The Y coordinate of the top of this node's subtree.
 * @param nodeX        The X coordinate (top-left) for this node.
 * @param direction    'right' expands further right; 'left' expands further left.
 * @param depth        Tree depth (1 = first level below root).
 * @param parentId     The react-flow id of the parent node.
 * @param siblingIndex The node's index among its siblings.
 * @param branchColor  The hex color inherited from the top-level branch ancestor.
 * @param ctx          Shared layout context (accumulates nodes + edges).
 */
function positionNode(
  node: MindmapNode,
  subtreeTopY: number,
  nodeX: number,
  direction: 'right' | 'left',
  depth: number,
  parentId: string,
  siblingIndex: number,
  branchColor: string,
  ctx: LayoutContext,
): void {
  const nodeId = getStableNodeId(node, parentId, siblingIndex);
  const nodeHeight = estimateNodeHeight(node.label, depth);
  const subtreeHeight = computeSubtreeHeight(node, nodeId, depth, ctx.collapsedNodes);

  // Center the node vertically within its assigned subtree slice.
  const nodeY = subtreeTopY + (subtreeHeight - nodeHeight) / 2;

  const pastelColor = lightenColor(branchColor);
  const confidence = node.concept_id ? ctx.confidenceMap.get(node.concept_id) : undefined;
  const isCollapsed = ctx.collapsedNodes.has(nodeId);
  const visibleChildCount = node.children?.length ?? 0;

  ctx.nodes.push({
    id: nodeId,
    type: 'mindmapNode',
    position: { x: nodeX, y: nodeY },
    data: {
      label: node.label,
      concept_id: node.concept_id,
      content: node.content,
      study_cue: node.study_cue,
      depth,
      direction,
      branchColor,
      pastelColor,
      confidence,
      isCollapsed,
      visibleChildCount,
      onToggleCollapse: ctx.onToggleCollapse,
      onConceptClick: ctx.onConceptClick,
    },
    // Non-concept leaf nodes are not selectable (they're just detail bullets).
    selectable: !!node.concept_id,
    draggable: false,
  });

  // Edge from parent to this node.
  const sourceHandle = direction === 'right' ? 'right' : 'left';
  const targetHandle = direction === 'right' ? 'left' : 'right';
  ctx.edges.push({
    id: `edge-${parentId}-${nodeId}`,
    source: parentId,
    target: nodeId,
    sourceHandle,
    targetHandle,
    type: 'mindmapEdge',
    data: { depth, branchColor, direction },
  });

  // Recurse into children if not collapsed.
  if (!isCollapsed && node.children && node.children.length > 0) {
    const childX =
      direction === 'right'
        ? nodeX + NODE_WIDTH + HORIZONTAL_GAP
        : nodeX - NODE_WIDTH - HORIZONTAL_GAP;

    let currentY = subtreeTopY;
    for (const [index, child] of node.children.entries()) {
      const childId = getStableNodeId(child, nodeId, index);
      const childSubtreeHeight = computeSubtreeHeight(child, childId, depth + 1, ctx.collapsedNodes);
      positionNode(child, currentY, childX, direction, depth + 1, nodeId, index, branchColor, ctx);
      currentY += childSubtreeHeight + VERTICAL_GAP;
    }
  }
}

// ── Main layout function ──────────────────────────────────────────────────────

/**
 * Computes react-flow Node[] + Edge[] for the full mindmap tree, accounting
 * for the current collapsed state.
 *
 * Called on every render cycle where collapsedNodes or confidenceMap changes.
 * Pure computation — no DOM access, no side effects.
 */
export function buildBalancedTreeLayout(
  tree: MindmapTreeOutput,
  confidenceMap: Map<string, number>,
  collapsedNodes: Set<string>,
  onToggleCollapse: (nodeId: string) => void,
  onConceptClick: (conceptId: string) => void,
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge<FlowEdgeData>[] = [];

  const ctx: LayoutContext = {
    confidenceMap,
    collapsedNodes,
    onToggleCollapse,
    onConceptClick,
    nodes,
    edges,
  };

  // Root is centered at the origin. Position is top-left corner.
  const rootId = 'root';
  nodes.push({
    id: rootId,
    type: 'mindmapNode',
    position: { x: -ROOT_WIDTH / 2, y: -ROOT_HEIGHT / 2 },
    data: {
      label: tree.title,
      depth: 0,
      direction: 'root',
      branchColor: '#2C3E50',
      pastelColor: '#2C3E50',
      isCollapsed: false,
      visibleChildCount: 0,
      onToggleCollapse,
      onConceptClick,
    },
    selectable: false,
    draggable: false,
  });

  const totalBranches = tree.children.length;
  const rightCount = Math.ceil(totalBranches / 2);
  const rightBranches = tree.children.slice(0, rightCount);
  const leftBranches = tree.children.slice(rightCount);

  // Both groups are vertically centered around root's center Y (y=0).
  const rootCenterY = 0;

  // ── Right side ──────────────────────────────────────────────────────────────

  if (rightBranches.length > 0) {
    const rightTotalHeight =
      rightBranches
        .map((branch, index) => {
          const id = getStableNodeId(branch, rootId, index);
          return computeSubtreeHeight(branch, id, 1, collapsedNodes);
        })
        .reduce((sum, h) => sum + h, 0) +
      (rightBranches.length - 1) * VERTICAL_GAP;

    let rightCurrentY = rootCenterY - rightTotalHeight / 2;
    const rightX = ROOT_WIDTH / 2 + HORIZONTAL_GAP;

    for (const [index, branch] of rightBranches.entries()) {
      const branchColor = BRANCH_PALETTE[index % BRANCH_PALETTE.length];
      const branchId = getStableNodeId(branch, rootId, index);
      const branchHeight = computeSubtreeHeight(branch, branchId, 1, collapsedNodes);
      positionNode(branch, rightCurrentY, rightX, 'right', 1, rootId, index, branchColor, ctx);
      rightCurrentY += branchHeight + VERTICAL_GAP;
    }
  }

  // ── Left side ───────────────────────────────────────────────────────────────

  if (leftBranches.length > 0) {
    const leftTotalHeight =
      leftBranches
        .map((branch, index) => {
          const id = getStableNodeId(branch, rootId, rightCount + index);
          return computeSubtreeHeight(branch, id, 1, collapsedNodes);
        })
        .reduce((sum, h) => sum + h, 0) +
      (leftBranches.length - 1) * VERTICAL_GAP;

    let leftCurrentY = rootCenterY - leftTotalHeight / 2;
    const leftX = -(ROOT_WIDTH / 2 + HORIZONTAL_GAP + NODE_WIDTH);

    for (const [index, branch] of leftBranches.entries()) {
      // Continue palette where right side left off to keep colors distinct.
      const branchColor = BRANCH_PALETTE[(rightCount + index) % BRANCH_PALETTE.length];
      const siblingIndex = rightCount + index;
      const branchId = getStableNodeId(branch, rootId, siblingIndex);
      const branchHeight = computeSubtreeHeight(branch, branchId, 1, collapsedNodes);
      positionNode(branch, leftCurrentY, leftX, 'left', 1, rootId, siblingIndex, branchColor, ctx);
      leftCurrentY += branchHeight + VERTICAL_GAP;
    }
  }

  return { nodes, edges };
}

// ── Utility: get IDs of all depth-1 nodes ────────────────────────────────────

/**
 * Returns the stable IDs of all top-level branch nodes (depth 1).
 * Used by MindmapViewer's "collapse all" button to hide the entire tree body.
 */
export function getTopLevelNodeIds(tree: MindmapTreeOutput): string[] {
  return tree.children.map((branch, index) => getStableNodeId(branch, 'root', index));
}
