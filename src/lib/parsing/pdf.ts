/**
 * WHY: Extracts text from PDF files for the Tasur parsing pipeline.
 *
 * PDFs are the most common format students upload (lecture slides, textbooks,
 * past papers). This module handles the three tricky edge cases that break naive
 * pdf-parse usage: encrypted PDFs (fail gracefully with a clear error), empty
 * PDFs (return an error rather than an empty string that confuses agents), and
 * large PDFs (>50 pages are chunked so Module 7 can call the LLM per chunk
 * rather than exceeding context window limits in a single call).
 *
 * Uses pdf-parse v2 (class-based API). The constructor takes `{ data: Uint8Array }`
 * rather than a raw Buffer. See LoadParameters in pdf-parse types for all options.
 * Zero LLM dependency — pure file processing.
 */

import { PDFParse, PasswordException } from 'pdf-parse';

import type { ParseResult } from './types';

/** PDFs exceeding this page count are split into chunks for LLM processing. */
const LARGE_PDF_PAGE_THRESHOLD = 50;

/**
 * Extracts text from a PDF buffer.
 *
 * Failure modes handled:
 * - Encrypted PDF → { success: false, error: '...' }
 * - Empty PDF (no text layer) → { success: false, error: '...' }
 * - Large PDF (>50 pages) → success with isChunked: true and chunks array
 */
export async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  // pdf-parse v2 prefers Uint8Array over Buffer to avoid unnecessary copies.
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new PDFParse({ data, verbosity: 0 });

  try {
    const result = await parser.getText();

    const rawText = result.text.trim();

    if (!rawText) {
      return {
        success: false,
        error:
          'PDF has no extractable text layer. The file may be a scanned image — try uploading as an image for OCR instead.',
      };
    }

    const pageCount = result.total;
    const isChunked = pageCount > LARGE_PDF_PAGE_THRESHOLD;
    const chunks = isChunked ? splitIntoPageChunks(rawText, pageCount) : undefined;

    return {
      success: true,
      data: {
        rawText,
        fileType: 'pdf',
        pageCount,
        parsingConfidence: 1.0,
        metadata: { pdfVersion: 'unknown' },
        isChunked,
        chunks,
      },
    };
  } catch (err) {
    if (err instanceof PasswordException) {
      return {
        success: false,
        error: 'PDF is password-protected. Please remove the password before uploading.',
      };
    }

    const message = err instanceof Error ? err.message : String(err);

    // Catch any other error messages that suggest encryption (belt-and-suspenders).
    if (isEncryptionError(message)) {
      return {
        success: false,
        error: 'PDF is password-protected. Please remove the password before uploading.',
      };
    }

    return { success: false, error: `PDF parsing failed: ${message}` };
  } finally {
    await parser.destroy();
  }
}

/**
 * Splits the full extracted text into chunks of approximately
 * LARGE_PDF_PAGE_THRESHOLD pages each. Since pdf-parse gives us the full text
 * without per-page boundaries we divide by character count as a proxy.
 */
function splitIntoPageChunks(rawText: string, pageCount: number): string[] {
  const chunkCount = Math.ceil(pageCount / LARGE_PDF_PAGE_THRESHOLD);
  const chunkSize = Math.ceil(rawText.length / chunkCount);
  const chunks: string[] = [];

  for (let offset = 0; offset < rawText.length; offset += chunkSize) {
    chunks.push(rawText.slice(offset, offset + chunkSize));
  }

  return chunks;
}

/**
 * Belt-and-suspenders check for encryption-related error messages.
 * PasswordException is the canonical path, but some pdfjs-dist internals
 * surface encryption via generic errors with keyword-containing messages.
 */
function isEncryptionError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('encrypted') ||
    lowerMessage.includes('password') ||
    lowerMessage.includes('decryption')
  );
}
