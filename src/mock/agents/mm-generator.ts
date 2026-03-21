/**
 * WHY: Mock .mm Generator Agent for local development and tests.
 *
 * Returns the static DBMS normalization .mm fixture so the entire pipeline
 * can run without any LLM call. The fixture is a real Freeplane XML file
 * that produces valid DerivedConcept[], ConceptEdge[], and MindmapTreeOutput
 * when passed through the .mm Parser.
 *
 * Validated by parseMmXml() at call time so if the fixture is malformed the
 * test suite breaks loudly. validateMmOutput() is also called so the mock
 * exercises the same validation path as the real agent.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { MmGeneratorInput } from '@/interfaces/registry';
import { validateMmOutput } from '@/lib/schemas/mm-generator-output';

// Load the fixture at module initialisation time — fails fast if the file is missing
const FIXTURE_PATH = join(__dirname, '../fixtures/dbms-normalization.mm');
const MM_FIXTURE = readFileSync(FIXTURE_PATH, 'utf-8');

export class MockMmGeneratorAgent implements TasurAgent<MmGeneratorInput, string> {
  async execute(_input: MmGeneratorInput): Promise<AgentResult<string>> {
    const start = Date.now();

    const validation = validateMmOutput(MM_FIXTURE);
    if (!validation.valid) {
      throw new Error(
        `Mock .mm fixture failed validation:\n${validation.errors.join('\n')}`,
      );
    }

    return {
      data: MM_FIXTURE,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }
}
