'use client';

/**
 * WHY: Root client component for the interactive mindmap view.
 *
 * This is the "wow moment" — the first thing a student sees after uploading
 * material. It wraps react-flow with Tasur's custom layout and visual design
 * using the "Nocturne Vellum" aesthetic.
 *
 * Responsibilities:
 *   - Manages collapsed node state and re-runs the balanced-tree layout when
 *     it changes (so the tree re-centers correctly, not just hides nodes).
 *   - Manages search query: matching nodes are highlighted, others fade to 30%.
 *   - Exposes a pill-shaped floating toolbar with zoom, fit-to-view,
 *     expand-all, collapse-all, search, and a learning-mode indicator.
 *   - Passes stable callbacks to node data so nodes can toggle collapse and
 *     navigate to concept chat without re-registering event listeners.
 *   - Uses ReactFlowProvider so toolbar controls can call useReactFlow() from
 *     inside the provider's context.
 *
 * The component is split into MindmapViewer (renders the provider) and
 * MindmapViewerContent (uses the hooks). This follows react-flow's required
 * pattern for using useReactFlow outside the ReactFlow component tree.
 */

import React, { useState, useMemo, useCallback } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useRouter } from 'next/navigation';

import { MindmapNode } from './MindmapNode';
import { MindmapEdge } from './MindmapEdge';
import {
  buildBalancedTreeLayout,
  getTopLevelNodeIds,
  getAllCollapsibleNodeIds,
  type FlowNodeData,
} from './layout/balanced-tree';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';

// ── react-flow type registrations (defined outside component to prevent remount) ─

const NODE_TYPES = { mindmapNode: MindmapNode };
const EDGE_TYPES = { mindmapEdge: MindmapEdge };

// ── Public types ──────────────────────────────────────────────────────────────

export type MindmapViewerProps = {
  tree: MindmapTreeOutput;
  /** Maps concept_id → confidence score (0.0–1.0). Passed as plain object
   *  because Maps are not serializable across the server/client boundary. */
  confidenceData: Record<string, number>;
  sessionId: string;
  learningMode: 'fast' | 'steady';
  sessionTitle: string;
  /**
   * The concept_id the graph recommends the student work on next.
   * Null when all concepts are mastered or the graph hasn't been built yet.
   * The corresponding node is highlighted with a pulsing ring.
   */
  resumeConceptId?: string | null;
};

// ── Top-level export: wraps content in ReactFlowProvider ──────────────────────

export function MindmapViewer(props: MindmapViewerProps) {
  return (
    <ReactFlowProvider>
      <MindmapViewerContent {...props} />
    </ReactFlowProvider>
  );
}

// ── Confidence legend data ─────────────────────────────────────────────────────

const CONFIDENCE_LEGEND = [
  { dot: '#3D7A5E', label: 'Mastered' },
  { dot: '#C2692A', label: 'Reviewing' },
  { dot: '#9B5C4A', label: 'Struggling' },
];

// ── Inner component: uses useReactFlow hook ───────────────────────────────────

function MindmapViewerContent({
  tree,
  confidenceData,
  sessionId,
  learningMode,
  resumeConceptId,
}: MindmapViewerProps) {
  const router = useRouter();
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Start fully collapsed so the map opens clean — users expand what they need.
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(
    () => new Set(getAllCollapsibleNodeIds(tree)),
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Memoised confidence map avoids rebuilding on every render.
  const confidenceMap = useMemo(
    () => new Map(Object.entries(confidenceData)),
    [confidenceData],
  );

  // Stable callbacks prevent unnecessary node re-renders in react-flow.
  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleConceptClick = useCallback(
    (conceptId: string) => {
      router.push(`/study/${sessionId}/chat?conceptId=${encodeURIComponent(conceptId)}`);
    },
    [router, sessionId],
  );

  // Re-run layout when collapsed state changes so the tree recenters correctly.
  const { nodes: rawLayoutNodes, edges: layoutEdges } = useMemo(
    () =>
      buildBalancedTreeLayout(
        tree,
        confidenceMap,
        collapsedNodes,
        handleToggleCollapse,
        handleConceptClick,
      ),
    [tree, confidenceMap, collapsedNodes, handleToggleCollapse, handleConceptClick],
  );

  // Flag the single node the graph recommends next. Done as a post-process so
  // balanced-tree.ts stays free of resume-specific concerns.
  const layoutNodes = useMemo<Node<FlowNodeData>[]>(() => {
    if (!resumeConceptId) return rawLayoutNodes;
    return rawLayoutNodes.map((node) =>
      node.data.concept_id === resumeConceptId
        ? { ...node, data: { ...node.data, isResumeTarget: true } }
        : node,
    );
  }, [rawLayoutNodes, resumeConceptId]);

  // Apply search dim: nodes not matching query fade to 30% opacity (handled in MindmapNode).
  const searchedNodes = useMemo<Node<FlowNodeData>[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return layoutNodes;

    return layoutNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        searchMatch: node.data.label.toLowerCase().includes(query),
      },
    }));
  }, [layoutNodes, searchQuery]);

  // Top-level node IDs are used by "collapse all" to fold the entire tree body.
  const topLevelIds = useMemo(() => getTopLevelNodeIds(tree), [tree]);

  const handleExpandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedNodes(new Set(topLevelIds));
  }, [topLevelIds]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.12, duration: 450 });
  }, [fitView]);

  // Jump viewport to the resume target node.
  const handleJumpToResume = useCallback(() => {
    const resumeNode = layoutNodes.find((n) => n.data.isResumeTarget);
    if (!resumeNode) return;
    fitView({ nodes: [{ id: resumeNode.id }], padding: 0.5, duration: 550 });
  }, [fitView, layoutNodes]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const isAnyCollapsed = collapsedNodes.size > 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--mindmap-bg)',
        backgroundImage: 'radial-gradient(var(--mindmap-dot) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    >
      {/* Keyframe for resume-target amber pulse ring + suppress RF selection outline */}
      <style>{`
        @keyframes resumePulse {
          0%   { box-shadow: 0 0 0 0 rgba(194, 137, 42, 0.4); }
          65%  { box-shadow: 0 0 0 8px rgba(194, 137, 42, 0); }
          100% { box-shadow: 0 0 0 0 rgba(194, 137, 42, 0); }
        }
        .react-flow__node.selected > div { outline: none !important; box-shadow: none !important; }
        .react-flow__node:focus { outline: none !important; }
        .react-flow__node { cursor: default !important; }
      `}</style>

      {/* ── Pill-shaped floating toolbar ──────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'var(--toolbar-bg)',
          border: '1px solid var(--toolbar-border)',
          borderRadius: '9999px',
          padding: '4px',
          boxShadow: '0 4px 20px rgba(28,25,23,0.12)',
        }}
      >
        {/* Zoom controls */}
        <ToolbarButton onClick={handleZoomOut} title="Zoom out">−</ToolbarButton>
        <ToolbarButton onClick={handleZoomIn} title="Zoom in">+</ToolbarButton>
        <ToolbarDivider />

        {/* Fit to view */}
        <ToolbarButton onClick={handleFitView} title="Fit to view">⊡</ToolbarButton>
        <ToolbarDivider />

        {/* Expand / collapse all */}
        <ToolbarButton
          onClick={handleExpandAll}
          disabled={!isAnyCollapsed}
          title="Expand all"
        >
          ⊞
        </ToolbarButton>
        <ToolbarButton
          onClick={handleCollapseAll}
          disabled={collapsedNodes.size === topLevelIds.length}
          title="Collapse all"
        >
          ⊟
        </ToolbarButton>
        <ToolbarDivider />

        {/* Search — inline always, styled to match */}
        <ToolbarButton onClick={() => {}} title="Search">⌕</ToolbarButton>
        <input
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: searchQuery ? '1px solid var(--text-muted)' : '1px solid transparent',
            outline: 'none',
            fontSize: 11,
            width: 100,
            color: 'var(--text)',
            fontFamily: 'Inter, sans-serif',
            padding: '2px 0',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLInputElement).style.borderBottomColor = 'var(--text-muted)';
          }}
          onBlur={(e) => {
            if (!searchQuery)
              (e.currentTarget as HTMLInputElement).style.borderBottomColor = 'transparent';
          }}
        />
        {searchQuery && (
          <ToolbarButton onClick={() => setSearchQuery('')} title="Clear search">
            ✕
          </ToolbarButton>
        )}

        {/* Resume target jump button — only shown when a target exists */}
        {resumeConceptId && (
          <>
            <ToolbarDivider />
            <button
              onClick={handleJumpToResume}
              title="Jump to recommended next concept"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                border: 'none',
                borderRadius: 9999,
                background: 'var(--primary)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary)';
              }}
            >
              ▶ Continue
            </button>
          </>
        )}

        <ToolbarDivider />

        {/* Learning mode indicator */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: learningMode === 'fast' ? '#C2692A' : '#3D7A5E',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            padding: '0 8px',
          }}
        >
          {learningMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
        </span>
      </div>

      {/* ── Confidence legend (bottom-right) ─────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          zIndex: 10,
          background: 'var(--toolbar-bg)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--toolbar-border)',
          borderRadius: 12,
          padding: '12px 16px',
          boxShadow: '0 4px 16px rgba(28,25,23,0.08)',
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontFamily: 'monospace',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          CONFIDENCE
        </div>
        {CONFIDENCE_LEGEND.map(({ dot, label }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: dot,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── react-flow canvas ─────────────────────────────────────────────────── */}
      <ReactFlow
        nodes={searchedNodes}
        edges={layoutEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        style={{ background: 'transparent' }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnDoubleClick={false}
        onDoubleClick={handleFitView}
        attributionPosition="bottom-right"
      />
    </div>
  );
}

// ── Small toolbar sub-components ─────────────────────────────────────────────

type ToolbarButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
};

function ToolbarButton({ onClick, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 40,
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: 'none',
        background: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--border-hover)' : 'var(--text-muted)',
        fontSize: 15,
        transition: 'background 0.1s ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--tab-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'none';
      }}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 1,
        height: 20,
        background: 'var(--border)',
        margin: '0 2px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}
