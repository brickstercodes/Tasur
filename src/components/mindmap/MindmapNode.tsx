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

import React, { useState, useCallback, useRef } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { FlowNodeData } from './layout/balanced-tree';
import { getConfidenceColor } from './color-utils';
import { getDocFromCache } from '@/lib/doc-cache';
import { getDiagramPage, saveDiagramPage } from '@/lib/diagram-cache';

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

function getNodeBackground(branchColor: string, depth: number): {
  bg: string;
  border: string;
  borderHover: string;
} {
  const baseBg = depth === 2 ? 'var(--mindmap-node-2)' : 'var(--mindmap-node-1)';

  // Mix branch hue with existing theme tokens so colors adapt in both themes.
  if (depth === 1) {
    return {
      bg: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-fill-l1), ${baseBg})`,
      border: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-l1), var(--mindmap-node-border))`,
      borderHover: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-hover-l1), var(--mindmap-node-border-hover))`,
    };
  }

  if (depth === 2) {
    return {
      bg: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-fill-l2), ${baseBg})`,
      border: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-l2), var(--mindmap-node-border))`,
      borderHover: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-hover-l2), var(--mindmap-node-border-hover))`,
    };
  }

  return {
    bg: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-fill-l3), ${baseBg})`,
    border: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-l3), var(--mindmap-node-border))`,
    borderHover: `color-mix(in srgb, ${branchColor} var(--mindmap-branch-border-hover-l3), var(--mindmap-node-border-hover))`,
  };
}

// ── Diagram node ──────────────────────────────────────────────────────────────

/**
 * Renders a [DIAGRAM TO STUDY: p.N: description] leaf as a camera-icon button.
 * On click it shows the rendered PDF page full-screen with a blurred backdrop.
 * The rendered page image is cached in IndexedDB after the first load.
 */
function DiagramNodeContent({
  sessionId,
  pageNumber,
  description,
  branchColor,
}: {
  sessionId: string;
  pageNumber: number;
  description: string;
  branchColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const renderRef = useRef(false);

  const loadPage = useCallback(async () => {
    if (imgSrc || renderRef.current) return;
    renderRef.current = true;
    setLoading(true);
    setError(false);

    try {
      // Check IndexedDB cache first
      const cached = await getDiagramPage(sessionId, pageNumber);
      if (cached) {
        setImgSrc(cached.dataUrl);
        setLoading(false);
        return;
      }

      // Load PDF from doc cache
      const doc = await getDocFromCache(sessionId);
      if (!doc) {
        setError(true);
        setLoading(false);
        return;
      }

      // Lazy-load pdfjs-dist — it's large and only needed when a diagram is clicked
      const pdfjs = await import('pdfjs-dist');
      // Use a CDN worker to avoid bundling the heavy worker JS in the main chunk
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await doc.data.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

      const targetPage = Math.max(1, Math.min(pageNumber, pdf.numPages));
      const page = await pdf.getPage(targetPage);

      const scale = 2.0; // 2× for retina sharpness
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvas, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      await saveDiagramPage(sessionId, pageNumber, dataUrl, viewport.width, viewport.height);
      setImgSrc(dataUrl);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId, pageNumber, imgSrc]);

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(true);
      loadPage();
    },
    [loadPage],
  );

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
  }, []);

  return (
    <>
      {/* Diagram node chip */}
      <div
        className="nopan"
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          width: 180,
          background: `color-mix(in srgb, ${branchColor} 12%, var(--mindmap-node-1))`,
          border: `1.5px dashed color-mix(in srgb, ${branchColor} 55%, var(--mindmap-node-border))`,
          borderRadius: 8,
          cursor: 'pointer',
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
        title="Click to view diagram"
      >
        <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>📷</span>
        <span
          style={{
            fontSize: 11,
            color: `color-mix(in srgb, ${branchColor} 70%, var(--mindmap-node-text))`,
            lineHeight: 1.3,
            fontFamily: "'Instrument Serif', Georgia, serif",
            wordBreak: 'break-word',
            flex: 1,
          }}
        >
          {description}
          {pageNumber > 0 && (
            <span
              style={{
                display: 'block',
                fontSize: 9,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text-muted)',
                marginTop: 1,
              }}
            >
              p.{pageNumber} · tap to view
            </span>
          )}
        </span>
      </div>

      {/* Full-screen lightbox */}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(12px) brightness(0.45)',
            WebkitBackdropFilter: 'blur(12px) brightness(0.45)',
            cursor: 'zoom-out',
          }}
        >
          {/* Stop propagation so clicks inside the image don't close */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '88vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {/* Header bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.55)',
                borderRadius: '10px 10px 0 0',
                color: '#fff',
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.9, maxWidth: '80%', lineHeight: 1.4 }}>
                {description}
                {pageNumber > 0 && (
                  <span style={{ opacity: 0.6, marginLeft: 8, fontFamily: 'monospace', fontSize: 11 }}>
                    p.{pageNumber}
                  </span>
                )}
              </span>
              <button
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: 20,
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: 1,
                  opacity: 0.75,
                }}
              >
                ✕
              </button>
            </div>

            {/* Image / loading / error */}
            <div
              style={{
                background: '#fff',
                borderRadius: '0 0 10px 10px',
                overflow: 'hidden',
                maxWidth: '88vw',
                maxHeight: 'calc(88vh - 50px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 320,
                minHeight: 200,
              }}
            >
              {loading && (
                <span style={{ color: '#888', fontSize: 13, padding: 32 }}>Rendering page…</span>
              )}
              {error && !loading && (
                <span style={{ color: '#c0392b', fontSize: 13, padding: 32 }}>
                  Could not render page — PDF may not be cached locally.
                </span>
              )}
              {imgSrc && !loading && (
                <img
                  src={imgSrc}
                  alt={description}
                  style={{
                    maxWidth: '88vw',
                    maxHeight: 'calc(88vh - 50px)',
                    display: 'block',
                    objectFit: 'contain',
                  }}
                />
              )}
            </div>

            <span
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                fontFamily: 'monospace',
              }}
            >
              Click outside or ✕ to close
            </span>
          </div>
        </div>
      )}
    </>
  );
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
    isFocusDimmed,
    isResumeTarget,
    onToggleCollapse,
    onConceptClick,
  } = data;

  const [isHovered, setIsHovered] = useState(false);
  const [bubbleHovered, setBubbleHovered] = useState(false);

  const isRoot = depth === 0;
  const isConcept = !!concept_id;
  const hasChildren = visibleChildCount > 0;

  // Search + focus mode: non-matches and out-of-focus branches dim.
  const searchOpacity = searchMatch === false ? 0.3 : 1;
  const focusOpacity = isFocusDimmed ? 0.2 : 1;
  const opacity = Math.min(searchOpacity, focusOpacity);

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

  // ── Diagram leaf nodes ──────────────────────────────────────────────────────
  if (data.isDiagramNode && data.sessionId && data.diagramDescription !== undefined) {
    return (
      <div className="nodrag nopan" style={{ opacity, transition: 'opacity 0.2s ease' }}>
        <Handle id="left" type="source" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE_STYLE} />
        <Handle id="left" type="target" position={Position.Left} isConnectable={false} style={HIDDEN_HANDLE_STYLE} />
        <DiagramNodeContent
          sessionId={data.sessionId}
          pageNumber={data.diagramPageNumber ?? 0}
          description={data.diagramDescription}
          branchColor={branchColor}
        />
        <Handle id="right" type="source" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE_STYLE} />
        <Handle id="right" type="target" position={Position.Right} isConnectable={false} style={HIDDEN_HANDLE_STYLE} />
      </div>
    );
  }

  // ── Non-root nodes ──────────────────────────────────────────────────────────
  const { padding, fontSize, fontWeight, width } = getDepthStyles(depth);
  const { bg, border, borderHover } = getNodeBackground(branchColor, depth);

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
