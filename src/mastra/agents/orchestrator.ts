/**
 * WHY: Mastra-backed Orchestrator Agent — the central routing intelligence.
 *
 * The orchestrator never teaches content. It reads the student's graph state,
 * evaluates what just happened, and decides which specialist to invoke next.
 * It uses getOrchestratorModel() (Gemini Pro in dev, Claude Sonnet in prod)
 * because routing decisions require nuanced reasoning about the full student
 * state — not just fast structured generation.
 *
 * NOTE: Uses generateObject() directly (not Mastra Agent.generate()) due to
 * Mastra 0.24.9 compatibility issues with AI SDK v6 streaming path.
 */

import { generateObject } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { OrchestratorInput } from '@/interfaces/types';
import { StudentGraph } from '@/lib/graph/student-graph';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import {
  buildOrchestratorUserMessage,
} from '@/lib/orchestration/session-utils';
import { loadPrompt } from '@/prompts/loader';

export class MastraOrchestratorAgent
  implements TasurAgent<OrchestratorInput, OrchestratorOutputSchema>
{
  async execute(
    input: OrchestratorInput,
  ): Promise<AgentResult<OrchestratorOutputSchema>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('orchestrator', input.domain);

    // Rebuild the in-memory graph so we can run mode-aware queries
    const graph = StudentGraph.fromState(input.studentState);
    const progress = graph.getProgress();
    const confidenceThreshold = input.mode === 'fast' ? 0.5 : 0.7;
    const unblockedIds = graph.getUnblockedConcepts(confidenceThreshold);

    const userMessage = buildOrchestratorUserMessage(
      input.studentState,
      progress,
      unblockedIds,
      input.lastEvent,
      input.mode,
      input.domain,
    );

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(
        `\n[DEBUG mastra:orchestrator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`,
      );
    }

    const { object, usage } = await generateObject({
      model: getOrchestratorModel(),
      schema: orchestratorOutputSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    return {
      data: object,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      duration: Date.now() - startTime,
    };
  }
}
