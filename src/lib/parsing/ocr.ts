/**
 * WHY: OCR fallback for image-based study materials in the Tasur pipeline.
 *
 * Some students photograph whiteboard notes or scan pages as images rather than
 * PDFs. This module wraps Tesseract.js so those images can enter the same
 * pipeline as typed documents. OCR is marked as beta because:
 * 1. Accuracy degrades on handwriting, low-contrast images, and unusual fonts.
 * 2. Confidence scores below ~70% indicate noisy text that may mislead Module 7.
 * 3. Processing is significantly slower than PDF/DOCX extraction.
 * The isBeta flag and parsingConfidence let downstream agents decide whether
 * to surface a quality warning to the student.
 * Zero LLM dependency — pure file processing.
 */

import { createWorker } from 'tesseract.js';

import type { ParseResult } from './types';

/**
 * Tesseract confidence is reported 0–100. We normalise to 0–1 for consistency
 * with the rest of the pipeline. Results below this threshold are still returned
 * but the isBeta flag and low confidence value signal reduced reliability.
 */
const TESSERACT_CONFIDENCE_SCALE = 100;

/**
 * Runs OCR on an image buffer (PNG, JPG, or JPEG).
 *
 * Always marks the result with isBeta: true to signal downstream agents that
 * this text was extracted from a raster image and may contain recognition errors.
 * Spawns a short-lived Tesseract worker per call — not suitable for bulk batch
 * processing (a persistent worker pool would be needed at scale).
 */
export async function parseImageOcr(buffer: Buffer): Promise<ParseResult> {
  const worker = await createWorker('eng');

  try {
    const { data } = await worker.recognize(buffer);

    const rawText = data.text.trim();

    if (!rawText) {
      return {
        success: false,
        error: 'OCR produced no text. The image may be too low-resolution, blurry, or contain no readable text.',
      };
    }

    const parsingConfidence = data.confidence / TESSERACT_CONFIDENCE_SCALE;

    return {
      success: true,
      data: {
        rawText,
        fileType: 'png', // caller overrides this with the actual type via parseDocument
        pageCount: 1,
        parsingConfidence,
        isBeta: true,
        metadata: {
          ocrConfidence: data.confidence,
          ocrEngine: 'tesseract.js',
          language: 'eng',
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `OCR failed: ${message}` };
  } finally {
    // Always terminate the worker — leaking workers causes memory exhaustion.
    await worker.terminate();
  }
}
