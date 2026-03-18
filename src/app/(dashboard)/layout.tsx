/**
 * WHY: Server layout that gates every dashboard route behind a valid session.
 *
 * All pages inside the (dashboard) route group inherit this layout. It does two
 * things beyond rendering children:
 *
 *   1. Session validation — calls auth.api.getSession() server-side. If there is
 *      no valid session (expired, tampered cookie, or missing), it hard-redirects
 *      to /login. This is the authoritative check; the middleware (src/middleware.ts)
 *      is only a fast first-pass that runs at the edge without full crypto validation.
 *
 *   2. Persistent header — displays the app name, the signed-in user's email, and
 *      the sign-out button so users always know who they're logged in as.
 *
 * The SignOutButton is a thin client component because event handlers can't live
 * in server components. Everything else here runs on the server, so session data
 * never touches the browser.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SignOutButton } from '@/components/sign-out-button';
import { auth } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Middleware should have already redirected — this is the safety net for
  // cases where middleware is bypassed (direct server calls, tests, etc.).
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm font-semibold tracking-tight text-black dark:text-white">
            Tasur
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
