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
 * All six agents are instantiated fresh on every `createMockRegistry()` call
 * (stateless — no shared mutable state between registry instances).
 */

import type { AgentName } from '@/interfaces/types';
import type { AgentRegistry } from '@/interfaces/registry';

import { MockDocumentParserAgent } from './agents/document-parser';
import { MockFlashcardGeneratorAgent } from './agents/flashcard-generator';
import { MockMindmapGeneratorAgent } from './agents/mindmap-generator';
import { MockConceptExplainerAgent } from './agents/concept-explainer';
import { MockWebSearchAgent } from './agents/web-search';
import { MockOrchestratorAgent } from './agents/orchestrator';

/**
 * Returns a fully-wired AgentRegistry backed by deterministic mock agents.
 *
 * Implemented as an object-literal factory rather than a class so we can
 * return `AgentRegistry` directly. The `as unknown as AgentRegistry` cast on
 * the `get` return is intentional: TypeScript cannot statically verify that a
 * heterogeneous Map lookup satisfies `AgentMap[N]` (a conditional/mapped type
 * narrowed by the generic parameter), even though the runtime mapping is
 * correct. This is a known limitation when bridging heterogeneous maps to
 * generic interfaces — the cast is safe because the Map is fully keyed by
 * `AgentName` with matching agent types.
 */
export function createMockRegistry(): AgentRegistry {
  const agents = {
    'document-parser': new MockDocumentParserAgent(),
    'mindmap-generator': new MockMindmapGeneratorAgent(),
    'flashcard-generator': new MockFlashcardGeneratorAgent(),
    'concept-explainer': new MockConceptExplainerAgent(),
    'web-search': new MockWebSearchAgent(),
    'orchestrator': new MockOrchestratorAgent(),
  } as const;

  return {
    get<N extends AgentName>(name: N) {
      const agent = agents[name];
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
