/**
 * WHY: Composes the two-layer prompt system into a single system string.
 *
 * Layer 1 (base/):    agent role, output schema, examples — agent-specific.
 * Layer 2 (domains/): subject vocabulary, concept patterns — domain-specific.
 *
 * Both layers are .md files so content editors can update them without touching
 * TypeScript. Files are read from disk at call time (not import time) so edits
 * are picked up by Next.js hot-reload in dev. If no domain template exists for
 * the detected subject the base prompt is returned alone — agents degrade
 * gracefully on unknown domains.
 */

import * as fs from 'fs';
import * as path from 'path';

const PROMPTS_DIRECTORY = path.join(process.cwd(), 'src', 'prompts');

/**
 * Loads and composes the system prompt for a named agent.
 *
 * @param agentName - Filename stem inside src/prompts/base/ (e.g. "document-parser").
 * @param domain    - Optional domain key (e.g. "dbms"). If provided and a matching
 *                    file exists in src/prompts/domains/, it is appended to the base.
 */
export function loadPrompt(agentName: string, domain?: string | null): string {
  const baseFilePath = path.join(PROMPTS_DIRECTORY, 'base', `${agentName}.md`);
  const basePrompt = fs.readFileSync(baseFilePath, 'utf-8');

  if (!domain) {
    return basePrompt;
  }

  const domainFilePath = path.join(PROMPTS_DIRECTORY, 'domains', `${domain}.md`);
  const domainFileExists = fs.existsSync(domainFilePath);

  if (!domainFileExists) {
    return basePrompt;
  }

  const domainPrompt = fs.readFileSync(domainFilePath, 'utf-8');
  return `${basePrompt}\n\n---\n\n## Domain Context\n\n${domainPrompt}`;
}
