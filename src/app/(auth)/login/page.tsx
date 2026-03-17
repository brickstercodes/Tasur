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
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-black px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            Sign in to Tasur
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {"Don't have an account? "}
            <Link
              href="/signup"
              className="text-black dark:text-white underline underline-offset-2"
            >
              Sign up
            </Link>
          </p>
        </div>

        {errorMessage !== null && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder-zinc-400 focus:border-black focus:outline-none dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder-zinc-600 dark:focus:border-white"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder-zinc-400 focus:border-black focus:outline-none dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder-zinc-600 dark:focus:border-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-black py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-zinc-400 dark:bg-black">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-50 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
