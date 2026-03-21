/**
 * WHY: Manual (Vercel AI SDK) path learning session orchestration — .mm-first pipeline.
 *
 * Structurally identical to src/mastra/workflows/learning-session.ts.
 * Both implement the same phases, same pipeline, same LearningSessionResult shape.
 * The distinction is which agent registry is injected (manual vs. mastra).
 *
 * See the Mastra version for full design rationale and pipeline comments.
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
  mergeAugmentations,
} from '@/lib/orchestration/session-utils';
import type { LearningMode } from '@/types/sessions';
import type { StudentGraphState } from '@/types/graph';
import { loadPrompt } from '@/prompts/loader';
import { getOrchestratorModel } from '@/config/model-provider';
import { generateObject } from 'ai';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUTING_STEPS = 20;

// ── Types (re-exported for consumers that import from either path) ─────────────

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

// ── ManualLearningSession ─────────────────────────────────────────────────────

export class ManualLearningSession {
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

    // ── Phase 2: .mm Parser (deterministic code) ─────────────────────────────
    const parsedTree = parseMmXml(mmXml);
    const derivedConcepts = extractConcepts(parsedTree);
    const graphEdges = buildGraphEdges(derivedConcepts);
    const mindmapTree = toMindmapTreeOutput(parsedTree, input.domain);

    // ── Phase 3: Augment (conditional web search) ────────────────────────────
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

      const { object } = await generateObject({
        model: getOrchestratorModel(),
        schema: orchestratorOutputSchema,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const decision = object;

      if (decision.understanding_update) {
        const { concept_id, new_confidence } = decision.understanding_update;
        graph.updateConfidence(concept_id, new_confidence, 'orchestrator_assessment');
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

function simulateNextEvent(agentName: string): string {
  switch (agentName) {
    case 'concept-explainer':   return 'micro_assessment_complete';
    case 'flashcard-generator': return 'flashcards_generated';
    case 'web-search':          return 'web_search_complete';
    case 'mm-generator':        return 'mm_generated';
    default:                    return 'micro_assessment_complete';
  }
}
