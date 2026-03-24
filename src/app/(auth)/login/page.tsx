/**
 * WHY: Login page — entry point for returning users.
 *
 * Supports two sign-in methods: email/password (form submit) and Google OAuth
 * (button click). On success, the router pushes to /dashboard. On failure, the
 * error message from BetterAuth is surfaced inline so users know what went wrong
 * without a full page reload.
 *
 * This is a client component because it manages controlled form state and calls
 * the BetterAuth browser client. Server-side session validation happens in the
 * dashboard layout, not here.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthInput } from '@/components/auth-input';
import { signIn } from '@/lib/auth-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleEmailSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await signIn.email({
      email,
      password,
      callbackURL: '/dashboard',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Sign in failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    router.push('/dashboard');
  }

  async function handleGoogleSignIn() {
    await signIn.social({
      provider: 'google',
      callbackURL: '/dashboard',
    });
  }

  return (
    <div className="app-parchment-shell flex min-h-screen flex-col items-center justify-center px-4" >
      <div className="manuscript-card app-fade-up w-full max-w-sm space-y-8 rounded-xl px-7 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            Sign in to Tasur
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {"Don't have an account? "}
            <Link
              href="/signup"
              className="underline underline-offset-2"
              style={{ color: 'var(--text)' }}
            >
              Sign up
            </Link>
          </p>
        </div>

        {errorMessage !== null && (
          <div className="rounded-md p-3 text-sm" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', color: 'var(--error-text)' }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <AuthInput
            id="email"
            label="Email"
            type="email"
            value={email}
            placeholder="you@example.com"
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
          <AuthInput
            id="password"
            label="Password"
            type="password"
            value={password}
            placeholder="••••••••"
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="manuscript-button w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
            style={{ color: '#ffffff' }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="px-2" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full rounded-md px-4 py-2 text-sm font-medium"
          style={{ border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--surface) 88%, var(--bg))', color: 'var(--text)' }}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
