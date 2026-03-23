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
  { rating: 'again', label: 'Again',  sublabel: '< 1d',   bg: '#232221', hoverBg: '#2C1A0E', text: '#9B5C4A' },
  { rating: 'hard',  label: 'Hard',   sublabel: '~1d',    bg: '#232221', hoverBg: '#2C2825', text: '#9A9390' },
  { rating: 'good',  label: 'Good',   sublabel: '~6d',    bg: '#232221', hoverBg: '#1A2C25', text: '#3D7A5E' },
  { rating: 'easy',  label: 'Easy',   sublabel: 'longer', bg: '#232221', hoverBg: '#1A2535', text: '#3B6FA0' },
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
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* Header: title + card counter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 400,
            color: 'var(--text)',
            fontFamily: "'Instrument Serif', Georgia, serif",
          }}
        >
          Flashcards
        </h2>
        <span
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: 'var(--text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {currentIndex + 1} / {cards.length} CARDS
        </span>
      </div>

      {/* Progress bar — thin 2px line */}
      <div
        style={{
          height: 2,
          background: 'var(--border)',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: 'var(--primary)',
            borderRadius: 99,
            transition: 'width 0.3s ease',
          }}
        />
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
        border: '1px solid var(--border)',
        borderRadius: 6,
        background: disabled ? 'var(--surface-elevated)' : hovered ? hoverBg : bg,
        color: disabled ? 'var(--text-muted)' : text,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.1s ease',
        minWidth: 64,
        fontSize: 12,
        fontWeight: 600,
      }}
      aria-label={`Rate as ${label}`}
    >
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>{sublabel}</span>
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
        padding: '40px 24px',
        background: 'var(--bg)',
        borderRadius: 12,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <h2
        style={{
          margin: '0 0 4px',
          fontSize: 28,
          fontWeight: 400,
          color: 'var(--text)',
          fontFamily: "'Instrument Serif', Georgia, serif",
        }}
      >
        Session complete
      </h2>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-muted)' }}>
        {minutes > 0 ? `${minutes}m ` : ''}{seconds}s · {learningMode} mode
      </p>

      {/* Accuracy */}
      <div
        style={{
          fontSize: 48,
          fontWeight: 400,
          fontFamily: "'Instrument Serif', Georgia, serif",
          color: accuracy >= 80 ? '#3D7A5E' : accuracy >= 50 ? '#C2692A' : '#9B5C4A',
          marginBottom: 4,
        }}
      >
        {accuracy}%
      </div>
      <p style={{ margin: '0 0 28px', fontSize: 13, color: 'var(--text-muted)' }}>
        accuracy ({correct} / {totalCards} correct)
      </p>

      {/* Rating breakdown */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
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
              padding: '10px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              minWidth: 56,
            }}
          >
            <span style={{ fontSize: 20, fontWeight: 600, color: btn.text }}>
              {counts[btn.rating] ?? 0}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              {btn.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
