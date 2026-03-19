/**
 * WHY: Mock Concept Explainer Agent for local development and tests.
 *
 * Simulates the three-turn explanation sequence from the fixture for
 * normalization_2NF (or a generic one-turn explanation for other concepts).
 *
 * Streaming simulation: `stream()` yields words with small delays so the
 * frontend SSE integration can be tested without a live LLM. The delay is
 * intentionally short (5ms between chunks) to keep tests fast.
 *
 * `execute()` returns the full turn immediately, which is what integration
 * tests and the orchestrator use.
 *
 * Turn selection is based on `conversationHistory.length`:
 *   0 messages → turn 1 (explanation)
 *   1 message  → turn 2 (micro_assessment)
 *   2+ messages → turn 3 (complete + handoff)
 */

import type { AgentResult, TasurStreamingAgent } from '@/interfaces/agents';
import type { ConceptExplainerInput } from '@/interfaces/registry';
import { explainerOutputSchema } from '@/lib/schemas/explainer-output';
import type { ExplainerOutput } from '@/lib/schemas/explainer-output';

import fixture from '../fixtures/dbms-normalization.json';

const STREAM_CHUNK_DELAY_MS = 5;

export class MockConceptExplainerAgent
  implements TasurStreamingAgent<ConceptExplainerInput, ExplainerOutput>
{
  // ── execute ──────────────────────────────────────────────────────────────

  async execute(
    input: ConceptExplainerInput,
  ): Promise<AgentResult<ExplainerOutput>> {
    const start = Date.now();
    const output = this.buildOutput(input);

    return {
      data: output,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }

  // ── stream ────────────────────────────────────────────────────────────────

  async *stream(input: ConceptExplainerInput): AsyncIterable<string> {
    const output = this.buildOutput(input);
    const words = output.content.split(' ');

    for (const word of words) {
      yield word + ' ';
      await delay(STREAM_CHUNK_DELAY_MS);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private buildOutput(input: ConceptExplainerInput): ExplainerOutput {
    const turnIndex = input.conversationHistory.length;

    // Use the fixture turns for normalization_2NF; generic for others
    if (input.conceptId === 'normalization_2NF') {
      const turns = fixture.sample_explanations.normalization_2NF;
      const turnKeys = ['turn_1', 'turn_2', 'turn_3'] as const;
      const key = turnKeys[Math.min(turnIndex, 2)];
      const raw = turns[key];
      return explainerOutputSchema.parse(raw);
    }

    // Generic fallback for any other concept
    const isLast = turnIndex >= 2;
    return explainerOutputSchema.parse({
      message_type: 'explanation',
      content: `Mock explanation for concept "${input.conceptId}" (turn ${turnIndex + 1}). In ${input.learningMode} mode. This would contain a real LLM-generated explanation in production.`,
      visual_suggestion: null,
      micro_assessment: null,
      conversation_complete: isLast,
      handoff_signal: isLast ? 'ready_for_flashcards' : null,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
