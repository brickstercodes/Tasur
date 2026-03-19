/**
 * WHY: Mastra-backed Concept Explainer Agent implementation.
 *
 * The Phase 2 study-partner chat. Implements TasurStreamingAgent: stream() gives
 * the frontend real-time typing, execute() gives the orchestrator a complete
 * structured turn. Uses getOrchestratorModel() because good Socratic pedagogy
 * requires the high-capability model.
 *
 * NOTE: Mastra 0.24.9 Agent.generate() and Agent.stream() are both broken with
 * AI SDK v6 models. Both generateObject() and streamText() from the AI SDK are
 * used directly until Mastra ships v6 support.
 */

import { generateObject, streamText } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurStreamingAgent } from '@/interfaces/agents';
import type { ConceptExplainerInput } from '@/interfaces/registry';
import { explainerOutputSchema } from '@/lib/schemas/explainer-output';
import type { ExplainerOutput } from '@/lib/schemas/explainer-output';
import { loadPrompt } from '@/prompts/loader';

function buildSystemPrompt(input: ConceptExplainerInput): string {
  const base = loadPrompt('concept-explainer', input.domain);
  return (
    `${base}\n\n---\n\n## Current Session Context\n\n` +
    `Concept being studied: ${input.conceptId}\nLearning mode: ${input.learningMode}\nStudent context: ${input.studentContext}`
  );
}

function buildMessages(
  input: ConceptExplainerInput,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return [
    ...input.conversationHistory,
    { role: 'user', content: input.currentMessage },
  ];
}

export class MastraConceptExplainerAgent
  implements TasurStreamingAgent<ConceptExplainerInput, ExplainerOutput>
{
  async execute(input: ConceptExplainerInput): Promise<AgentResult<ExplainerOutput>> {
    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt(input);
    const messages = buildMessages(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG mastra:concept-explainer:execute]\n[system]\n${systemPrompt}\n[user]\n${messages.at(-1)?.content}\n`);
    }

    const { object, usage } = await generateObject({
      model: getOrchestratorModel(),
      schema: explainerOutputSchema,
      system: systemPrompt,
      messages,
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

  async *stream(input: ConceptExplainerInput): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(input);
    const messages = buildMessages(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG mastra:concept-explainer:stream]\n[system]\n${systemPrompt}\n[user]\n${messages.at(-1)?.content}\n`);
    }

    const result = streamText({
      model: getOrchestratorModel(),
      system: systemPrompt,
      messages,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
