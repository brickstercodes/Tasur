/**
 * WHY: Lightweight server-side guardrail for user-supplied "custom instructions"
 * on the upload flow.
 *
 * The goal is not to build a comprehensive content-safety system — that's the
 * underlying model's job. The goal is to reject obvious prompt-injection attempts
 * and enforce a reasonable length cap before the text ever reaches the LLM prompt.
 *
 * Patterns checked:
 *   • Classic prompt-injection phrases ("ignore previous instructions", "you are now", …)
 *   • Attempts to reference or override the system prompt
 *   • Jailbreak keywords
 *   • Inline HTML/script tags (XSS-style injection into XML output)
 *
 * This runs on the server only — never import from client components.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GuardrailResult {
  ok: true;
  sanitised: string; // trimmed + normalised whitespace
}

export interface GuardrailRejection {
  ok: false;
  reason: string; // human-readable message suitable for showing to the user
}

export type GuardrailOutcome = GuardrailResult | GuardrailRejection;

// ── Config ────────────────────────────────────────────────────────────────────

/** Hard limit on custom instructions length (characters). */
const MAX_LENGTH = 500;

/**
 * Patterns that strongly suggest prompt injection or jailbreak intent.
 * Kept intentionally broad — false positives here just mean the user
 * gets a friendly error; a false negative means bad input reaches the LLM.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|all|the|your)\s+(instruction|prompt|rule|guideline)/i,
  /forget\s+(your|all|the|previous|everything)/i,
  /you\s+are\s+now\s+(a|an|the)\b/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /\bact\s+as\s+(a|an|if)\b/i,
  /\bjailbreak\b/i,
  /override\s+(your|all|the)\s+(instruction|prompt|rule)/i,
  /disregard\s+(your|all|the|previous)/i,
  /\bsystem\s+prompt\b/i,
  /\bnew\s+instructions?\b/i,
  /do\s+not\s+follow\b/i,
  /instead\s+of\s+(the\s+above|your\s+(instruction|task|goal))/i,
  /<\/?script/i,
  /\bprompt\s+inject/i,
  /\bDAN\b/, // "Do Anything Now" jailbreak
  /\[INST\]|\[\/INST\]/i, // Llama instruction tags injected into content
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate and sanitise a user-supplied custom instructions string.
 *
 * @param raw - The raw string from the form field (may be undefined/null/empty).
 * @returns GuardrailResult with the cleaned string, or GuardrailRejection with
 *          a reason string if the input fails any check.
 *
 * An undefined / empty input always passes and returns an empty `sanitised` string,
 * since the field is optional.
 */
export function validateCustomInstructions(raw: string | null | undefined): GuardrailOutcome {
  // Empty / missing — perfectly fine, field is optional
  if (!raw || raw.trim() === '') {
    return { ok: true, sanitised: '' };
  }

  const trimmed = raw.trim();

  // Length check
  if (trimmed.length > MAX_LENGTH) {
    return {
      ok: false,
      reason: `Custom instructions must be ${MAX_LENGTH} characters or fewer (yours: ${trimmed.length}).`,
    };
  }

  // Injection pattern checks
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        ok: false,
        reason:
          'Your custom instructions contain content that looks like a prompt injection attempt. Please describe how you want the AI to present your study material instead.',
      };
    }
  }

  return { ok: true, sanitised: trimmed };
}
