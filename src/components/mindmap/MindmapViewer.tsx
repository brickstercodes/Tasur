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

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  type Edge,
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
  findAncestorIds,
  type FlowNodeData,
} from './layout/balanced-tree';
import { BRANCH_PALETTE, getStableNodeId } from './color-utils';
import type { MindmapTreeOutput, MindmapNode as MindmapTreeNode } from '@/lib/schemas/mindmap-tree-output';

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

// Dashboard header (52px) + study nav (48px) + breathing room.
const MINDMAP_FLOATING_TOP = 108;
const DOUBLE_SPACE_WINDOW_MS = 350;

type TreeSearchMatch = {
  nodeId: string;
  ancestorIds: string[];
};

function collectTreeSearchMatches(
  node: MindmapTreeNode,
  parentId: string,
  siblingIndex: number,
  queryLower: string,
  ancestorIds: string[],
  result: TreeSearchMatch[],
): void {
  const nodeId = getStableNodeId(node, parentId, siblingIndex);
  const nextAncestors = [...ancestorIds, nodeId];

  if (node.label.toLowerCase().includes(queryLower)) {
    result.push({ nodeId, ancestorIds });
  }

  if (!node.children || node.children.length === 0) return;

  for (const [index, child] of node.children.entries()) {
    collectTreeSearchMatches(child, nodeId, index, queryLower, nextAncestors, result);
  }
}

function getTreeSearchMatches(tree: MindmapTreeOutput, query: string): TreeSearchMatch[] {
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) return [];

  const result: TreeSearchMatch[] = [];
  for (const [index, child] of tree.children.entries()) {
    collectTreeSearchMatches(child, 'root', index, queryLower, [], result);
  }
  return result;
}

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
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

  // Start fully collapsed so the map opens clean — users expand what they need.
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(
    () => new Set(getAllCollapsibleNodeIds(tree)),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
  const [isShortcutPanelOpen, setIsShortcutPanelOpen] = useState(false);
  const [isFocusModeEnabled, setIsFocusModeEnabled] = useState(false);
  const [focusedBranchId, setFocusedBranchId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
  // Set to true after expanding ancestors; cleared once fitView fires.
  const [pendingJumpToResume, setPendingJumpToResume] = useState(false);
  // Search reveal flow: after expanding ancestors, wait until node appears then fit.
  const [pendingSearchTargetId, setPendingSearchTargetId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastSpacePressAtRef = useRef(0);
  const lastAutoExpandedQueryRef = useRef('');

  // Lock page scroll while the mindmap is mounted so the document never
  // overflows its container. main's padding-bottom still contributes to the
  // scroll height even with negative margins, causing the toolbar (position:
  // absolute inside the canvas) to scroll off-screen.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  const focusedNodes = useMemo<Node<FlowNodeData>[]>(() => {
    const shouldDim = isFocusModeEnabled && !!focusedBranchId;
    if (!shouldDim) {
      return searchedNodes.map((node) => ({
        ...node,
        data: { ...node.data, isFocusDimmed: false },
      }));
    }

    return searchedNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isFocusDimmed:
          node.data.depth > 0 &&
          !!node.data.topLevelBranchId &&
          node.data.topLevelBranchId !== focusedBranchId,
      },
    }));
  }, [searchedNodes, isFocusModeEnabled, focusedBranchId]);

  const focusedEdges = useMemo<Edge[]>(() => {
    const shouldDim = isFocusModeEnabled && !!focusedBranchId;
    if (!shouldDim) {
      return layoutEdges.map((edge) => ({
        ...edge,
        style: { ...(edge.style ?? {}), opacity: 1 },
      }));
    }

    return layoutEdges.map((edge) => {
      const isDimmed = !!edge.data?.topLevelBranchId && edge.data.topLevelBranchId !== focusedBranchId;
      return {
        ...edge,
        style: {
          ...(edge.style ?? {}),
          opacity: isDimmed ? 0.14 : 1,
        },
      };
    });
  }, [layoutEdges, isFocusModeEnabled, focusedBranchId]);

  const nodeLabelById = useMemo(() => {
    const result = new Map<string, string>();
    for (const node of layoutNodes) result.set(node.id, node.data.label);
    result.set('root', tree.title);
    return result;
  }, [layoutNodes, tree.title]);

  const parentByNodeId = useMemo(() => {
    const result = new Map<string, string>();
    for (const edge of layoutEdges) result.set(edge.target, edge.source);
    return result;
  }, [layoutEdges]);

  const breadcrumbPath = useMemo(() => {
    const activeNodeId = nodeLabelById.has(selectedNodeId) ? selectedNodeId : 'root';
    const ids: string[] = [];
    const visited = new Set<string>();

    let cursor = activeNodeId;
    while (!visited.has(cursor)) {
      visited.add(cursor);
      ids.push(cursor);
      if (cursor === 'root') break;
      const parent = parentByNodeId.get(cursor);
      if (!parent) {
        ids.push('root');
        break;
      }
      cursor = parent;
    }

    return ids.reverse().map((id) => ({
      id,
      label: nodeLabelById.get(id) ?? tree.title,
    }));
  }, [nodeLabelById, parentByNodeId, selectedNodeId, tree.title]);

  const searchMatches = useMemo(
    () => getTreeSearchMatches(tree, searchQuery),
    [tree, searchQuery],
  );

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

  // Jump viewport to the resume target node, expanding collapsed ancestors first.
  const handleJumpToResume = useCallback(() => {
    if (!resumeConceptId) return;

    const resumeNode = layoutNodes.find((n) => n.data.isResumeTarget);
    if (resumeNode) {
      // Node is already visible — jump immediately.
      fitView({ nodes: [{ id: resumeNode.id }], padding: 0.5, duration: 550 });
      return;
    }

    // Node is hidden inside a collapsed ancestor — expand ancestors first, then
    // set pendingJumpToResume so the useEffect below fires fitView once the
    // re-layout has added the node to the canvas.
    const ancestorIds = findAncestorIds(tree, resumeConceptId);
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      for (const id of ancestorIds) next.delete(id);
      return next;
    });
    setPendingJumpToResume(true);
  }, [fitView, layoutNodes, resumeConceptId, tree]);

  // Fire fitView once the pending jump target becomes visible in the layout.
  useEffect(() => {
    if (!pendingJumpToResume) return;
    const resumeNode = layoutNodes.find((n) => n.data.isResumeTarget);
    if (!resumeNode) return; // Still not visible yet — wait for next render.
    fitView({ nodes: [{ id: resumeNode.id }], padding: 0.5, duration: 550 });
    setSelectedNodeId(resumeNode.id);
    setPendingJumpToResume(false);
  }, [pendingJumpToResume, layoutNodes, fitView]);

  // Auto-expand ancestors of the first search hit whenever the query changes.
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      lastAutoExpandedQueryRef.current = '';
      setPendingSearchTargetId(null);
      return;
    }

    if (query === lastAutoExpandedQueryRef.current) return;
    lastAutoExpandedQueryRef.current = query;

    const firstMatch = searchMatches[0];
    if (!firstMatch) return;

    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const ancestorId of firstMatch.ancestorIds) {
        if (next.delete(ancestorId)) changed = true;
      }
      return changed ? next : prev;
    });
    setPendingSearchTargetId(firstMatch.nodeId);
  }, [searchQuery, searchMatches]);

  // Once the search target becomes visible after expansion, center it.
  useEffect(() => {
    if (!pendingSearchTargetId) return;
    const targetNode = layoutNodes.find((node) => node.id === pendingSearchTargetId);
    if (!targetNode) return;
    fitView({ nodes: [{ id: targetNode.id }], padding: 0.45, duration: 520 });
    setSelectedNodeId(targetNode.id);
    setPendingSearchTargetId(null);
  }, [pendingSearchTargetId, layoutNodes, fitView]);

  // Keep selection valid across relayouts/collapse state changes.
  useEffect(() => {
    if (!nodeLabelById.has(selectedNodeId)) {
      setSelectedNodeId('root');
    }
  }, [selectedNodeId, nodeLabelById]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 });
  }, [zoomOut]);

  const isAnyCollapsed = collapsedNodes.size > 0;
  const branchChips = useMemo(
    () =>
      tree.children.map((branch, index) => ({
        id: getStableNodeId(branch, 'root', index),
        nodeId: getStableNodeId(branch, 'root', index),
        label: branch.label,
        color: BRANCH_PALETTE[index % BRANCH_PALETTE.length],
      })),
    [tree],
  );

  const handleFocusBranch = useCallback(
    (nodeId: string) => {
      setFocusedBranchId(nodeId);
      setSelectedNodeId(nodeId);
      fitView({ nodes: [{ id: nodeId }], padding: 0.45, duration: 520 });
      setIsBranchMenuOpen(false);
    },
    [fitView],
  );

  const handleCycleBranch = useCallback(
    (delta: 1 | -1) => {
      if (branchChips.length === 0) return;

      const currentIndex = focusedBranchId
        ? branchChips.findIndex((chip) => chip.nodeId === focusedBranchId)
        : -1;

      const seedIndex = currentIndex === -1 ? (delta === 1 ? -1 : 0) : currentIndex;
      const nextIndex = (seedIndex + delta + branchChips.length) % branchChips.length;
      const nextBranch = branchChips[nextIndex];

      setFocusedBranchId(nextBranch.nodeId);
      setSelectedNodeId(nextBranch.nodeId);
      fitView({ nodes: [{ id: nextBranch.nodeId }], padding: 0.45, duration: 520 });
      setIsBranchMenuOpen(false);
    },
    [branchChips, focusedBranchId, fitView],
  );

  const handleBreadcrumbClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);

      const clickedNode = layoutNodes.find((node) => node.id === nodeId);
      if (clickedNode?.data.topLevelBranchId) {
        setFocusedBranchId(clickedNode.data.topLevelBranchId);
      }

      fitView({ nodes: [{ id: nodeId }], padding: 0.45, duration: 520 });
    },
    [fitView, layoutNodes],
  );

  const handleToggleFocusMode = useCallback(() => {
    setIsFocusModeEnabled((prev) => {
      const next = !prev;
      if (next && !focusedBranchId && branchChips.length > 0) {
        setFocusedBranchId(branchChips[0].nodeId);
      }
      return next;
    });
  }, [focusedBranchId, branchChips]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBranchMenuOpen(false);
        setIsShortcutPanelOpen(false);
        return;
      }

      if (isTypingElement(event.target)) return;

      if (event.key === ' ') {
        const now = Date.now();
        if (now - lastSpacePressAtRef.current <= DOUBLE_SPACE_WINDOW_MS) {
          event.preventDefault();
          setIsShortcutPanelOpen((prev) => !prev);
          lastSpacePressAtRef.current = 0;
        } else {
          lastSpacePressAtRef.current = now;
        }
        return;
      }

      const key = event.key.toLowerCase();
      if (key === '?') {
        event.preventDefault();
        setIsShortcutPanelOpen((prev) => !prev);
        return;
      }
      if (key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        handleFitView();
        return;
      }
      if (key === 'e') {
        event.preventDefault();
        handleExpandAll();
        return;
      }
      if (key === 'c') {
        event.preventDefault();
        handleCollapseAll();
        return;
      }
      if (key === 't') {
        event.preventDefault();
        setIsBranchMenuOpen((prev) => !prev);
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        handleToggleFocusMode();
        return;
      }
      if (key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        handleCycleBranch(1);
        return;
      }
      if (key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        handleCycleBranch(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleCollapseAll,
    handleCycleBranch,
    handleExpandAll,
    handleFitView,
    handleToggleFocusMode,
  ]);

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
          // Viewport-anchored so it never gets clipped by sticky parent layout bars.
          position: 'fixed',
          top: MINDMAP_FLOATING_TOP,
          left: 16,
          zIndex: 45,
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
          ref={searchInputRef}
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

        {/* Collapsed topic list dropdown (top-level branches) */}
        <div style={{ position: 'relative', padding: '0 4px' }}>
          <button
            onClick={() => setIsBranchMenuOpen((prev) => !prev)}
            title="Open topic list"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              border: '1px solid var(--toolbar-border)',
              background: 'transparent',
              color: 'var(--text)',
              padding: '7px 11px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            aria-expanded={isBranchMenuOpen}
            aria-label="Toggle topic list"
          >
            Topics
            <span style={{ fontSize: 12, lineHeight: 1 }}>{isBranchMenuOpen ? '▴' : '▾'}</span>
          </button>

          {isBranchMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                minWidth: 220,
                maxWidth: 280,
                maxHeight: 260,
                overflowY: 'auto',
                zIndex: 70,
                background: 'var(--toolbar-bg)',
                border: '1px solid var(--toolbar-border)',
                borderRadius: 12,
                padding: 8,
                boxShadow: '0 6px 18px rgba(28,25,23,0.16)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {branchChips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handleFocusBranch(chip.nodeId)}
                  title={`Focus ${chip.label}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    borderRadius: 10,
                    border:
                      focusedBranchId === chip.nodeId
                        ? `1px solid color-mix(in srgb, ${chip.color} 82%, var(--toolbar-border))`
                        : `1px solid color-mix(in srgb, ${chip.color} 54%, var(--toolbar-border))`,
                    background:
                      focusedBranchId === chip.nodeId
                        ? `color-mix(in srgb, ${chip.color} 24%, var(--toolbar-bg))`
                        : `color-mix(in srgb, ${chip.color} 14%, var(--toolbar-bg))`,
                    color: 'var(--text)',
                    padding: '7px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: chip.color,
                      boxShadow: `0 0 0 1px color-mix(in srgb, ${chip.color} 72%, transparent)`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
                  {focusedBranchId === chip.nodeId && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 9,
                        color: 'var(--text-muted)',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Active
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolbarDivider />

        {/* Focus mode: dim non-selected branches */}
        <button
          onClick={handleToggleFocusMode}
          title="Toggle branch focus mode"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 999,
            border: isFocusModeEnabled ? '1px solid var(--primary)' : '1px solid var(--toolbar-border)',
            background: isFocusModeEnabled
              ? 'color-mix(in srgb, var(--primary) 14%, var(--toolbar-bg))'
              : 'transparent',
            color: 'var(--text)',
            padding: '7px 11px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {isFocusModeEnabled ? 'Focus On' : 'Focus Off'}
        </button>

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

        <ToolbarDivider />

        {/* Keyboard hint */}
        <button
          onClick={() => setIsShortcutPanelOpen((prev) => !prev)}
          title="Open keyboard shortcuts"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            padding: '0 10px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          Space x2 Shortcuts
        </button>
      </div>

      {/* ── Breadcrumb trail (selected node path) ─────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          top: MINDMAP_FLOATING_TOP + 56,
          left: 16,
          zIndex: 44,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: 'min(78vw, 820px)',
          overflowX: 'auto',
          padding: '6px 10px',
          borderRadius: 9999,
          border: '1px solid var(--toolbar-border)',
          background: 'var(--toolbar-bg)',
          boxShadow: '0 4px 16px rgba(28,25,23,0.1)',
          backdropFilter: 'blur(6px)',
          scrollbarWidth: 'thin',
        }}
        title="Selected path"
      >
        {breadcrumbPath.map((crumb, index) => {
          const isLast = index === breadcrumbPath.length - 1;
          return (
            <React.Fragment key={crumb.id}>
              <button
                onClick={() => handleBreadcrumbClick(crumb.id)}
                style={{
                  border: 'none',
                  background: isLast ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  color: isLast ? 'var(--text)' : 'var(--text-muted)',
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: isLast ? 700 : 500,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={crumb.label}
              >
                {crumb.label}
              </button>
              {!isLast && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    userSelect: 'none',
                  }}
                >
                  {'>'}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isShortcutPanelOpen && (
        <div
          style={{
            position: 'fixed',
            top: MINDMAP_FLOATING_TOP + 98,
            left: 16,
            zIndex: 60,
            width: 300,
            background: 'var(--toolbar-bg)',
            border: '1px solid var(--toolbar-border)',
            borderRadius: 12,
            padding: 12,
            boxShadow: '0 8px 24px rgba(28,25,23,0.18)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text)',
              }}
            >
              Keyboard Shortcuts
            </span>
            <button
              onClick={() => setIsShortcutPanelOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          <ShortcutRow keys="Space, Space" action="Toggle this panel" />
          <ShortcutRow keys="/" action="Focus search" />
          <ShortcutRow keys="J / K" action="Next / previous topic" />
          <ShortcutRow keys="T" action="Open topic dropdown" />
          <ShortcutRow keys="H" action="Toggle focus mode" />
          <ShortcutRow keys="E / C" action="Expand all / collapse all" />
          <ShortcutRow keys="F" action="Fit view" />
          <ShortcutRow keys="Esc" action="Close open panels" />
        </div>
      )}

      {/* ── Confidence legend (bottom-right) ─────────────────────────────────── */}
      {/* position: fixed so it's always viewport-relative and never clipped by
          the parent overflow: hidden canvas boundary. */}
      <div
        style={{
          position: 'fixed',
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
        nodes={focusedNodes}
        edges={focusedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        style={{ background: 'transparent' }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesFocusable={false}
        elevateNodesOnSelect={false}
        selectionOnDrag={false}
        selectNodesOnDrag={false}
        panOnDrag={true}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnDoubleClick={false}
        nodeDragThreshold={6}
        onNodeClick={(_, node) => {
          setSelectedNodeId(node.id);
          if (node.data.topLevelBranchId) setFocusedBranchId(node.data.topLevelBranchId);
        }}
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

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '4px 0',
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: 'var(--text)',
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.03em',
        }}
      >
        {keys}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
        {action}
      </span>
    </div>
  );
}
