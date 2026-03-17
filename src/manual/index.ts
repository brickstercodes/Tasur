/**
 * WHY: Vercel AI SDK fallback AgentRegistry factory.
 *
 * When AGENT_PROVIDER=manual, all agent calls go through direct Vercel AI SDK
 * calls instead of Mastra. This path exists so the learning engine can run
 * without any Mastra infrastructure — useful during development, demos, or if
 * Mastra becomes unavailable. Real manual agents will be wired up in later modules.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { AgentName } from '@/interfaces/types';

export function createManualRegistry(): AgentRegistry {
  return {
    // Return type intentionally omitted — throw infers `never`, assignable to AgentMap[N].
    get<N extends AgentName>(name: N) {
      throw new Error(`Manual agent "${name}" is not yet configured.`);
    },
  };
}
