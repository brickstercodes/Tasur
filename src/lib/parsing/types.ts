/**
 * WHY: Shared output contract for every parser in the document parsing pipeline.
 *
 * All four parsers (PDF, text, DOCX, OCR) must return the same shape so the
 * unified parseDocument router and downstream agents can consume them without
 * branching on file type. Having the types in one place prevents drift between
 * parsers and makes the Module 7 Document Parser Agent's intake dead simple.
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

export type FileType = 'pdf' | 'txt' | 'docx' | 'png' | 'jpg' | 'jpeg';

/**
 * Normalised output every parser produces.
 * parsingConfidence is 1.0 for exact extraction (PDF text layer, plain text,
 * DOCX) and degrades toward 0.0 for low-quality OCR results.
 */
export interface ParsedDocument {
  rawText: string;
  fileType: FileType;
  /** Number of pages, or 1 for formats that have no concept of pages. */
  pageCount: number;
  /** 0.0–1.0. OCR output may be significantly below 1.0. */
  parsingConfidence: number;
  metadata: Record<string, unknown>;
  /**
   * Present and true when a PDF exceeded the large-file threshold.
   * The Module 7 agent should process `chunks` sequentially rather than
   * passing `rawText` to a single LLM call.
   */
  isChunked?: boolean;
  /** Populated when isChunked is true. Each element is ~50 pages of text. */
  chunks?: string[];
  /**
   * true for OCR output. Signals to downstream agents that extraction quality
   * is lower than a native text layer and confidence scores are meaningful.
   */
  isBeta?: boolean;
}

export type ParseResult =
  | { success: true; data: ParsedDocument }
  | { success: false; error: string };
