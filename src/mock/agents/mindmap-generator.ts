/**
 * WHY: Mock Mindmap Generator Agent for local development and tests.
 *
 * Returns the pre-written DBMS hierarchical mindmap fixture. Validated
 * against the real Zod schema at call time so schema drift is caught early.
 */

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MindmapInput } from '@/interfaces/registry';
import { mindmapTreeOutputSchema } from '@/lib/schemas/mindmap-tree-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';

import fixture from '../fixtures/dbms-normalization.json';

export class MockMindmapGeneratorAgent
  implements TasurAgent<MindmapInput, MindmapTreeOutput>
{
  async execute(
    _input: MindmapInput,
  ): Promise<AgentResult<MindmapTreeOutput>> {
    const start = Date.now();

    const output = mindmapTreeOutputSchema.parse(fixture.mindmap_tree_output);

    return {
      data: output,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }
}
