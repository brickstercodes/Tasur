/**
 * WHY: Mastra-backed AgentRegistry factory.
 *
 * This is the primary agent implementation path. When AGENT_PROVIDER=mastra,
 * getAgentRegistry() delegates here. Real Mastra agents will be wired up in
 * later modules — for now the stub throws a helpful error that points to the
 * manual fallback, so development can continue without a full Mastra setup.
 */

import type { AgentRegistry } from '@/interfaces/registry';
import type { AgentName } from '@/interfaces/types';

export function createMastraRegistry(): AgentRegistry {
  return {
    // Return type is intentionally omitted — the throw makes it `never`,
    // which is assignable to AgentMap[N] for any N.
    get<N extends AgentName>(name: N) {
      throw new Error(
        `Mastra agent "${name}" is not yet configured. ` +
          `Set AGENT_PROVIDER=manual to use the manual fallback.`,
      );
    },
  };
}
