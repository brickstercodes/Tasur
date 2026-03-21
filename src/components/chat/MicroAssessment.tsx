'use client';

/**
 * WHY: Inline assessment component rendered inside the chat when the Concept
 * Explainer agent produces a `micro_assessment` in its response.
 *
 * Fast mode  → yes/no buttons for quick comprehension checks (MCQ-style).
 * Steady mode → free-text textarea so the student must articulate understanding.
 *
 * The `onSubmit` callback sends the answer back to ChatInterface, which
 * includes it in the next POST request with isAssessmentSubmit=true.
 * The orchestrator then evaluates the answer and updates confidence_score.
 *
 * The `expected_understanding` rubric is intentionally never shown to the
 * student — it is only used by the orchestrator for evaluation.
 */

import React, { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MicroAssessmentProps {
  question: string;
  difficulty: 'easy' | 'intermediate' | 'hard';
  learningMode: 'fast' | 'steady';
  onSubmit: (answer: string) => void;
}

// ── Fast-mode answers ─────────────────────────────────────────────────────────

// Fast mode presents two options: confident yes or uncertain no.
const FAST_MODE_OPTIONS = [
  { label: 'Yes, I got it', value: 'Yes, I understand.' },
  { label: 'Not quite', value: 'Not quite sure yet.' },
] as const;

// ── Difficulty colour map ─────────────────────────────────────────────────────

const DIFFICULTY_COLOUR: Record<string, string> = {
  easy: '#16a34a',
  intermediate: '#d97706',
  hard: '#dc2626',
};

// ── Main component ────────────────────────────────────────────────────────────

export function MicroAssessment({
  question,
  difficulty,
  learningMode,
  onSubmit,
}: MicroAssessmentProps) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

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
    <div
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        border: '1px solid #e0e7ff',
        borderLeft: '4px solid #6366f1',
        borderRadius: 8,
        background: '#fafafe',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#6366f1',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Check your understanding
        </span>
        <DifficultyBadge difficulty={difficulty} />
      </div>

      {/* Question */}
      <p
        style={{
          margin: '0 0 12px',
          fontSize: 14,
          color: '#1e293b',
          lineHeight: 1.5,
          fontWeight: 500,
        }}
      >
        {question}
      </p>

      {/* Answer input */}
      {submitted ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: '#6366f1',
            fontStyle: 'italic',
          }}
        >
          Answer submitted — waiting for response…
        </p>
      ) : learningMode === 'fast' ? (
        <FastModeButtons onSelect={handleFastSubmit} />
      ) : (
        <SteadyModeInput
          answer={answer}
          onChange={setAnswer}
          onSubmit={handleSteadySubmit}
        />
      )}
    </div>
  );
}

// ── Fast mode: yes/no buttons ─────────────────────────────────────────────────

function FastModeButtons({
  onSelect,
}: {
  onSelect: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {FAST_MODE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          style={{
            padding: '6px 16px',
            border: '1px solid #c7d2fe',
            borderRadius: 6,
            background: '#fff',
            color: '#4338ca',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.1s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#e0e7ff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          }}
        >
          {opt.label}
        </button>
      ))}
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
    // Ctrl/Cmd + Enter submits without requiring the button.
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      onSubmit();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={answer}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your answer… (Ctrl+Enter to submit)"
        rows={3}
        style={{
          width: '100%',
          padding: '8px 10px',
          border: '1px solid #c7d2fe',
          borderRadius: 6,
          fontSize: 13,
          color: '#1e293b',
          background: '#fff',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
        onFocus={(e) => {
          e.currentTarget.style.border = '1px solid #6366f1';
        }}
        onBlur={(e) => {
          e.currentTarget.style.border = '1px solid #c7d2fe';
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          alignSelf: 'flex-end',
          padding: '6px 18px',
          border: 'none',
          borderRadius: 6,
          background: canSubmit ? '#6366f1' : '#e2e8f0',
          color: canSubmit ? '#fff' : '#94a3b8',
          fontSize: 13,
          fontWeight: 500,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          transition: 'background 0.1s ease',
        }}
      >
        Submit
      </button>
    </div>
  );
}

// ── Difficulty badge ──────────────────────────────────────────────────────────

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colour = DIFFICULTY_COLOUR[difficulty] ?? '#64748b';

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: colour,
        border: `1px solid ${colour}`,
        borderRadius: 4,
        padding: '1px 6px',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {difficulty}
    </span>
  );
}
