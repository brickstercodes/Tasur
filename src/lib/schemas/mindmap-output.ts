/**
 * @deprecated The flat nodes/edges mindmap schema has been superseded by the
 * hierarchical MindmapTreeOutput schema in `mindmap-tree-output.ts`.
 *
 * This file re-exports from the new canonical location so any stale imports
 * keep compiling. Update imports to use `@/lib/schemas/mindmap-tree-output` directly.
 */

export {
  mindmapNodeSchema,
  mindmapTreeOutputSchema,
  mindmapTreeOutputSchema as mindmapOutputSchema,
} from './mindmap-tree-output';

export type {
  MindmapNode,
  MindmapTreeOutput,
  MindmapTreeOutput as MindmapOutput,
} from './mindmap-tree-output';
