# Task: Fix tree-converter.ts to preserve full non-TRACKABLE sub-tree depth

## Context & Why

The `.mm Generator` produces rich, deeply nested Freeplane XML — but the frontend mindmap viewer shows far fewer nodes than the raw XML contains. The problem is NOT in .mm generation (that's working well). The problem is in `src/lib/mm-parser/tree-converter.ts`, which converts the parsed `MmNode` tree into `MindmapTreeOutput` JSON for the react-flow frontend.

**Root cause:** `convertMmNode()` flattens all non-TRACKABLE children to just their `.TEXT` string, discarding any children those nodes may have. For example, a non-TRACKABLE node "Certificate Verification Flow" with 11 child steps underneath it becomes just the text string "Certificate Verification Flow" — all 11 steps are lost.

Specifically, lines 84-86:
```typescript
const leafTexts = nonTrackableChildren
    .map((c) => c.TEXT)    // ← drops all children of non-TRACKABLE nodes
    .filter((t) => t.length > 0);
```

Then `CONTENT_LEAF_LIMIT = 2` means only the first 2 non-TRACKABLE texts become the `content` string, and the rest become flat `MindmapNode` objects with only a `label` and no children.

**Impact:** The .mm XML might have 300+ nodes, but `MindmapTreeOutput` only shows ~80 because every non-TRACKABLE sub-tree is collapsed to a single label. This is the #1 user-facing quality issue — students see a sparse mindmap instead of the comprehensive one the LLM generated.

## Changes Required

### 1. Rewrite `convertMmNode()` in `src/lib/mm-parser/tree-converter.ts`

The core logic change: non-TRACKABLE children that themselves have children (i.e., they are intermediate nodes, not leaves) must be **recursively converted** into `MindmapNode` objects that preserve their full sub-tree. Only truly leaf non-TRACKABLE nodes (no children at all) should be treated as text bullets.

Here is the new logic for `convertMmNode()`:

```typescript
function convertMmNode(node: MmNode): MindmapNode {
  const trackableChildren = node.children.filter((c) => c.TRACKABLE);
  const nonTrackableChildren = node.children.filter((c) => !c.TRACKABLE);

  // Separate non-TRACKABLE children into two groups:
  // 1. "Leaf" non-trackable nodes: no children of their own → become text content or label-only bullets
  // 2. "Branch" non-trackable nodes: have children → recursively converted to preserve full sub-tree
  const leafNonTrackable = nonTrackableChildren.filter((c) => c.children.length === 0);
  const branchNonTrackable = nonTrackableChildren.filter((c) => c.children.length > 0);

  // Leaf non-trackable texts become the inline `content` field (teaching points shown on expand)
  const leafTexts = leafNonTrackable
    .map((c) => c.TEXT)
    .filter((t) => t.length > 0);

  // Recursively convert branch non-trackable nodes — their children are preserved
  const branchNonTrackableNodes: MindmapNode[] = branchNonTrackable.map(convertMmNode);

  // Recursively convert TRACKABLE children
  const trackableChildNodes: MindmapNode[] = trackableChildren.map(convertMmNode);

  // All leaf texts beyond a small limit become label-only bullet nodes.
  // But we now use ALL leaf texts as content (joined), not just the first 2.
  // The limit is removed because every leaf text is a teaching point the student needs.
  const contentText = leafTexts.length > 0 ? leafTexts.join('\n') : undefined;

  // Assemble children: TRACKABLE children first, then branch non-trackable sub-trees.
  // Leaf non-trackable nodes are captured in `content` — they don't need separate child nodes.
  const children: MindmapNode[] = [...trackableChildNodes, ...branchNonTrackableNodes];

  const result: MindmapNode = {
    label: node.TEXT,
    children: children.length > 0 ? children : undefined,
  };

  if (node.TRACKABLE && node.CONCEPT_ID) {
    result.id = node.CONCEPT_ID;
    result.concept_id = node.CONCEPT_ID;
  }

  if (contentText) {
    result.content = contentText;
  }

  return result;
}
```

### 2. Remove the `CONTENT_LEAF_LIMIT` constant

Delete the constant at line 29:
```typescript
/** Max leaf nodes to promote to `content` vs. keep as children. */
const CONTENT_LEAF_LIMIT = 2;
```

It's no longer used. All leaf text goes into `content`, and branch non-trackable nodes become recursive children.

### 3. Update the file-level WHY comment

Update the mapping rules in the top-of-file comment (lines 8-16) to reflect the new behavior:

Replace:
```
 * Mapping rules:
 * - Root MmNode → title + subject fields of MindmapTreeOutput
 * - TRACKABLE MmNode → MindmapNode with concept_id, label, content
 * - Non-TRACKABLE children of a TRACKABLE node → first one becomes `content`,
 *   additional ones become leaf MindmapNode children (label only, no concept_id)
 * - Non-TRACKABLE nodes at the top level (between root and first TRACKABLE)
 *   are treated the same as non-TRACKABLE children
 * - The [DIAGRAM TO STUDY:] leaf nodes become their own children with label
```

With:
```
 * Mapping rules:
 * - Root MmNode → title + subject fields of MindmapTreeOutput
 * - TRACKABLE MmNode → MindmapNode with concept_id, label, content
 * - Non-TRACKABLE LEAF children (no sub-children) → all texts joined into `content`
 * - Non-TRACKABLE BRANCH children (have sub-children) → recursively converted to
 *   MindmapNode children, preserving their full sub-tree depth
 * - TRACKABLE children → recursively converted with concept_id
 * - [DIAGRAM TO STUDY:] leaf nodes are preserved as leaf text in content
```

### 4. Update the convertMmNode JSDoc comment

Replace the existing JSDoc on `convertMmNode` (lines 66-79) with:

```typescript
/**
 * Converts a single MmNode (and its subtree) into a MindmapNode.
 *
 * For TRACKABLE nodes:
 * - `label` ← node.TEXT
 * - `concept_id` ← node.CONCEPT_ID
 * - `content` ← all leaf (childless) non-TRACKABLE child texts joined with newlines
 * - `children` ← TRACKABLE children (recursed) + non-TRACKABLE branch children (recursed)
 *
 * For non-TRACKABLE nodes with children:
 * - Recursively converted so their sub-tree is preserved in the frontend
 * - No concept_id (they are structural, not assessable)
 *
 * For non-TRACKABLE leaf nodes (no children):
 * - Their text is folded into the parent's `content` field
 */
```

## What NOT to change

- Do NOT change `toMindmapTreeOutput()` — only `convertMmNode()` changes
- Do NOT change `collectAllMindmapNodes()` or `computeMaxMindmapDepth()` — they already handle arbitrary depth recursion
- Do NOT change any types in `src/lib/schemas/mindmap-tree-output.ts` — `MindmapNode` already supports recursive `children`
- Do NOT change `src/lib/mm-parser/types.ts` — `MmNode` is unchanged
- Do NOT change any frontend files (`MindmapViewer.tsx`, `MindmapNode.tsx`, `balanced-tree.ts`) — they already handle arbitrary depth through recursion
- Do NOT change `src/lib/mm-parser/concept-extractor.ts` or `graph-builder.ts` — they operate on `ParsedMindmap`, not `MindmapTreeOutput`
- Do NOT change any prompt files or agent files

## Verification

After making changes:

1. Run `npx tsc --noEmit` — no type errors
2. Run `npm run lint` — no lint errors
3. Verify the `CONTENT_LEAF_LIMIT` constant is removed
4. Verify `convertMmNode` recursively processes non-TRACKABLE nodes that have children
5. Verify leaf non-TRACKABLE nodes (no children) still have their text captured in `content`
6. Verify the only file changed is `src/lib/mm-parser/tree-converter.ts`
