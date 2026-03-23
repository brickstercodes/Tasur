/**
 * WHY: Mastra-path learning session orchestration — .mm-first pipeline.
 *
 * Implements the new four-phase pipeline:
 *   Phase 1 — Ingest: extract text from file, then .mm Generator (single LLM call)
 *   Phase 2 — Parse: .mm Parser (deterministic code) derives concepts + graph + tree
 *   Phase 3 — Augment: web-search fills gaps detected from the .mm (conditional)
 *   Phase 4 — Orient: flashcard-generator (tree-to-MindmapTreeOutput is code, not LLM)
 *   Phase 5 — Route: orchestrator loop — tree-walk for sequencing, LLM for judgment only
 *
 * Compared to the old pipeline:
 * - Document Parser LLM call → replaced by .mm Generator LLM call (richer output)
 * - Mindmap Generator LLM call → ELIMINATED (toMindmapTreeOutput() is code)
 * - Net: one fewer LLM call in the critical path; all downstream data is richer
 *
 * NOTE: Mastra 0.24.9 Workflow graph API has known issues with AI SDK v6.
 * We implement the flow as a TypeScript class rather than a Mastra Workflow
 * graph until Mastra ships stable v6 support.
 */

import type { AgentRegistry, DocumentParserInput } from '@/interfaces/registry';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import { parseMmXml } from '@/lib/mm-parser';
import { extractConcepts } from '@/lib/mm-parser/concept-extractor';
import { buildGraphEdges } from '@/lib/mm-parser/graph-builder';
import { toMindmapTreeOutput } from '@/lib/mm-parser/tree-converter';
import type { DerivedConcept } from '@/lib/mm-parser/types';
import { parseDocument } from '@/lib/parsing';
import type { FileType } from '@/lib/parsing';
import { StudentGraph } from '@/lib/graph/student-graph';
import {
  buildInitialGraphStateFromMm,
  buildOrchestratorUserMessage,
  buildParserOutputFromDerivedConcepts,
  getNextTeachingTarget,
} from '@/lib/orchestration/session-utils';
import type { LearningMode } from '@/types/sessions';
import type { StudentGraphState } from '@/types/graph';
import { loadPrompt } from '@/prompts/loader';
import { getOrchestratorModel } from '@/config/model-provider';
import { generateObject } from 'ai';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUTING_STEPS = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LearningSessionInput {
  sessionId: string;
  documentInput: DocumentParserInput;
  domain: string;
  mode: LearningMode;
}

export interface RoutingStep {
  step: number;
  lastEvent: string;
  decision: OrchestratorOutputSchema;
  timestamp: string;
}

export interface LearningSessionResult {
  mmXml: string;
  derivedConcepts: DerivedConcept[];
  mindmap: MindmapTreeOutput;
  flashcards: FlashcardOutput;
  finalGraphState: StudentGraphState;
  routingLog: RoutingStep[];
  totalOrchestratorCalls: number;
}

// ── MastraLearningSession ─────────────────────────────────────────────────────

export class MastraLearningSession {
  constructor(private readonly agents: AgentRegistry) {}

  async run(input: LearningSessionInput): Promise<LearningSessionResult> {
    // ── Phase 1a: Extract text from file ────────────────────────────────────
    const fileType = resolveFileType(input.documentInput.mimeType, input.documentInput.filename);
    const parseResult = await parseDocument(input.documentInput.fileBuffer, fileType);

    if (!parseResult.success) {
      throw new Error(`File text extraction failed: ${parseResult.error}`);
    }

    const rawText = parseResult.data.rawText;

    // ── Phase 1b: .mm Generator (single LLM call) ────────────────────────────
    const mmResult = await this.agents.get('mm-generator').execute({
      rawText,
      fileType,
      subjectHint: input.domain,
    });

    const mmXml = mmResult.data;

    // ── Phase 2: .mm Parser (deterministic code — zero LLM calls) ────────────
    const parsedTree = parseMmXml(mmXml);
    const derivedConcepts = extractConcepts(parsedTree);
    const graphEdges = buildGraphEdges(derivedConcepts);
    const mindmapTree = toMindmapTreeOutput(parsedTree, input.domain);

    // ── Phase 3: Augment with web search (gap detection from .mm) ────────────
    // Build a parser-output-compatible structure so web-search can run
    // on any gaps identified. In the .mm pipeline, gaps are concepts referenced
    // in leaf nodes but not expanded into trackable concepts.
    const richParsedContent = buildParserOutputFromDerivedConcepts(
      derivedConcepts,
      graphEdges,
      input.domain,
      parsedTree.metadata.title,
    );

    let flashcardInputContent = richParsedContent;

    if (richParsedContent.gaps_detected.length > 0) {
      const webResult = await this.agents.get('web-search').execute({
        gaps: richParsedContent.gaps_detected,
        domain: input.domain,
      });
      // Merge augmentations into the parsed content for the flashcard generator
      const { mergeAugmentations } = await import('@/lib/orchestration/session-utils');
      flashcardInputContent = mergeAugmentations(richParsedContent, webResult.data);
    }

    // ── Phase 4: Flashcard Generation ────────────────────────────────────────
    const flashcardResult = await this.agents.get('flashcard-generator').execute({
      parsedContent: flashcardInputContent,
      domain: input.domain,
      learningMode: input.mode,
    });

    // ── Phase 5: Core orchestration loop ─────────────────────────────────────
    const graph = StudentGraph.fromState(
      buildInitialGraphStateFromMm(input.sessionId, derivedConcepts, graphEdges, input.domain),
    );

    const routingLog: RoutingStep[] = [];
    let lastEvent = 'mm_parsed';
    let sessionActive = true;
    let step = 0;

    const systemPrompt = loadPrompt('orchestrator', input.domain);

    while (sessionActive && step < MAX_ROUTING_STEPS) {
      const progress = graph.getProgress();
      const confidenceThreshold = input.mode === 'fast' ? 0.5 : 0.7;
      const unblockedIds = graph.getUnblockedConcepts(confidenceThreshold);

      // Deterministic tree-walk gives the orchestrator the next concept — no LLM reasoning needed
      const nextTarget = getNextTeachingTarget(parsedTree, graph, input.mode);

      const userMessage = buildOrchestratorUserMessage(
        graph.serialize(),
        progress,
        unblockedIds,
        lastEvent,
        input.mode,
        input.domain,
        nextTarget,
      );

      const { object, usage } = await generateObject({
        model: getOrchestratorModel(),
        schema: orchestratorOutputSchema,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const decision = object;
      void usage; // tracked via routingLog for future cost analysis

      if (decision.understanding_update) {
        const { concept_id, new_confidence } = decision.understanding_update;
        graph.updateConfidence(concept_id, new_confidence, input.mode, 'orchestrator_assessment');
      }

      routingLog.push({
        step,
        lastEvent,
        decision,
        timestamp: new Date().toISOString(),
      });

      if (decision.next_action.agent === 'session_complete') {
        sessionActive = false;
      } else {
        lastEvent = simulateNextEvent(decision.next_action.agent as string);
      }

      step++;
    }

    return {
      mmXml,
      derivedConcepts,
      mindmap: mindmapTree,
      flashcards: flashcardResult.data,
      finalGraphState: graph.serialize(),
      routingLog,
      totalOrchestratorCalls: routingLog.length,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveFileType(mimeType: string, filename: string): FileType {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    extension === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) return 'docx';
  if (extension === 'txt' || mimeType === 'text/plain') return 'txt';
  if (extension === 'png' || mimeType === 'image/png') return 'png';
  if (extension === 'jpg' || extension === 'jpeg' || mimeType.startsWith('image/jpeg')) return 'jpg';
  return 'txt';
}

/**
 * Maps an agent name to the next logical event for test/demo simulation.
 * In production, events come from real student interactions.
 */
function simulateNextEvent(agentName: string): string {
  switch (agentName) {
    case 'concept-explainer':   return 'micro_assessment_complete';
    case 'flashcard-generator': return 'flashcards_generated';
    case 'web-search':          return 'web_search_complete';
    case 'mm-generator':        return 'mm_generated';
    default:                    return 'micro_assessment_complete';
  }
}
