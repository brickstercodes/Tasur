/**
 * WHY: Mock Orchestrator Agent for local development and tests.
 *
 * The real orchestrator calls an LLM to make routing decisions. The mock
 * implements the same routing logic deterministically using StudentGraph
 * methods — no LLM, no randomness, fully predictable for tests.
 *
 * Routing rules (in priority order):
 *
 *  1. session_start event → route to document-parser (initial parse)
 *  2. document_parsed event → route to mindmap-generator
 *  3. mindmap_generated event → route to web-search (if gaps present)
 *  4. web_search_complete event → route to concept-explainer (first unblocked concept)
 *  5. micro_assessment_complete event:
 *     a. Extract score from params and update confidence on the current concept
 *     b. If explanation count ≥ 3 → route to flashcard-generator
 *     c. Else → route to concept-explainer (next unblocked concept)
 *  6. flashcards_generated / all mastered → session_complete
 *
 * `understanding_update` is populated whenever a micro_assessment score is
 * available in `lastEvent` params (passed as `assessment_score` in the
 * orchestrator input params).
 */

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { OrchestratorInput } from '@/interfaces/types';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import { StudentGraph } from '@/lib/graph/student-graph';

export class MockOrchestratorAgent
  implements TasurAgent<OrchestratorInput, OrchestratorOutputSchema>
{
  async execute(
    input: OrchestratorInput,
  ): Promise<AgentResult<OrchestratorOutputSchema>> {
    const start = Date.now();

    const graph = StudentGraph.fromState(input.studentState);
    const output = this.route(input, graph);

    return {
      data: orchestratorOutputSchema.parse(output),
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }

  // ── Routing logic ─────────────────────────────────────────────────────────

  private route(
    input: OrchestratorInput,
    graph: StudentGraph,
  ): OrchestratorOutputSchema {
    const { lastEvent, mode } = input;

    // ── 1. Session start ────────────────────────────────────────────────────
    if (lastEvent === 'session_start') {
      return {
        understanding_update: null,
        next_action: {
          agent: 'document-parser',
          params: { domain: input.domain },
        },
        reasoning:
          'Session just started — first step is to parse the uploaded document.',
      };
    }

    // ── 2. Document parsed → mindmap ────────────────────────────────────────
    if (lastEvent === 'document_parsed') {
      return {
        understanding_update: null,
        next_action: {
          agent: 'mindmap-generator',
          params: { domain: input.domain },
        },
        reasoning:
          'Document parsed successfully — generating visual mindmap to orient the student.',
      };
    }

    // ── 3. Mindmap generated → web search ───────────────────────────────────
    if (lastEvent === 'mindmap_generated') {
      return {
        understanding_update: null,
        next_action: {
          agent: 'web-search',
          params: { domain: input.domain },
        },
        reasoning:
          'Mindmap ready — augmenting with web search to fill detected document gaps.',
      };
    }

    // ── 4. Web search complete → first explanation ──────────────────────────
    if (lastEvent === 'web_search_complete') {
      const nextConcept = graph.getNextRecommended(mode);

      if (!nextConcept) {
        return this.sessionComplete(graph, 'All concepts already mastered after web search.');
      }

      return {
        understanding_update: null,
        next_action: {
          agent: 'concept-explainer',
          params: { conceptId: nextConcept.id, domain: input.domain },
        },
        reasoning: `Web search complete — starting concept explanation with "${nextConcept.name}" (${mode} mode, highest priority unblocked concept).`,
      };
    }

    // ── 5. Micro-assessment complete → update confidence + route ────────────
    if (lastEvent === 'micro_assessment_complete') {
      const conceptId = (input.studentState as unknown as Record<string, unknown>)
        ?.current_concept_id as string | undefined;
      const rawScore = (input.studentState as unknown as Record<string, unknown>)
        ?.assessment_score as number | undefined;

      const score = typeof rawScore === 'number' ? rawScore : 0.6;
      const currentConceptId = conceptId ?? graph.getNextRecommended(mode)?.id;

      let understanding_update: OrchestratorOutputSchema['understanding_update'] =
        null;

      if (currentConceptId) {
        const evidence = score >= 0.7
          ? 'Student answered the micro-assessment correctly.'
          : 'Student struggled with the micro-assessment — confidence partially updated.';

        understanding_update = {
          concept_id: currentConceptId,
          new_confidence: score,
          evidence,
        };
      }

      // Count how many concepts have been explained (exposure count > 0)
      const explainedCount = Array.from(graph.nodes.values()).filter(
        (n) => n.studentState.exposureCount > 0,
      ).length;

      // After 3 explanations, shift to flashcard practice
      if (explainedCount >= 3) {
        return {
          understanding_update,
          next_action: {
            agent: 'flashcard-generator',
            params: { domain: input.domain },
          },
          reasoning:
            'Student has completed 3 concept explanations — switching to flashcard retrieval practice.',
        };
      }

      // Otherwise continue with next unblocked concept
      const next = graph.getNextRecommended(mode);
      if (!next) {
        return this.sessionComplete(graph, 'All concepts mastered — session complete.', understanding_update);
      }

      return {
        understanding_update,
        next_action: {
          agent: 'concept-explainer',
          params: { conceptId: next.id, domain: input.domain },
        },
        reasoning: `Assessment done — moving to next unblocked concept "${next.name}".`,
      };
    }

    // ── 6. Flashcards generated → session complete ──────────────────────────
    if (
      lastEvent === 'flashcards_generated' ||
      lastEvent === 'session_complete'
    ) {
      return this.sessionComplete(graph, 'Flashcard practice round complete — session finished.');
    }

    // ── Default: pick the next unblocked concept ────────────────────────────
    const fallback = graph.getNextRecommended(mode);
    if (!fallback) {
      return this.sessionComplete(graph, 'No more unblocked concepts remaining.');
    }

    return {
      understanding_update: null,
      next_action: {
        agent: 'concept-explainer',
        params: { conceptId: fallback.id, domain: input.domain },
      },
      reasoning: `Default routing: next unblocked concept is "${fallback.name}".`,
    };
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private sessionComplete(
    _graph: StudentGraph,
    reason: string,
    understanding_update: OrchestratorOutputSchema['understanding_update'] = null,
  ): OrchestratorOutputSchema {
    return {
      understanding_update,
      next_action: { agent: 'session_complete', params: {} },
      reasoning: reason,
    };
  }
}
