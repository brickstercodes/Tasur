/**
 * WHY: Mastra-backed .mm Generator Agent — replaces Document Parser + Mindmap Generator.
 *
 * Receives raw extracted text (or raw PDF bytes for PDFs) and produces a Freeplane
 * .mm XML string. This XML is the single source of truth for the entire study session.
 *
 * Two execution paths:
 *
 *   PDF-native path  (fileType === "pdf" && fileBuffer is present)
 *     → Sends the raw PDF bytes directly to Gemini vision (gemini-2.5-pro by default)
 *       with thinking enabled. Gemini can SEE every diagram on every page and will
 *       produce accurate [DIAGRAM TO STUDY: …] callout nodes without relying on
 *       text extraction to describe visuals.
 *
 *   Text-based path  (all other file types, or PDF without a buffer)
 *     → Sends the extracted raw text to the orchestrator model. Used for DOCX, TXT,
 *       and image OCR results where multimodal vision adds no value.
 *
 * Both paths validate the output with validateMmOutput() and retry once on failure.
 * The PDF path always retries with PDF-native (Gemini 2.5 Pro + file bytes) — it
 * never falls back to the text-based path, which would lose diagram visibility and
 * downgrade to the older orchestrator model.
 *
 * On malformed XML: validates with validateMmOutput() and retries once with a
 * stricter prompt before failing hard.
 *
 * NOTE: Uses generateText() (not generateObject()) because the output is raw XML.
 */

import { generateText } from 'ai';

import { getOrchestratorModel, getPdfMmModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MmGeneratorInput } from '@/interfaces/registry';
import { validateMmOutput } from '@/lib/schemas/mm-generator-output';
import { loadPrompt } from '@/prompts/loader';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Low temperature for structural consistency — the .mm format is strict. */
const TEXT_TEMPERATURE = 0.1;
/** Thinking models require temperature = 1. */
const PDF_TEMPERATURE = 1;

// ── Mastra .mm Generator Agent ────────────────────────────────────────────────

export class MastraMmGeneratorAgent implements TasurAgent<MmGeneratorInput, string> {
  async execute(input: MmGeneratorInput): Promise<AgentResult<string>> {
    const startTime = Date.now();

    // PDF-native path: send bytes directly so Gemini can see diagrams on the page
    if (input.fileType === 'pdf' && input.fileBuffer) {
      return executePdfNative(input, startTime);
    }

    // Text-based path: all other file types
    return executeTextBased(input, startTime);
  }
}

// ── Text-based execution (DOCX / TXT / image OCR) ─────────────────────────────

async function executeTextBased(
  input: MmGeneratorInput,
  startTime: number,
): Promise<AgentResult<string>> {
  const systemPrompt = loadPrompt('mm-generator', input.subjectHint ?? null);
  const userMessage = buildTextUserMessage(input);

  if (process.env.DEBUG_PROMPTS) {
    process.stderr.write(
      `\n[DEBUG mastra:mm-generator:text]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`,
    );
  }

  const { text, usage } = await generateText({
    model: getOrchestratorModel(),
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    temperature: TEXT_TEMPERATURE,
  });

  const mmXml = extractXmlFromResponse(text);
  const validationResult = validateMmOutput(mmXml);

  if (!validationResult.valid) {
    const retryMessage = buildTextRetryMessage(input, mmXml, validationResult.errors);
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
        `.mm Generator (text) failed validation after retry. Errors:\n${retryValidation.errors.join('\n')}`,
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

// ── PDF-native execution ───────────────────────────────────────────────────────

async function executePdfNative(
  input: MmGeneratorInput,
  startTime: number,
): Promise<AgentResult<string>> {
  const systemPrompt = loadPrompt('mm-generator', input.subjectHint ?? null);
  const userTextPart = buildPdfUserTextPart(input);

  if (process.env.DEBUG_PROMPTS) {
    process.stderr.write(
      `\n[DEBUG mastra:mm-generator:pdf-native]\n[system]\n${systemPrompt}\n[user-text]\n${userTextPart}\n`,
    );
  }

  const { text, usage } = await generateText({
    model: getPdfMmModel(),
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file' as const,
            data: input.fileBuffer!,
            mediaType: 'application/pdf',
          },
          {
            type: 'text' as const,
            text: userTextPart,
          },
        ],
      },
    ],
    temperature: PDF_TEMPERATURE,
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: 'high' as const,
        },
      },
    },
  });

  const mmXml = extractXmlFromResponse(text);
  const validationResult = validateMmOutput(mmXml);

  if (!validationResult.valid) {
    process.stderr.write(
      `[mm-generator] PDF-native validation failed. Errors: ${validationResult.errors.join(', ')}\n`,
    );
    // Always retry with PDF-native — never fall back to the text-based path for PDFs.
    // Text-based uses an older model and loses all diagram visibility, which is the
    // whole reason we're on this path. Retry with the same file + explicit error list.
    const retryResult = await generateText({
      model: getPdfMmModel(),
      system: loadPrompt('mm-generator', input.subjectHint ?? null),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file' as const, data: input.fileBuffer!, mediaType: 'application/pdf' },
            {
              type: 'text' as const,
              text: [
                buildPdfUserTextPart(input),
                '',
                'CRITICAL: Your previous attempt produced invalid XML. Errors:',
                ...validationResult.errors.map((e) => `- ${e}`),
                '',
                'Output ONLY valid XML starting with <map and ending with </map>.',
              ].join('\n'),
            },
          ],
        },
      ],
      temperature: PDF_TEMPERATURE,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'medium' as const },
        },
      },
    });
    const retriedXml = extractXmlFromResponse(retryResult.text);
    const retryValidation = validateMmOutput(retriedXml);
    if (!retryValidation.valid) {
      throw new Error(
        `.mm Generator (PDF-native) failed validation after retry. Errors:\n${retryValidation.errors.join('\n')}`,
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

// ── Message builders ───────────────────────────────────────────────────────────

function buildTextUserMessage(input: MmGeneratorInput): string {
  const lines = [
    `Generate a COMPLETE and EXHAUSTIVE Freeplane .mm mindmap for the following study material.`,
    ``,
    `CRITICAL: This mindmap is the student's PRIMARY and SOLE resource for their exam.`,
    `Every concept, definition, property, algorithm step, formula, worked example, comparison,`,
    `and diagram reference present in the source material MUST appear as a leaf node.`,
    `Do NOT summarize. Do NOT omit "minor" details. If it is in the source, it is in the mindmap.`,
    `Produce depth: aim for 4–5 levels with dense leaf nodes — not a flat overview.`,
  ];

  if (input.subjectHint) {
    lines.push(``, `Subject: ${input.subjectHint}`);
  }
  if (input.fileType) {
    lines.push(`Source file type: ${input.fileType}`);
  }

  if (input.customInstructions) {
    lines.push(
      ``,
      `━━━ MANDATORY STUDENT DIRECTIVES ━━━`,
      `The student has specified the following requirements. These MUST be honored in your output`,
      `and take priority over any default style preferences:`,
      ``,
      input.customInstructions,
      `━━━ END STUDENT DIRECTIVES ━━━`,
    );
  }

  lines.push(``, `--- SOURCE MATERIAL BEGIN ---`, input.rawText, `--- SOURCE MATERIAL END ---`);

  if (input.customInstructions) {
    lines.push(
      ``,
      `Reminder before you generate: the student explicitly requires — "${input.customInstructions}"`,
      `Ensure your output fully satisfies this.`,
    );
  }

  return lines.join('\n');
}

/**
 * Builds the text part of the PDF-native user message.
 * The file part (PDF bytes) is attached separately as a FilePart.
 * Gemini sees the actual pages including diagrams — no text extraction needed.
 */
function buildPdfUserTextPart(input: MmGeneratorInput): string {
  const lines = [
    `Generate a COMPLETE and EXHAUSTIVE Freeplane .mm mindmap from the attached PDF.`,
    ``,
    `CRITICAL: This mindmap is the student's PRIMARY and SOLE resource for their exam.`,
    `Every concept, definition, property, algorithm step, formula, worked example, and`,
    `comparison visible in this PDF MUST appear as a leaf node in the mindmap.`,
    `Do NOT summarize. Produce depth: aim for 4–5 levels with dense leaf nodes.`,
    ``,
    `DIAGRAMS: You can see the actual PDF pages. For every diagram, figure, chart, table,`,
    `or visual on any page, add a leaf node exactly in this format:`,
    `[DIAGRAM TO STUDY: brief description of what the diagram shows]`,
    `Place the callout node inside the branch that covers that diagram's topic.`,
  ];

  if (input.subjectHint) {
    lines.push(``, `Subject: ${input.subjectHint}`);
  }

  if (input.customInstructions) {
    lines.push(
      ``,
      `━━━ MANDATORY STUDENT DIRECTIVES ━━━`,
      `The student has specified the following requirements. These MUST be honored:`,
      ``,
      input.customInstructions,
      `━━━ END STUDENT DIRECTIVES ━━━`,
      ``,
      `Reminder: the student explicitly requires — "${input.customInstructions}"`,
    );
  }

  return lines.join('\n');
}

function buildTextRetryMessage(
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
