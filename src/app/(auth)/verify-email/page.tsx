/**
 * WHY: Post-signup screen that tells the user to check their inbox.
 *
 * requireEmailVerification blocks sign-in until the user clicks the link
 * BetterAuth emailed them. This page also offers a "resend" button that
 * re-triggers sendVerificationEmail via the BetterAuth client.
 */

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { authClient } from '@/lib/auth-client';

function VerifyEmailInner() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResend() {
    if (!email) {
      setStatus('error');
      setErrorMessage('Missing email address.');
      return;
    }
    setStatus('sending');
    setErrorMessage(null);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/dashboard',
    });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message ?? 'Could not resend email.');
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="app-parchment-shell flex min-h-screen flex-col items-center justify-center px-4">
      <div className="manuscript-card app-fade-up w-full max-w-sm space-y-5 rounded-xl px-7 py-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          Check your inbox
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {email
            ? `We sent a verification link to ${email}. Click it to activate your account.`
            : 'We sent you a verification link. Click it to activate your account.'}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Didn't get it? Check spam, or resend below.
        </p>

        {status === 'sent' && (
          <div className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-muted, #f3f3ef)', border: '1px solid var(--border, #e5e5df)', color: 'var(--text-muted)' }}>
            Sent. Give it a minute to arrive.
          </div>
        )}

        {status === 'error' && errorMessage !== null && (
          <div className="rounded-md p-3 text-sm" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-text)' }}>
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={status === 'sending'}
          className="manuscript-button w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
          style={{ color: '#ffffff' }}
        >
          {status === 'sending' ? 'Sending…' : 'Resend verification email'}
        </button>

        <Link
          href="/login"
          className="block text-center text-sm underline underline-offset-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
