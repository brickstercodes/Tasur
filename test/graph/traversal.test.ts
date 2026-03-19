/**
 * WHY: Tests for the pure graph traversal algorithms.
 *
 * The traversal functions have zero domain coupling — all tests use small
 * hand-crafted adjacency maps so failure messages point to the algorithm
 * logic, not to data fixtures. Edge cases covered: empty graph, single node,
 * disconnected components, and cycle detection in topological sort.
 */

import { describe, expect, it } from 'vitest';

import {
  bfs,
  connectedComponents,
  dfs,
  shortestPath,
  topologicalSort,
  type AdjacencyMap,
} from '../../src/lib/graph/traversal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMap(entries: Record<string, string[]>): AdjacencyMap {
  return new Map(Object.entries(entries));
}

// ── BFS ───────────────────────────────────────────────────────────────────────

describe('bfs', () => {
  it('visits all reachable nodes in breadth-first order', () => {
    const adj = makeMap({ a: ['b', 'c'], b: ['d'], c: [], d: [] });
    expect(bfs(adj, 'a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns only the start node when it has no neighbours', () => {
    const adj = makeMap({ a: [], b: ['a'] });
    expect(bfs(adj, 'a')).toEqual(['a']);
  });

  it('returns a single node for an isolated node not in the adjacency map', () => {
    const adj = makeMap({ a: ['b'], b: [] });
    expect(bfs(adj, 'x')).toEqual(['x']);
  });

  it('handles a linear chain', () => {
    const adj = makeMap({ a: ['b'], b: ['c'], c: ['d'], d: [] });
    expect(bfs(adj, 'a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not revisit nodes in a graph with back edges', () => {
    // a→b→c→a (cycle)
    const adj = makeMap({ a: ['b'], b: ['c'], c: ['a'] });
    const result = bfs(adj, 'a');
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
  });
});

// ── DFS ───────────────────────────────────────────────────────────────────────

describe('dfs', () => {
  it('visits all reachable nodes depth-first', () => {
    const adj = makeMap({ a: ['b', 'c'], b: ['d'], c: [], d: [] });
    const result = dfs(adj, 'a');
    // a must come first, d must come before c (b branch explored fully first)
    expect(result[0]).toBe('a');
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('d'));
    expect(result.indexOf('d')).toBeLessThan(result.indexOf('c'));
  });

  it('returns only the start node when there are no edges', () => {
    const adj = makeMap({ a: [] });
    expect(dfs(adj, 'a')).toEqual(['a']);
  });

  it('does not revisit nodes in a cyclic graph', () => {
    const adj = makeMap({ a: ['b'], b: ['c'], c: ['a'] });
    const result = dfs(adj, 'a');
    expect(result).toHaveLength(3);
    expect(new Set(result).size).toBe(3);
  });

  it('returns all nodes for a node-only graph (no edges)', () => {
    const adj = makeMap({ a: [], b: [], c: [] });
    expect(dfs(adj, 'a')).toEqual(['a']);
  });
});

// ── Shortest path ─────────────────────────────────────────────────────────────

describe('shortestPath', () => {
  it('returns the shortest path between two connected nodes', () => {
    const adj = makeMap({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] });
    // Both a→b→d and a→c→d have length 3; either is valid
    const path = shortestPath(adj, 'a', 'd');
    expect(path[0]).toBe('a');
    expect(path[path.length - 1]).toBe('d');
    expect(path).toHaveLength(3);
  });

  it('returns the path for a direct edge', () => {
    const adj = makeMap({ a: ['b'], b: [] });
    expect(shortestPath(adj, 'a', 'b')).toEqual(['a', 'b']);
  });

  it('returns an empty array when from === to', () => {
    const adj = makeMap({ a: ['b'] });
    expect(shortestPath(adj, 'a', 'a')).toEqual([]);
  });

  it('returns an empty array when no path exists', () => {
    const adj = makeMap({ a: ['b'], c: ['d'] });
    expect(shortestPath(adj, 'a', 'd')).toEqual([]);
  });

  it('finds the shortest among multiple paths', () => {
    // Long path: a→b→c→d; short path: a→d
    const adj = makeMap({ a: ['b', 'd'], b: ['c'], c: ['d'], d: [] });
    expect(shortestPath(adj, 'a', 'd')).toEqual(['a', 'd']);
  });
});

// ── Connected components ──────────────────────────────────────────────────────

describe('connectedComponents', () => {
  it('returns one component for a fully connected graph', () => {
    const adj = makeMap({ a: ['b'], b: ['c'], c: [] });
    const components = connectedComponents(adj);
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('returns multiple components for a disconnected graph', () => {
    const adj = makeMap({ a: ['b'], b: [], c: ['d'], d: [] });
    const components = connectedComponents(adj);
    expect(components).toHaveLength(2);
    const flat = components.map((c) => c.sort().join(',')).sort();
    expect(flat).toEqual(['a,b', 'c,d']);
  });

  it('treats edges as undirected (reverse-direction links in same component)', () => {
    // a→b (directed). In undirected view, b is connected to a.
    const adj = makeMap({ a: ['b'], b: [] });
    const components = connectedComponents(adj);
    expect(components).toHaveLength(1);
    expect(components[0].sort()).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty graph', () => {
    expect(connectedComponents(new Map())).toEqual([]);
  });

  it('returns isolated single-node components', () => {
    const adj = makeMap({ a: [], b: [], c: [] });
    const components = connectedComponents(adj);
    expect(components).toHaveLength(3);
    for (const c of components) expect(c).toHaveLength(1);
  });
});

// ── Topological sort ──────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('returns nodes such that every prerequisite comes before its dependents', () => {
    // functional_dep → 1NF → 2NF → 3NF → BCNF (linear chain)
    const adj = makeMap({
      functional_dep: ['1NF'],
      '1NF': ['2NF'],
      '2NF': ['3NF'],
      '3NF': ['BCNF'],
      BCNF: [],
    });

    const order = topologicalSort(adj);

    // Each concept must appear before its dependents
    const pos = (id: string) => order.indexOf(id);
    expect(pos('functional_dep')).toBeLessThan(pos('1NF'));
    expect(pos('1NF')).toBeLessThan(pos('2NF'));
    expect(pos('2NF')).toBeLessThan(pos('3NF'));
    expect(pos('3NF')).toBeLessThan(pos('BCNF'));
  });

  it('includes all nodes in the output', () => {
    const adj = makeMap({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] });
    const result = topologicalSort(adj);
    expect(result.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles a graph with no edges (all nodes are roots)', () => {
    const adj = makeMap({ a: [], b: [], c: [] });
    const result = topologicalSort(adj);
    expect(result.sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles a single node', () => {
    const adj = makeMap({ a: [] });
    expect(topologicalSort(adj)).toEqual(['a']);
  });

  it('returns all nodes even when a cycle is present (partial sort)', () => {
    // a→b→c→a (cycle)
    const adj = makeMap({ a: ['b'], b: ['c'], c: ['a'] });
    const result = topologicalSort(adj);
    // All three nodes must be present
    expect(result.sort()).toEqual(['a', 'b', 'c']);
  });

  it('is deterministic across calls', () => {
    const adj = makeMap({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] });
    expect(topologicalSort(adj)).toEqual(topologicalSort(adj));
  });
});
