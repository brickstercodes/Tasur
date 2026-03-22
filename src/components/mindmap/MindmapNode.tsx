'use client';

/**
 * WHY: Custom react-flow node component for the Tasur mindmap.
 *
 * react-flow's default node is a plain rectangle — this component implements
 * the "Nocturne Vellum" visual design:
 *   - Root: dark pill (#1C1917), white text, Instrument Serif.
 *   - All other nodes: warm parchment (#F4F3EE), Inter font, depth-scaled sizing.
 *   - Concept nodes (those with a concept_id) show a colored confidence dot BEFORE
 *     the label text and navigate to chat on click.
 *   - Collapsed nodes show a "+N" toggle badge; expanded nodes show "−".
 *   - Hover on non-root nodes adds a shadow and darker border.
 *   - study_cue text appears as a native tooltip via the title attribute.
 *   - Search dim: nodes with searchMatch=false render at 30% opacity.
 *   - Resume target pulse: amber ring animation.
 */

import React, { useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from './layout/balanced-tree';
import { getConfidenceColor } from './color-utils';

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

// ── Depth-based sizing ────────────────────────────────────────────────────────

function getDepthStyles(depth: number): {
  padding: string;
  fontSize: string;
  fontWeight: number;
  width: number;
} {
  if (depth === 1) return { padding: '7px 12px', fontSize: '11px', fontWeight: 500, width: 190 };
  if (depth === 2) return { padding: '5px 10px', fontSize: '10.5px', fontWeight: 500, width: 185 };
  return { padding: '4px 8px', fontSize: '10px', fontWeight: 400, width: 180 };
}

// ── Depth-based node colour ───────────────────────────────────────────────────
// Three warm parchment tones that deepen with each level of the tree —
// like layers of aged paper, lightest at the top, dustiest at the leaves.

function getNodeBackground(depth: number): { bg: string; border: string; borderHover: string } {
  if (depth === 1) return { bg: '#F2EDE3', border: '#DDD5C4', borderHover: '#C4B9A6' };
  if (depth === 2) return { bg: '#E8DFD0', border: '#D0C4B0', borderHover: '#B8A99A' };
  return           { bg: '#DDD4C2', border: '#C4B8A4', borderHover: '#A89A88' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MindmapNode({ id, data }: NodeProps<FlowNodeData>) {
  const {
    label,
    concept_id,
    study_cue,
    depth,
    confidence,
    isCollapsed,
    visibleChildCount,
    searchMatch,
    isResumeTarget,
    onToggleCollapse,
    onConceptClick,
  } = data;

  const [isHovered, setIsHovered] = useState(false);

  const isRoot = depth === 0;
  const isConcept = !!concept_id;
  const hasChildren = visibleChildCount > 0;

  // Search: non-matching nodes fade to 30% opacity.
  const opacity = searchMatch === false ? 0.3 : 1;

  // Resume target pulsing ring is driven by the CSS animation injected in MindmapViewer.
  const animation = isResumeTarget && !isHovered
    ? 'resumePulse 2s ease-out infinite'
    : undefined;

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

  // ── Root node ───────────────────────────────────────────────────────────────
  if (isRoot) {
    return (
      <div style={{ opacity, transition: 'opacity 0.2s ease' }}>
        <Handle
          id="left"
          type="source"
          position={Position.Left}
          isConnectable={false}
          style={HIDDEN_HANDLE_STYLE}
        />
        <Handle
          id="left"
          type="target"
          position={Position.Left}
          isConnectable={false}
          style={HIDDEN_HANDLE_STYLE}
        />

        <div
          title={study_cue ?? undefined}
          style={{
            background: '#1C1917',
            color: '#F9F9F6',
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: '13px',
            fontWeight: 400,
            padding: '10px 18px',
            borderRadius: '12px',
            border: 'none',
            width: 200,
            letterSpacing: '-0.01em',
            wordBreak: 'break-word',
            lineHeight: 1.35,
            cursor: 'default',
            position: 'relative',
            boxSizing: 'border-box',
            userSelect: 'none',
            animation,
          }}
        >
          {label}
        </div>

        <Handle
          id="right"
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={HIDDEN_HANDLE_STYLE}
        />
        <Handle
          id="right"
          type="target"
          position={Position.Right}
          isConnectable={false}
          style={HIDDEN_HANDLE_STYLE}
        />
      </div>
    );
  }

  // ── Non-root nodes ──────────────────────────────────────────────────────────
  const { padding, fontSize, fontWeight, width } = getDepthStyles(depth);
  const { bg, border, borderHover } = getNodeBackground(depth);

  const borderColor = isHovered ? borderHover : border;
  const boxShadow = isHovered ? '0 2px 12px rgba(0,0,0,0.08)' : undefined;

  return (
    <div style={{ opacity, transition: 'opacity 0.2s ease' }}>
      {/* Left handles */}
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        isConnectable={false}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="left"
        type="target"
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
          background: bg,
          border: `1px solid ${borderColor}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding,
          width,
          color: '#1C1917',
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontSize,
          fontWeight,
          wordBreak: 'break-word',
          lineHeight: 1.35,
          cursor: isConcept ? 'pointer' : 'default',
          position: 'relative',
          boxSizing: 'border-box',
          userSelect: 'none',
          boxShadow,
          animation,
          transition: 'box-shadow 0.15s ease, border-color 0.1s ease',
        }}
      >
        {/* Confidence dot before label text */}
        {isConcept && confidence !== undefined && (
          <span
            aria-label={`Confidence: ${Math.round(confidence * 100)}%`}
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: getConfidenceColor(confidence),
              flexShrink: 0,
            }}
          />
        )}

        <span style={{ flex: 1 }}>{label}</span>

        {/* Expand / collapse toggle badge */}
        {hasChildren && (
          <span
            onClick={handleToggleClick}
            title={isCollapsed ? 'Expand' : 'Collapse'}
            style={{
              display: 'inline-block',
              fontSize: '9px',
              color: '#78716C',
              opacity: 0.7,
              cursor: 'pointer',
              userSelect: 'none',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {isCollapsed ? `+${visibleChildCount}` : '−'}
          </span>
        )}
      </div>

      {/* Right handles */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={HIDDEN_HANDLE_STYLE}
      />
      <Handle
        id="right"
        type="target"
        position={Position.Right}
        isConnectable={false}
        style={HIDDEN_HANDLE_STYLE}
      />
    </div>
  );
}
