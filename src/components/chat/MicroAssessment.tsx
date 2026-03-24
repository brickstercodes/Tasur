'use client';

/**
 * WHY: Inline assessment component rendered inside the chat when the Concept
 * Explainer agent produces a `micro_assessment` in its response.
 *
 * Fast mode  → yes/no buttons for quick comprehension checks (MCQ-style).
 * Steady mode → free-text textarea so the student must articulate understanding.
 *
 * Design: "Scholarly Canvas" system — forest green (#3D7A5E) tertiary accent
 * signals an interactive checkpoint. Background uses tonal layering (no hard
 * borders) to sit distinctly above the parchment chat blocks.
 */

import React, { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MicroAssessmentProps {
  question: string;
  difficulty: 'easy' | 'intermediate' | 'hard';
  learningMode: 'fast' | 'steady';
  questionType?: 'self_check' | 'open';
  /** True when loaded from history and the student already answered. */
  initialSubmitted?: boolean;
  onSubmit: (answer: string) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FOREST_GREEN = '#3D7A5E';
const GREEN_SURFACE = 'rgba(61, 122, 94, 0.07)';
const GREEN_BORDER  = 'rgba(61, 122, 94, 0.18)';

const FAST_MODE_OPTIONS = [
  { label: 'Got it', value: 'Yes, I understand.' },
  { label: 'Not yet', value: 'Not quite sure yet.' },
] as const;

// Difficulty uses semantic palette from DESIGN.md
const DIFFICULTY_META: Record<string, { label: string; color: string }> = {
  easy:         { label: 'Easy',         color: '#3D7A5E' }, // forest green
  intermediate: { label: 'Intermediate', color: '#7A6C2A' }, // warm gold
  hard:         { label: 'Hard',         color: '#9B5C4A' }, // terracotta
};

// ── Main component ────────────────────────────────────────────────────────────

export function MicroAssessment({
  question,
  difficulty,
  learningMode,
  questionType = 'open',
  initialSubmitted = false,
  onSubmit,
}: MicroAssessmentProps) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(initialSubmitted);

  function handleFastSubmit(value: string) {
    setSubmitted(true);
    onSubmit(value);
  }

  function handleSteadySubmit() {
    if (!answer.trim()) return;
    setSubmitted(true);
    onSubmit(answer.trim());
  }

  return (
    <>
      <style>{`
        .micro-btn-yes:hover  { background: ${FOREST_GREEN} !important; color: #fff !important; }
        .micro-btn-not:hover  { background: rgba(61,122,94,0.1) !important; }
        .micro-submit:hover:not(:disabled) { background: #2E5E47 !important; }
        .micro-textarea:focus { border-bottom: 2px solid ${FOREST_GREEN} !important; outline: none; }
      `}</style>

      <div
        style={{
          margin: '4px 0 0',
          padding: '20px 20px 18px',
          // Tonal layering: green-tinted surface, distinct from cream parchment
          background: GREEN_SURFACE,
          borderLeft: `3px solid ${FOREST_GREEN}`,
          borderRadius: '0 10px 10px 0',
          // Ambient shadow per DESIGN.md — warm occlusion, not muddy gray
          boxShadow: '0 4px 16px rgba(28,25,23,0.06), inset 0 1px 0 rgba(255,255,255,0.5)',
        }}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {/* Icon-dot */}
          <span
            style={{
              display: 'inline-block',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: FOREST_GREEN,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: 9,
              fontWeight: 700,
              color: FOREST_GREEN,
              textTransform: 'uppercase' as const,
              letterSpacing: '0.14em',
            }}
          >
            Check your understanding
          </span>
          <DifficultyBadge difficulty={difficulty} />
        </div>

        {/* ── Question ──────────────────────────────────────────────────────── */}
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 13.5,
            color: 'var(--text)',
            lineHeight: 1.65,
            fontFamily: "'Georgia', serif",
            fontWeight: 400,
          }}
        >
          {question}
        </p>

        {/* ── Answer input ──────────────────────────────────────────────────── */}
        {submitted ? (
          <p
            style={{
              margin: 0,
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: 11,
              color: FOREST_GREEN,
              letterSpacing: '0.04em',
            }}
          >
            ✓ Answer submitted
          </p>
        ) : learningMode === 'fast' && questionType === 'self_check' ? (
          <FastModeButtons onSelect={handleFastSubmit} />
        ) : (
          <SteadyModeInput
            answer={answer}
            onChange={setAnswer}
            onSubmit={handleSteadySubmit}
          />
        )}
      </div>
    </>
  );
}

// ── Fast mode: yes/no buttons ─────────────────────────────────────────────────

function FastModeButtons({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="micro-btn-yes"
        onClick={() => onSelect(FAST_MODE_OPTIONS[0].value)}
        style={{
          padding: '7px 18px',
          border: `1px solid ${GREEN_BORDER}`,
          borderRadius: 8,
          background: 'var(--surface-elevated)',
          color: FOREST_GREEN,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          transition: 'background 0.12s ease, color 0.12s ease',
          letterSpacing: '0.01em',
        }}
      >
        {FAST_MODE_OPTIONS[0].label}
      </button>
      <button
        className="micro-btn-not"
        onClick={() => onSelect(FAST_MODE_OPTIONS[1].value)}
        style={{
          padding: '7px 18px',
          border: `1px solid ${GREEN_BORDER}`,
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
          transition: 'background 0.12s ease',
          letterSpacing: '0.01em',
        }}
      >
        {FAST_MODE_OPTIONS[1].label}
      </button>
    </div>
  );
}

// ── Steady mode: free-text textarea ──────────────────────────────────────────

function SteadyModeInput({
  answer,
  onChange,
  onSubmit,
}: {
  answer: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canSubmit = answer.trim().length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      onSubmit();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        className="micro-textarea"
        value={answer}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer… (Ctrl+Enter to submit)"
        rows={3}
        style={{
          width: '100%',
          padding: '10px 0 8px',
          // Underline-only per DESIGN.md input spec
          border: 'none',
          borderBottom: `1px solid ${GREEN_BORDER}`,
          borderRadius: 0,
          fontSize: 13,
          color: 'var(--text)',
          background: 'transparent',
          resize: 'none',
          fontFamily: "'Georgia', serif",
          lineHeight: 1.6,
          boxSizing: 'border-box' as const,
          transition: 'border-bottom 0.15s ease',
        }}
      />
      <button
        className="micro-submit"
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          alignSelf: 'flex-end',
          padding: '7px 20px',
          border: 'none',
          borderRadius: 8,
          background: canSubmit ? FOREST_GREEN : 'rgba(61,122,94,0.15)',
          color: canSubmit ? '#fff' : 'rgba(61,122,94,0.45)',
          fontSize: 12,
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.02em',
          transition: 'background 0.12s ease',
        }}
      >
        Submit
      </button>
    </div>
  );
}

// ── Difficulty badge ──────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const meta = DIFFICULTY_META[difficulty] ?? { label: difficulty, color: '#9A9390' };

  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 9,
        fontWeight: 700,
        color: meta.color,
        background: `${meta.color}18`,
        borderRadius: 4,
        padding: '2px 7px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
      }}
    >
      {meta.label}
    </span>
  );
}
