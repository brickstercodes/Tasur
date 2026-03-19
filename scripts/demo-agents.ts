/**
 * Side-by-side demo: runs all 3 core agents on the same DBMS document using
 * both the Manual path and the Mastra path, then prints a comparison table.
 * Usage: npx tsx scripts/demo-agents.ts
 */

import { config } from 'dotenv';
import path from 'path';

// Load .env (not .env.local — tsx doesn't pick it up automatically)
config({ path: path.resolve(process.cwd(), '.env') });

import { MastraDocumentParserAgent } from '../src/mastra/agents/document-parser';
import { MastraConceptExplainerAgent } from '../src/mastra/agents/concept-explainer';
import { MastraFlashcardGeneratorAgent } from '../src/mastra/agents/flashcard-generator';
import { ManualDocumentParserAgent } from '../src/manual/agents/document-parser';
import { ManualConceptExplainerAgent } from '../src/manual/agents/concept-explainer';
import { ManualFlashcardGeneratorAgent } from '../src/manual/agents/flashcard-generator';

const SAMPLE_TEXT = `
Database Normalization

Normalization reduces redundancy in relational databases by decomposing tables.

First Normal Form (1NF): Every column contains atomic values.

Second Normal Form (2NF): Must be 1NF + every non-prime attribute fully depends on the primary key.

Third Normal Form (3NF): Must be 2NF + no non-prime attribute transitively depends on the primary key.

Boyce-Codd Normal Form (BCNF): Stricter than 3NF — every determinant must be a candidate key.

Functional Dependency: X → Y means the same X value always implies the same Y value.
`.trim();

const INPUT = {
  fileBuffer: Buffer.from(SAMPLE_TEXT, 'utf-8'),
  mimeType: 'text/plain' as const,
  filename: 'dbms-notes.txt',
};

function sep(label: string) {
  const line = '─'.repeat(57);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

function row(label: string, manual: string, mastra: string) {
  console.log(`  ${label.padEnd(20)} Manual: ${manual}`);
  console.log(`  ${''.padEnd(20)} Mastra: ${mastra}`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Tasur Agent Demo — Manual vs Mastra (gemini-2.5-flash)');
  console.log('═══════════════════════════════════════════════════════════');

  // ── Step 1: Document Parser ───────────────────────────────────────────────
  sep('Step 1: Document Parser');
  console.log('  Parsing same DBMS text through both paths in parallel...\n');

  const [manualParserResult, mastraParserResult] = await Promise.all([
    new ManualDocumentParserAgent().execute(INPUT),
    new MastraDocumentParserAgent().execute(INPUT),
  ]);

  const manualParsed = manualParserResult.data;
  const mastraParsed = mastraParserResult.data;

  row('Title:', manualParsed.title, mastraParsed.title);
  row(
    'Subject:',
    `${manualParsed.subject_detection.primary} (${manualParsed.subject_detection.confidence})`,
    `${mastraParsed.subject_detection.primary} (${mastraParsed.subject_detection.confidence})`,
  );
  row('Concepts found:', `${manualParsed.concepts.length}`, `${mastraParsed.concepts.length}`);
  row('Gaps detected:', `${manualParsed.gaps_detected.length}`, `${mastraParsed.gaps_detected.length}`);
  row(
    'Tokens (in/out):',
    `${manualParserResult.usage.inputTokens} / ${manualParserResult.usage.outputTokens}  (${manualParserResult.duration}ms)`,
    `${mastraParserResult.usage.inputTokens} / ${mastraParserResult.usage.outputTokens}  (${mastraParserResult.duration}ms)`,
  );

  // ── Step 2: Flashcard Generator ───────────────────────────────────────────
  sep('Step 2: Flashcard Generator');
  console.log('  Generating flashcards from each parser output in parallel...\n');

  const flashcardInput = { domain: 'dbms' as const, learningMode: 'fast' as const };

  const [manualFlashcardResult, mastraFlashcardResult] = await Promise.all([
    new ManualFlashcardGeneratorAgent().execute({ parsedContent: manualParsed, ...flashcardInput }),
    new MastraFlashcardGeneratorAgent().execute({ parsedContent: mastraParsed, ...flashcardInput }),
  ]);

  row(
    'Cards generated:',
    `${manualFlashcardResult.data.cards.length}`,
    `${mastraFlashcardResult.data.cards.length}`,
  );
  row(
    'Tokens (in/out):',
    `${manualFlashcardResult.usage.inputTokens} / ${manualFlashcardResult.usage.outputTokens}  (${manualFlashcardResult.duration}ms)`,
    `${mastraFlashcardResult.usage.inputTokens} / ${mastraFlashcardResult.usage.outputTokens}  (${mastraFlashcardResult.duration}ms)`,
  );

  const sampleManual = manualFlashcardResult.data.cards[0];
  const sampleMastra = mastraFlashcardResult.data.cards[0];
  console.log(`\n  Sample card — Manual [${sampleManual?.type}]`);
  console.log(`  Q: ${sampleManual?.front}`);
  console.log(`  A: ${sampleManual?.back.slice(0, 100)}${(sampleManual?.back.length ?? 0) > 100 ? '...' : ''}`);
  console.log(`\n  Sample card — Mastra [${sampleMastra?.type}]`);
  console.log(`  Q: ${sampleMastra?.front}`);
  console.log(`  A: ${sampleMastra?.back.slice(0, 100)}${(sampleMastra?.back.length ?? 0) > 100 ? '...' : ''}`);

  // ── Step 3: Concept Explainer (streaming, sequential) ─────────────────────
  const targetConcept = manualParsed.concepts[0];
  const explainerInput = {
    conceptId: targetConcept?.id ?? 'normalization_3NF',
    domain: 'dbms' as const,
    learningMode: 'fast' as const,
    studentContext: 'First-year CS student, new to databases.',
    conversationHistory: [],
    currentMessage: `Can you explain ${targetConcept?.name ?? '3NF'} in simple terms?`,
  };

  sep(`Step 3: Concept Explainer (streaming) — "${targetConcept?.name ?? '3NF'}"`);

  console.log('\n  [Manual stream]');
  process.stdout.write('  ');
  let chunks = 0;
  for await (const chunk of new ManualConceptExplainerAgent().stream(explainerInput)) {
    process.stdout.write(chunk);
    if (++chunks > 300) { process.stdout.write(' [truncated]'); break; }
  }

  console.log('\n\n  [Mastra stream]');
  process.stdout.write('  ');
  chunks = 0;
  for await (const chunk of new MastraConceptExplainerAgent().stream(explainerInput)) {
    process.stdout.write(chunk);
    if (++chunks > 300) { process.stdout.write(' [truncated]'); break; }
  }

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Both paths completed successfully.');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);
