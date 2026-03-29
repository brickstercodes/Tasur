/**
 * WHY: Integration tests for the Concept Explainer Agent — streaming + structured output.
 *
 * Validates that both Mastra and manual paths:
 * 1. Produce ExplainerOutput that passes Zod schema validation via execute().
 * 2. Yield at least one text chunk via stream() — confirming SSE delivery works.
 * Tests are skipped when GOOGLE_APPLICATION_CREDENTIALS is absent (CI without credentials).
 */

import { describe, expect, it } from 'vitest';

import { ManualConceptExplainerAgent } from '@/manual/agents/concept-explainer';
import { MastraConceptExplainerAgent } from '@/mastra/agents/concept-explainer';
import type { ConceptExplainerInput } from '@/interfaces/registry';
import { explainerOutputSchema } from '@/lib/schemas/explainer-output';

const TEST_INPUT: ConceptExplainerInput = {
  conceptId: 'normalization_3NF',
  domain: 'dbms',
  learningMode: 'fast',
  studentContext:
    'Student has mastered 1NF and 2NF (confidence > 0.8). Currently studying 3NF for the first time.',
  conversationHistory: [],
  currentMessage: 'Can you explain what Third Normal Form (3NF) is?',
};

const hasApiKey = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

describe.skipIf(!hasApiKey)('Concept Explainer Agent — Mastra path', () => {
  it('execute() produces valid ExplainerOutput', async () => {
    const agent = new MastraConceptExplainerAgent();
    const result = await agent.execute(TEST_INPUT);

    expect(result.duration).toBeGreaterThan(0);

    const validated = explainerOutputSchema.safeParse(result.data);
    expect(validated.success).toBe(true);

    if (validated.success) {
      expect(validated.data.content).toBeTruthy();
      expect(['explanation', 'analogy', 'example', 'micro_assessment', 'clarification']).toContain(
        validated.data.message_type,
      );
      expect(typeof validated.data.conversation_complete).toBe('boolean');
    }
  }, 60_000);

  it('stream() yields at least one text chunk', async () => {
    const agent = new MastraConceptExplainerAgent();
    const chunks: string[] = [];

    for await (const chunk of agent.stream(TEST_INPUT)) {
      chunks.push(chunk);
      // Stop after first chunk — we just need to confirm streaming works.
      if (chunks.length >= 1) break;
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toBeTruthy();
  }, 60_000);
});

describe.skipIf(!hasApiKey)('Concept Explainer Agent — manual path', () => {
  it('execute() produces valid ExplainerOutput', async () => {
    const agent = new ManualConceptExplainerAgent();
    const result = await agent.execute(TEST_INPUT);

    expect(result.duration).toBeGreaterThan(0);

    const validated = explainerOutputSchema.safeParse(result.data);
    expect(validated.success).toBe(true);

    if (validated.success) {
      expect(validated.data.content).toBeTruthy();
    }
  }, 60_000);

  it('stream() yields at least one text chunk', async () => {
    const agent = new ManualConceptExplainerAgent();
    const chunks: string[] = [];

    for await (const chunk of agent.stream(TEST_INPUT)) {
      chunks.push(chunk);
      if (chunks.length >= 1) break;
    }

    expect(chunks.length).toBeGreaterThan(0);
  }, 60_000);
});
