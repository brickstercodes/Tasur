/**
 * WHY: Vercel AI SDK fallback AgentRegistry factory.
 *
 * When AGENT_PROVIDER=manual, all agent calls go through direct Vercel AI SDK
 * calls instead of Mastra. Useful during development, for environments where
 * Mastra is unavailable, or when Mastra infra adds unwanted overhead for quick
 * LLM testing.
 *
 * Active pipeline agents (4 + orchestrator):
 *   mm-generator, web-search, concept-explainer, flashcard-generator, orchestrator
 *
 * Deprecated agents (retained for comparison testing):
 *   document-parser, mindmap-generator
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { AgentName } from '@/interfaces/types';

import { ManualMmGeneratorAgent } from './agents/mm-generator';
import { ManualConceptExplainerAgent } from './agents/concept-explainer';
import { ManualDocumentParserAgent } from './agents/document-parser';
import { ManualFlashcardGeneratorAgent } from './agents/flashcard-generator';
import { ManualMindmapGeneratorAgent } from './agents/mindmap-generator';
import { ManualOrchestratorAgent } from './agents/orchestrator';
import { ManualWebSearchAgent } from './agents/web-search';

export function createManualRegistry(): AgentRegistry {
  const agents = {
    // Active .mm-first pipeline agents:
    'mm-generator': new ManualMmGeneratorAgent(),
    'web-search': new ManualWebSearchAgent(),
    'concept-explainer': new ManualConceptExplainerAgent(),
    'flashcard-generator': new ManualFlashcardGeneratorAgent(),
    'orchestrator': new ManualOrchestratorAgent(),
    // Deprecated — retained for comparison testing:
    'document-parser': new ManualDocumentParserAgent(),
    'mindmap-generator': new ManualMindmapGeneratorAgent(),
  };

  return {
    get<N extends AgentName>(name: N) {
      const agent = agents[name as keyof typeof agents];
      if (!agent) {
        throw new Error(
          `Manual agent "${name}" is not registered. Available: ${Object.keys(agents).join(', ')}.`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return agent as any;
    },
  };
}
