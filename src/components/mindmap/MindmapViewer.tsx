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
import { ShareButton } from './ShareButton';
import { exportAsHtml, exportAsPdf } from './exportLinearNotes';
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
  /** Whether the current user owns this session (controls share button visibility). */
  isOwner?: boolean;
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

type NavigationDirection = 'left' | 'right' | 'up' | 'down';

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
  isOwner,
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
  const [pendingDeepenFromNodeId, setPendingDeepenFromNodeId] = useState<string | null>(null);

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

  const nodeById = useMemo(() => {
    const result = new Map<string, Node<FlowNodeData>>();
    for (const node of layoutNodes) result.set(node.id, node);
    return result;
  }, [layoutNodes]);

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

  const childrenByNodeId = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const edge of layoutEdges) {
      const children = result.get(edge.source) ?? [];
      children.push(edge.target);
      result.set(edge.source, children);
    }
    return result;
  }, [layoutEdges]);

  const selectNodeAndSyncFocus = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);

      if (nodeId === 'root') {
        setFocusedBranchId(null);
        return;
      }

      const node = nodeById.get(nodeId);
      if (node?.data.topLevelBranchId) {
        setFocusedBranchId(node.data.topLevelBranchId);
      } else {
        setFocusedBranchId(null);
      }
    },
    [nodeById],
  );

  const getPreferredChildId = useCallback(
    (parentId: string): string | undefined => {
      const childIds = childrenByNodeId.get(parentId) ?? [];
      if (childIds.length === 0) return undefined;

      const parentNode = nodeById.get(parentId);
      if (!parentNode) return childIds[0];

      const parentY = parentNode.position.y;
      let bestChildId = childIds[0];
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const childId of childIds) {
        const childNode = nodeById.get(childId);
        if (!childNode) continue;
        const distance = Math.abs(childNode.position.y - parentY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestChildId = childId;
        }
      }

      return bestChildId;
    },
    [childrenByNodeId, nodeById],
  );

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

  // After expanding a collapsed node for deeper navigation, move into its first child.
  useEffect(() => {
    if (!pendingDeepenFromNodeId) return;
    const firstChildId = getPreferredChildId(pendingDeepenFromNodeId);
    if (!firstChildId) return;

    const childNode = nodeById.get(firstChildId);
    if (!childNode) return;

    selectNodeAndSyncFocus(childNode.id);
    fitView({ nodes: [{ id: childNode.id }], padding: 0.45, duration: 500 });
    setPendingDeepenFromNodeId(null);
  }, [pendingDeepenFromNodeId, getPreferredChildId, nodeById, fitView, selectNodeAndSyncFocus]);

  // Keep selection valid across relayouts/collapse state changes.
  useEffect(() => {
    if (!nodeLabelById.has(selectedNodeId)) {
      setSelectedNodeId('root');
      setFocusedBranchId(null);
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

  const getNodeCenter = useCallback((node: Node<FlowNodeData>) => {
    const fallbackWidth =
      node.data.depth === 0 ? 200 : node.data.depth === 1 ? 190 : node.data.depth === 2 ? 185 : 180;
    const fallbackHeight = node.data.depth === 0 ? 52 : 40;
    const width = node.width ?? fallbackWidth;
    const height = node.height ?? fallbackHeight;

    return {
      x: node.position.x + width / 2,
      y: node.position.y + height / 2,
    };
  }, []);

  const getDirectionalNeighborId = useCallback(
    (fromNodeId: string, direction: NavigationDirection): string | undefined => {
      const fromNode = nodeById.get(fromNodeId);
      if (!fromNode) return undefined;

      const fromCenter = getNodeCenter(fromNode);
      const MIN_AXIS_DELTA = 10;

      let bestId: string | undefined;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of layoutNodes) {
        if (candidate.id === fromNodeId) continue;

        const candidateCenter = getNodeCenter(candidate);
        const dx = candidateCenter.x - fromCenter.x;
        const dy = candidateCenter.y - fromCenter.y;

        const isInDirection =
          (direction === 'left' && dx <= -MIN_AXIS_DELTA) ||
          (direction === 'right' && dx >= MIN_AXIS_DELTA) ||
          (direction === 'up' && dy <= -MIN_AXIS_DELTA) ||
          (direction === 'down' && dy >= MIN_AXIS_DELTA);

        if (!isInDirection) continue;

        const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
        const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
        const score = primary + secondary * 1.45;

        if (score < bestScore) {
          bestScore = score;
          bestId = candidate.id;
        }
      }

      return bestId;
    },
    [getNodeCenter, layoutNodes, nodeById],
  );

  const handleDirectionalMove = useCallback(
    (direction: NavigationDirection): boolean => {
      const nextNodeId = getDirectionalNeighborId(selectedNodeId, direction);
      if (!nextNodeId) return false;

      selectNodeAndSyncFocus(nextNodeId);
      fitView({ nodes: [{ id: nextNodeId }], padding: 0.45, duration: 500 });
      return true;
    },
    [fitView, getDirectionalNeighborId, selectNodeAndSyncFocus, selectedNodeId],
  );

  const handleFocusBranch = useCallback(
    (nodeId: string) => {
      selectNodeAndSyncFocus(nodeId);
      fitView({ nodes: [{ id: nodeId }], padding: 0.45, duration: 520 });
      setIsBranchMenuOpen(false);
    },
    [fitView, selectNodeAndSyncFocus],
  );

  const handleCycleSibling = useCallback(
    (delta: 1 | -1) => {
      // Root has no siblings by definition.
      if (selectedNodeId === 'root') return;

      const parentId = parentByNodeId.get(selectedNodeId);
      if (!parentId) return;

      const siblings = childrenByNodeId.get(parentId) ?? [];
      if (siblings.length <= 1) return;

      const currentIndex = siblings.indexOf(selectedNodeId);
      if (currentIndex === -1) return;

      const nextIndex = (currentIndex + delta + siblings.length) % siblings.length;
      const nextSiblingId = siblings[nextIndex];

      selectNodeAndSyncFocus(nextSiblingId);
      fitView({ nodes: [{ id: nextSiblingId }], padding: 0.45, duration: 520 });
    },
    [selectedNodeId, parentByNodeId, childrenByNodeId, fitView, selectNodeAndSyncFocus],
  );

  const handleBreadcrumbClick = useCallback(
    (nodeId: string) => {
      selectNodeAndSyncFocus(nodeId);
      fitView({ nodes: [{ id: nodeId }], padding: 0.45, duration: 520 });
    },
    [fitView, selectNodeAndSyncFocus],
  );

  const handleGoDeeper = useCallback(() => {
    if (selectedNodeId === 'root') {
      const rightBranchId =
        getDirectionalNeighborId('root', 'right') ?? branchChips[0]?.nodeId;
      if (!rightBranchId) return;

      selectNodeAndSyncFocus(rightBranchId);
      fitView({ nodes: [{ id: rightBranchId }], padding: 0.45, duration: 500 });
      return;
    }

    const selectedNode = nodeById.get(selectedNodeId);
    if (!selectedNode || selectedNode.data.visibleChildCount === 0) return;

    if (collapsedNodes.has(selectedNodeId)) {
      setCollapsedNodes((prev) => {
        const next = new Set(prev);
        next.delete(selectedNodeId);
        return next;
      });
      setPendingDeepenFromNodeId(selectedNodeId);
      return;
    }

    const firstChildId = getPreferredChildId(selectedNodeId);
    if (!firstChildId) return;

    const childNode = nodeById.get(firstChildId);
    if (!childNode) return;

    selectNodeAndSyncFocus(childNode.id);
    fitView({ nodes: [{ id: childNode.id }], padding: 0.45, duration: 500 });
  }, [
    selectedNodeId,
    branchChips,
    getDirectionalNeighborId,
    fitView,
    collapsedNodes,
    nodeById,
    getPreferredChildId,
    selectNodeAndSyncFocus,
  ]);

  const handleGoShallower = useCallback(() => {
    if (selectedNodeId === 'root') return;
    const parentId = parentByNodeId.get(selectedNodeId);
    if (!parentId) return;

    selectNodeAndSyncFocus(parentId);
    fitView({ nodes: [{ id: parentId }], padding: 0.45, duration: 500 });
  }, [selectedNodeId, parentByNodeId, fitView, selectNodeAndSyncFocus]);

  const handleToggleFocusMode = useCallback(() => {
    setIsFocusModeEnabled((prev) => {
      const next = !prev;
      if (next && !focusedBranchId && branchChips.length > 0) {
        setFocusedBranchId(branchChips[0].nodeId);
      }
      return next;
    });
  }, [focusedBranchId, branchChips]);

  const selectedNode = nodeById.get(selectedNodeId);
  const canGoShallower = selectedNodeId !== 'root';
  const canGoDeeper = selectedNodeId === 'root'
    ? branchChips.length > 0
    : (selectedNode?.data.visibleChildCount ?? 0) > 0;

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
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!handleDirectionalMove('down')) handleCycleSibling(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!handleDirectionalMove('up')) handleCycleSibling(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();

        if (!handleDirectionalMove('right')) {
          const currentNode = nodeById.get(selectedNodeId);
          const rootNode = nodeById.get('root');

          if (!currentNode || !rootNode) {
            handleGoDeeper();
            return;
          }

          const currentX = getNodeCenter(currentNode).x;
          const rootX = getNodeCenter(rootNode).x;
          const isOutwardMove = selectedNodeId === 'root' || currentX > rootX;

          if (isOutwardMove) handleGoDeeper();
          else handleGoShallower();
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();

        if (!handleDirectionalMove('left')) {
          const currentNode = nodeById.get(selectedNodeId);
          const rootNode = nodeById.get('root');

          if (!currentNode || !rootNode) {
            handleGoShallower();
            return;
          }

          const currentX = getNodeCenter(currentNode).x;
          const rootX = getNodeCenter(rootNode).x;
          const isOutwardMove = selectedNodeId === 'root' || currentX < rootX;

          if (isOutwardMove) handleGoDeeper();
          else handleGoShallower();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    handleCollapseAll,
    handleCycleSibling,
    handleDirectionalMove,
    handleExpandAll,
    handleFitView,
    getNodeCenter,
    handleGoDeeper,
    handleGoShallower,
    nodeById,
    selectedNodeId,
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
          // Viewport-anchored and horizontally centered.
          position: 'fixed',
          top: MINDMAP_FLOATING_TOP,
          left: '50%',
          transform: 'translateX(-50%)',
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

        <ToolbarButton
          onClick={handleGoShallower}
          disabled={!canGoShallower}
          title="Go back (←)"
        >
          ‹
        </ToolbarButton>
        <ToolbarButton
          onClick={handleGoDeeper}
          disabled={!canGoDeeper}
          title="Go deeper (→)"
        >
          ›
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
                minHeight: 34,
                minWidth: 106,
                padding: '6px 14px',
                border: '1px solid color-mix(in srgb, var(--primary) 62%, transparent)',
                borderRadius: 9999,
                background: 'var(--primary)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
                boxShadow: '0 3px 10px color-mix(in srgb, var(--primary) 24%, transparent)',
                transition: 'background 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'var(--primary-hover)';
                el.style.transform = 'translateY(-1px)';
                el.style.boxShadow = '0 6px 16px color-mix(in srgb, var(--primary) 34%, transparent)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.background = 'var(--primary)';
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 3px 10px color-mix(in srgb, var(--primary) 24%, transparent)';
              }}
              onMouseDown={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.transform = 'translateY(-1px)';
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

        {isOwner && (
          <>
            <ToolbarDivider />
            <ShareButton sessionId={sessionId} />
          </>
        )}

        <ToolbarDivider />

        {/* Export as linear notes */}
        <ExportNotesButton tree={tree} />

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
          Hit Spacebar twice for Shortcuts
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
          <ShortcutRow keys="↑ / ↓" action="Move to nearest node above / below" />
          <ShortcutRow keys="→ / ←" action="Move to nearest node right / left" />
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
          selectNodeAndSyncFocus(node.id);
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

function ExportNotesButton({ tree }: { tree: MindmapTreeOutput }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && e.target instanceof Element && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleHtml = () => {
    exportAsHtml(tree);
    setIsOpen(false);
  };

  const handlePdf = () => {
    setIsOpen(false);
    exportAsPdf(tree);
  };

  return (
    <div ref={popoverRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setIsOpen((p) => !p)}
        title="Export as linear notes"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          borderRadius: 999,
          border: isOpen ? '1px solid var(--primary)' : '1px solid var(--toolbar-border)',
          background: isOpen
            ? 'color-mix(in srgb, var(--primary) 12%, var(--toolbar-bg))'
            : 'transparent',
          color: 'var(--text-muted)',
          padding: '7px 12px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          whiteSpace: 'nowrap' as const,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 0.1s, border-color 0.1s, color 0.1s',
        }}
      >
        ↓ Notes
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--toolbar-bg)',
            border: '1px solid var(--toolbar-border)',
            borderRadius: 10,
            padding: '8px',
            zIndex: 100,
            minWidth: 180,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column' as const,
            gap: 2,
          }}
        >
          <ExportOption
            icon="◎"
            label="HTML"
            description="Interactive, dark theme"
            onClick={handleHtml}
          />
          <ExportOption
            icon="⬡"
            label="PDF"
            description="Print-ready, with watermark"
            onClick={handlePdf}
          />
        </div>
      )}
    </div>
  );
}

function ExportOption({
  icon,
  label,
  description,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 7,
        border: 'none',
        background: hovered ? 'var(--tab-hover)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left' as const,
        width: '100%',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column' as const, gap: 1 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            color: 'var(--text)',
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{description}</span>
      </span>
    </button>
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
