/**
 * WHY: Vercel AI SDK fallback Flashcard Generator Agent implementation.
 *
 * Uses generateObject() with the FlashcardOutput schema. Mode-aware card type
 * distribution is communicated via the user prompt so the LLM adjusts the
 * recall / application / explain_simply / compare_contrast ratio accordingly.
 * Shares schema and prompt with the Mastra path so generated cards are
 * structurally identical regardless of which AGENT_PROVIDER is active.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { FlashcardGeneratorInput } from '@/interfaces/registry';
import { flashcardOutputSchema } from '@/lib/schemas/flashcard-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import { loadPrompt } from '@/prompts/loader';

export class ManualFlashcardGeneratorAgent
  implements TasurAgent<FlashcardGeneratorInput, FlashcardOutput>
{
  async execute(input: FlashcardGeneratorInput): Promise<AgentResult<FlashcardOutput>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('flashcard-generator', input.domain);

    const conceptsSummary = input.parsedContent.concepts
      .map(
        (concept) =>
          `- id: ${concept.id}, name: ${concept.name}, complexity: ${concept.complexity}\n  content: ${concept.raw_content}`,
      )
      .join('\n');

    const userMessage =
      `Generate flashcards for the following concepts.\n\n` +
      `Mode: ${input.learningMode}\nDomain: ${input.domain}\n\nConcepts:\n${conceptsSummary}`;

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG manual:flashcard-generator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`);
    }

    const { object, usage } = await generateObject({
      model: getSpecialistModel(),
      schema: flashcardOutputSchema,
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
