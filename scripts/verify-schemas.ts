/**
 * Schema smoke test — calls schema.parse() with a valid example object for each schema.
 * Run with: npx tsx scripts/verify-schemas.ts
 * Exits with code 0 on success, 1 on any parse failure.
 */

import { explainerOutputSchema } from '@/lib/schemas/explainer-output';
import { flashcardOutputSchema } from '@/lib/schemas/flashcard-output';
import { mindmapTreeOutputSchema } from '@/lib/schemas/mindmap-tree-output';
import { orchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import { documentParserOutputSchema } from '@/lib/schemas/parser-output';

let passed = 0;
let failed = 0;

function verify(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

// ── 1. Document Parser Output ──────────────────────────────────────────────

verify('parser-output', () => {
  documentParserOutputSchema.parse({
    title: 'Chapter 5: Normalization',
    subject_detection: {
      primary: 'DBMS',
      confidence: 0.95,
      domain_template: 'dbms_v1',
    },
    concepts: [
      {
        id: 'normalization_1NF',
        name: 'First Normal Form',
        raw_content: 'Extracted text about 1NF...',
        prerequisites: [],
        complexity: 'foundational',
        keywords: ['atomic values', 'repeating groups'],
      },
      {
        id: 'normalization_2NF',
        name: 'Second Normal Form',
        raw_content: 'Extracted text about 2NF...',
        prerequisites: ['normalization_1NF'],
        complexity: 'intermediate',
        keywords: ['partial dependency', 'candidate key'],
      },
    ],
    concept_relationships: [
      { from: 'normalization_1NF', to: 'normalization_2NF', type: 'prerequisite' },
    ],
    gaps_detected: ['BCNF mentioned but not explained — web augmentation recommended'],
  });
});

// ── 2. Mindmap Tree Output (hierarchical) ──────────────────────────────────

verify('mindmap-tree-output (hierarchical with 3-level nesting)', () => {
  mindmapTreeOutputSchema.parse({
    title: 'Database Normalization',
    subject: 'DBMS',
    children: [
      {
        id: 'functional_dependencies',
        label: 'Functional Dependencies',
        concept_id: 'functional_dep',
        children: [
          {
            label: 'Definition',
            content: 'X → Y means values of X uniquely determine values of Y',
            children: [
              { label: 'Full FD: removal of any attribute from X breaks the dependency' },
              { label: 'Partial FD: proper subset of X can determine Y (violates 2NF)' },
              { label: 'Transitive FD: X → Y → Z implies X → Z (violates 3NF)' },
            ],
          },
          {
            label: "Armstrong's Axioms",
            content: 'Rules for deriving new FDs from existing ones',
            children: [
              { label: 'Reflexivity: if Y ⊆ X, then X → Y' },
              { label: 'Augmentation: if X → Y, then XZ → YZ' },
              { label: 'Transitivity: if X → Y and Y → Z, then X → Z' },
            ],
          },
        ],
      },
      {
        id: 'normal_forms',
        label: 'Normal Forms',
        concept_id: 'normalization_overview',
        children: [
          {
            id: '1nf',
            label: 'First Normal Form (1NF)',
            concept_id: 'normalization_1NF',
            content: 'Atomic values, no repeating groups, unique rows',
            study_cue: 'Think: one value per cell in a spreadsheet',
            children: [
              { label: 'All attributes contain only atomic (indivisible) values' },
              { label: 'No repeating groups or arrays' },
              { label: 'Each row identified by a primary key' },
            ],
          },
          {
            id: '2nf',
            label: 'Second Normal Form (2NF)',
            concept_id: 'normalization_2NF',
            content: '1NF + no partial dependencies on composite key',
            children: [
              { label: 'Only relevant when primary key is composite' },
              { label: 'Every non-prime attribute fully depends on entire candidate key' },
              { label: 'Fix: decompose table to remove partial dependencies' },
            ],
          },
        ],
      },
    ],
    metadata: {
      total_nodes: 14,
      max_depth: 3,
      concept_ids_covered: [
        'functional_dep',
        'normalization_overview',
        'normalization_1NF',
        'normalization_2NF',
      ],
    },
  });
});

verify('mindmap-tree-output (minimal leaf-only tree)', () => {
  mindmapTreeOutputSchema.parse({
    title: 'Quick Overview',
    subject: 'OS',
    children: [
      { label: 'Processes', children: [{ label: 'PCB' }, { label: 'Context Switch' }] },
    ],
    metadata: { total_nodes: 3, max_depth: 2, concept_ids_covered: [] },
  });
});

// ── 3. Concept Explainer Output ────────────────────────────────────────────

verify('explainer-output (explanation turn)', () => {
  explainerOutputSchema.parse({
    message_type: 'explanation',
    content: 'First Normal Form (1NF) means every column in a table contains atomic values...',
    visual_suggestion: null,
    micro_assessment: null,
    conversation_complete: false,
    handoff_signal: null,
  });
});

verify('explainer-output (micro_assessment turn)', () => {
  explainerOutputSchema.parse({
    message_type: 'micro_assessment',
    content: 'Let me check your understanding.',
    visual_suggestion: {
      type: 'table',
      data: { headers: ['Column', 'Value'], rows: [] },
    },
    micro_assessment: {
      question:
        'If a table has partial dependency on a candidate key, what normal form is it violating?',
      expected_understanding: 'Student should identify this as a 2NF violation.',
      difficulty: 'intermediate',
    },
    conversation_complete: true,
    handoff_signal: 'ready_for_orchestrator',
  });
});

// ── 4. Orchestrator Output ─────────────────────────────────────────────────

verify('orchestrator-output (with understanding_update)', () => {
  orchestratorOutputSchema.parse({
    understanding_update: {
      concept_id: 'normalization_3NF',
      new_confidence: 0.6,
      evidence: 'Confused BCNF with 3NF in micro-assessment',
    },
    next_action: {
      agent: 'concept-explainer',
      params: {
        concept_id: 'normalization_bcnf',
        approach: 'compare_contrast_with_3NF',
        depth: 'detailed',
      },
    },
    reasoning:
      'Student shows partial 3NF understanding but conflates with BCNF. Clarify the distinction.',
  });
});

verify('orchestrator-output (null understanding_update)', () => {
  orchestratorOutputSchema.parse({
    understanding_update: null,
    next_action: {
      agent: 'flashcard-generator',
      params: { sessionId: 'session_abc' },
    },
    reasoning: 'Session initialized — generating initial flashcard deck.',
  });
});

verify('orchestrator-output (session_complete)', () => {
  orchestratorOutputSchema.parse({
    understanding_update: null,
    next_action: {
      agent: 'session_complete',
      params: {},
    },
    reasoning: 'All high-priority concepts covered. Session complete.',
  });
});

// ── 5. Flashcard Output ────────────────────────────────────────────────────

verify('flashcard-output', () => {
  flashcardOutputSchema.parse({
    cards: [
      {
        id: 'card_001',
        concept_id: 'normalization_3NF',
        type: 'recall',
        front: 'What is the key difference between 3NF and BCNF?',
        back: 'In BCNF every determinant must be a candidate key. 3NF allows non-prime attributes to determine other non-prime attributes under certain conditions.',
        difficulty: 'intermediate',
        tags: ['normalization', 'normal_forms'],
        hints: ['Think about which attributes can be determinants...'],
      },
      {
        id: 'card_002',
        concept_id: 'normalization_2NF',
        type: 'application',
        front:
          'A table has columns (OrderID, ProductID, ProductName, Quantity). Which columns violate 2NF and why?',
        back: 'ProductName depends only on ProductID (partial dependency). It should move to a Products table.',
        difficulty: 'intermediate',
        tags: ['normalization', '2NF', 'partial_dependency'],
        hints: ['Identify which columns depend on ALL primary key columns vs. just part of it.'],
      },
    ],
  });
});

// ── Result ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
