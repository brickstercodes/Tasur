/**
 * DEPRECATED — Module 8.5 (.mm-First Architecture Refactor)
 * This agent is no longer in the active pipeline. It has been replaced by
 * MastraMmGeneratorAgent (src/mastra/agents/mm-generator.ts).
 * Retained for comparison testing only. Do not use in new sessions.
 *
 * WHY: Mastra-backed Document Parser Agent implementation.
 *
 * Receives a raw file buffer, extracts text via the Module 5 parsing pipeline,
 * then sends the text to a Gemini specialist model to produce a structured
 * concept map (concepts, relationships, gaps).
 *
 * NOTE: Mastra 0.24.9's Agent.generate() internally routes through Agent.stream(),
 * which throws AGENT_STREAM_V1_MODEL_NOT_SUPPORTED for AI SDK v6 models. Until
 * Mastra ships AI SDK v6 support, we call generateObject() from the AI SDK directly.
 * The file stays in src/mastra/ to preserve the dual-path architecture.
 */

import { generateObject } from 'ai';

import { getSpecialistModel } from '@/config/model-provider';
import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { DocumentParserInput } from '@/interfaces/registry';
import { parseDocument } from '@/lib/parsing';
import type { FileType } from '@/lib/parsing';
import { documentParserOutputSchema } from '@/lib/schemas/parser-output';
import type { DocumentParserOutput } from '@/lib/schemas/parser-output';
import { loadPrompt } from '@/prompts/loader';

// ── MIME type → FileType mapping ─────────────────────────────────────────────

function resolveFileType(mimeType: string, filename: string): FileType {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    extension === 'docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
    return 'docx';
  if (extension === 'txt' || mimeType === 'text/plain') return 'txt';
  if (extension === 'png' || mimeType === 'image/png') return 'png';
  if (extension === 'jpg' || extension === 'jpeg' || mimeType.startsWith('image/jpeg'))
    return 'jpg';

  return 'txt';
}

// ── Mastra Document Parser Agent ─────────────────────────────────────────────

export class MastraDocumentParserAgent
  implements TasurAgent<DocumentParserInput, DocumentParserOutput>
{
  async execute(input: DocumentParserInput): Promise<AgentResult<DocumentParserOutput>> {
    const startTime = Date.now();

    const fileType = resolveFileType(input.mimeType, input.filename);
    const parseResult = await parseDocument(input.fileBuffer, fileType);

    if (!parseResult.success) {
      throw new Error(`Document parsing failed: ${parseResult.error}`);
    }

    const rawText = parseResult.data.rawText;
    const systemPrompt = loadPrompt('document-parser');
    const userMessage = `Parse the following document and extract a structured concept map.\n\nFilename: ${input.filename}\n\nContent:\n${rawText}`;

    if (process.env.DEBUG_PROMPTS) {
      process.stderr.write(`\n[DEBUG mastra:document-parser]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`);
    }

    const { object, usage } = await generateObject({
      model: getSpecialistModel(),
      schema: documentParserOutputSchema,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
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
