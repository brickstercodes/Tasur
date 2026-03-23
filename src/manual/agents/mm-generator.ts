/**
 * WHY: Vercel AI SDK fallback .mm Generator Agent implementation.
 *
 * Structurally identical to the Mastra version but uses generateText() from
 * the Vercel AI SDK directly (which is also what the Mastra version does —
 * the distinction here is which registry instantiates this class).
 *
 * See src/mastra/agents/mm-generator.ts for full design rationale.
 */

import { generateText } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MmGeneratorInput } from '@/interfaces/registry';
import { validateMmOutput } from '@/lib/schemas/mm-generator-output';
import { loadPrompt } from '@/prompts/loader';

const MM_GENERATOR_TEMPERATURE = 0.1;

export class ManualMmGeneratorAgent implements TasurAgent<MmGeneratorInput, string> {
  async execute(input: MmGeneratorInput): Promise<AgentResult<string>> {
    const startTime = Date.now();
    const systemPrompt = loadPrompt('mm-generator', input.subjectHint ?? null);
    const userMessage = buildUserMessage(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(
        `\n[DEBUG manual:mm-generator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`,
      );
    }

    const { text, usage } = await generateText({
      model: getOrchestratorModel(),
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      temperature: MM_GENERATOR_TEMPERATURE,
    });

    const mmXml = extractXmlFromResponse(text);
    const validationResult = validateMmOutput(mmXml);

    if (!validationResult.valid) {
      const retryMessage = buildRetryUserMessage(input, mmXml, validationResult.errors);
      const retryResult = await generateText({
        model: getOrchestratorModel(),
        system: systemPrompt,
        messages: [{ role: 'user', content: retryMessage }],
        temperature: 0,
      });

      const retriedXml = extractXmlFromResponse(retryResult.text);
      const retryValidation = validateMmOutput(retriedXml);

      if (!retryValidation.valid) {
        throw new Error(
          `.mm Generator failed validation after retry. Errors:\n${retryValidation.errors.join('\n')}`,
        );
      }

      return {
        data: retriedXml,
        usage: {
          inputTokens: (usage.inputTokens ?? 0) + (retryResult.usage.inputTokens ?? 0),
          outputTokens: (usage.outputTokens ?? 0) + (retryResult.usage.outputTokens ?? 0),
        },
        duration: Date.now() - startTime,
      };
    }

    return {
      data: mmXml,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
      duration: Date.now() - startTime,
    };
  }
}

function buildUserMessage(input: MmGeneratorInput): string {
  const lines = [
    `Generate a comprehensive Freeplane .mm mindmap for the following study material.`,
  ];
  if (input.subjectHint) lines.push(`Subject hint: ${input.subjectHint}`);
  if (input.fileType) lines.push(`Source file type: ${input.fileType}`);
  lines.push('', 'Source material:', input.rawText);
  return lines.join('\n');
}

function buildRetryUserMessage(
  input: MmGeneratorInput,
  previousOutput: string,
  errors: string[],
): string {
  return [
    'Your previous .mm output failed validation. Correct ALL of the following errors and regenerate the complete .mm file:',
    '',
    ...errors.map((e) => `- ${e}`),
    '',
    'CRITICAL REMINDERS:',
    '- Output must start with <map and end with </map>',
    '- Every TRACKABLE="true" node must have a unique CONCEPT_ID attribute',
    '- Minimum 3 levels of nesting',
    '- No markdown fencing or extra text outside the XML',
    '',
    'Original source material:',
    input.rawText,
    '',
    'Your previous (failed) output for reference:',
    previousOutput.slice(0, 500) + (previousOutput.length > 500 ? '...' : ''),
  ].join('\n');
}

function extractXmlFromResponse(responseText: string): string {
  const trimmed = responseText.trim();
  const fenceMatch = trimmed.match(/^```(?:xml)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  const mapMatch = trimmed.match(/(<map[\s\S]*<\/map>)/);
  if (mapMatch) return mapMatch[1].trim();
  return trimmed;
}
