/**
 * WHY: Shared helpers for the learning session orchestration loop.
 *
 * Both the Mastra workflow and the manual async loop need to:
 *   1. Build an initial StudentGraphState from a DocumentParserOutput
 *   2. Format a student graph summary string for the orchestrator LLM prompt
 *   3. Merge web-search augmentations into the parsed content structure
 *
 * Extracting these into one file means each learning session implementation
 * stays under 100 lines and avoids duplicating graph-building logic.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { DocumentParserOutput } from '@/lib/schemas/parser-output';
import type { ConceptNode, ConceptEdge } from '@/types/concepts';
import type { StudentGraphState } from '@/types/graph';
import type { GraphProgress } from '@/lib/graph/student-graph';

// ── Graph state builder ───────────────────────────────────────────────────────

/**
 * Converts a DocumentParserOutput into an initial StudentGraphState.
 *
 * All concepts start at confidence 0.0 and exposure count 0 — the orchestrator
 * begins with a blank slate and updates confidence as the student interacts.
 * Relationships are mapped directly from the parser's `concept_relationships`.
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
 * The format is terse and fact-dense — the orchestrator does not need prose,
 * it needs enough signal to make a routing decision in one pass.
 */
export function buildOrchestratorUserMessage(
  state: StudentGraphState,
  progress: GraphProgress,
  unblockedConceptIds: string[],
  lastEvent: string,
  mode: string,
  domain: string,
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

  const unblockedNames = unblockedConceptIds
    .map((id) => state.nodes.find((n) => n.id === id)?.name ?? id)
    .join(', ');

  return [
    `Event: ${lastEvent}`,
    `Mode: ${mode} | Domain: ${domain}`,
    '',
    `Progress: ${progress.mastered}/${progress.total} mastered | avg confidence: ${progress.averageConfidence.toFixed(2)}`,
    `Unblocked concepts (ready to study): ${unblockedNames || 'none'}`,
    '',
    'Concept graph:',
    nodeLines,
    '',
    'Make your routing decision now.',
  ].join('\n');
}

// ── Web augmentation merge ────────────────────────────────────────────────────

/**
 * Merges web-search augmentations back into the parsed content structure.
 *
 * The web search agent returns additional content for gap concepts. We append
 * that content to the matching concept's `raw_content` field so downstream
 * agents (mindmap, flashcard) see the enriched version.
 *
 * Unknown concept IDs from the web search are silently ignored — the web
 * search agent sometimes invents IDs that don't match the parser's output.
 */
export function mergeAugmentations(
  parsed: DocumentParserOutput,
  augmentationData: unknown,
): DocumentParserOutput {
  // Type guard: augmentation data must have the expected shape
  if (!isAugmentationOutput(augmentationData)) {
    return parsed;
  }

  const enriched = { ...parsed, concepts: parsed.concepts.map((c) => ({ ...c })) };

  for (const aug of augmentationData.augmentations) {
    const concept = enriched.concepts.find((c) => c.id === aug.concept_id);
    if (!concept) continue;
    concept.raw_content = `${concept.raw_content}\n\n[Web augmentation]\n${aug.additional_content}`;
  }

  return enriched;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Maps concept complexity to an exam priority score.
 * Foundational concepts are weighted higher in fast mode because they underpin
 * everything — even though they are "simpler".
 */
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
