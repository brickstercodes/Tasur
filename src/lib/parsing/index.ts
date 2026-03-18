/**
 * WHY: Unified entry point for the document parsing pipeline.
 *
 * Module 7's Document Parser Agent and any future upload handler should call
 * parseDocument rather than importing individual parsers directly. This keeps
 * the routing logic (which parser handles which file type) in one place so
 * adding a new format only requires changing this file. The function also
 * handles the File → Buffer conversion so callers can pass either a browser
 * File object or a Node.js Buffer (API routes receive Buffers, client
 * components receive Files).
 * Zero LLM dependency — pure file processing.
 */

import { parseDocx } from './docx';
import { parseImageOcr } from './ocr';
import { parsePdf } from './pdf';
import { parseText } from './text';
import type { FileType, ParseResult } from './types';

export type { FileType, ParsedDocument, ParseResult } from './types';

/**
 * Routes a file to the correct parser based on its declared file type and
 * returns a normalised ParseResult.
 *
 * Accepts either a Node.js Buffer (server-side) or a browser File object.
 * All parsers receive a Buffer internally — File objects are converted once
 * at this boundary so parsers stay environment-agnostic.
 */
export async function parseDocument(
  file: File | Buffer,
  fileType: FileType,
): Promise<ParseResult> {
  const buffer = await toBuffer(file);

  switch (fileType) {
    case 'pdf':
      return parsePdf(buffer);

    case 'txt':
      return parseText(buffer);

    case 'docx':
      return parseDocx(buffer);

    case 'png':
    case 'jpg':
    case 'jpeg': {
      const result = await parseImageOcr(buffer);
      // OCR always sets fileType: 'png' internally; correct it to the actual type.
      if (result.success) {
        return { success: true, data: { ...result.data, fileType } };
      }
      return result;
    }

    default: {
      // TypeScript exhaustiveness check — this branch is unreachable at compile
      // time but guards against runtime callers passing an unsupported string.
      const exhaustiveCheck: never = fileType;
      return {
        success: false,
        error: `Unsupported file type: ${exhaustiveCheck}. Supported types are: pdf, txt, docx, png, jpg, jpeg.`,
      };
    }
  }
}

/**
 * Normalises the input to a Buffer so all parsers receive the same type.
 * Browser File → ArrayBuffer → Buffer.
 * Node Buffer → returned as-is.
 */
async function toBuffer(file: File | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(file)) {
    return file;
  }
  return Buffer.from(await file.arrayBuffer());
}
