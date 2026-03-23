/**
 * WHY: Mastra-backed .mm Generator Agent — replaces Document Parser + Mindmap Generator.
 *
 * Receives raw extracted text and produces a Freeplane .mm XML string in a single
 * LLM call. This XML is the single source of truth for the entire study session:
 * concept registry, knowledge graph, visual mindmap, and teaching sequence are all
 * derived from it deterministically by the .mm Parser utility (not by more LLM calls).
 *
 * On malformed XML: validates with validateMmOutput() and retries once with a
 * stricter prompt that explicitly names the validation errors before failing hard.
 *
 * NOTE: Uses generateText() (not generateObject()) because the output is raw XML,
 * not JSON. Mastra 0.24.9 compatibility note: same generateText() from AI SDK
 * is used directly, same as other agents in this project.
 */

import { generateText } from 'ai';

import { getOrchestratorModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MmGeneratorInput } from '@/interfaces/registry';
import { validateMmOutput } from '@/lib/schemas/mm-generator-output';
import { loadPrompt } from '@/prompts/loader';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Low temperature for structural consistency — the .mm format is strict. */
const MM_GENERATOR_TEMPERATURE = 0.1;

// ── Mastra .mm Generator Agent ────────────────────────────────────────────────

export class MastraMmGeneratorAgent implements TasurAgent<MmGeneratorInput, string> {
  async execute(input: MmGeneratorInput): Promise<AgentResult<string>> {
    const startTime = Date.now();
    const systemPrompt = loadPrompt('mm-generator', input.subjectHint ?? null);
    const userMessage = buildUserMessage(input);

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(
        `\n[DEBUG mastra:mm-generator]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`,
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
      // Retry once with a stricter prompt that explicitly names the errors
      const retryMessage = buildRetryUserMessage(input, mmXml, validationResult.errors);
      const retryResult = await generateText({
        model: getOrchestratorModel(),
        system: systemPrompt,
        messages: [{ role: 'user', content: retryMessage }],
        temperature: 0, // zero temperature on retry for maximum consistency
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

// ── Message builders ──────────────────────────────────────────────────────────

function buildUserMessage(input: MmGeneratorInput): string {
  const lines = [
    `Generate a comprehensive Freeplane .mm mindmap for the following study material.`,
  ];

  if (input.subjectHint) {
    lines.push(`Subject hint: ${input.subjectHint}`);
  }
  if (input.fileType) {
    lines.push(`Source file type: ${input.fileType}`);
  }

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

// ── XML extraction helper ─────────────────────────────────────────────────────

/**
 * Strips accidental markdown fences or leading whitespace from the LLM response.
 * The model is instructed to output raw XML but occasionally wraps it in ```xml.
 */
function extractXmlFromResponse(responseText: string): string {
  const trimmed = responseText.trim();

  // Strip ```xml ... ``` fencing if present
  const fenceMatch = trimmed.match(/^```(?:xml)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Look for the <map ... </map> block if there is preamble text
  const mapMatch = trimmed.match(/(<map[\s\S]*<\/map>)/);
  if (mapMatch) {
    return mapMatch[1].trim();
  }

  return trimmed;
}
