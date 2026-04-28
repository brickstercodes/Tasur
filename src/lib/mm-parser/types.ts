/**
 * WHY: Shared type definitions for the .mm parser pipeline.
 *
 * These types flow through three deterministic steps: parseMmXml → extractConcepts
 * → buildGraphEdges / toMindmapTreeOutput. Keeping them in one file means every
 * step shares the same contracts with no circular imports and no framework deps.
 * No imports from Mastra, Vercel AI SDK, Supabase, or fast-xml-parser.
 */

// ── Raw XML node (output of fast-xml-parser, before normalisation) ────────────

/**
 * The shape fast-xml-parser produces for a single <node> element.
 * Attribute names are prefixed with '@_' by the parser.
 * child <node> elements are always an array (via the `isArray` option).
 * child <font> elements are also always an array.
 */
export interface RawMmXmlNode {
  '@_TEXT'?: string;
  '@_TRACKABLE'?: string;
  '@_CONCEPT_ID'?: string;
  '@_FOLDED'?: string;
  '@_POSITION'?: string;
  font?: Array<{
    '@_BOLD'?: string;
    '@_NAME'?: string;
    '@_SIZE'?: string;
  }>;
  node?: RawMmXmlNode[];
  [key: string]: unknown;
}

// ── Normalised in-memory node tree ────────────────────────────────────────────

/**
 * A single node in the normalised mindmap tree produced by parseMmXml().
 *
 * Every field is a first-class TypeScript property — no string-keyed attribute
 * access required after normalisation. This is the shape that concept-extractor,
 * graph-builder, and tree-converter all operate on.
 */
export interface MmNode {
  /** Visible text label of the node. */
  TEXT: string;

  /** True when this node represents an assessable concept (TRACKABLE="true"). */
  TRACKABLE: boolean;

  /**
   * Stable concept identifier — only present on TRACKABLE nodes.
   * Maps to flashcard anchors, the student graph, and the understanding state table.
   */
  CONCEPT_ID?: string;

  /** Freeplane FOLDED attribute — true means collapsed by default in the UI. */
  FOLDED?: string;

  /** POSITION attribute — "right" | "left" | undefined (only on top-level branches). */
  POSITION?: string;

  /** Font styling — used to indicate structural level (bold SIZE=16 = top-level branch). */
  font?: {
    BOLD?: string;
    NAME?: string;
    SIZE?: string;
  };

  /** Recursive children (order preserved from the XML). */
  children: MmNode[];

  /** Zero-based depth in the tree (root = 0). */
  depth: number;
}

// ── Top-level parsed result ────────────────────────────────────────────────────

/**
 * The full parsed mindmap returned by parseMmXml().
 * `root` is the single root <node> (the document title node).
 */
export interface ParsedMindmap {
  root: MmNode;
  metadata: {
    /** Root node TEXT — used as the study session title. */
    title: string;
    /** Total count of TRACKABLE nodes in the tree. */
    trackableCount: number;
    /** Maximum depth of any node in the tree (root = 0). */
    maxDepth: number;
  };
}

// ── Derived concept (extracted from TRACKABLE nodes) ─────────────────────────

/**
 * A single assessable concept derived from a TRACKABLE node in the .mm tree.
 *
 * This is the shape that flows into the StudentGraph, Flashcard Generator,
 * and Concept Explainer. The `leafContent` array contains the actual teaching
 * points — individual facts, definitions, steps, and properties — taken
 * directly from the non-trackable child nodes below this concept.
 *
 * This is richer than the Document Parser's old `raw_content` field, which
 * was 2-4 LLM-generated sentences. Here every bullet point from the .mm is
 * preserved as a separate string.
 */
export interface DerivedConcept {
  /** From CONCEPT_ID attribute — stable identifier for this concept. */
  id: string;

  /** From TEXT attribute — human-readable concept name. */
  name: string;

  /**
   * Zero-based depth of the TRACKABLE node (root = 0).
   * depth 1 = top-level branch (e.g. "1. Introduction")
   * depth 2 = sub-topic (e.g. "Challenges in Distributed Systems")
   */
  depth: number;

  /** CONCEPT_ID of the nearest TRACKABLE ancestor, or null for top-level concepts. */
  parentId: string | null;

  /** CONCEPT_IDs of direct TRACKABLE children of this node. */
  childConceptIds: string[];

  /**
   * TEXT values of non-TRACKABLE child nodes (the actual teaching content).
   * Each string is one fact, definition, property, step, or diagram callout.
   * Preserves source order from the .mm file.
   */
  leafContent: string[];

  /**
   * True if any leafContent entry starts with "[DIAGRAM TO STUDY:".
   * Signals that the student should refer to the source material for visual content.
   */
  hasDiagram: boolean;

  /**
   * Parsed diagram references extracted from [DIAGRAM TO STUDY: p.N: description] callouts.
   * Empty when hasDiagram is false or when page numbers are absent (legacy format).
   */
  diagramRefs: { pageNumber: number; description: string }[];

  /** Position of this node among its siblings (0-based, preserves teaching sequence). */
  position: number;
}
