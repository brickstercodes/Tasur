/**
 * WHY: Extracts DerivedConcept[] from a ParsedMindmap by walking the MmNode tree.
 *
 * Every TRACKABLE node becomes one DerivedConcept. The extraction captures:
 * - The concept's identity (id, name) from the TRACKABLE node's attributes
 * - Its structural position (depth, parentId, position, childConceptIds)
 * - Its actual teaching content (leafContent) from non-TRACKABLE child nodes
 * - A diagram flag if any leaf contains a [DIAGRAM TO STUDY:] callout
 *
 * This replaces the Document Parser agent's concept extraction — the same
 * information is now derived deterministically from the .mm structure.
 * No LLM call. No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { MmNode, ParsedMindmap, DerivedConcept } from './types';

const DIAGRAM_CALLOUT_PREFIX = '[DIAGRAM TO STUDY:';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extracts all TRACKABLE nodes from the parsed mindmap as DerivedConcept[].
 *
 * The walk is depth-first and preserves source order (parent before children,
 * siblings in document order). This order IS the default teaching sequence —
 * the tree structure encodes the pedagogical path.
 *
 * Positions are resolved in a single post-pass after the walk, so `position`
 * reflects each concept's 0-based index among its same-parent siblings.
 *
 * @param tree  ParsedMindmap produced by parseMmXml().
 * @returns     Ordered array of assessable concepts derived from the .mm.
 */
export function extractConcepts(tree: ParsedMindmap): DerivedConcept[] {
  const concepts: DerivedConcept[] = [];
  walkNode(tree.root, null, concepts);
  return resolvePositions(concepts);
}

// ── Tree walk ─────────────────────────────────────────────────────────────────

/**
 * Recursive depth-first walk. When we encounter a TRACKABLE node, we build a
 * DerivedConcept and continue walking its children (which may themselves be
 * TRACKABLE). Non-TRACKABLE nodes are traversed only to pass through to any
 * TRACKABLE descendants further down.
 */
function walkNode(
  node: MmNode,
  nearestTrackableAncestorId: string | null,
  accumulator: DerivedConcept[],
): void {
  if (node.TRACKABLE && node.CONCEPT_ID) {
    const concept = buildDerivedConcept(node, nearestTrackableAncestorId);
    accumulator.push(concept);

    for (const child of node.children) {
      walkNode(child, node.CONCEPT_ID, accumulator);
    }
  } else {
    // Non-TRACKABLE: recurse without changing the ancestor context
    for (const child of node.children) {
      walkNode(child, nearestTrackableAncestorId, accumulator);
    }
  }
}

// ── DerivedConcept builder ────────────────────────────────────────────────────

/**
 * Builds a DerivedConcept from a single TRACKABLE MmNode.
 *
 * `leafContent` collects TEXT from direct non-TRACKABLE children only.
 * We stop at TRACKABLE children because their content belongs to a separate
 * concept that will be extracted in its own walk step.
 */
function buildDerivedConcept(node: MmNode, parentConceptId: string | null): DerivedConcept {
  const leafContent = collectDirectLeafContent(node);
  const childConceptIds = collectDirectChildConceptIds(node);
  const hasDiagram = leafContent.some((text) => text.startsWith(DIAGRAM_CALLOUT_PREFIX));

  return {
    id: node.CONCEPT_ID!,
    name: node.TEXT,
    depth: node.depth,
    parentId: parentConceptId,
    childConceptIds,
    leafContent,
    hasDiagram,
    position: 0, // resolved in resolvePositions() post-pass
  };
}

/**
 * Collects TEXT from non-TRACKABLE direct children.
 *
 * One level deep only — TRACKABLE children are separate concepts with their
 * own content. Empty strings (blank nodes) are filtered out.
 */
function collectDirectLeafContent(node: MmNode): string[] {
  return node.children
    .filter((child) => !child.TRACKABLE)
    .map((child) => child.TEXT)
    .filter((text) => text.length > 0);
}

/**
 * Returns CONCEPT_IDs of direct TRACKABLE children.
 */
function collectDirectChildConceptIds(node: MmNode): string[] {
  return node.children
    .filter((child) => child.TRACKABLE && Boolean(child.CONCEPT_ID))
    .map((child) => child.CONCEPT_ID!);
}

// ── Position resolution ───────────────────────────────────────────────────────

/**
 * Assigns the 0-based `position` to each concept among its same-parent siblings.
 *
 * Groups concepts by parentId, then numbers them in source (depth-first) order.
 * This preserves the teaching sequence encoded in the .mm file.
 */
function resolvePositions(concepts: DerivedConcept[]): DerivedConcept[] {
  const siblingCounters = new Map<string | null, number>();

  return concepts.map((concept) => {
    const counter = siblingCounters.get(concept.parentId) ?? 0;
    siblingCounters.set(concept.parentId, counter + 1);
    return { ...concept, position: counter };
  });
}
