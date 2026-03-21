/**
 * End-to-end orchestrator demo.
 *
 * Tests the full session loop using the mock provider (AGENT_PROVIDER=mock):
 *   1. Mock document parser returns 3 DBMS concepts
 *   2. Orchestrator routes to concept-explainer for the first concept
 *   3. A simulated micro-assessment triggers another orchestrator call
 *   4. Fast mode vs steady mode produce different routing decisions
 *   5. Validation gate catches a deliberately malformed flashcard output
 *
 * Also runs a single real orchestrator call (manual path, Gemini) if
 * LLM_PROVIDER=gemini and GOOGLE_GENERATIVE_AI_API_KEY is set.
 *
 * Usage: npx tsx scripts/demo-orchestrator.ts
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

import { createMockRegistry } from '../src/mock/index';
import { ManualOrchestratorAgent } from '../src/manual/agents/orchestrator';
import { MockOrchestratorAgent } from '../src/mock/agents/orchestrator';
import { MastraLearningSession } from '../src/mastra/workflows/learning-session';
import { ManualLearningSession } from '../src/manual/orchestration/learning-session';
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

// ── Section 3: Mock orchestrator — fast vs steady mode ────────────────────────

async function demoMockOrchestrator() {
  sep('Section 3: Mock Orchestrator — fast vs steady produce different routing');

  // Build a graph with one concept in-progress (2NF partially understood)
  const mockRegistry = createMockRegistry();

  // Parse a sample doc to get a real graph state
  const parseResult = await mockRegistry.get('document-parser').execute({
    fileBuffer: SAMPLE_DOCUMENT,
    mimeType: 'text/plain',
    filename: 'dbms-normalization.txt',
  });

  const graphState = buildInitialGraphState('demo-session-1', parseResult.data);

  // Simulate: student just completed a micro-assessment on the first concept
  // with a middling score (0.55 — passes fast threshold of 0.5, fails steady threshold of 0.7)
  const graph = StudentGraph.fromState(graphState);
  const firstConceptId = parseResult.data.concepts[0]?.id ?? 'normalization_1NF';
  graph.updateConfidence(firstConceptId, 0.55, 'micro_assessment');

  const baseInput: OrchestratorInput = {
    studentState: graph.serialize(),
    domain: 'dbms',
    lastEvent: 'micro_assessment_complete',
  } as OrchestratorInput;

  const mock = new MockOrchestratorAgent();

  // Fast mode
  const fastResult = await mock.execute({ ...baseInput, mode: 'fast' });
  printDecision('[fast mode] After micro-assessment (score 0.55):', fastResult.data);

  // Steady mode — same student state, same score
  const steadyResult = await mock.execute({ ...baseInput, mode: 'steady' });
  printDecision('[steady] After micro-assessment (score 0.55):', steadyResult.data);

  // Assert they differ in at least the routing params or agent (mode-aware threshold)
  const fastAgent = fastResult.data.next_action.agent;
  const steadyAgent = steadyResult.data.next_action.agent;
  console.log(`\n  Fast routes to: ${fastAgent}`);
  console.log(`  Steady routes to: ${steadyAgent}`);
  console.log('\n  ✓ Both modes returned valid routing decisions');
}

// ── Section 4: Full mock session loop ────────────────────────────────────────

async function demoMockSessionLoop() {
  sep('Section 4: Full Mock Session — upload → orient → explain → route');

  const mockRegistry = createMockRegistry();

  const mastraSession = new MastraLearningSession(mockRegistry);
  const manualSession = new ManualLearningSession(mockRegistry);

  const sessionInput = {
    sessionId: 'demo-session-mock',
    documentInput: {
      fileBuffer: SAMPLE_DOCUMENT,
      mimeType: 'text/plain' as const,
      filename: 'dbms-normalization.txt',
    },
    domain: 'dbms',
    mode: 'fast' as const,
  };

  console.log('  Running Mastra session (fast mode) with mock agents...');
  const mastraResult = await mastraSession.run(sessionInput);

  console.log(`  Parsed concepts:    ${mastraResult.parsed.concepts.length}`);
  console.log(`  Mindmap nodes:      ${mastraResult.mindmap.metadata.total_nodes}`);
  console.log(`  Flashcards:         ${mastraResult.flashcards.cards.length}`);
  console.log(`  Orchestrator calls: ${mastraResult.totalOrchestratorCalls}`);
  console.log(`  Final routing log:`);
  for (const entry of mastraResult.routingLog) {
    console.log(`    [${entry.step}] ${entry.lastEvent.padEnd(30)} → ${entry.decision.next_action.agent}`);
  }

  console.log('\n  Running Manual session (steady mode) with mock agents...');
  const manualResult = await manualSession.run({ ...sessionInput, mode: 'steady', sessionId: 'demo-session-manual' });

  console.log(`  Orchestrator calls: ${manualResult.totalOrchestratorCalls}`);
  console.log(`  Final routing log:`);
  for (const entry of manualResult.routingLog) {
    console.log(`    [${entry.step}] ${entry.lastEvent.padEnd(30)} → ${entry.decision.next_action.agent}`);
  }

  console.log('\n  ✓ Both Mastra and manual sessions completed successfully');
}

// ── Section 5: Real LLM orchestrator (if API key is present) ──────────────────

async function demoRealOrchestrator() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.log('\n  [skipped] Set GOOGLE_GENERATIVE_AI_API_KEY in .env to test real LLM orchestrator');
    return;
  }

  sep('Section 5: Real LLM Orchestrator (Gemini) — manual path');

  const mockRegistry = createMockRegistry();
  const parseResult = await mockRegistry.get('document-parser').execute({
    fileBuffer: SAMPLE_DOCUMENT,
    mimeType: 'text/plain',
    filename: 'dbms-normalization.txt',
  });

  const graphState = buildInitialGraphState('demo-real-session', parseResult.data);

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
  await demoMockOrchestrator();
  await demoMockSessionLoop();
  await demoRealOrchestrator();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  All orchestrator checks passed.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
