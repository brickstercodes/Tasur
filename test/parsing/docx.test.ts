/**
 * WHY: Tests for the DOCX parser.
 *
 * DOCX is the second-most-common student upload format. The tests verify that
 * mammoth's Markdown output preserves structural signals (headings, lists) that
 * Module 7 relies on for concept hierarchy detection.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { parseDocx } from '../../src/lib/parsing/docx';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('parseDocx', () => {
  it('extracts text from a valid DOCX file', async () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.docx'));
    const result = await parseDocx(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.rawText.length).toBeGreaterThan(0);
    expect(result.data.fileType).toBe('docx');
    expect(result.data.parsingConfidence).toBe(1.0);
  });

  it('preserves heading structure as Markdown', async () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.docx'));
    const result = await parseDocx(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // Markdown headings should be present since sample.docx has headed sections
    expect(result.data.rawText).toMatch(/^#{1,3} /m);
  });

  it('returns pageCount of 1 (DOCX has no reliable page count)', async () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.docx'));
    const result = await parseDocx(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pageCount).toBe(1);
  });

  it('includes conversionWarnings in metadata', async () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.docx'));
    const result = await parseDocx(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.metadata).toHaveProperty('conversionWarnings');
    expect(Array.isArray(result.data.metadata.conversionWarnings)).toBe(true);
  });

  it('returns an error for a corrupt buffer', async () => {
    const corruptBuffer = Buffer.from('not a docx file');
    const result = await parseDocx(corruptBuffer);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.length).toBeGreaterThan(0);
  });
});
