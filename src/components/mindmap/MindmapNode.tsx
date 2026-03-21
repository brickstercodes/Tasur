'use client';

/**
 * WHY: Custom react-flow node component for the Tasur mindmap.
 *
 * react-flow's default node is a plain rectangle — this component implements
 * the full Freeplane-style visual design from the architecture spec:
 *   - Root: dark fill (#2C3E50), white text, 12px bold.
 *   - Depth 1–4+: pastel fill, saturated border in the branch color, dark text.
 *   - Font size and weight taper with depth (12→10→8.5→7.5→7px, bold only at 0–1).
 *   - Concept nodes (those with a concept_id) show a colored confidence dot and
 *     navigate to chat on click.
 *   - Collapsed nodes show a "+N" toggle badge; expanded nodes show "−".
 *   - Hover on concept nodes adds a shadow and thickens the border.
 *   - study_cue text appears as a native tooltip via the title attribute.
 *   - Search dim: nodes with searchMatch=false render at 30% opacity.
 *
 * The component is stateless beyond hover — all other state lives in
 * MindmapViewer and is passed through FlowNodeData.
 */

import React, { useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from './layout/balanced-tree';
import { getConfidenceColor } from './color-utils';

// ── Typography constants ──────────────────────────────────────────────────────

const FONT_SIZE_BY_DEPTH: Record<number, string> = {
  0: '12px',
  1: '10px',
  2: '8.5px',
  3: '7.5px',
};
const FONT_SIZE_LEAF = '7px';

function getFontSize(depth: number): string {
  return FONT_SIZE_BY_DEPTH[depth] ?? FONT_SIZE_LEAF;
}

// ── Handle styles ─────────────────────────────────────────────────────────────

/** Invisible handle: used only to anchor edge endpoints in the DOM. */
const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 'none',
  background: 'transparent',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MindmapNode({ id, data }: NodeProps<FlowNodeData>) {
  const {
    label,
    concept_id,
    study_cue,
    depth,
    branchColor,
    pastelColor,
    confidence,
    isCollapsed,
    visibleChildCount,
    searchMatch,
    onToggleCollapse,
    onConceptClick,
  } = data;

  const [isHovered, setIsHovered] = useState(false);

  const isRoot = depth === 0;
  const isConcept = !!concept_id;
  const hasChildren = visibleChildCount > 0;

  const backgroundColor = isRoot ? '#2C3E50' : pastelColor;
  const textColor = isRoot ? '#FFFFFF' : '#1A1A2E';
  const baseBorderColor = isRoot ? '#2C3E50' : branchColor;
  const fontSize = getFontSize(depth);
  const fontWeight = depth <= 1 ? 700 : 400;

  // Hover adds a shadow and thicker border on concept nodes.
  const borderWidth = isHovered && isConcept ? 2 : 1.5;
  const boxShadow = isHovered && isConcept ? '0 2px 8px rgba(0,0,0,0.18)' : undefined;

  // Search: non-matching nodes fade to 30% opacity.
  const opacity = searchMatch === false ? 0.3 : 1;

  const handleToggleClick = useCallback(
    (event: React.MouseEvent) => {
      // Stop propagation so react-flow's node-click handler doesn't also fire.
      event.stopPropagation();
      onToggleCollapse(id);
    },
    [id, onToggleCollapse],
  );

  const handleConceptClick = useCallback(() => {
    if (isConcept && concept_id) {
      onConceptClick(concept_id);
    }
  }, [isConcept, concept_id, onConceptClick]);

  return (
    <div style={{ opacity, transition: 'opacity 0.2s ease' }}>
      {/* Left handle — used when this node is a left-side child or a left-side parent. */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={false}
        style={HIDDEN_HANDLE_STYLE}
      />

      {/* Node body */}
      <div
        title={study_cue ?? undefined}
        onClick={handleConceptClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          backgroundColor,
          border: `${borderWidth}px solid ${baseBorderColor}`,
          borderRadius: 4,
          padding: '4px 7px',
          width: isRoot ? 180 : 200,
          color: textColor,
          fontSize,
          fontWeight,
          fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
          wordBreak: 'break-word',
          lineHeight: 1.35,
          cursor: isConcept ? 'pointer' : 'default',
          position: 'relative',
          boxSizing: 'border-box',
          userSelect: 'none',
          boxShadow,
          transition: 'box-shadow 0.15s ease, border-width 0.1s ease',
        }}
      >
        {/* Confidence dot for concept nodes that have been assessed. */}
        {isConcept && confidence !== undefined && (
          <span
            aria-label={`Confidence: ${Math.round(confidence * 100)}%`}
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: getConfidenceColor(confidence),
              marginRight: 4,
              verticalAlign: 'middle',
              flexShrink: 0,
            }}
          />
        )}

        {label}

        {/* Expand / collapse toggle badge (not shown on root). */}
        {hasChildren && !isRoot && (
          <span
            onClick={handleToggleClick}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            style={{
              display: 'inline-block',
              marginLeft: 5,
              fontSize: '9px',
              color: textColor,
              opacity: 0.55,
              cursor: 'pointer',
              verticalAlign: 'middle',
              userSelect: 'none',
              fontWeight: 400,
            }}
          >
            {isCollapsed ? `+${visibleChildCount}` : '−'}
          </span>
        )}
      </div>

      {/* Right handle — used when this node is a right-side child or a right-side parent. */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={HIDDEN_HANDLE_STYLE}
      />
    </div>
  );
}
