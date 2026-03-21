/**
 * WHY: Deterministic Freeplane .mm XML parser — the entry point for the .mm-first pipeline.
 *
 * The .mm Generator agent produces a single Freeplane XML string. This module
 * parses that string into a normalised MmNode tree (ParsedMindmap) from which
 * all downstream data structures are derived by code — not by additional LLM calls.
 *
 * Design decisions:
 * - fast-xml-parser is used because it handles Freeplane XML reliably and is
 *   significantly faster than DOM-based parsers for server-side use.
 * - `isArray: (name) => name === 'node' || name === 'font'` ensures child nodes
 *   are always arrays even when there is only one child, preventing the
 *   "single vs array" branching bug that affects naive XML parsers.
 * - Validation runs before normalisation so error messages reference the raw
 *   XML structure, not the normalised tree.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import { XMLParser } from 'fast-xml-parser';

import type { MmNode, ParsedMindmap, RawMmXmlNode } from './types';

// ── Parser configuration ──────────────────────────────────────────────────────

const ATTRIBUTE_PREFIX = '@_';

/**
 * Shared fast-xml-parser instance (stateless — safe to reuse across calls).
 *
 * Key options:
 * - ignoreAttributes: false — we need TRACKABLE, CONCEPT_ID, TEXT attributes
 * - attributeNamePrefix: '@_' — keeps attribute keys distinct from element names
 * - isArray: forces <node> and <font> to always parse as arrays
 * - allowBooleanAttributes: handles bare attributes like FOLDED without ="value"
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  isArray: (name) => name === 'node' || name === 'font',
  allowBooleanAttributes: true,
  trimValues: true,
});

// ── Validation constants ───────────────────────────────────────────────────────

const DIAGRAM_CALLOUT_PREFIX = '[DIAGRAM TO STUDY:';
const MINIMUM_DEPTH = 2;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses a Freeplane .mm XML string into a normalised ParsedMindmap.
 *
 * Throws a descriptive error for:
 * - Invalid or non-map XML
 * - Missing root <node>
 * - No TRACKABLE nodes found
 * - TRACKABLE nodes missing CONCEPT_ID
 * - Depth < 3 levels (the prompt enforces min 3 — validate it was followed)
 *
 * @param xmlString  The raw .mm XML produced by the .mm Generator agent.
 */
export function parseMmXml(xmlString: string): ParsedMindmap {
  validateXmlStartsCorrectly(xmlString);

  const rawParsed = xmlParser.parse(xmlString) as { map?: { node?: RawMmXmlNode[] } };

  if (!rawParsed.map) {
    throw new Error('.mm parse error: root <map> element not found. Ensure the XML starts with <map>.');
  }

  const rootNodes = rawParsed.map.node;
  if (!rootNodes || rootNodes.length === 0) {
    throw new Error('.mm parse error: <map> has no <node> children. The .mm must have a root node.');
  }

  // Freeplane always has a single root node at the top level of <map>
  const rawRoot = rootNodes[0];
  const root = normaliseMmNode(rawRoot, 0);

  validateNormalisedTree(root);

  const maxDepth = computeMaxDepth(root);
  const trackableCount = countTrackableNodes(root);

  return {
    root,
    metadata: {
      title: root.TEXT,
      trackableCount,
      maxDepth,
    },
  };
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Recursively converts a raw fast-xml-parser node into a normalised MmNode.
 *
 * Attribute values from the parser are strings (even for booleans), so we
 * convert TRACKABLE to a real boolean here rather than spreading that
 * knowledge across every consumer.
 */
function normaliseMmNode(raw: RawMmXmlNode, depth: number): MmNode {
  const rawChildren = raw.node ?? [];
  const children = rawChildren.map((child) => normaliseMmNode(child, depth + 1));

  const rawFont = raw.font?.[0];
  const font = rawFont
    ? {
        BOLD: rawFont[`${ATTRIBUTE_PREFIX}BOLD`],
        NAME: rawFont[`${ATTRIBUTE_PREFIX}NAME`],
        SIZE: rawFont[`${ATTRIBUTE_PREFIX}SIZE`],
      }
    : undefined;

  return {
    TEXT: String(raw[`${ATTRIBUTE_PREFIX}TEXT`] ?? '').trim(),
    TRACKABLE: raw[`${ATTRIBUTE_PREFIX}TRACKABLE`] === 'true',
    CONCEPT_ID: raw[`${ATTRIBUTE_PREFIX}CONCEPT_ID`] as string | undefined,
    FOLDED: raw[`${ATTRIBUTE_PREFIX}FOLDED`] as string | undefined,
    POSITION: raw[`${ATTRIBUTE_PREFIX}POSITION`] as string | undefined,
    font,
    children,
    depth,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Fast pre-parse check — confirms the string starts and ends with the right tags
 * before paying the cost of full XML parsing.
 */
function validateXmlStartsCorrectly(xmlString: string): void {
  const trimmed = xmlString.trim();

  if (!trimmed.startsWith('<map')) {
    throw new Error(
      `.mm validation error: XML must start with <map ...>. Got: "${trimmed.slice(0, 40)}..."`,
    );
  }

  if (!trimmed.endsWith('</map>')) {
    throw new Error(
      `.mm validation error: XML must end with </map>. Last 40 chars: "...${trimmed.slice(-40)}"`,
    );
  }
}

/**
 * Post-normalisation structural validation.
 *
 * Checks performed:
 * 1. At least one TRACKABLE node exists in the entire tree
 * 2. Every TRACKABLE node has a non-empty CONCEPT_ID
 * 3. Tree depth is at least MINIMUM_DEPTH levels (root counts as 0)
 */
function validateNormalisedTree(root: MmNode): void {
  const trackableNodes = collectTrackableNodes(root);

  if (trackableNodes.length === 0) {
    throw new Error(
      '.mm validation error: No TRACKABLE="true" nodes found. The .mm generator must mark assessable concepts as TRACKABLE.',
    );
  }

  for (const node of trackableNodes) {
    if (!node.CONCEPT_ID || node.CONCEPT_ID.trim() === '') {
      throw new Error(
        `.mm validation error: TRACKABLE node "${node.TEXT}" (depth ${node.depth}) is missing CONCEPT_ID. Every TRACKABLE node must have a CONCEPT_ID.`,
      );
    }
  }

  const maxDepth = computeMaxDepth(root);
  if (maxDepth < MINIMUM_DEPTH) {
    throw new Error(
      `.mm validation error: Tree is too shallow (max depth ${maxDepth}, minimum required: ${MINIMUM_DEPTH}). The .mm must have at least 3 levels of depth.`,
    );
  }
}

// ── Tree utilities ─────────────────────────────────────────────────────────────

/** Returns all TRACKABLE nodes in depth-first order. */
function collectTrackableNodes(node: MmNode): MmNode[] {
  const result: MmNode[] = [];
  if (node.TRACKABLE) result.push(node);
  for (const child of node.children) {
    result.push(...collectTrackableNodes(child));
  }
  return result;
}

/** Returns the maximum depth of any node in the subtree rooted at `node`. */
function computeMaxDepth(node: MmNode): number {
  if (node.children.length === 0) return node.depth;
  return Math.max(...node.children.map(computeMaxDepth));
}

/** Returns the count of TRACKABLE nodes in the subtree. */
function countTrackableNodes(node: MmNode): number {
  const selfCount = node.TRACKABLE ? 1 : 0;
  return selfCount + node.children.reduce((sum, child) => sum + countTrackableNodes(child), 0);
}

// Re-export types for consumers that import from this module
export type { MmNode, ParsedMindmap, DerivedConcept } from './types';
export { DIAGRAM_CALLOUT_PREFIX };
