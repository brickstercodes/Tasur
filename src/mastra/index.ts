/**
 * WHY: Mastra-backed AgentRegistry factory.
 *
 * When AGENT_PROVIDER=mastra, getAgentRegistry() delegates here. Each agent
 * is instantiated once and reused across calls (agents hold no mutable state —
 * they rebuild per-request context inside execute/stream). Adding a new agent
 * means registering it in the map below and nowhere else.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { AgentName } from '@/interfaces/types';

import { MastraConceptExplainerAgent } from './agents/concept-explainer';
import { MastraDocumentParserAgent } from './agents/document-parser';
import { MastraFlashcardGeneratorAgent } from './agents/flashcard-generator';
import { MastraMindmapGeneratorAgent } from './agents/mindmap-generator';
import { MastraOrchestratorAgent } from './agents/orchestrator';
import { MastraWebSearchAgent } from './agents/web-search';

export function createMastraRegistry(): AgentRegistry {
  const agents = {
    'document-parser': new MastraDocumentParserAgent(),
    'web-search': new MastraWebSearchAgent(),
    'mindmap-generator': new MastraMindmapGeneratorAgent(),
    'concept-explainer': new MastraConceptExplainerAgent(),
    'flashcard-generator': new MastraFlashcardGeneratorAgent(),
    'orchestrator': new MastraOrchestratorAgent(),
  };

  return {
    get<N extends AgentName>(name: N) {
      const agent = agents[name as keyof typeof agents];
      if (!agent) {
        throw new Error(
          `Mastra agent "${name}" is not registered. Available: ${Object.keys(agents).join(', ')}.`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return agent as any;
    },
  };
}
