/**
 * WHY: Single entry point for the dual-path agent toggle.
 *
 * AGENT_PROVIDER is the one env var that controls whether the entire agent layer
 * is backed by Mastra, direct Vercel AI SDK calls, or the deterministic mock.
 * API routes call getAgentRegistry() and never import either implementation
 * directly — this file is the only place that knows all three exist. Adding a
 * fourth provider means adding one case here and nothing else.
 *
 * Default: 'mock' — runs fully offline without any LLM or Supabase credentials.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import { createManualRegistry } from '@/manual';
import { createMastraRegistry } from '@/mastra';
import { createMockRegistry } from '@/mock';

export function getAgentRegistry(): AgentRegistry {
  const provider = process.env.AGENT_PROVIDER || 'mock';

  switch (provider) {
    case 'mastra':
      return createMastraRegistry();
    case 'manual':
      return createManualRegistry();
    case 'mock':
      return createMockRegistry();
    default:
      throw new Error(
        `Unknown agent provider: "${provider}". Must be "mastra", "manual", or "mock".`,
      );
  }
}
