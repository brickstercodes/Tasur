/**
 * WHY: Mastra-path learning session orchestration.
 *
 * This runs the full session pipeline using the Mastra agent registry:
 *   Phase 1 — Ingest: document-parser extracts concepts
 *   Phase 2 — Augment: web-search fills gaps (skipped if no gaps)
 *   Phase 3 — Orient: mindmap-generator + flashcard-generator run in parallel
 *   Phase 4 — Route: orchestrator loop until session_complete
 *
 * The Mastra version and the manual version (src/manual/orchestration/) are
 * structurally identical — they differ only in which agent registry they
 * receive. Both produce the same `LearningSessionResult` shape so the API
 * layer can switch providers without changing any downstream code.
 *
 * NOTE: Mastra 0.24.9 Workflow graph API has known issues with AI SDK v6.
 * We implement the flow as a TypeScript class rather than a Mastra Workflow
 * graph until Mastra ships stable v6 support. All agents still use Mastra
 * implementations internally — only the workflow orchestration is manual.
 *
 * The loop uses MAX_ROUTING_STEPS as a circuit-breaker. In production the
 * loop is driven by real student events (not a timer), so infinite loops are
 * not a practical concern — this guard exists for test/demo scenarios only.
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

/** Safety limit on routing iterations for test/demo runs. */
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
  parsed: DocumentParserOutput;
  mindmap: MindmapTreeOutput;
  flashcards: FlashcardOutput;
  finalGraphState: StudentGraphState;
  routingLog: RoutingStep[];
  totalOrchestratorCalls: number;
}

// ── MastraLearningSession ─────────────────────────────────────────────────────

export class MastraLearningSession {
  constructor(private readonly agents: AgentRegistry) {}

  /**
   * Runs the full learning session pipeline from document upload to the
   * first `session_complete` routing decision.
   *
   * Returns all intermediate artifacts (parsed content, mindmap, flashcards)
   * alongside the final graph state and the full routing log.
   */
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

      // Apply confidence update from the orchestrator's assessment
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
        // Simulate session progression for non-interactive (test/demo) runs.
        // In production this loop is exited after each orchestrator call and
        // re-entered only when the next student event arrives.
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

/**
 * Maps an agent name to the event that logically follows its execution.
 * Used only in test/demo runs where real student interaction is absent.
 * In production, the next event comes from the actual student response.
 */
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
