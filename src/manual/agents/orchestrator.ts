/**
 * WHY: Vercel AI SDK fallback Orchestrator Agent.
 *
 * Identical routing logic and prompt to the Mastra path — the only difference
 * is the class name and the absence of Mastra imports. When AGENT_PROVIDER=manual
 * this agent makes the same generateObject() call and returns the same validated
 * OrchestratorOutputSchema, guaranteeing that switching providers does not
 * change routing behaviour.
 *
 * Uses getOrchestratorModel() (high-capability tier) because routing decisions
 * require the same reasoning quality regardless of which infrastructure path
 * is active.
 */

import { generateObject } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { OrchestratorInput } from '@/interfaces/types';
import { StudentGraph } from '@/lib/graph/student-graph';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import { buildOrchestratorUserMessage } from '@/lib/orchestration/session-utils';
import { loadPrompt } from '@/prompts/loader';

export class ManualOrchestratorAgent
  implements TasurAgent<OrchestratorInput, OrchestratorOutputSchema>
{
  async execute(
    input: OrchestratorInput,
  ): Promise<AgentResult<OrchestratorOutputSchema>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('orchestrator', input.domain);

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
      undefined,
      input.currentConceptId,
    );

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(
        `\n[DEBUG manual:orchestrator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`,
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
