'use client';

/**
 * WHY: Root client component for the interactive mindmap view.
 *
 * This is the "wow moment" — the first thing a student sees after uploading
 * material. It wraps react-flow with Tasur's custom layout and visual design.
 *
 * Responsibilities:
 *   - Manages collapsed node state and re-runs the balanced-tree layout when
 *     it changes (so the tree re-centers correctly, not just hides nodes).
 *   - Manages search query: matching nodes are highlighted, others fade to 30%.
 *   - Exposes a toolbar with zoom, fit-to-view, expand-all, collapse-all, and
 *     search controls, plus a learning-mode indicator.
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
  Background,
  BackgroundVariant,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useRouter } from 'next/navigation';

import { MindmapNode } from './MindmapNode';
import { MindmapEdge } from './MindmapEdge';
import {
  buildBalancedTreeLayout,
  getTopLevelNodeIds,
  type FlowNodeData,
  type FlowEdgeData,
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

  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
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
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Keyframe for resume-target pulse ring — injected once at the container level. */}
      <style>{`
        @keyframes resumePulse {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.55); }
          65%  { box-shadow: 0 0 0 7px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }
      `}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          padding: '5px 10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          fontSize: 12,
          fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
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

        {/* Search */}
        <input
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            border: '1px solid #d0d0d0',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 11,
            width: 120,
            outline: 'none',
            fontFamily: 'inherit',
            color: '#1A1A2E',
            background: searchQuery ? '#fff8dc' : '#fafafa',
            transition: 'background 0.15s ease',
          }}
        />
        {searchQuery && (
          <ToolbarButton onClick={() => setSearchQuery('')} title="Clear search">
            ✕
          </ToolbarButton>
        )}
        <ToolbarDivider />

        {/* Resume target jump button — only shown when a target exists. */}
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
                padding: '3px 8px',
                border: 'none',
                borderRadius: 5,
                background: '#6366f1',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#4f46e5';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#6366f1';
              }}
            >
              ▶ Continue
            </button>
          </>
        )}

        {/* Learning mode indicator */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: learningMode === 'fast' ? '#E6550D' : '#1A9641',
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {learningMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
        </span>
      </div>

      {/* ── react-flow canvas ────────────────────────────────────────────────── */}
      <ReactFlow
        nodes={searchedNodes}
        edges={layoutEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        style={{ background: '#F8F9FA' }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnDoubleClick={false}
        onDoubleClick={handleFitView}
        attributionPosition="bottom-right"
      >
        <Background
          color="#dde0e3"
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
        />
      </ReactFlow>
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
        background: 'none',
        border: 'none',
        padding: '2px 5px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14,
        color: disabled ? '#c0c0c0' : '#444',
        borderRadius: 4,
        lineHeight: 1,
        fontFamily: 'inherit',
        transition: 'background 0.1s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f0';
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
        height: 16,
        background: '#e0e0e0',
        margin: '0 2px',
        verticalAlign: 'middle',
      }}
    />
  );
}
