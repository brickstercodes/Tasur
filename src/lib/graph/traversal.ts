/**
 * WHY: Pure graph traversal algorithms for the StudentGraph.
 *
 * All functions operate on `Map<string, string[]>` adjacency lists so they
 * have zero coupling to the StudentGraph class or any domain types. This lets
 * you unit-test the algorithms in isolation and reuse them in other contexts
 * (e.g., the orchestrator running reachability checks without instantiating a
 * full StudentGraph).
 *
 * Algorithm choices:
 *   - bfs / dfs          → iterative (stack/queue) to avoid call-stack limits
 *                          on deep prerequisite chains.
 *   - shortestPath       → BFS with parent tracking (unweighted graph).
 *   - connectedComponents → BFS over an *undirected* view of the adjacency map
 *                          so prerequisite edges don't prevent grouping.
 *   - topologicalSort    → Kahn's algorithm (BFS-based); partial sort on cycle
 *                          detection rather than throwing, so callers get a
 *                          best-effort ordering even on malformed graphs.
 *
 * No imports from Mastra, Supabase, or any framework.
 */

// ── Type alias ────────────────────────────────────────────────────────────────

/** Directed adjacency list: nodeId → [neighbourId, ...] */
export type AdjacencyMap = Map<string, string[]>;

// ── BFS ───────────────────────────────────────────────────────────────────────

/**
 * Breadth-first traversal starting from `startId`.
 *
 * Returns node ids in BFS order. Nodes absent from the adjacency map are
 * treated as leaves (no outgoing edges). `startId` itself is always included
 * as the first element (even if it has no neighbours).
 */
export function bfs(adjacency: AdjacencyMap, startId: string): string[] {
  if (!adjacency.has(startId) && !isReachable(adjacency, startId)) {
    return [startId];
  }

  const visited = new Set<string>();
  const queue: string[] = [startId];
  const result: string[] = [];

  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    for (const neighbour of adjacency.get(current) ?? []) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  return result;
}

// ── DFS ───────────────────────────────────────────────────────────────────────

/**
 * Depth-first traversal starting from `startId`.
 *
 * Returns node ids in DFS pre-order (node visited before its descendants).
 * Uses an explicit stack to avoid recursion-depth limits.
 */
export function dfs(adjacency: AdjacencyMap, startId: string): string[] {
  const visited = new Set<string>();
  const stack: string[] = [startId];
  const result: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (visited.has(current)) continue;
    visited.add(current);
    result.push(current);

    // Push in reverse order so the first neighbour is processed first
    const neighbours = adjacency.get(current) ?? [];
    for (let i = neighbours.length - 1; i >= 0; i--) {
      if (!visited.has(neighbours[i])) {
        stack.push(neighbours[i]);
      }
    }
  }

  return result;
}

// ── Shortest path ─────────────────────────────────────────────────────────────

/**
 * Finds the shortest path (fewest hops) between two nodes using BFS.
 *
 * Returns an ordered array `[fromId, ..., toId]`.
 * Returns an empty array if no path exists or if `fromId === toId`.
 */
export function shortestPath(
  adjacency: AdjacencyMap,
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return [];

  const visited = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  // parent[child] = node we arrived from — used to reconstruct the path
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighbour of adjacency.get(current) ?? []) {
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      parent.set(neighbour, current);

      if (neighbour === toId) {
        return reconstructPath(parent, fromId, toId);
      }

      queue.push(neighbour);
    }
  }

  return []; // no path found
}

/** Walks the parent map backwards from `toId` to `fromId`. */
function reconstructPath(
  parent: Map<string, string>,
  fromId: string,
  toId: string,
): string[] {
  const path: string[] = [];
  let current = toId;

  while (current !== fromId) {
    path.unshift(current);
    current = parent.get(current)!;
  }

  path.unshift(fromId);
  return path;
}

// ── Connected components ──────────────────────────────────────────────────────

/**
 * Finds all connected components treating edges as *undirected*.
 *
 * This is the right semantic for "which concepts are in the same knowledge
 * cluster?" — a prerequisite edge still means the two concepts are related,
 * even though the relationship is directional.
 *
 * Returns an array of groups, each group being an array of node ids.
 */
export function connectedComponents(adjacency: AdjacencyMap): string[][] {
  // Build undirected view: for every A→B edge, also add B→A
  const undirected = buildUndirectedMap(adjacency);

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of undirected.keys()) {
    if (visited.has(nodeId)) continue;

    // BFS from this unvisited node to find its full component
    const component: string[] = [];
    const queue: string[] = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbour of undirected.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/** Returns a new undirected adjacency map derived from a directed one. */
function buildUndirectedMap(directed: AdjacencyMap): Map<string, string[]> {
  const undirected = new Map<string, string[]>();

  const ensure = (id: string) => {
    if (!undirected.has(id)) undirected.set(id, []);
    return undirected.get(id)!;
  };

  for (const [nodeId, neighbours] of directed.entries()) {
    ensure(nodeId);
    for (const neighbour of neighbours) {
      ensure(nodeId).push(neighbour);
      ensure(neighbour).push(nodeId);
    }
  }

  return undirected;
}

// ── Topological sort ──────────────────────────────────────────────────────────

/**
 * Topological sort via Kahn's algorithm (BFS-based).
 *
 * Returns nodes in an order where every prerequisite appears before the
 * concepts that depend on it. If the graph contains a cycle, the cycle nodes
 * are appended at the end in an unspecified order (partial sort rather than
 * throwing) so callers always receive a usable ordering.
 *
 * Suitable for prerequisite ordering: if A is a prerequisite of B, A appears
 * before B in the output.
 */
export function topologicalSort(adjacency: AdjacencyMap): string[] {
  // Compute in-degrees (number of incoming edges per node)
  const inDegree = new Map<string, number>();

  // Initialise every known node at 0
  for (const nodeId of adjacency.keys()) {
    if (!inDegree.has(nodeId)) inDegree.set(nodeId, 0);
    for (const neighbour of adjacency.get(nodeId) ?? []) {
      inDegree.set(neighbour, (inDegree.get(neighbour) ?? 0) + 1);
    }
  }

  // Start with all nodes that have no prerequisites
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(nodeId);
  }

  const result: string[] = [];

  while (queue.length > 0) {
    // For determinism, always process lexicographically smallest id first
    queue.sort();
    const current = queue.shift()!;
    result.push(current);

    for (const neighbour of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbour) ?? 1) - 1;
      inDegree.set(neighbour, newDegree);
      if (newDegree === 0) queue.push(neighbour);
    }
  }

  // Cycle detection: any node still with in-degree > 0 is part of a cycle
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree > 0) result.push(nodeId);
  }

  return result;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if `nodeId` appears as a *neighbour* in any edge, even if it
 * has no outgoing edges of its own (i.e., it's a leaf target node).
 */
function isReachable(adjacency: AdjacencyMap, nodeId: string): boolean {
  for (const neighbours of adjacency.values()) {
    if (neighbours.includes(nodeId)) return true;
  }
  return false;
}
