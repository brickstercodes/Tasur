/**
 * WHY: Vercel AI SDK fallback Document Parser Agent implementation.
 *
 * Implements the same TasurAgent contract as the Mastra version but uses
 * generateObject() directly from the Vercel AI SDK instead of Mastra's Agent
 * class. This path is useful when Mastra infrastructure is unavailable or
 * during local development where lighter-weight LLM calls are preferred.
 * The parsed text extraction and schema validation logic is identical to the
 * Mastra path — only the framework call differs.
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

// ── Manual Document Parser Agent ─────────────────────────────────────────────

export class ManualDocumentParserAgent
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
      process.stderr.write(`\n[DEBUG manual:document-parser]\n[system]\n${systemPrompt}\n[user]\n${userMessage}\n`);
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
