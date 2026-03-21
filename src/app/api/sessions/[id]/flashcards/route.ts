/**
 * WHY: Flashcard review API — the SM-2 scheduling and confidence feedback loop.
 *
 * Two handlers:
 *   GET  — returns all due flashcards for this session, sorted by priority.
 *           "Due" means sr_state is null (never reviewed) or next_review ≤ now.
 *           Exam priority comes from concept metadata stored in the concepts table.
 *
 *   POST — submits a rating for one card. Updates:
 *           1. flashcards.sr_state   — new SM-2 interval/EF via updateSR()
 *           2. understanding_state   — blended confidence via blendConfidence()
 *           3. student_graphs        — in-memory graph sync so the orchestrator
 *              sees the updated confidence on its next call.
 *
 * Both handlers verify session ownership before touching any data.
 * The service-role Supabase client bypasses RLS — auth is enforced in code.
 */

import { type NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { loadFromSupabase, syncToSupabase } from '@/lib/graph/sync';
import {
  isDue,
  updateSR,
  blendConfidence,
  sortByPriority,
  type FlashcardRating,
} from '@/lib/sr-algorithm';
import type { SM2State } from '@/types/database';

// ── GET: due flashcards ───────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const { id: sessionId } = await params;
  const mode = (request.nextUrl.searchParams.get('mode') ?? 'steady') as
    | 'fast'
    | 'steady';
  const limit = Math.min(
    50,
    parseInt(request.nextUrl.searchParams.get('limit') ?? '20'),
  );

  const supabase = createServerClient();

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch flashcards and concept metadata in parallel — independent queries.
  const [flashcardsResult, conceptsResult] = await Promise.all([
    supabase
      .from('flashcards')
      .select('id, concept_id, card_type, front, back, hints, difficulty, sr_state')
      .eq('session_id', sessionId),

    supabase
      .from('concepts')
      .select('id, metadata')
      .eq('session_id', sessionId),
  ]);

  if (flashcardsResult.error) {
    return Response.json({ error: 'Failed to load flashcards' }, { status: 500 });
  }

  const allCards = flashcardsResult.data ?? [];

  // Build exam priority map from concept metadata (set by the .mm parser depth).
  const examPriorities: Record<string, number> = {};
  for (const concept of conceptsResult.data ?? []) {
    const meta = concept.metadata as { examPriority?: number } | null;
    examPriorities[concept.id] = meta?.examPriority ?? 1;
  }

  // Filter to due cards only, then sort by priority.
  const dueCards = allCards.filter((card) =>
    isDue(card.sr_state as SM2State | null),
  );

  const sorted = sortByPriority(dueCards, examPriorities, mode).slice(0, limit);

  // Find the earliest next-review date among non-due cards (for empty-state UI).
  const nonDueCards = allCards.filter(
    (card) => !isDue(card.sr_state as SM2State | null),
  );
  const nextReviewAt =
    nonDueCards.length > 0
      ? nonDueCards
          .map((c) => (c.sr_state as SM2State | null)?.next_review ?? '')
          .filter(Boolean)
          .sort()[0]
      : null;

  return Response.json({
    cards: sorted,
    totalDue: dueCards.length,
    totalCards: allCards.length,
    nextReviewAt,
  });
}

// ── POST request shape ────────────────────────────────────────────────────────

interface RatingRequestBody {
  cardId: string;
  conceptId: string;
  rating: FlashcardRating;
}

// ── POST: submit rating ───────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const { id: sessionId } = await params;
  const body: RatingRequestBody = await request.json();
  const { cardId, conceptId, rating } = body;

  const supabase = createServerClient();

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Fetch the current SR state for this card.
  const { data: cardRow } = await supabase
    .from('flashcards')
    .select('id, sr_state')
    .eq('id', cardId)
    .eq('session_id', sessionId)
    .single();

  if (!cardRow) {
    return Response.json({ error: 'Card not found' }, { status: 404 });
  }

  const currentSR = (cardRow.sr_state as SM2State | null) ?? {
    interval: 0,
    ease_factor: 2.5,
    repetitions: 0,
    next_review: new Date().toISOString(),
  };

  const newSR = updateSR(currentSR, rating);

  // Run SR update and understanding_state update in parallel — independent writes.
  const [srUpdateResult, understandingResult] = await Promise.all([
    supabase
      .from('flashcards')
      // Cast to satisfy Supabase's Json type — SM2State is a plain serialisable object.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ sr_state: newSR as any })
      .eq('id', cardId),

    supabase
      .from('understanding_state')
      .select('id, confidence_score, exposure_count')
      .eq('session_id', sessionId)
      .eq('concept_id', conceptId)
      .maybeSingle(),
  ]);

  if (srUpdateResult.error) {
    return Response.json({ error: 'Failed to update SR state' }, { status: 500 });
  }

  // Upsert understanding_state with blended confidence.
  const existing = understandingResult.data;
  const newConfidence = blendConfidence(
    existing?.confidence_score ?? 0,
    rating,
  );

  if (existing) {
    await supabase
      .from('understanding_state')
      .update({
        confidence_score: newConfidence,
        exposure_count: existing.exposure_count + 1,
        last_assessed_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('understanding_state').insert({
      session_id: sessionId,
      user_id: appUserId,
      concept_id: conceptId,
      confidence_score: newConfidence,
      exposure_count: 1,
      last_assessed_at: new Date().toISOString(),
    });
  }

  // Sync the in-memory graph so the orchestrator sees the updated confidence
  // on its next call. Non-fatal if student_graphs row doesn't exist yet.
  try {
    const graph = await loadFromSupabase(sessionId);
    if (graph) {
      graph.updateConfidence(conceptId, newConfidence, 'flashcard');
      await syncToSupabase(graph);
    }
  } catch {
    // Graph sync failure is non-fatal — SR and understanding_state are already updated.
  }

  return Response.json({
    newSRState: newSR,
    newConfidence,
  });
}
