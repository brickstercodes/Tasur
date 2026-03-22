/**
 * WHY: Client-side sign-out button, isolated from the server dashboard layout.
 *
 * The dashboard layout (src/app/(dashboard)/layout.tsx) is a server component
 * that can't attach event listeners or call signOut(). This tiny client component
 * bridges that gap: it lives inside the server layout and handles the interactive
 * sign-out action, redirecting to /login on success.
 */

'use client';

import { useRouter } from 'next/navigation';

import { signOut } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  return (
    <button
      onClick={handleSignOut}
      className="sign-out-btn"
      style={{ fontFamily: 'inherit' }}
    >
      Sign out
    </button>
  );
}
