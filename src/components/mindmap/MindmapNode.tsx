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
  if (depth === 1) return { padding: '7px 12px', fontSize: '13px', fontWeight: 500, width: 190 };
  if (depth === 2) return { padding: '5px 10px', fontSize: '12px', fontWeight: 500, width: 185 };
  return { padding: '4px 8px', fontSize: '12px', fontWeight: 400, width: 180 };
}

// ── Depth-based node colour ───────────────────────────────────────────────────
// Three warm parchment tones that deepen with each level of the tree —
// like layers of aged paper, lightest at the top, dustiest at the leaves.

function getNodeBackground(depth: number): { bg: string; border: string; borderHover: string } {
  if (depth === 1) return { bg: 'var(--mindmap-node-1)', border: 'var(--mindmap-node-border)', borderHover: 'var(--mindmap-node-border-hover)' };
  if (depth === 2) return { bg: 'var(--mindmap-node-2)', border: 'var(--mindmap-node-border)', borderHover: 'var(--mindmap-node-border-hover)' };
  return           { bg: 'var(--mindmap-node-1)', border: 'var(--mindmap-node-border)', borderHover: 'var(--mindmap-node-border-hover)' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MindmapNode({ id, data }: NodeProps<FlowNodeData>) {
  const {
    label,
    concept_id,
    study_cue,
    depth,
    direction,
    branchColor,
    confidence,
    isCollapsed,
    visibleChildCount,
    searchMatch,
    isResumeTarget,
    onToggleCollapse,
    onConceptClick,
  } = data;

  const [isHovered, setIsHovered] = useState(false);
  const [bubbleHovered, setBubbleHovered] = useState(false);

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
    (event: React.PointerEvent) => {
      // Stop propagation so react-flow's node-click handler doesn't also fire.
      event.preventDefault();
      event.stopPropagation();
      onToggleCollapse(id);
    },
    [id, onToggleCollapse],
  );

  const handleNodePointerDown = useCallback((event: React.PointerEvent) => {
    // Prevent click-hold from initiating any React Flow node-level interaction.
    event.stopPropagation();
  }, []);

  const handleConceptClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (hasChildren) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      // Ignore node-clicks in the bubble overlap zone so expand intent doesn't
      // accidentally route the user into concept chat.
      const nearBubbleX = direction === 'left'
        ? x <= 16
        : x >= bounds.width - 16;
      const nearBubbleY = Math.abs(y - bounds.height / 2) <= 14;

      if (nearBubbleX && nearBubbleY) return;
    }

    if (isConcept && concept_id) {
      onConceptClick(concept_id);
    }
  }, [hasChildren, direction, isConcept, concept_id, onConceptClick]);

  // ── Root node ───────────────────────────────────────────────────────────────
  if (isRoot) {
    return (
      <div className="nodrag nopan" style={{ opacity, transition: 'opacity 0.2s ease' }}>
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
          className="nopan"
          onPointerDown={handleNodePointerDown}
          title={study_cue ?? undefined}
          style={{
            background: 'var(--mindmap-node-root)',
            color: '#FAFAF7',
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
    <div className="nodrag nopan" style={{ opacity, transition: 'opacity 0.2s ease' }}>
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
        className="nopan"
        onPointerDown={handleNodePointerDown}
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
          color: 'var(--mindmap-node-text)',
          fontFamily: "'Instrument Serif', Georgia, serif",
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

        {/* Edge bubble — sits at the expansion side of the node */}
        {hasChildren && (
          <span
            className="nopan"
            onPointerDown={handleToggleClick}
            onMouseEnter={() => setBubbleHovered(true)}
            onMouseLeave={() => setBubbleHovered(false)}
            title={isCollapsed ? `Expand ${visibleChildCount} items` : 'Collapse'}
            style={{
              position: 'absolute',
              ...(direction === 'left'
                ? { left: -14 }
                : { right: -14 }),
              top: '50%',
              transform: `translateY(-50%) scale(${bubbleHovered ? 1.35 : 1})`,
              transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1), background 0.12s ease, color 0.12s ease',
              minWidth: 22,
              height: 22,
              borderRadius: 11,
              background: bubbleHovered ? branchColor : `${branchColor}28`,
              border: `1.5px solid ${branchColor}`,
              color: bubbleHovered ? '#fff' : branchColor,
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "'Courier New', monospace",
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              padding: '0 4px',
              userSelect: 'none',
              flexShrink: 0,
              lineHeight: 1,
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
