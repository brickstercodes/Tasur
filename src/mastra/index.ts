/**
 * WHY: Mastra-backed AgentRegistry factory.
 *
 * When AGENT_PROVIDER=mastra, getAgentRegistry() delegates here. Each agent
 * is instantiated once and reused across calls (agents hold no mutable state —
 * they rebuild per-request context inside execute/stream).
 *
 * Active pipeline agents (4 + orchestrator):
 *   mm-generator, web-search, concept-explainer, flashcard-generator, orchestrator
 *
 * Deprecated agents (retained for comparison testing):
 *   document-parser, mindmap-generator — adding a new agent means registering
 *   it in the map below and nowhere else.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { AgentName } from '@/interfaces/types';

import { MastraMmGeneratorAgent } from './agents/mm-generator';
import { MastraConceptExplainerAgent } from './agents/concept-explainer';
import { MastraDocumentParserAgent } from './agents/document-parser';
import { MastraFlashcardGeneratorAgent } from './agents/flashcard-generator';
import { MastraMindmapGeneratorAgent } from './agents/mindmap-generator';
import { MastraOrchestratorAgent } from './agents/orchestrator';
import { MastraWebSearchAgent } from './agents/web-search';

export function createMastraRegistry(): AgentRegistry {
  const agents = {
    // Active .mm-first pipeline agents:
    'mm-generator': new MastraMmGeneratorAgent(),
    'web-search': new MastraWebSearchAgent(),
    'concept-explainer': new MastraConceptExplainerAgent(),
    'flashcard-generator': new MastraFlashcardGeneratorAgent(),
    'orchestrator': new MastraOrchestratorAgent(),
    // Deprecated — retained for comparison testing:
    'document-parser': new MastraDocumentParserAgent(),
    'mindmap-generator': new MastraMindmapGeneratorAgent(),
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
