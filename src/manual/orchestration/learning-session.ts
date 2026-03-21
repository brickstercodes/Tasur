/**
 * WHY: Manual (Vercel AI SDK) path learning session orchestration.
 *
 * Implements the same pipeline as src/mastra/workflows/learning-session.ts
 * using the manual agent registry. Structurally identical — same phases,
 * same loop, same LearningSessionResult shape — so the API layer can
 * switch AGENT_PROVIDER without changing any consumer code.
 *
 * The manual path is the fallback when Mastra has breaking changes or adds
 * unwanted constraints. Having a working manual path as a maintained file
 * (not just a code comment) ensures the pivot is always < 1 day of work.
 *
 * See src/mastra/workflows/learning-session.ts for the full design rationale.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { DocumentParserInput } from '@/interfaces/registry';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import type { DocumentParserOutput } from '@/lib/schemas/parser-output';
import { StudentGraph } from '@/lib/graph/student-graph';
import {
  buildInitialGraphState,
  mergeAugmentations,
} from '@/lib/orchestration/session-utils';
import type { LearningMode } from '@/types/sessions';
import type { StudentGraphState } from '@/types/graph';

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
  parsed: DocumentParserOutput;
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
    // ── Phase 1: Ingest ──────────────────────────────────────────────────────
    const parsedResult = await this.agents
      .get('document-parser')
      .execute(input.documentInput);

    let parsedContent = parsedResult.data;

    // ── Phase 2: Augment (conditional) ──────────────────────────────────────
    if (parsedContent.gaps_detected.length > 0) {
      const webResult = await this.agents.get('web-search').execute({
        gaps: parsedContent.gaps_detected,
        domain: input.domain,
      });
      parsedContent = mergeAugmentations(parsedContent, webResult.data);
    }

    // ── Phase 3: Orient (parallel mindmap + flashcard generation) ────────────
    const [mindmapResult, flashcardResult] = await Promise.all([
      this.agents.get('mindmap-generator').execute({
        parsedContent,
        domain: input.domain,
      }),
      this.agents.get('flashcard-generator').execute({
        parsedContent,
        domain: input.domain,
        learningMode: input.mode,
      }),
    ]);

    // ── Phase 4: Core orchestration loop ─────────────────────────────────────
    const graph = StudentGraph.fromState(
      buildInitialGraphState(input.sessionId, parsedContent),
    );

    const routingLog: RoutingStep[] = [];
    let lastEvent = 'web_search_complete';
    let sessionActive = true;
    let step = 0;

    while (sessionActive && step < MAX_ROUTING_STEPS) {
      const orchestratorResult = await this.agents.get('orchestrator').execute({
        studentState: graph.serialize(),
        mode: input.mode,
        lastEvent,
        domain: input.domain,
      });

      const decision = orchestratorResult.data;

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
      parsed: parsedContent,
      mindmap: mindmapResult.data,
      flashcards: flashcardResult.data,
      finalGraphState: graph.serialize(),
      routingLog,
      totalOrchestratorCalls: routingLog.length,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function simulateNextEvent(agentName: string): string {
  switch (agentName) {
    case 'concept-explainer':    return 'micro_assessment_complete';
    case 'flashcard-generator':  return 'flashcards_generated';
    case 'web-search':           return 'web_search_complete';
    case 'mindmap-generator':    return 'mindmap_generated';
    case 'document-parser':      return 'document_parsed';
    default:                     return 'micro_assessment_complete';
  }
}
