/**
 * WHY: Mastra-backed Mindmap Generator Agent implementation.
 *
 * Transforms the flat concept list from DocumentParserOutput into a
 * hierarchical tree that the frontend renders as a collapsible mindmap.
 *
 * NOTE: Mastra 0.24.9 Agent.generate() is broken with AI SDK v6 (routes through
 * streaming). Using generateObject() directly until Mastra ships v6 support.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MindmapInput } from '@/interfaces/registry';
import { mindmapTreeOutputSchema } from '@/lib/schemas/mindmap-tree-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import { loadPrompt } from '@/prompts/loader';

export class MastraMindmapGeneratorAgent
  implements TasurAgent<MindmapInput, MindmapTreeOutput>
{
  async execute(input: MindmapInput): Promise<AgentResult<MindmapTreeOutput>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('mindmap-generator', input.domain ?? null);

    const conceptsSummary = input.parsedContent.concepts
      .map(
        (c) =>
          `- id: ${c.id}, name: ${c.name}, complexity: ${c.complexity}, prerequisites: [${c.prerequisites.join(', ')}]`,
      )
      .join('\n');

    const relationshipsSummary = input.parsedContent.concept_relationships
      .map((r) => `- ${r.from} → ${r.to} (${r.type})`)
      .join('\n');

    const { object, usage } = await generateObject({
      model: getSpecialistModel(),
      schema: mindmapTreeOutputSchema,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content:
            `Generate a mindmap tree for the following parsed content.\n\n` +
            `Document title: ${input.parsedContent.title}\n` +
            `Subject: ${input.parsedContent.subject_detection.primary}\n` +
            `Mode: steady\n\nConcepts:\n${conceptsSummary}\n\nRelationships:\n${relationshipsSummary}`,
        },
      ],
    });

    return {
      data: object,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      duration: Date.now() - startTime,
    };
  }
}
