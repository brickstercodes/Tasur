/**
 * WHY: Client-side helper to get a reCAPTCHA v3 token.
 *
 * reCAPTCHA v3 runs invisibly — no checkbox, no image challenge. It returns a
 * token that the server verifies with Google to get a bot-likelihood score (0–1).
 *
 * Usage:
 *   const token = await getRecaptchaToken('signup');
 *   // send token to /api/auth/verify-recaptcha
 */

declare global {
  interface Window {
    grecaptcha: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';

/**
 * Executes reCAPTCHA v3 and returns a token for server-side verification.
 * Returns null if reCAPTCHA is not loaded (e.g. missing site key, script blocked).
 */
export function getRecaptchaToken(action: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!SITE_KEY || typeof window === 'undefined' || !window.grecaptcha) {
      resolve(null);
      return;
    }

    window.grecaptcha.ready(async () => {
      try {
        const token = await window.grecaptcha.execute(SITE_KEY, { action });
        resolve(token);
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Verifies a reCAPTCHA token via the server-side endpoint.
 * Returns { ok: true } if the score is above threshold, { ok: false, message } otherwise.
 */
export async function verifyRecaptcha(
  token: string,
  action: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/auth/verify-recaptcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, message: data.message || 'Verification failed' };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: 'Network error during verification' };
  }
}
