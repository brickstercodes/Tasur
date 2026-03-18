/**
 * WHY: Tests for the plain-text parser.
 *
 * Text parsing is trivial but the tests lock in the output shape contract —
 * any breakage here signals that downstream agents would receive malformed data.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { parseText } from '../../src/lib/parsing/text';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('parseText', () => {
  it('extracts text from a valid UTF-8 file', () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.txt'));
    const result = parseText(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.rawText.length).toBeGreaterThan(0);
    expect(result.data.fileType).toBe('txt');
    expect(result.data.pageCount).toBe(1);
    expect(result.data.parsingConfidence).toBe(1.0);
  });

  it('includes expected content from the sample file', () => {
    const buffer = readFileSync(resolve(FIXTURES, 'sample.txt'));
    const result = parseText(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    // sample.txt contains a DB normalization document
    expect(result.data.rawText).toContain('Normal Form');
  });

  it('returns an error for an empty buffer', () => {
    const result = parseText(Buffer.from(''));

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error).toMatch(/empty/i);
  });

  it('returns an error for a whitespace-only buffer', () => {
    const result = parseText(Buffer.from('   \n\t  '));

    expect(result.success).toBe(false);
  });

  it('includes byte length in metadata', () => {
    const buffer = Buffer.from('hello world');
    const result = parseText(buffer);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.metadata.byteLength).toBe(buffer.byteLength);
  });
});
