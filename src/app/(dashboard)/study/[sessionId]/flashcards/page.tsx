/**
 * WHY: Server component for the Phase 4 flashcard review experience.
 *
 * Fetches due flashcards for the session, joins them with concept names
 * (the card only stores concept_id, not the display name), and passes
 * the enriched deck to FlashcardDeck for client-side review.
 *
 * The "no cards due" empty state shows when next_review for all cards is
 * in the future — the page returns the earliest upcoming review time so
 * the student knows when to come back.
 *
 * URL: /study/[sessionId]/flashcards
 * Reached from the mindmap toolbar or the session dashboard.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { isDue } from '@/lib/sr-algorithm';
import { FlashcardDeck, type DeckCard } from '@/components/flashcards/FlashcardDeck';
import type { SM2State } from '@/types/database';

// ── Page props ────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function FlashcardsPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const { mode: modeParam } = await searchParams;
  const mode = modeParam === 'fast' ? 'fast' : 'steady';

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/login');
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Verify ownership and get session metadata.
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('title, learning_mode, subject_domain')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    notFound();
  }

  const effectiveMode = (sessionRow.learning_mode ?? mode) as 'fast' | 'steady';

  // Fetch flashcards + concept names in parallel.
  const [flashcardsResult, conceptsResult] = await Promise.all([
    supabase
      .from('flashcards')
      .select('id, concept_id, card_type, front, back, hints, difficulty, sr_state')
      .eq('session_id', sessionId),

    supabase
      .from('concepts')
      .select('id, name, metadata')
      .eq('session_id', sessionId),
  ]);

  const allCards = flashcardsResult.data ?? [];
  const conceptMap = new Map(
    (conceptsResult.data ?? []).map((c) => [c.id, c.name]),
  );
  const examPriorityMap: Record<string, number> = {};
  for (const c of conceptsResult.data ?? []) {
    const meta = c.metadata as { examPriority?: number } | null;
    examPriorityMap[c.id] = meta?.examPriority ?? 1;
  }

  // Split due / not-due cards.
  const dueCards = allCards.filter((card) =>
    isDue(card.sr_state as SM2State | null),
  );

  const nextReviewAt =
    dueCards.length === 0 && allCards.length > 0
      ? allCards
          .map((c) => (c.sr_state as SM2State | null)?.next_review ?? '')
          .filter(Boolean)
          .sort()[0]
      : null;

  // Enrich cards with concept names for display.
  const deckCards: DeckCard[] = dueCards.map((card) => ({
    id: card.id,
    concept_id: card.concept_id,
    concept_name: conceptMap.get(card.concept_id) ?? card.concept_id,
    card_type: card.card_type as DeckCard['card_type'],
    front: card.front,
    back: card.back,
    difficulty: card.difficulty as DeckCard['difficulty'],
    hints: card.hints,
  }));

  return (
    <div
      style={{
        fontFamily: 'Inter, sans-serif',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      {/* Breadcrumb */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 20,
        }}
      >
        <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
          Dashboard
        </Link>
        <span>›</span>
        <Link
          href={`/study/${sessionId}/mindmap`}
          style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          {sessionRow.title}
        </Link>
        <span>›</span>
        <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>Flashcards</span>
      </nav>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {allCards.length} cards total
            {dueCards.length > 0 && ` · ${dueCards.length} due now`}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: effectiveMode === 'fast' ? '#C2692A' : '#3D7A5E',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {effectiveMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
          </span>
          <Link
            href={`/study/${sessionId}/mindmap`}
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            ← Mindmap
          </Link>
        </div>
      </div>

      {/* Main content */}
      {allCards.length === 0 ? (
        <NoCardsState sessionId={sessionId} />
      ) : dueCards.length === 0 ? (
        <NoDueCardsState nextReviewAt={nextReviewAt} sessionId={sessionId} />
      ) : (
        <FlashcardDeck
          cards={deckCards}
          sessionId={sessionId}
          learningMode={effectiveMode}
        />
      )}
    </div>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

function NoCardsState({ sessionId }: { sessionId: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: 'var(--text-muted)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--text-faint)',
          margin: '0 0 10px',
        }}
      >
        No flashcards yet.
      </p>
      <p style={{ fontSize: 13, margin: '0 0 20px', color: 'var(--text-muted)' }}>
        Flashcards are generated when you study concepts in the chat.
      </p>
      <Link
        href={`/study/${sessionId}/mindmap`}
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          padding: '8px 18px',
          border: '1px solid var(--border)',
          borderRadius: 7,
        }}
      >
        Go to Mindmap
      </Link>
    </div>
  );
}

function NoDueCardsState({
  nextReviewAt,
  sessionId,
}: {
  nextReviewAt: string | null;
  sessionId: string;
}) {
  const nextReview = nextReviewAt ? new Date(nextReviewAt) : null;
  const formattedNext = nextReview
    ? nextReview.toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        color: 'var(--text-muted)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <p
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 18,
          color: 'var(--text-faint)',
          margin: '0 0 10px',
        }}
      >
        All caught up.
      </p>
      <p style={{ fontSize: 13, margin: '0 0 4px', color: 'var(--text-muted)' }}>
        No cards are due right now.
      </p>
      {formattedNext && (
        <p style={{ fontSize: 13, margin: '0 0 20px', color: 'var(--text-muted)' }}>
          Next review: <strong>{formattedNext}</strong>
        </p>
      )}
      <Link
        href={`/study/${sessionId}/mindmap`}
        style={{
          fontSize: 13,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          padding: '8px 18px',
          border: '1px solid var(--border)',
          borderRadius: 7,
        }}
      >
        Back to Mindmap
      </Link>
    </div>
  );
}
