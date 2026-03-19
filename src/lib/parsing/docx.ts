/**
 * WHY: Extracts structured text from DOCX files for the Tasur parsing pipeline.
 *
 * DOCX is the primary format for university lecture notes and assignments.
 * mammoth.js is used over raw XML parsing because it correctly converts Word
 * formatting (headings, bold, lists) into Markdown, which Module 7's Document
 * Parser Agent can then use as semantic signals when identifying concepts and
 * their hierarchy. Raw text extraction would discard heading structure and
 * lose information about which concepts are primary vs. sub-topics.
 * Zero LLM dependency — pure file processing.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as {
  convertToMarkdown: (input: { buffer: Buffer }) => Promise<{
    value: string;
    messages: Array<{ type: string; message: string }>;
  }>;
};

import type { ParseResult } from './types';

/**
 * Extracts text from a DOCX buffer, converting formatting to Markdown.
 *
 * Headings → # / ## / ### (preserves hierarchy for Module 7 concept detection)
 * Lists → - / 1. (preserves enumeration intent)
 * Bold/italic → **text** / _text_ (preserves emphasis signals)
 *
 * Note: DOCX has no reliable page count without rendering. pageCount is always
 * 1 here — Module 7 should not use it for chunking decisions on DOCX files.
 */
export async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const result = await mammoth.convertToMarkdown({ buffer });

    const rawText = result.value.trim();

    if (!rawText) {
      return {
        success: false,
        error: 'DOCX file produced no extractable text. The document may be empty or contain only images.',
      };
    }

    const warnings = result.messages
      .filter((message) => message.type === 'warning')
      .map((message) => message.message);

    return {
      success: true,
      data: {
        rawText,
        fileType: 'docx',
        // DOCX has no page count without rendering — placeholder value.
        pageCount: 1,
        parsingConfidence: 1.0,
        metadata: {
          conversionWarnings: warnings,
          warningCount: warnings.length,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `DOCX parsing failed: ${message}` };
  }
}
