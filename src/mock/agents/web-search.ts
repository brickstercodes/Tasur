/**
 * WHY: Mock Web Search Augmentor Agent for local development and tests.
 *
 * Returns a minimal but realistic augmentation payload for the two DBMS gaps
 * detected in the fixture (4NF / multivalued dependencies, 5NF / join
 * dependencies). Output type is `unknown` in the registry since the real
 * web-search agent output schema isn't finalised yet — mock returns a plain
 * object that the orchestrator can pass through without validation.
 */

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { WebSearchInput } from '@/interfaces/registry';

interface WebSearchResult {
  gap: string;
  summary: string;
  source_url: string;
  relevance_score: number;
}

interface WebSearchOutput {
  results: WebSearchResult[];
  augmented_concepts: Array<{
    id: string;
    name: string;
    summary: string;
  }>;
}

export class MockWebSearchAgent
  implements TasurAgent<WebSearchInput, unknown>
{
  async execute(input: WebSearchInput): Promise<AgentResult<unknown>> {
    const start = Date.now();

    const results: WebSearchResult[] = input.gaps.map((gap, i) => ({
      gap,
      summary: `Mock augmentation for gap ${i + 1}: "${gap}". In a real session this would contain retrieved web content.`,
      source_url: `https://example.com/dbms/augmentation-${i + 1}`,
      relevance_score: 0.85 - i * 0.05,
    }));

    const output: WebSearchOutput = {
      results,
      augmented_concepts: [
        {
          id: 'multivalued_dep',
          name: 'Multivalued Dependency',
          summary:
            'A multivalued dependency X →→ Y means that the set of Y values associated with an X value is independent of other attributes. It is the basis for Fourth Normal Form (4NF).',
        },
        {
          id: 'join_dep',
          name: 'Join Dependency',
          summary:
            'A join dependency *(R1, R2, ..., Rn) holds on relation R if R equals the natural join of its projections onto R1, R2, ..., Rn. It is the basis for Fifth Normal Form (5NF/PJNF).',
        },
      ],
    };

    return {
      data: output,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }
}
