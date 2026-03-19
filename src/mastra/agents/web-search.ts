/**
 * WHY: Mastra-backed Web Search Augmentor Agent implementation.
 *
 * For each gap detected by the Document Parser, fetches web content via the
 * Tavily Search API and structures the results into WebSearchOutput.
 *
 * NOTE: Mastra 0.24.9 Agent.generate() is broken with AI SDK v6 (routes through
 * streaming). Using generateObject() directly until Mastra ships v6 support.
 * Falls back to empty augmentations when TAVILY_API_KEY is not configured.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { WebSearchInput } from '@/interfaces/registry';
import { webSearchOutputSchema } from '@/lib/schemas/web-search-output';
import type { WebSearchOutput } from '@/lib/schemas/web-search-output';

// ── Tavily search helper ──────────────────────────────────────────────────────

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const RESULTS_PER_GAP = 3;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: RESULTS_PER_GAP,
      search_depth: 'basic',
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { results?: TavilyResult[] };
  return data.results ?? [];
}

// ── Mastra Web Search Agent ───────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS = `You are an academic research assistant. You are given knowledge gaps and web search results for each gap. Compile the results into a structured JSON response — raw JSON only, no markdown fences.`;

export class MastraWebSearchAgent implements TasurAgent<WebSearchInput, WebSearchOutput> {
  async execute(input: WebSearchInput): Promise<AgentResult<WebSearchOutput>> {
    const startTime = Date.now();

    if (input.gaps.length === 0) {
      return {
        data: { augmentations: [] },
        usage: { inputTokens: 0, outputTokens: 0 },
        duration: Date.now() - startTime,
      };
    }

    const searchData = await Promise.all(
      input.gaps.map(async (gap) => ({
        gap,
        results: await searchTavily(`${input.domain} ${gap}`),
      })),
    );

    const contextLines = searchData.map(({ gap, results }) => {
      const resultText =
        results.length > 0
          ? results
              .map((r) => `  - Title: ${r.title}\n    URL: ${r.url}\n    Content: ${r.content}`)
              .join('\n')
          : '  (no results found)';
      return `Gap: "${gap}"\nResults:\n${resultText}`;
    });

    const { object, usage } = await generateObject({
      model: getSpecialistModel(),
      schema: webSearchOutputSchema,
      system: SYSTEM_INSTRUCTIONS,
      messages: [
        {
          role: 'user',
          content: `Domain: ${input.domain}\n\n${contextLines.join('\n\n')}\n\nStructure these results into the required JSON schema.`,
        },
      ],
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
