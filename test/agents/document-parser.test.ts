/**
 * WHY: Integration tests for the Document Parser Agent — manual (Vercel AI SDK) path.
 *
 * Each test passes a hardcoded DBMS normalization paragraph as a Buffer (simulating
 * a .txt upload) and asserts that the output passes Zod schema validation.
 * These tests require LLM_PROVIDER=gemini and GOOGLE_APPLICATION_CREDENTIALS to be set
 * in .env. They are skipped automatically when credentials are absent so the
 * CI pipeline can run without live credentials.
 *
 * Note: Mastra path removed 2026-03-29 (Mastra sunset).
 * Note: DocumentParser is deprecated in favour of the .mm-first pipeline but retained for testing.
 */

import { describe, expect, it } from 'vitest';

import { ManualDocumentParserAgent } from '@/manual/agents/document-parser';
import type { DocumentParserInput } from '@/interfaces/registry';
import { documentParserOutputSchema } from '@/lib/schemas/parser-output';

const SAMPLE_DBMS_TEXT = `
Database Normalization

Normalization is the process of organizing a relational database to reduce data redundancy
and improve data integrity. It involves decomposing relations to remove undesirable
characteristics like insertion, update, and deletion anomalies.

First Normal Form (1NF): A relation is in 1NF if it contains only atomic values and each
column contains values of a single type. Multi-valued attributes must be moved to separate tables.

Second Normal Form (2NF): A relation is in 2NF if it is in 1NF and every non-prime attribute
is fully functionally dependent on the primary key. Partial dependencies must be removed by
decomposing the table.

Third Normal Form (3NF): A relation is in 3NF if it is in 2NF and no non-prime attribute is
transitively dependent on the primary key. Transitive dependencies indicate that one non-key
attribute determines another non-key attribute.

Boyce-Codd Normal Form (BCNF): BCNF is a stricter version of 3NF. Every functional dependency
X → Y must have X as a superkey. BCNF eliminates all anomalies that 3NF cannot, but
decomposition into BCNF may not always preserve functional dependencies.

Functional Dependency: A constraint between two attribute sets X and Y in a relation R,
written X → Y, meaning that for any two tuples with the same X value, the Y values must
also be the same. Functional dependencies are the foundation of normalization theory.
`.trim();

const TEST_INPUT: DocumentParserInput = {
  fileBuffer: Buffer.from(SAMPLE_DBMS_TEXT, 'utf-8'),
  mimeType: 'text/plain',
  filename: 'dbms-normalization.txt',
};

const hasApiKey = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);

describe.skipIf(!hasApiKey)('Document Parser Agent — manual path', () => {
  it('produces output that passes Zod schema validation', async () => {
    const agent = new ManualDocumentParserAgent();
    const result = await agent.execute(TEST_INPUT);

    expect(result.duration).toBeGreaterThan(0);

    const validated = documentParserOutputSchema.safeParse(result.data);
    expect(validated.success).toBe(true);

    if (validated.success) {
      expect(validated.data.concepts.length).toBeGreaterThan(0);
      // DBMS text — primary subject should be detected.
      expect(validated.data.subject_detection.confidence).toBeGreaterThan(0.5);
    }
  }, 60_000);
});
