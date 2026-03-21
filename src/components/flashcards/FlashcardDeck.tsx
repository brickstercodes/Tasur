'use client';

/**
 * WHY: Manages the full flashcard review session flow.
 *
 * Responsibilities:
 *   - Displays one card at a time (FlashcardCard handles flip animation).
 *   - Shows rating buttons (Again / Hard / Good / Easy) after the card is flipped.
 *   - Submits each rating to POST /api/sessions/[id]/flashcards and advances
 *     to the next card.
 *   - Tracks per-session statistics (counts per rating) for the summary screen.
 *   - Shows a session summary when all due cards have been reviewed.
 *
 * The rating buttons are intentionally hidden until the card is flipped —
 * forcing the student to actively recall before self-grading.
 *
 * Fast vs steady mode affects the card ORDER (determined server-side in the
 * GET endpoint) and the visual emphasis: fast mode shows the exam priority
 * label, steady mode shows days overdue.
 */

import React, { useState, useCallback } from 'react';
import { FlashcardCard } from './FlashcardCard';
import type { FlashcardRating } from '@/lib/sr-algorithm';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DeckCard {
  id: string;
  concept_id: string;
  concept_name: string;
  card_type: 'recall' | 'application' | 'explain' | 'compare';
  front: string;
  back: string;
  difficulty: 'easy' | 'intermediate' | 'hard';
  hints: string[] | null;
}

interface SessionResult {
  cardId: string;
  rating: FlashcardRating;
}

export interface FlashcardDeckProps {
  cards: DeckCard[];
  sessionId: string;
  learningMode: 'fast' | 'steady';
}

// ── Rating button config ──────────────────────────────────────────────────────

const RATING_BUTTONS: Array<{
  rating: FlashcardRating;
  label: string;
  sublabel: string;
  bg: string;
  hoverBg: string;
  text: string;
}> = [
  { rating: 'again', label: 'Again',  sublabel: '< 1d',   bg: '#fee2e2', hoverBg: '#fecaca', text: '#dc2626' },
  { rating: 'hard',  label: 'Hard',   sublabel: '~1d',    bg: '#fef3c7', hoverBg: '#fde68a', text: '#d97706' },
  { rating: 'good',  label: 'Good',   sublabel: '~6d',    bg: '#dcfce7', hoverBg: '#bbf7d0', text: '#16a34a' },
  { rating: 'easy',  label: 'Easy',   sublabel: 'longer', bg: '#dbeafe', hoverBg: '#bfdbfe', text: '#2563eb' },
];

// ── Main component ────────────────────────────────────────────────────────────

export function FlashcardDeck({ cards, sessionId, learningMode }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionStartTime] = useState(() => Date.now());

  const currentCard = cards[currentIndex];
  const progress = currentIndex / cards.length;

  const handleFlip = useCallback(() => {
    setIsFlipped(true);
  }, []);

  const handleRating = useCallback(
    async (rating: FlashcardRating) => {
      if (!currentCard || isSubmitting) return;

      setIsSubmitting(true);

      try {
        await fetch(`/api/sessions/${sessionId}/flashcards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId: currentCard.id,
            conceptId: currentCard.concept_id,
            rating,
          }),
        });
      } catch {
        // Non-fatal — move forward even if the API call fails.
      }

      setResults((prev) => [...prev, { cardId: currentCard.id, rating }]);

      const nextIndex = currentIndex + 1;
      if (nextIndex >= cards.length) {
        setSessionComplete(true);
      } else {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
      }

      setIsSubmitting(false);
    },
    [currentCard, currentIndex, cards.length, sessionId, isSubmitting],
  );

  if (sessionComplete) {
    return (
      <SessionSummary
        results={results}
        totalCards={cards.length}
        durationMs={Date.now() - sessionStartTime}
        learningMode={learningMode}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Progress bar */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Card {currentIndex + 1} of {cards.length}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {learningMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
          </span>
        </div>
        <div
          style={{
            height: 4,
            background: '#e2e8f0',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: '#6366f1',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Card */}
      {currentCard && (
        <FlashcardCard
          front={currentCard.front}
          back={currentCard.back}
          cardType={currentCard.card_type}
          difficulty={currentCard.difficulty}
          conceptName={currentCard.concept_name}
          hints={currentCard.hints}
          isFlipped={isFlipped}
          onFlip={handleFlip}
        />
      )}

      {/* Rating buttons — only shown after flip */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          opacity: isFlipped ? 1 : 0,
          pointerEvents: isFlipped ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      >
        {RATING_BUTTONS.map((btn) => (
          <RatingButton
            key={btn.rating}
            {...btn}
            disabled={isSubmitting}
            onClick={() => handleRating(btn.rating)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Rating button ─────────────────────────────────────────────────────────────

function RatingButton({
  rating,
  label,
  sublabel,
  bg,
  hoverBg,
  text,
  disabled,
  onClick,
}: {
  rating: FlashcardRating;
  label: string;
  sublabel: string;
  bg: string;
  hoverBg: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 16px',
        border: 'none',
        borderRadius: 8,
        background: disabled ? '#f1f5f9' : hovered ? hoverBg : bg,
        color: disabled ? '#94a3b8' : text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.1s ease',
        minWidth: 64,
      }}
      aria-label={`Rate as ${label}`}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.8 }}>{sublabel}</span>
    </button>
  );
}

// ── Session summary ───────────────────────────────────────────────────────────

function SessionSummary({
  results,
  totalCards,
  durationMs,
  learningMode,
}: {
  results: SessionResult[];
  totalCards: number;
  durationMs: number;
  learningMode: 'fast' | 'steady';
}) {
  const counts = results.reduce(
    (acc, r) => {
      acc[r.rating] = (acc[r.rating] ?? 0) + 1;
      return acc;
    },
    {} as Record<FlashcardRating, number>,
  );

  const correct = (counts.hard ?? 0) + (counts.good ?? 0) + (counts.easy ?? 0);
  const accuracy = totalCards > 0 ? Math.round((correct / totalCards) * 100) : 0;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.floor((durationMs % 60_000) / 1000);

  return (
    <div
      style={{
        textAlign: 'center',
        padding: '32px 24px',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 8 }}>
        {accuracy >= 80 ? '🎯' : accuracy >= 50 ? '📈' : '🔁'}
      </div>

      <h2
        style={{
          margin: '0 0 4px',
          fontSize: 22,
          fontWeight: 700,
          color: '#0f172a',
        }}
      >
        Session complete
      </h2>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
        {minutes > 0 ? `${minutes}m ` : ''}{seconds}s · {learningMode} mode
      </p>

      {/* Accuracy ring */}
      <div
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: accuracy >= 80 ? '#16a34a' : accuracy >= 50 ? '#d97706' : '#dc2626',
          marginBottom: 4,
        }}
      >
        {accuracy}%
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
        accuracy ({correct} / {totalCards} correct)
      </p>

      {/* Rating breakdown */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {RATING_BUTTONS.map((btn) => (
          <div
            key={btn.rating}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '8px 14px',
              background: btn.bg,
              borderRadius: 8,
              minWidth: 52,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, color: btn.text }}>
              {counts[btn.rating] ?? 0}
            </span>
            <span style={{ fontSize: 11, color: btn.text, fontWeight: 500 }}>
              {btn.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
