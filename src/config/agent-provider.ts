import type { AgentRegistry } from '@/interfaces/registry';
import { createManualRegistry } from '@/manual';

export function getAgentRegistry(): AgentRegistry {
  return createManualRegistry();
}
