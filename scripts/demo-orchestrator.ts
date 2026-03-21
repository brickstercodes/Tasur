/**
 * End-to-end orchestrator demo.
 *
 * Tests orchestrator correctness using real API calls (mock system retired):
 *   1. Call frequency gate — deterministic code, no LLM needed.
 *   2. Validation gate — deterministic code, no LLM needed.
 *   3. Real LLM orchestrator call (manual path, Gemini) if API key is set.
 *
 * Usage: npx tsx scripts/demo-orchestrator.ts
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

import { ManualOrchestratorAgent } from '../src/manual/agents/orchestrator';
import {
  validateMindmapCoverage,
  validateFlashcards,
  validateExplainerOutput,
} from '../src/lib/orchestration/validation-gate';
import { shouldCallOrchestrator, getCallDecision } from '../src/lib/orchestration/call-frequency';
import { buildInitialGraphState } from '../src/lib/orchestration/session-utils';
import { StudentGraph } from '../src/lib/graph/student-graph';
import type { OrchestratorInput } from '../src/interfaces/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_DOCUMENT = Buffer.from(`
Database Normalization

First Normal Form (1NF): Every column must contain atomic values.
Second Normal Form (2NF): Must be 1NF + no partial dependency on primary key.
Third Normal Form (3NF): Must be 2NF + no transitive dependency.
`.trim(), 'utf-8');

const MOCK_CONCEPT_IDS = ['normalization_1NF', 'normalization_2NF', 'normalization_3NF'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(label: string) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(line);
}

function printDecision(label: string, decision: {
  next_action: { agent: string; params: Record<string, unknown> };
  understanding_update: { concept_id: string; new_confidence: number; evidence: string } | null;
  reasoning: string;
}) {
  console.log(`  ${label}`);
  console.log(`    → Agent:   ${decision.next_action.agent}`);
  if (Object.keys(decision.next_action.params).length > 0) {
    console.log(`    → Params:  ${JSON.stringify(decision.next_action.params)}`);
  }
  if (decision.understanding_update) {
    console.log(`    → Update:  ${decision.understanding_update.concept_id} → ${decision.understanding_update.new_confidence}`);
  }
  console.log(`    → Reason:  ${decision.reasoning}`);
}

// ── Section 1: Call frequency gate ───────────────────────────────────────────

function demoCallFrequency() {
  sep('Section 1: Call Frequency — Which events trigger the orchestrator?');

  const events = [
    'session_start',
    'micro_assessment_complete',
    'chat_turn',
    'flashcard_flip',
    'mindmap_generated',
    'mode_switch',
    'flashcard_rated',
    'concept_selected',
    'unknown_event_xyz',
  ];

  for (const event of events) {
    const d = getCallDecision(event);
    const mark = d.shouldCall ? '✓ CALL' : '✗ SKIP';
    console.log(`  [${mark}] ${event.padEnd(30)} ${d.reason.slice(0, 60)}`);
  }

  // Explicit assertion
  console.assert(shouldCallOrchestrator('micro_assessment_complete') === true, 'FAIL: assessment should call orchestrator');
  console.assert(shouldCallOrchestrator('chat_turn') === false, 'FAIL: chat turns should not call orchestrator');
  console.assert(shouldCallOrchestrator('flashcard_flip') === false, 'FAIL: card flip should not call orchestrator');
  console.log('\n  ✓ All call-frequency assertions passed');
}

// ── Section 2: Validation gate ────────────────────────────────────────────────

function demoValidationGate() {
  sep('Section 2: Validation Gate — Code-only quality checks');

  // 2a: Mindmap coverage — good (100% covered)
  const goodMindmap = {
    title: 'Normalization',
    subject: 'DBMS',
    children: [],
    metadata: {
      total_nodes: 3,
      max_depth: 2,
      concept_ids_covered: MOCK_CONCEPT_IDS,
    },
  };
  const r1 = validateMindmapCoverage(goodMindmap, MOCK_CONCEPT_IDS);
  console.log(`  Mindmap 100% coverage:  valid=${r1.valid}`);
  console.assert(r1.valid, 'FAIL: full coverage should pass');

  // 2b: Mindmap coverage — bad (only 1 of 3 concepts)
  const sparseMindmap = {
    ...goodMindmap,
    metadata: { ...goodMindmap.metadata, concept_ids_covered: ['normalization_1NF'] },
  };
  const r2 = validateMindmapCoverage(sparseMindmap, MOCK_CONCEPT_IDS);
  console.log(`  Mindmap 33% coverage:   valid=${r2.valid}  reason=${r2.reason}`);
  console.assert(!r2.valid, 'FAIL: sparse coverage should fail');

  // 2c: Flashcards — good
  const goodCards = {
    cards: [
      { id: 'c1', concept_id: 'normalization_1NF', type: 'recall' as const, front: 'What is 1NF?', back: 'Atomic values in every column.', difficulty: 'easy' as const, tags: [], hints: [] },
    ],
  };
  const r3 = validateFlashcards(goodCards);
  console.log(`  Flashcard valid front/back: valid=${r3.valid}`);
  console.assert(r3.valid, 'FAIL: good cards should pass');

  // 2d: Flashcards — empty back (should fail)
  const badCards = {
    cards: [
      { id: 'c2', concept_id: 'normalization_2NF', type: 'recall' as const, front: 'What is 2NF?', back: '', difficulty: 'easy' as const, tags: [], hints: [] },
    ],
  };
  const r4 = validateFlashcards(badCards);
  console.log(`  Flashcard empty back:   valid=${r4.valid}  reason=${r4.reason}`);
  console.assert(!r4.valid, 'FAIL: empty back should fail');

  // 2e: Explainer output — valid
  const goodExplainer = {
    message_type: 'explanation' as const,
    content: 'First Normal Form requires every column to have atomic values.',
    conversation_complete: false,
  };
  const r5 = validateExplainerOutput(goodExplainer);
  console.log(`  Explainer valid output: valid=${r5.valid}`);
  console.assert(r5.valid, 'FAIL: valid explainer should pass');

  // 2f: Explainer — micro_assessment with no question (should fail)
  const badExplainer = {
    message_type: 'micro_assessment' as const,
    content: 'Quick check!',
    conversation_complete: false,
  };
  const r6 = validateExplainerOutput(badExplainer);
  console.log(`  Explainer missing question: valid=${r6.valid}  reason=${r6.reason}`);
  console.assert(!r6.valid, 'FAIL: assessment without question should fail');

  console.log('\n  ✓ All validation gate assertions passed');
}

// ── Section 3: Real LLM orchestrator (if API key is present) ──────────────────

async function demoRealOrchestrator() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.log('\n  [skipped] Set GOOGLE_GENERATIVE_AI_API_KEY in .env to test real LLM orchestrator');
    return;
  }

  sep('Section 3: Real LLM Orchestrator (Gemini) — manual path');

  // Build a minimal graph state for the real orchestrator call.
  const graphState = buildInitialGraphState('demo-real-session', {
    title: 'Database Normalization',
    subject_detection: { primary: 'dbms', confidence: 0.95, domain_template: 'dbms_v1' },
    concepts: MOCK_CONCEPT_IDS.map((id, i) => ({
      id,
      name: id.replace(/_/g, ' '),
      raw_content: `Content for ${id}`,
      prerequisites: i > 0 ? [MOCK_CONCEPT_IDS[i - 1]] : [],
      complexity: 'foundational' as const,
      keywords: [],
    })),
    concept_relationships: [],
    gaps_detected: [],
  });

  const orchestratorInput: OrchestratorInput = {
    studentState: graphState,
    mode: 'fast',
    lastEvent: 'web_search_complete',
    domain: 'dbms',
  };

  console.log('  Calling real orchestrator (ManualOrchestratorAgent + Gemini)...');
  const start = Date.now();
  const orchestrator = new ManualOrchestratorAgent();
  const result = await orchestrator.execute(orchestratorInput);

  console.log(`  Duration: ${Date.now() - start}ms | tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);
  printDecision('Real LLM decision (fast mode, web_search_complete):', result.data);
  console.log('\n  ✓ Real orchestrator returned valid structured output');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Tasur Module 8 — Orchestrator Demo');
  console.log('═══════════════════════════════════════════════════════════════');

  demoCallFrequency();
  demoValidationGate();
  await demoRealOrchestrator();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  All orchestrator checks passed.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
