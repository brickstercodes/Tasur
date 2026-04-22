/**
 * WHY: Auth group layout — loads the reCAPTCHA v3 script for login + signup.
 *
 * reCAPTCHA v3 runs invisibly in the background (no user interaction needed).
 * The script is loaded only on auth pages so it doesn't bloat the rest of the app.
 */

import Script from 'next/script';

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';
const isDev = process.env.NODE_ENV === 'development';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {!isDev && RECAPTCHA_SITE_KEY && (
        <Script
          src={`https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`}
          strategy="afterInteractive"
        />
      )}
      {children}
      {/* Required by Google ToS when hiding the reCAPTCHA badge */}
      {!isDev && (
        <p
          style={{
            position: 'fixed',
            bottom: 8,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--text-faint, #999)',
            opacity: 0.5,
            pointerEvents: 'auto',
          }}
        >
          Protected by reCAPTCHA.{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Privacy</a>
          {' · '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Terms</a>
        </p>
      )}
    </>
  );
}
