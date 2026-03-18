/**
 * WHY: Tests for the unified parseDocument router.
 *
 * This is the public API for the entire parsing pipeline. The tests verify that
 * the router correctly dispatches to each parser and that the output shape is
 * consistent across file types — both properties Module 7 depends on without
 * knowing which parser was invoked.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { parseDocument } from '../../src/lib/parsing/index';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('parseDocument router', () => {
  describe('PDF routing', () => {
    it('routes a PDF buffer to parsePdf and returns extracted text', async () => {
      const buffer = readFileSync(resolve(FIXTURES, 'sample.pdf'));
      const result = await parseDocument(buffer, 'pdf');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.fileType).toBe('pdf');
      expect(result.data.rawText.length).toBeGreaterThan(0);
    });
  });

  describe('TXT routing', () => {
    it('routes a TXT buffer to parseText and returns file contents', async () => {
      const buffer = readFileSync(resolve(FIXTURES, 'sample.txt'));
      const result = await parseDocument(buffer, 'txt');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.fileType).toBe('txt');
      expect(result.data.rawText.length).toBeGreaterThan(0);
    });
  });

  describe('DOCX routing', () => {
    it('routes a DOCX buffer to parseDocx and returns extracted text', async () => {
      const buffer = readFileSync(resolve(FIXTURES, 'sample.docx'));
      const result = await parseDocument(buffer, 'docx');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.fileType).toBe('docx');
      expect(result.data.rawText.length).toBeGreaterThan(0);
    });
  });

  describe('output shape consistency', () => {
    it('PDF and TXT results share the same required fields', async () => {
      const pdfBuffer = readFileSync(resolve(FIXTURES, 'sample.pdf'));
      const txtBuffer = readFileSync(resolve(FIXTURES, 'sample.txt'));

      const pdfResult = await parseDocument(pdfBuffer, 'pdf');
      const txtResult = await parseDocument(txtBuffer, 'txt');

      expect(pdfResult.success).toBe(true);
      expect(txtResult.success).toBe(true);

      if (!pdfResult.success || !txtResult.success) return;

      const requiredFields: Array<keyof typeof pdfResult.data> = [
        'rawText',
        'fileType',
        'pageCount',
        'parsingConfidence',
        'metadata',
      ];

      for (const field of requiredFields) {
        expect(pdfResult.data).toHaveProperty(field);
        expect(txtResult.data).toHaveProperty(field);
      }
    });

    it('all successful results have parsingConfidence between 0 and 1', async () => {
      const pdfBuffer = readFileSync(resolve(FIXTURES, 'sample.pdf'));
      const txtBuffer = readFileSync(resolve(FIXTURES, 'sample.txt'));
      const docxBuffer = readFileSync(resolve(FIXTURES, 'sample.docx'));

      const results = await Promise.all([
        parseDocument(pdfBuffer, 'pdf'),
        parseDocument(txtBuffer, 'txt'),
        parseDocument(docxBuffer, 'docx'),
      ]);

      for (const result of results) {
        expect(result.success).toBe(true);
        if (!result.success) continue;
        expect(result.data.parsingConfidence).toBeGreaterThanOrEqual(0);
        expect(result.data.parsingConfidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('error handling', () => {
    it('returns an error result for a corrupt PDF', async () => {
      const result = await parseDocument(Buffer.from('not a pdf'), 'pdf');
      expect(result.success).toBe(false);
    });

    it('returns an error result for an empty TXT file', async () => {
      const result = await parseDocument(Buffer.from(''), 'txt');
      expect(result.success).toBe(false);
    });

    it('returns an error result for a corrupt DOCX', async () => {
      const result = await parseDocument(Buffer.from('not a docx'), 'docx');
      expect(result.success).toBe(false);
    });
  });

  describe('File object input', () => {
    it('accepts a browser File object and converts it correctly', async () => {
      const textContent = 'hello from a File object';
      const file = new File([textContent], 'test.txt', { type: 'text/plain' });

      const result = await parseDocument(file, 'txt');

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.rawText).toBe(textContent);
    });
  });
});
