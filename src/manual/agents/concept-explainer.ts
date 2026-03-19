/**
 * WHY: Vercel AI SDK fallback Concept Explainer Agent implementation.
 *
 * Implements TasurStreamingAgent using the Vercel AI SDK's streamText() for
 * the stream() method and generateObject() for execute(). This gives the
 * frontend real-time token streaming via SSE while the orchestrator still gets
 * a complete structured ExplainerOutput for routing decisions.
 * Uses getOrchestratorModel() (Gemini Pro in dev) — same as the Mastra path
 * because pedagogical quality requires a high-capability model.
 */

import { generateObject, streamText } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurStreamingAgent } from '@/interfaces/agents';
import type { ConceptExplainerInput } from '@/interfaces/registry';
import { explainerOutputSchema } from '@/lib/schemas/explainer-output';
import type { ExplainerOutput } from '@/lib/schemas/explainer-output';
import { loadPrompt } from '@/prompts/loader';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSystemPrompt(input: ConceptExplainerInput): string {
  const basePrompt = loadPrompt('concept-explainer', input.domain);
  return (
    `${basePrompt}\n\n` +
    `---\n\n` +
    `## Current Session Context\n\n` +
    `Concept being studied: ${input.conceptId}\n` +
    `Learning mode: ${input.learningMode}\n` +
    `Student context: ${input.studentContext}`
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

// ── Manual Concept Explainer Agent ───────────────────────────────────────────

export class ManualConceptExplainerAgent
  implements TasurStreamingAgent<ConceptExplainerInput, ExplainerOutput>
{
  async execute(input: ConceptExplainerInput): Promise<AgentResult<ExplainerOutput>> {
    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt(input);
    const messages = buildMessages(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG manual:concept-explainer:execute]\n[system]\n${systemPrompt}\n[user]\n${messages.at(-1)?.content}\n`);
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

  // Yields raw text chunks for the SSE endpoint. The frontend renders these
  // as a typing animation while the full structured response is being generated.
  async *stream(input: ConceptExplainerInput): AsyncIterable<string> {
    const systemPrompt = buildSystemPrompt(input);
    const messages = buildMessages(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG manual:concept-explainer:stream]\n[system]\n${systemPrompt}\n[user]\n${messages.at(-1)?.content}\n`);
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
