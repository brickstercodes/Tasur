/**
 * WHY: Mock agent registry factory for local development and tests.
 *
 * `createMockRegistry()` returns a fully-wired AgentRegistry where every
 * agent is backed by a deterministic mock. No LLM calls, no Supabase writes,
 * no external HTTP — the entire Tasur pipeline can run offline.
 *
 * Set AGENT_PROVIDER=mock in .env.local to activate this registry.
 * The agent-provider.ts config routes to this factory automatically.
 *
 * Active pipeline agents (4 + orchestrator):
 *   mm-generator, web-search, concept-explainer, flashcard-generator, orchestrator
 *
 * Deprecated agents (retained for comparison testing):
 *   document-parser, mindmap-generator — still registered so legacy test code
 *   that calls registry.get('document-parser') doesn't throw.
 */

import type { AgentName } from '@/interfaces/types';
import type { AgentRegistry } from '@/interfaces/registry';

import { MockMmGeneratorAgent } from './agents/mm-generator';
import { MockDocumentParserAgent } from './agents/document-parser';
import { MockFlashcardGeneratorAgent } from './agents/flashcard-generator';
import { MockMindmapGeneratorAgent } from './agents/mindmap-generator';
import { MockConceptExplainerAgent } from './agents/concept-explainer';
import { MockWebSearchAgent } from './agents/web-search';
import { MockOrchestratorAgent } from './agents/orchestrator';

export function createMockRegistry(): AgentRegistry {
  const agents = {
    // Active .mm-first pipeline agents:
    'mm-generator': new MockMmGeneratorAgent(),
    'web-search': new MockWebSearchAgent(),
    'concept-explainer': new MockConceptExplainerAgent(),
    'flashcard-generator': new MockFlashcardGeneratorAgent(),
    'orchestrator': new MockOrchestratorAgent(),
    // Deprecated — retained for comparison testing:
    'document-parser': new MockDocumentParserAgent(),
    'mindmap-generator': new MockMindmapGeneratorAgent(),
  } as const;

  return {
    get<N extends AgentName>(name: N) {
      const agent = agents[name as keyof typeof agents];
      if (!agent) {
        const allKeys = Object.keys(agents).join(', ');
        throw new Error(
          `Mock agent "${name}" is not registered. Available agents: ${allKeys}`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return agent as any;
    },
  };
}
