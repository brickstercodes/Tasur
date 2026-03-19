/**
 * WHY: Mock Document Parser Agent for local development and tests.
 *
 * Returns the pre-written DBMS normalization fixture so the entire pipeline
 * can run without an LLM call. Output is validated against the real Zod schema
 * so if the schema changes, this mock breaks loudly rather than silently.
 */

import type { AgentResult, TasurAgent } from '@/interfaces/agents';
import type { DocumentParserInput } from '@/interfaces/registry';
import { documentParserOutputSchema } from '@/lib/schemas/parser-output';
import type { DocumentParserOutput } from '@/lib/schemas/parser-output';

import fixture from '../fixtures/dbms-normalization.json';

export class MockDocumentParserAgent
  implements TasurAgent<DocumentParserInput, DocumentParserOutput>
{
  async execute(
    _input: DocumentParserInput,
  ): Promise<AgentResult<DocumentParserOutput>> {
    const start = Date.now();

    const output = documentParserOutputSchema.parse(
      fixture.document_parser_output,
    );

    return {
      data: output,
      usage: { inputTokens: 0, outputTokens: 0 },
      duration: Date.now() - start,
    };
  }
}
