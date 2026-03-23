'use client';

/**
 * WHY: Renders a single flashcard with a 3D flip animation.
 *
 * The card uses CSS 3D transforms (preserve-3d, rotateY, backface-visibility)
 * via inline React styles. The front and back faces are absolutely positioned
 * on top of each other — the back is pre-rotated 180° so it appears correct
 * after the container flips.
 *
 * The parent (FlashcardDeck) controls isFlipped state and the onFlip callback
 * so the deck can show rating buttons only after the card has been revealed.
 *
 * Card types are colour-coded to help the student recognise the retrieval
 * format at a glance: recall (blue), application (green), explain (purple),
 * compare (amber).
 */

import React, { useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlashcardCardProps {
  front: string;
  back: string;
  cardType: 'recall' | 'application' | 'explain' | 'compare';
  difficulty: 'easy' | 'intermediate' | 'hard';
  conceptName: string;
  hints: string[] | null;
  isFlipped: boolean;
  onFlip: () => void;
}

// ── Colour maps ───────────────────────────────────────────────────────────────

const CARD_TYPE_COLOUR_DARK: Record<string, { bg: string; text: string; label: string }> = {
  recall:      { bg: '#2C2B29', text: '#9A9390', label: 'Recall' },
  application: { bg: '#1A2C25', text: '#3D7A5E', label: 'Application' },
  explain:     { bg: '#28222E', text: '#9B8AAB', label: 'Explain' },
  compare:     { bg: '#2C2619', text: '#C2692A', label: 'Compare' },
};

const CARD_TYPE_COLOUR_LIGHT: Record<string, { bg: string; text: string; label: string }> = {
  recall:      { bg: '#EEECEA', text: '#78716C', label: 'Recall' },
  application: { bg: '#E4F0EC', text: '#2D6B50', label: 'Application' },
  explain:     { bg: '#EDE8F2', text: '#6B4E8A', label: 'Explain' },
  compare:     { bg: '#F5EDE3', text: '#944604', label: 'Compare' },
};

const DIFFICULTY_COLOUR: Record<string, string> = {
  easy:         '#3D7A5E',
  intermediate: '#C2692A',
  hard:         '#9B5C4A',
};

// ── Main component ────────────────────────────────────────────────────────────

export function FlashcardCard({
  front,
  back,
  cardType,
  difficulty,
  conceptName,
  hints,
  isFlipped,
  onFlip,
}: FlashcardCardProps) {
  const [hintsVisible, setHintsVisible] = useState(false);
  const { theme } = useTheme();
  const palette = theme === 'dark' ? CARD_TYPE_COLOUR_DARK : CARD_TYPE_COLOUR_LIGHT;
  const typeStyle = palette[cardType] ?? palette.recall;

  return (
    <div
      style={{
        perspective: '1200px',
        width: '100%',
        // Aspect ratio maintained via padding trick — keeps card proportional
        // at any container width.
        paddingBottom: '62%',
        position: 'relative',
        cursor: isFlipped ? 'default' : 'pointer',
      }}
      onClick={!isFlipped ? onFlip : undefined}
      role={!isFlipped ? 'button' : undefined}
      aria-label={!isFlipped ? 'Flip card to see answer' : undefined}
    >
      {/* ── 3D flip container ──────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.45s ease',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front face */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            borderRadius: 12,
            border: '1px solid var(--flash-border)',
            background: 'var(--flash-front-bg)',
            boxShadow: '0 8px 32px rgba(28,25,23,0.08)',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 24px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <CardHeader
            conceptName={conceptName}
            cardType={cardType}
            difficulty={difficulty}
            typeStyle={typeStyle}
          />

          {/* Question text */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 0',
            }}
          >
            <p
              style={{
                fontSize: 16,
                color: 'var(--flash-text)',
                lineHeight: 1.65,
                textAlign: 'center',
                margin: 0,
              }}
            >
              {front}
            </p>
          </div>

          {/* Flip hint */}
          <p
            style={{
              margin: 0,
              textAlign: 'center',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: 'var(--text-muted)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            CLICK TO REVEAL
          </p>

          {/* Hints (front side) */}
          {hints && hints.length > 0 && (
            <HintsSection
              hints={hints}
              visible={hintsVisible}
              onToggle={() => setHintsVisible((v) => !v)}
            />
          )}
        </div>

        {/* Back face — pre-rotated 180° so it reads correctly after flip */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 12,
            border: '1px solid var(--flash-border)',
            background: 'var(--flash-back-bg)',
            boxShadow: '0 8px 32px rgba(28,25,23,0.08)',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 24px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <CardHeader
            conceptName={conceptName}
            cardType={cardType}
            difficulty={difficulty}
            typeStyle={typeStyle}
          />

          {/* Answer text */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 0',
              overflowY: 'auto',
            }}
          >
            <p
              style={{
                fontSize: 15,
                color: 'var(--flash-text)',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                margin: 0,
              }}
            >
              {back}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card header (shared between front and back) ───────────────────────────────

function CardHeader({
  conceptName,
  cardType,
  difficulty,
  typeStyle,
}: {
  conceptName: string;
  cardType: string;
  difficulty: string;
  typeStyle: { bg: string; text: string; label: string };
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        flexShrink: 0,
      }}
    >
      {/* Concept name */}
      <span
        style={{
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          maxWidth: 160,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={conceptName}
      >
        {conceptName}
      </span>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Card type badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: typeStyle.text,
            background: typeStyle.bg,
            borderRadius: 4,
            padding: '2px 7px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {typeStyle.label}
        </span>

        {/* Difficulty dot */}
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: DIFFICULTY_COLOUR[difficulty] ?? '#94a3b8',
            display: 'inline-block',
          }}
          title={difficulty}
        />
      </div>
    </div>
  );
}

// ── Hints section ─────────────────────────────────────────────────────────────

function HintsSection({
  hints,
  visible,
  onToggle,
}: {
  hints: string[];
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ marginTop: 10, flexShrink: 0 }}>
      <button
        onClick={(e) => {
          e.stopPropagation(); // don't trigger card flip
          onToggle();
        }}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 5,
          padding: '3px 10px',
          fontSize: 11,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {visible ? 'Hide hints' : `Show hint${hints.length > 1 ? 's' : ''}`}
      </button>

      {visible && (
        <ul
          style={{
            margin: '8px 0 0',
            paddingLeft: 16,
            listStyle: 'disc',
          }}
        >
          {hints.map((hint, i) => (
            <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
              {hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
