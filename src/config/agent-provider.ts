/**
 * WHY: Single entry point for the dual-path agent toggle.
 *
 * AGENT_PROVIDER is the one env var that controls whether the entire agent layer
 * is backed by Mastra or direct Vercel AI SDK calls. API routes call
 * getAgentRegistry() and never import either implementation directly — this file
 * is the only place that knows both exist. Adding a third provider means adding
 * one case here and nothing else.
 *
 * Default: 'manual' — uses the Vercel AI SDK path, requires LLM API keys.
 * The mock system has been retired; all testing uses real API calls.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import { createManualRegistry } from '@/manual';
import { createMastraRegistry } from '@/mastra';

export function getAgentRegistry(): AgentRegistry {
  const provider = process.env.AGENT_PROVIDER || 'manual';

  switch (provider) {
    case 'mastra':
      return createMastraRegistry();
    case 'manual':
      return createManualRegistry();
    default:
      throw new Error(
        `Unknown agent provider: "${provider}". Must be "mastra" or "manual".`,
      );
  }
}
