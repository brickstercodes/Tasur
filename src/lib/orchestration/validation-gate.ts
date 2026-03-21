/**
 * WHY: Lightweight quality gate that runs on specialist output BEFORE it reaches the student.
 *
 * This is a CODE check, not an LLM call — it must be fast and free. It answers:
 * "Is this output structurally acceptable to show to a student?" not "Is this
 * output great?" Quality of content is handled by prompts and few-shot examples.
 *
 * Three validators, one per specialist type that produces student-facing output:
 *   - validateMindmapCoverage: ensures the visual tree covers ≥80% of parsed concepts
 *   - validateFlashcards: ensures every card has non-empty front and back text
 *   - validateExplainerOutput: ensures the explainer turn matches the required schema shape
 *
 * All validators return a `ValidationResult` with a boolean and a human-readable
 * reason on failure. The orchestrator uses the boolean to decide whether to pass
 * the output through or request a retry.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

import type { ExplainerOutput } from '@/lib/schemas/explainer-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Minimum fraction of parsed concept IDs that must appear in the mindmap tree. */
const MINDMAP_COVERAGE_THRESHOLD = 0.8;

// ── Return type ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  /** Human-readable explanation — only present when `valid` is false. */
  reason?: string;
}

// ── Mindmap validator ─────────────────────────────────────────────────────────

/**
 * Checks that the mindmap's `concept_ids_covered` contains at least
 * MINDMAP_COVERAGE_THRESHOLD of the concept IDs returned by the document parser.
 *
 * We compare against `parsedConceptIds` (the source of truth from the parser)
 * rather than the graph state because the graph may have been augmented since
 * the mindmap was generated, which would make the check unfairly strict.
 */
export function validateMindmapCoverage(
  mindmap: MindmapTreeOutput,
  parsedConceptIds: string[],
): ValidationResult {
  if (parsedConceptIds.length === 0) {
    return { valid: true };
  }

  const covered = new Set(mindmap.metadata.concept_ids_covered);
  const coveredCount = parsedConceptIds.filter((id) => covered.has(id)).length;
  const coverageRatio = coveredCount / parsedConceptIds.length;

  if (coverageRatio < MINDMAP_COVERAGE_THRESHOLD) {
    const coveredPct = Math.round(coverageRatio * 100);
    const thresholdPct = Math.round(MINDMAP_COVERAGE_THRESHOLD * 100);
    return {
      valid: false,
      reason:
        `Mindmap covers ${coveredPct}% of parsed concepts but threshold is ${thresholdPct}%. ` +
        `Missing: ${parsedConceptIds.filter((id) => !covered.has(id)).join(', ')}.`,
    };
  }

  return { valid: true };
}

// ── Flashcard validator ───────────────────────────────────────────────────────

/**
 * Checks that every flashcard has non-empty front and back text.
 *
 * The flashcard schema enforces types but not content length — an LLM can
 * technically return empty strings and pass schema validation. This gate
 * catches those cases before cards reach the student's deck.
 */
export function validateFlashcards(output: FlashcardOutput): ValidationResult {
  if (output.cards.length === 0) {
    return {
      valid: false,
      reason: 'Flashcard output contains zero cards.',
    };
  }

  const emptyCards = output.cards.filter(
    (card) => card.front.trim().length === 0 || card.back.trim().length === 0,
  );

  if (emptyCards.length > 0) {
    const ids = emptyCards.map((c) => c.id).join(', ');
    return {
      valid: false,
      reason: `${emptyCards.length} card(s) have empty front or back text: ${ids}.`,
    };
  }

  return { valid: true };
}

// ── Explainer output validator ────────────────────────────────────────────────

/**
 * Checks that the explainer output has the required fields for the frontend
 * to render a conversation turn.
 *
 * We do not re-run Zod here — the agent already validated at the boundary.
 * This check exists for the runtime case where the agent skips schema
 * validation (e.g., in mock or test environments) and output arrives
 * as plain JSON without passing through Zod.parse().
 */
export function validateExplainerOutput(output: ExplainerOutput): ValidationResult {
  if (!output.content || output.content.trim().length === 0) {
    return {
      valid: false,
      reason: 'Explainer output has empty content field — student would see a blank message.',
    };
  }

  const validMessageTypes = [
    'explanation',
    'analogy',
    'example',
    'micro_assessment',
    'clarification',
  ] as const;

  if (!validMessageTypes.includes(output.message_type)) {
    return {
      valid: false,
      reason: `Unknown message_type "${output.message_type}". Frontend cannot style this turn.`,
    };
  }

  // A micro_assessment turn must include the assessment question
  if (output.message_type === 'micro_assessment' && !output.micro_assessment?.question) {
    return {
      valid: false,
      reason: 'Turn is typed as micro_assessment but has no assessment question.',
    };
  }

  return { valid: true };
}
