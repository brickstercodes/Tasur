/**
 * WHY: Mock Flashcard Generator Agent for local development and tests.
 *
 * Returns the 10 pre-written DBMS flashcards from the fixture. Validated
 * against the real Zod schema so the card shape stays in sync with the
 * flashcard-generator real agent's output contract.
 */

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { FlashcardGeneratorInput } from '@/interfaces/registry';
import { flashcardOutputSchema } from '@/lib/schemas/flashcard-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';

import fixture from '../fixtures/dbms-normalization.json';

export class MockFlashcardGeneratorAgent
  implements TasurAgent<FlashcardGeneratorInput, FlashcardOutput>
{
  async execute(
    _input: FlashcardGeneratorInput,
  ): Promise<AgentResult<FlashcardOutput>> {
    const start = Date.now();

    const output = flashcardOutputSchema.parse(fixture.flashcard_output);

    return {
      data: output,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }
}
