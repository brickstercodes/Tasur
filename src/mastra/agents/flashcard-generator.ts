/**
 * WHY: Mastra-backed Flashcard Generator Agent implementation.
 *
 * Generates spaced-repetition flashcards from the student's parsed concept
 * list. Card type distribution is mode-aware.
 *
 * NOTE: Mastra 0.24.9 Agent.generate() is broken with AI SDK v6 (routes through
 * streaming). Using generateObject() directly until Mastra ships v6 support.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { FlashcardGeneratorInput } from '@/interfaces/registry';
import { flashcardOutputSchema } from '@/lib/schemas/flashcard-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import { loadPrompt } from '@/prompts/loader';

export class MastraFlashcardGeneratorAgent
  implements TasurAgent<FlashcardGeneratorInput, FlashcardOutput>
{
  async execute(input: FlashcardGeneratorInput): Promise<AgentResult<FlashcardOutput>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('flashcard-generator', input.domain);

    const conceptsSummary = input.parsedContent.concepts
      .map(
        (c) =>
          `- id: ${c.id}, name: ${c.name}, complexity: ${c.complexity}\n  content: ${c.raw_content}`,
      )
      .join('\n');

    const userMessage =
      `Generate flashcards for the following concepts.\n\n` +
      `Mode: ${input.learningMode}\nDomain: ${input.domain}\n\nConcepts:\n${conceptsSummary}`;

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG mastra:flashcard-generator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`);
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
