/**
 * WHY: SM-2 spaced repetition algorithm for flashcard scheduling.
 *
 * SM-2 is the algorithm behind Anki and SuperMemo. It keeps cards that the
 * student finds easy out of the queue for longer and brings back difficult
 * cards sooner. The core mechanic: a "quality" score (0–5) after each review
 * drives both the next interval and the ease factor adjustment.
 *
 * Tasur maps four UX rating buttons to SM-2 quality scores:
 *   Again → 0  (complete failure — interval resets)
 *   Hard  → 3  (correct but with effort)
 *   Good  → 4  (correct with some thought)
 *   Easy  → 5  (correct instantly)
 *
 * sortByPriority respects the orchestrator's exam priority override so that
 * flashcards for high-exam-weight concepts surface first in fast mode.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

// ── SM-2 state ────────────────────────────────────────────────────────────────

/** Serialised SM-2 state stored in flashcards.sr_state (JSONB). */
export interface SM2State {
  interval: number;      // days until next review
  ease_factor: number;   // difficulty multiplier (min 1.3)
  repetitions: number;   // consecutive successful reviews
  next_review: string;   // ISO date string
}

// ── Rating type ───────────────────────────────────────────────────────────────

export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';

// ── SM-2 constants ────────────────────────────────────────────────────────────

/** Quality score the SM-2 formula receives per button press. */
const RATING_QUALITY: Record<FlashcardRating, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

const MINIMUM_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;
const FIRST_INTERVAL_DAYS = 1;
const SECOND_INTERVAL_DAYS = 6;
const MS_PER_DAY = 86_400_000;

// ── Core SM-2 functions ───────────────────────────────────────────────────────

/**
 * Returns a fresh SM2State for a card that has never been reviewed.
 * next_review is set to now so the card appears immediately.
 */
export function getInitialSRState(): SM2State {
  return {
    interval: 0,
    ease_factor: INITIAL_EASE_FACTOR,
    repetitions: 0,
    next_review: new Date().toISOString(),
  };
}

/**
 * Applies one SM-2 review and returns the updated SM2State.
 *
 * For a failing rating (quality < 3):
 *   - Repetitions reset to 0, interval returns to 1 day.
 *   - EF is penalised (minimum 1.3).
 *
 * For a passing rating (quality ≥ 3):
 *   - Interval grows according to the SM-2 sequence:
 *       rep 0 → 1 day, rep 1 → 6 days, rep n → prev_interval × EF
 *   - EF updated by: EF += 0.1 - (5 - q) × (0.08 + (5 - q) × 0.02)
 */
export function updateSR(state: SM2State, rating: FlashcardRating): SM2State {
  const quality = RATING_QUALITY[rating];

  if (quality < 3) {
    return {
      interval: FIRST_INTERVAL_DAYS,
      ease_factor: Math.max(MINIMUM_EASE_FACTOR, state.ease_factor - 0.2),
      repetitions: 0,
      next_review: daysFromNow(FIRST_INTERVAL_DAYS),
    };
  }

  let newInterval: number;
  if (state.repetitions === 0) {
    newInterval = FIRST_INTERVAL_DAYS;
  } else if (state.repetitions === 1) {
    newInterval = SECOND_INTERVAL_DAYS;
  } else {
    newInterval = Math.round(state.interval * state.ease_factor);
  }

  // SM-2 ease factor update formula
  const newEaseFactor = Math.max(
    MINIMUM_EASE_FACTOR,
    state.ease_factor +
      0.1 -
      (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );

  return {
    interval: newInterval,
    ease_factor: newEaseFactor,
    repetitions: state.repetitions + 1,
    next_review: daysFromNow(newInterval),
  };
}

/**
 * Returns true when a card is due for review (next_review ≤ now).
 * Cards with no SR state are always due.
 */
export function isDue(state: SM2State | null): boolean {
  if (!state) return true;
  return new Date(state.next_review) <= new Date();
}

/**
 * Converts a flashcard rating into a confidence delta for understanding_state.
 *
 * The confidence is blended rather than set directly so a single flashcard
 * session doesn't swing the student's overall understanding score too sharply.
 * Blend weight is 30% new signal, 70% existing score.
 */
export function ratingToConfidenceScore(rating: FlashcardRating): number {
  switch (rating) {
    case 'again': return 0.0;
    case 'hard':  return 0.4;
    case 'good':  return 0.7;
    case 'easy':  return 1.0;
  }
}

/**
 * Blends a flashcard rating into an existing confidence score.
 * 70% existing + 30% new signal — preserves momentum while updating.
 */
export function blendConfidence(
  existingConfidence: number,
  rating: FlashcardRating,
): number {
  const newSignal = ratingToConfidenceScore(rating);
  const blended = 0.7 * existingConfidence + 0.3 * newSignal;
  return Math.max(0, Math.min(1, blended));
}

// ── Priority sort ─────────────────────────────────────────────────────────────

interface SortableCard {
  id: string;
  concept_id: string;
  sr_state: unknown;
}

/**
 * Sorts flashcards by review priority for the current session.
 *
 * Fast mode  — exam priority first, then overdue days descending.
 *              (student is cramming: high-value concepts before deep drilling)
 *
 * Steady mode — overdue days descending first, then exam priority.
 *               (student is building understanding: worst gaps first)
 *
 * Cards with no SR state (never reviewed) always come first — they are the
 * most information-dense since the student hasn't seen them yet.
 *
 * @param cards           Flashcards to sort.
 * @param examPriorities  Map of concept_id → examPriority (1–3 from .mm depth).
 * @param mode            Learning mode controls the tiebreaker order.
 */
export function sortByPriority(
  cards: SortableCard[],
  examPriorities: Record<string, number>,
  mode: 'fast' | 'steady',
): SortableCard[] {
  const now = new Date();

  return [...cards].sort((a, b) => {
    const srA = a.sr_state as SM2State | null;
    const srB = b.sr_state as SM2State | null;

    // Never-reviewed cards always come first
    if (!srA && srB) return -1;
    if (srA && !srB) return 1;

    const overdueDaysA = srA
      ? Math.max(0, (now.getTime() - new Date(srA.next_review).getTime()) / MS_PER_DAY)
      : 999;
    const overdueDaysB = srB
      ? Math.max(0, (now.getTime() - new Date(srB.next_review).getTime()) / MS_PER_DAY)
      : 999;

    const priorityA = examPriorities[a.concept_id] ?? 0;
    const priorityB = examPriorities[b.concept_id] ?? 0;

    if (mode === 'fast') {
      const prioDiff = priorityB - priorityA;
      if (prioDiff !== 0) return prioDiff;
      return overdueDaysB - overdueDaysA;
    } else {
      const overdueDiff = overdueDaysB - overdueDaysA;
      if (overdueDiff !== 0) return overdueDiff;
      return priorityB - priorityA;
    }
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
