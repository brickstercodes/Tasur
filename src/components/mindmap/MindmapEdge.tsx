'use client';

/**
 * WHY: Custom react-flow edge component for the Tasur mindmap.
 *
 * react-flow's default edges are straight lines and don't match the Freeplane
 * visual spec. This component renders curved bezier connectors that:
 *   - Attach to the nearest horizontal edge of each node (right-side branches
 *     connect via right→left handles; left-side branches via left→right handles).
 *   - Inherit the branch color from edge data.
 *   - Taper in stroke width with tree depth (1.5→1.3→1.1→0.8px).
 *
 * The source/target handle IDs ('left'/'right') on the edge objects in
 * balanced-tree.ts control which Handle the edge attaches to, which in turn
 * provides sourcePosition/targetPosition to getBezierPath — ensuring the
 * control points curve correctly outward from the tree center.
 */

import React from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';
import type { FlowEdgeData } from './layout/balanced-tree';

// ── Stroke width by depth ─────────────────────────────────────────────────────

const STROKE_WIDTH_BY_DEPTH: Record<number, number> = {
  1: 1.5,
  2: 1.3,
  3: 1.1,
};
const STROKE_WIDTH_LEAF = 0.8;

const EDGE_COLOR_MIX_BY_DEPTH: Record<number, number> = {
  1: 62,
  2: 54,
  3: 46,
};
const EDGE_COLOR_MIX_LEAF = 38;

function getStrokeWidth(depth: number): number {
  return STROKE_WIDTH_BY_DEPTH[depth] ?? STROKE_WIDTH_LEAF;
}

function getStrokeColor(depth: number, branchColor: string): string {
  const mixPct = EDGE_COLOR_MIX_BY_DEPTH[depth] ?? EDGE_COLOR_MIX_LEAF;
  return `color-mix(in srgb, ${branchColor} ${mixPct}%, var(--mindmap-edge))`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MindmapEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
}: EdgeProps<FlowEdgeData>) {
  // Guard: data is always present in our layout but EdgeProps types it as optional.
  if (!data) return null;

  const { depth, branchColor } = data;
  const strokeWidth = getStrokeWidth(depth);
  const strokeColor = getStrokeColor(depth, branchColor);

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{ stroke: strokeColor, strokeWidth, fill: 'none' }}
    />
  );
}
