/**
 * WHY: Server-side reCAPTCHA v3 token verification.
 *
 * The client sends a reCAPTCHA token (obtained invisibly via grecaptcha.execute).
 * This route verifies it with Google's siteverify API and checks:
 *   1. The token is valid (success: true)
 *   2. The action matches what we expect (prevents token reuse across flows)
 *   3. The score meets the threshold (0.5 = standard, 1.0 = definitely human)
 *
 * Returns 200 if the check passes, 403 if it fails.
 */

import { NextResponse } from 'next/server';

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY ?? '';
const SCORE_THRESHOLD = 0.5;

interface SiteverifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

// Error codes that indicate server/config issues — NOT a suspicious user.
// When these appear, we let the request through rather than locking everyone out.
const CONFIG_ERROR_CODES = new Set([
  'missing-input-secret',
  'invalid-input-secret',
  'bad-request',
]);

export async function POST(req: Request) {
  if (!RECAPTCHA_SECRET) {
    // If reCAPTCHA is not configured, allow the request through (dev mode)
    return NextResponse.json({ ok: true });
  }

  let body: { token?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
  }

  const { token, action } = body;

  if (!token) {
    // No token means the script didn't load — allow through gracefully
    console.warn('[recaptcha] No token provided — allowing request through');
    return NextResponse.json({ ok: true });
  }

  // Verify with Google
  const params = new URLSearchParams({
    secret: RECAPTCHA_SECRET,
    response: token,
  });

  let data: SiteverifyResponse;
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    data = await res.json();
  } catch (err) {
    console.error('[recaptcha] Failed to reach Google siteverify:', err);
    // Network failure — don't lock users out
    return NextResponse.json({ ok: true });
  }

  // Log the full response for debugging (visible in Railway logs)
  console.log('[recaptcha] Google siteverify response:', JSON.stringify(data));

  if (!data.success) {
    const errorCodes = data['error-codes'] ?? [];
    console.warn('[recaptcha] Verification failed. Error codes:', errorCodes);

    // If the failure is due to config/infra issues, let the user through.
    // This prevents a misconfigured secret key from locking ALL users out.
    const isConfigError = errorCodes.some((code) => CONFIG_ERROR_CODES.has(code));
    if (isConfigError) {
      console.error('[recaptcha] CONFIG ERROR — allowing request through. Fix your RECAPTCHA_SECRET_KEY env var.');
      return NextResponse.json({ ok: true });
    }

    // timeout-or-duplicate = token expired or reused. Could be legit (slow network).
    // Still block for safety but with a friendlier message.
    if (errorCodes.includes('timeout-or-duplicate')) {
      return NextResponse.json(
        { message: 'Verification expired — please try again.' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { message: 'reCAPTCHA verification failed', errors: errorCodes },
      { status: 403 },
    );
  }

  // Check action matches (prevents token reuse from a different page)
  if (action && data.action && data.action !== action) {
    console.warn(`[recaptcha] Action mismatch: expected "${action}", got "${data.action}"`);
    return NextResponse.json(
      { message: 'reCAPTCHA action mismatch' },
      { status: 403 },
    );
  }

  // Check score
  const score = data.score ?? 0;
  console.log(`[recaptcha] Score: ${score} (threshold: ${SCORE_THRESHOLD})`);
  if (score < SCORE_THRESHOLD) {
    return NextResponse.json(
      { message: 'Request blocked — please try again or contact support.' },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
