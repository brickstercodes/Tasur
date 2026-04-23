/**
 * WHY: Login page — entry point for returning users.
 *
 * Supports two sign-in modes: password (default) and OTP (email code).
 * The OTP path is the fallback when a user has forgotten their password —
 * BetterAuth emails a 6-digit code that completes the sign-in.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthInput } from '@/components/auth-input';
import { authClient, signIn } from '@/lib/auth-client';
import { getRecaptchaToken, verifyRecaptcha } from '@/lib/recaptcha';

const isDev = process.env.NODE_ENV === 'development';

type Mode = 'password' | 'otp';
type OtpStep = 'request' | 'verify';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [otpStep, setOtpStep] = useState<OtpStep>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function runRecaptcha(action: string): Promise<boolean> {
    if (isDev) return true;
    try {
      const token = await getRecaptchaToken(action);
      if (token) {
        const result = await verifyRecaptcha(token, action);
        if (!result.ok) {
          setErrorMessage(result.message ?? 'Verification failed — please try again.');
          return false;
        }
      }
    } catch {
      console.warn('reCAPTCHA verification skipped due to error');
    }
    return true;
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    if (!(await runRecaptcha('login'))) {
      setIsSubmitting(false);
      return;
    }

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

  async function handleRequestOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    if (!(await runRecaptcha('login_otp'))) {
      setIsSubmitting(false);
      return;
    }

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'sign-in',
    });

    setIsSubmitting(false);
    if (error) {
      setErrorMessage(error.message ?? 'Could not send code. Please try again.');
      return;
    }
    setOtpStep('verify');
    setInfoMessage(`We emailed a 6-digit code to ${email}.`);
  }

  async function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await signIn.emailOtp({ email, otp });

    if (error) {
      setErrorMessage(error.message ?? 'Invalid or expired code.');
      setIsSubmitting(false);
      return;
    }

    router.push('/dashboard');
  }

  function switchMode(next: Mode) {
    setMode(next);
    setOtpStep('request');
    setOtp('');
    setPassword('');
    setErrorMessage(null);
    setInfoMessage(null);
  }

  return (
    <div className="app-parchment-shell flex min-h-screen flex-col items-center justify-center px-4">
      <div className="manuscript-card app-fade-up w-full max-w-sm space-y-6 rounded-xl px-7 py-8">
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

        {infoMessage !== null && errorMessage === null && (
          <div className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-muted, #f3f3ef)', border: '1px solid var(--border, #e5e5df)', color: 'var(--text-muted)' }}>
            {infoMessage}
          </div>
        )}

        {mode === 'password' ? (
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
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
        ) : otpStep === 'request' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <AuthInput
              id="email"
              label="Email"
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="manuscript-button w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
              style={{ color: '#ffffff' }}
            >
              {isSubmitting ? 'Sending code…' : 'Send me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <AuthInput
              id="otp"
              label="6-digit code"
              type="text"
              value={otp}
              placeholder="123456"
              autoComplete="one-time-code"
              onChange={(event) => setOtp(event.target.value.trim())}
            />
            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="manuscript-button w-full rounded-md py-2 text-sm font-medium disabled:opacity-50"
              style={{ color: '#ffffff' }}
            >
              {isSubmitting ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setOtpStep('request'); setOtp(''); setInfoMessage(null); }}
              className="w-full text-xs underline underline-offset-2"
              style={{ color: 'var(--text-muted)' }}
            >
              Use a different email
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => switchMode(mode === 'password' ? 'otp' : 'password')}
          className="w-full text-sm underline underline-offset-2"
          style={{ color: 'var(--text-muted)' }}
        >
          {mode === 'password' ? 'Login with OTP instead' : 'Use password instead'}
        </button>
      </div>
    </div>
  );
}
