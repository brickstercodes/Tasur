/**
 * WHY: Unit tests for the prompt loader.
 *
 * Verifies that loadPrompt() reads base prompts, composes domain extensions,
 * and gracefully falls back when a domain template doesn't exist.
 * Pure filesystem tests — no LLM calls, no credentials required.
 */

import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { loadPrompt } from '@/prompts/loader';

describe('loadPrompt', () => {
  it('loads the document-parser base prompt', () => {
    const prompt = loadPrompt('document-parser');

    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(100);
    // Base prompt must define the agent role.
    expect(prompt).toContain('Document Parser');
  });

  it('loads the mindmap-generator base prompt', () => {
    const prompt = loadPrompt('mindmap-generator');
    expect(prompt).toContain('Mindmap');
  });

  it('loads the concept-explainer base prompt', () => {
    const prompt = loadPrompt('concept-explainer');
    expect(prompt).toContain('Concept Explainer');
  });

  it('loads the flashcard-generator base prompt', () => {
    const prompt = loadPrompt('flashcard-generator');
    expect(prompt).toContain('Flashcard');
  });

  it('returns only base prompt when domain is null', () => {
    const withNull = loadPrompt('document-parser', null);
    const withoutDomain = loadPrompt('document-parser');
    expect(withNull).toBe(withoutDomain);
  });

  it('returns only base prompt when domain file does not exist', () => {
    const base = loadPrompt('document-parser');
    const withUnknownDomain = loadPrompt('document-parser', 'nonexistent-subject-xyz');
    expect(withUnknownDomain).toBe(base);
  });

  it('composes base + domain when domain file exists', () => {
    // Only run if a domain file exists — won't fail if domains/ is empty.
    const domainDir = path.join(process.cwd(), 'src', 'prompts', 'domains');
    const fs = require('fs');
    const domainFiles: string[] = fs.existsSync(domainDir) ? fs.readdirSync(domainDir) : [];

    if (domainFiles.length === 0) {
      // No domain files yet — just verify the base is returned.
      const prompt = loadPrompt('document-parser', 'dbms');
      expect(prompt).toBeTruthy();
      return;
    }

    // Pick the first domain file that exists.
    const domainKey = domainFiles[0].replace('.md', '');
    const basePrompt = loadPrompt('document-parser');
    const composedPrompt = loadPrompt('document-parser', domainKey);

    // Composed prompt must be longer than base alone.
    expect(composedPrompt.length).toBeGreaterThan(basePrompt.length);
    // Must contain the domain separator.
    expect(composedPrompt).toContain('## Domain Context');
  });

  it('throws when the base prompt file does not exist', () => {
    expect(() => loadPrompt('nonexistent-agent')).toThrow();
  });
});
