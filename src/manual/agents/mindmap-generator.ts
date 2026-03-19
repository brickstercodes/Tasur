/**
 * WHY: Vercel AI SDK fallback Mindmap Generator Agent implementation.
 *
 * Uses generateObject() with the MindmapTreeOutput Zod schema to produce a
 * structured hierarchical tree from the Document Parser's concept list.
 * The depth and detail are mode-aware — the mode is passed in the user prompt
 * so the LLM adjusts the tree accordingly. Shares the same prompt and schema
 * as the Mastra path so both produce structurally identical trees.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MindmapInput } from '@/interfaces/registry';
import { mindmapTreeOutputSchema } from '@/lib/schemas/mindmap-tree-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import { loadPrompt } from '@/prompts/loader';

export class ManualMindmapGeneratorAgent
  implements TasurAgent<MindmapInput, MindmapTreeOutput>
{
  async execute(input: MindmapInput): Promise<AgentResult<MindmapTreeOutput>> {
    const startTime = Date.now();

    const systemPrompt = loadPrompt('mindmap-generator', input.domain ?? null);

    const conceptsSummary = input.parsedContent.concepts
      .map(
        (concept) =>
          `- id: ${concept.id}, name: ${concept.name}, complexity: ${concept.complexity}, prerequisites: [${concept.prerequisites.join(', ')}]`,
      )
      .join('\n');

    const relationshipsSummary = input.parsedContent.concept_relationships
      .map((rel) => `- ${rel.from} → ${rel.to} (${rel.type})`)
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
            `Mode: steady\n\n` +
            `Concepts:\n${conceptsSummary}\n\n` +
            `Relationships:\n${relationshipsSummary}`,
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
