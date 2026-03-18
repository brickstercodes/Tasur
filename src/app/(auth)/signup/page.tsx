/**
 * WHY: Signup page — account creation for new users.
 *
 * Collects name, email, and password. On success, BetterAuth creates the user
 * record and session, then the router pushes to /dashboard. The name field is
 * required by BetterAuth's default user schema and used in future personalization.
 *
 * Client component for the same reason as login/page.tsx: controlled form state
 * and BetterAuth browser client calls.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthInput } from '@/components/auth-input';
import { signUp } from '@/lib/auth-client';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await signUp.email({
      name,
      email,
      password,
      callbackURL: '/dashboard',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Sign up failed. Please try again.');
      setIsSubmitting(false);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-black px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {'Already have an account? '}
            <Link
              href="/login"
              className="text-black dark:text-white underline underline-offset-2"
            >
              Sign in
            </Link>
          </p>
        </div>

        {errorMessage !== null && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <AuthInput
            id="name"
            label="Name"
            type="text"
            value={name}
            placeholder="Aisha Khan"
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-black py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
