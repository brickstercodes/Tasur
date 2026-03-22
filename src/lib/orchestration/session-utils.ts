/**
 * WHY: Shared helpers for the learning session orchestration loop.
 *
 * Both the Mastra workflow and the manual async loop need to:
 *   1. Build an initial StudentGraphState from DerivedConcept[] + ConceptEdge[]
 *      (new .mm-first path) or from a DocumentParserOutput (legacy path)
 *   2. Format a student graph summary string for the orchestrator LLM prompt
 *   3. Merge web-search augmentations into parsed content structure
 *   4. Determine the next teaching target via deterministic tree traversal
 *
 * The tree-walk routing function (getNextTeachingTarget) replaces the old
 * orchestrator concept-sequencing logic. Default teaching order is now
 * determined by code, not LLM reasoning — the orchestrator only gets called
 * for assessment evaluation and approach selection.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { ConceptNode, ConceptEdge } from '@/types/concepts';
import type { StudentGraphState } from '@/types/graph';
import type { DerivedConcept } from '@/lib/mm-parser/types';
import type { ParsedMindmap, MmNode } from '@/lib/mm-parser/types';
import type { DocumentParserOutput } from '@/lib/schemas/parser-output';
import type { GraphProgress } from '@/lib/graph/student-graph';
import { StudentGraph } from '@/lib/graph/student-graph';

// ── Graph state builder: .mm-first path ───────────────────────────────────────

/**
 * Builds an initial StudentGraphState from DerivedConcept[] and ConceptEdge[].
 *
 * This replaces buildInitialGraphState (the Document Parser path) for the new
 * .mm-first pipeline. Key difference: `content.raw` is now the full leafContent
 * from the .mm — actual teaching bullet points, not a 2-4 sentence summary.
 *
 * Complexity is derived from depth: shallow concepts (depth 1-2) are foundational,
 * medium depth (3) is intermediate, and deep concepts (4+) are advanced.
 *
 * @param sessionId  Unique session identifier.
 * @param concepts   DerivedConcept[] from extractConcepts().
 * @param edges      ConceptEdge[] from buildGraphEdges().
 * @param domain     Subject domain string (e.g. "dbms").
 */
export function buildInitialGraphStateFromMm(
  sessionId: string,
  concepts: DerivedConcept[],
  edges: ConceptEdge[],
  domain: string,
): StudentGraphState {
  const nodes: ConceptNode[] = concepts.map((concept) => ({
    id: concept.id,
    name: concept.name,
    domain,
    content: {
      raw: concept.leafContent.join('\n'),
    },
    complexity: depthToComplexity(concept.depth),
    keywords: [],
    studentState: {
      confidence: 0,
      exposureCount: 0,
      effectiveModalities: [],
      modePerformance: { fast: 0, steady: 0 },
      lastAssessed: null,
    },
    metadata: {
      examPriority: depthToExamPriority(concept.depth),
    },
  }));

  return {
    sessionId,
    nodes,
    edges,
    lastSyncedAt: new Date().toISOString(),
  };
}

// ── Tree-walk routing (deterministic — no LLM) ────────────────────────────────

/**
 * Returns the next concept the student should study using depth-first tree traversal.
 *
 * This is the default teaching sequence derived from the .mm tree structure.
 * The orchestrator LLM is NOT called for sequencing decisions — only for
 * assessment evaluation, approach selection, and mode adaptation.
 *
 * Walk logic:
 * 1. Traverse depth-first (parent concepts before children — prerequisite order)
 * 2. Skip non-TRACKABLE nodes
 * 3. For each TRACKABLE node:
 *    - If mastered (confidence >= threshold): skip, continue to children
 *    - If not mastered: return this concept as the next target
 *
 * The tree structure implicitly enforces prerequisite ordering: a parent concept
 * must be mastered before its children are eligible (parents appear first in DFS).
 *
 * @param tree   ParsedMindmap from parseMmXml().
 * @param graph  Current StudentGraph — used to check mastery per concept.
 * @param mode   Learning mode determines the mastery threshold.
 * @returns      concept_id of the next concept to teach, or null if all mastered.
 */
export function getNextTeachingTarget(
  tree: ParsedMindmap,
  graph: StudentGraph,
  mode: 'fast' | 'steady',
): string | null {
  const masteryThreshold = mode === 'fast' ? 0.5 : 0.7;
  return walkForNextTarget(tree.root, graph, masteryThreshold);
}

/**
 * Recursive DFS walk. Returns the first unmastered TRACKABLE concept id, or null.
 */
function walkForNextTarget(
  node: MmNode,
  graph: StudentGraph,
  masteryThreshold: number,
): string | null {
  if (node.TRACKABLE && node.CONCEPT_ID) {
    const conceptNode = graph.nodes.get(node.CONCEPT_ID);
    const confidence = conceptNode?.studentState.confidence ?? 0;

    if (confidence < masteryThreshold) {
      return node.CONCEPT_ID;
    }
    // Mastered — fall through to check children
  }

  for (const child of node.children) {
    const result = walkForNextTarget(child, graph, masteryThreshold);
    if (result !== null) return result;
  }

  return null;
}

// ── DerivedConcept[] → DocumentParserOutput adapter ──────────────────────────

/**
 * Converts DerivedConcept[] + ConceptEdge[] into a DocumentParserOutput-shaped
 * object so the Flashcard Generator agent (which expects DocumentParserOutput)
 * can work with .mm-derived data without changing its interface.
 *
 * The key improvement: `raw_content` is now the full leafContent from the .mm
 * (all teaching bullet points), not a 2-4 sentence LLM summary. Flashcards
 * generated from this richer content are more specific and exam-ready.
 *
 * @param concepts  DerivedConcept[] from extractConcepts().
 * @param edges     ConceptEdge[] from buildGraphEdges().
 * @param domain    Subject domain string (e.g. "dbms").
 * @param title     Document title for the parser output header.
 */
export function buildParserOutputFromDerivedConcepts(
  concepts: DerivedConcept[],
  edges: ConceptEdge[],
  domain: string,
  title: string,
): DocumentParserOutput {
  return {
    title,
    subject_detection: {
      primary: domain,
      confidence: 1.0,
      domain_template: `${domain}_v1`,
    },
    concepts: concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      raw_content: concept.leafContent.join('\n') || concept.name,
      prerequisites: concept.parentId ? [concept.parentId] : [],
      complexity: depthToComplexity(concept.depth),
      keywords: [],
    })),
    concept_relationships: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      // Map 'sequential' → 'related' for the flashcard generator's schema
      type: edge.type === 'sequential' ? ('related' as const) : (edge.type as 'prerequisite'),
    })),
    gaps_detected: [],
  };
}

// ── Graph state builder: legacy Document Parser path ─────────────────────────

/**
 * Converts a DocumentParserOutput into an initial StudentGraphState.
 *
 * Retained for comparison testing against the old Document Parser pipeline.
 * In the active .mm-first pipeline, use buildInitialGraphStateFromMm() instead.
 */
export function buildInitialGraphState(
  sessionId: string,
  parsed: DocumentParserOutput,
): StudentGraphState {
  const nodes: ConceptNode[] = parsed.concepts.map((concept) => ({
    id: concept.id,
    name: concept.name,
    domain: parsed.subject_detection.primary,
    content: {
      raw: concept.raw_content,
    },
    complexity: concept.complexity,
    keywords: concept.keywords,
    studentState: {
      confidence: 0,
      exposureCount: 0,
      effectiveModalities: [],
      modePerformance: { fast: 0, steady: 0 },
      lastAssessed: null,
    },
    metadata: {
      examPriority: computeExamPriority(concept.complexity),
    },
  }));

  const edges: ConceptEdge[] = parsed.concept_relationships.map((rel) => ({
    from: rel.from,
    to: rel.to,
    type: rel.type,
    weight: 1,
    bidirectional: false,
  }));

  return {
    sessionId,
    nodes,
    edges,
    lastSyncedAt: new Date().toISOString(),
  };
}

// ── Orchestrator user message builder ─────────────────────────────────────────

/**
 * Formats the student graph state into a structured string the orchestrator
 * LLM receives as its user message.
 *
 * In the .mm-first pipeline the orchestrator focuses on assessment evaluation
 * and approach selection. Concept sequencing is handled by getNextTeachingTarget()
 * (deterministic code) and passed as `nextTeachingTarget` in the message.
 */
export function buildOrchestratorUserMessage(
  state: StudentGraphState,
  progress: GraphProgress,
  unblockedConceptIds: string[],
  lastEvent: string,
  mode: string,
  domain: string,
  nextTeachingTarget?: string | null,
  currentConceptId?: string,
): string {
  const nodeLines = state.nodes
    .map((node) => {
      const c = node.studentState.confidence;
      const status =
        c >= 0.6 ? 'MASTERED' : c === 0 && node.studentState.exposureCount === 0
          ? 'NOT_STARTED'
          : 'IN_PROGRESS';
      const isUnblocked = unblockedConceptIds.includes(node.id);
      const flag = isUnblocked ? ' [UNBLOCKED]' : '';
      return `  - ${node.id} | "${node.name}" | confidence: ${c.toFixed(2)} | ${status}${flag}`;
    })
    .join('\n');

  const lines = [
    `Event: ${lastEvent}`,
    `Mode: ${mode} | Domain: ${domain}`,
  ];

  // When a concept is being actively assessed, surface it explicitly so the
  // orchestrator never has to guess concept_id from the student's answer text.
  if (currentConceptId) {
    const conceptNode = state.nodes.find((n) => n.id === currentConceptId);
    const conceptName = conceptNode ? ` ("${conceptNode.name}")` : '';
    lines.push(`Currently assessed concept: ${currentConceptId}${conceptName}`);
    lines.push(
      `IMPORTANT: If emitting understanding_update, you MUST set concept_id to "${currentConceptId}" — do not infer it from the student answer.`,
    );
  }

  lines.push(
    '',
    `Progress: ${progress.mastered}/${progress.total} mastered | avg confidence: ${progress.averageConfidence.toFixed(2)}`,
  );

  if (nextTeachingTarget !== undefined) {
    lines.push(
      `Next teaching target (tree-walk determined): ${nextTeachingTarget ?? 'ALL CONCEPTS MASTERED'}`,
    );
  }

  lines.push('', 'Concept graph:', nodeLines, '', 'Make your judgment now.');

  return lines.join('\n');
}

// ── Web augmentation merge ────────────────────────────────────────────────────

/**
 * Merges web-search augmentations back into the parsed content structure.
 *
 * Used when a web search agent fills detected gaps. The enriched content is
 * appended to the matching concept's `raw_content` field so downstream agents
 * (flashcard generator, concept explainer) see the complete information.
 */
export function mergeAugmentations(
  parsed: DocumentParserOutput,
  augmentationData: unknown,
): DocumentParserOutput {
  if (!isAugmentationOutput(augmentationData)) return parsed;

  const enriched = { ...parsed, concepts: parsed.concepts.map((c) => ({ ...c })) };

  for (const aug of augmentationData.augmentations) {
    const concept = enriched.concepts.find((c) => c.id === aug.concept_id);
    if (!concept) continue;
    concept.raw_content = `${concept.raw_content}\n\n[Web augmentation]\n${aug.additional_content}`;
  }

  return enriched;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function depthToComplexity(depth: number): 'foundational' | 'intermediate' | 'advanced' {
  if (depth <= 2) return 'foundational';
  if (depth === 3) return 'intermediate';
  return 'advanced';
}

function depthToExamPriority(depth: number): number {
  // Shallower concepts (foundational) get higher exam priority
  if (depth <= 2) return 3;
  if (depth === 3) return 2;
  return 1;
}

function computeExamPriority(complexity: 'foundational' | 'intermediate' | 'advanced'): number {
  switch (complexity) {
    case 'foundational': return 3;
    case 'intermediate': return 2;
    case 'advanced':     return 1;
  }
}

interface AugmentationOutput {
  augmentations: Array<{
    concept_id: string;
    additional_content: string;
  }>;
}

function isAugmentationOutput(value: unknown): value is AugmentationOutput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'augmentations' in value &&
    Array.isArray((value as AugmentationOutput).augmentations)
  );
}
