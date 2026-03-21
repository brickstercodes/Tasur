/**
 * WHY: Color utilities for the Tasur mindmap visualization.
 *
 * The visual design uses a branch-level color palette: each top-level branch
 * and all its descendants share one color. Node fills are a pastel tint of the
 * branch color (pushed ~82% toward white); borders use the full-saturation
 * branch color. This creates clear branch grouping without overwhelming content.
 *
 * Confidence overlay colors follow a traffic-light convention (green/amber/red)
 * so students can read their mastery state at a glance.
 *
 * No framework imports — pure TypeScript computation.
 */

import type { MindmapNode } from '@/lib/schemas/mindmap-tree-output';

// ── Branch palette ────────────────────────────────────────────────────────────

/**
 * Fixed 8-color palette assigned round-robin to top-level branches.
 * Colors are chosen for visual distinction and study-tool aesthetics
 * (matching Freeplane's default color scheme).
 */
export const BRANCH_PALETTE = [
  '#2C7BB6', // blue
  '#1A9641', // green
  '#D7191C', // red
  '#756BB1', // purple
  '#E6550D', // orange
  '#0E7F7F', // teal
  '#8C510A', // brown
  '#C51B7D', // pink
] as const;

// ── Confidence thresholds ─────────────────────────────────────────────────────

const MASTERY_THRESHOLD = 0.7;
const PARTIAL_THRESHOLD = 0.3;

export const CONFIDENCE_COLORS = {
  mastered: '#1A9641',
  partial: '#E6AB02',
  untouched: '#D7191C',
} as const;

// ── Color math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Lightens a hex color toward white by the given factor.
 * formula: channel = base + (255 - base) * factor
 * factor=0.82 → soft pastel suitable for node backgrounds.
 */
export function lightenColor(hex: string, factor = 0.82): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * factor, g + (255 - g) * factor, b + (255 - b) * factor);
}

/**
 * Returns green, amber, or red depending on confidence score thresholds.
 * Used for the small dot overlay on concept nodes.
 */
export function getConfidenceColor(score: number): string {
  if (score >= MASTERY_THRESHOLD) return CONFIDENCE_COLORS.mastered;
  if (score >= PARTIAL_THRESHOLD) return CONFIDENCE_COLORS.partial;
  return CONFIDENCE_COLORS.untouched;
}

// ── Stable node ID ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * Returns a stable, unique ID for a MindmapNode suitable for use as a
 * react-flow node id. Preference order: concept_id → id → path-based slug.
 *
 * @param node         The node to identify.
 * @param parentId     The parent's stable id (used to scope path-based slugs).
 * @param siblingIndex The node's index among its siblings (prevents collisions
 *                     when two siblings have the same label).
 */
export function getStableNodeId(
  node: MindmapNode,
  parentId: string,
  siblingIndex: number,
): string {
  if (node.concept_id) return node.concept_id;
  if (node.id) return node.id;
  return `${parentId}__${siblingIndex}__${slugify(node.label)}`;
}
