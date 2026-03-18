/**
 * WHY: Reads plain text files for the Tasur parsing pipeline.
 *
 * Plain text is the simplest format but also the most reliable — no rendering
 * engine, no hidden layers. Students often paste notes into .txt files or
 * export from note-taking apps. This parser exists as a thin adapter that
 * gives text files the same ParseResult shape as every other parser so the
 * unified router and Module 7 agent never need to branch on source format.
 * Zero LLM dependency — pure file processing.
 */

import type { ParseResult } from './types';

/**
 * Reads a UTF-8 text buffer and returns a normalised ParseResult.
 * Synchronous — text extraction needs no I/O beyond what the caller
 * already did to produce the buffer.
 */
export function parseText(buffer: Buffer): ParseResult {
  const rawText = buffer.toString('utf-8').trim();

  if (!rawText) {
    return { success: false, error: 'Text file is empty.' };
  }

  return {
    success: true,
    data: {
      rawText,
      fileType: 'txt',
      pageCount: 1,
      parsingConfidence: 1.0,
      metadata: { encoding: 'utf-8', byteLength: buffer.byteLength },
    },
  };
}
