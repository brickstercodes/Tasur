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

import { TasurWordmark } from '@/components/ui/TasurWordmark';
import { ProfileMenu } from '@/components/ui/ProfileMenu';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { PendingImportRedirect } from '@/components/import/PendingImportRedirect';
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
    <div className="app-parchment-shell" style={{ minHeight: '100vh' }}>
      {/* One-shot client effect: bounce back to /import if a partner-button
          flow was interrupted by signup. Renders nothing. */}
      <PendingImportRedirect />
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--nav-bg) 86%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--primary) 18%, var(--nav-border))',
          backdropFilter: 'blur(10px)',
          padding: '0 24px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '1536px',
            margin: '0 auto',
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
          }}
        >
          {/* Left spacer */}
          <div />

          {/* Centre: wordmark as focal point */}
          <TasurWordmark size={38} color="var(--logo)" />

          {/* Right: controls flush to the edge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
            <ThemeToggle />
            <ProfileMenu
              initial={(session.user.name ?? session.user.email ?? 'U').trim().charAt(0).toUpperCase()}
              email={session.user.email ?? ''}
            />
          </div>
        </div>
      </header>

      <main style={{ padding: '40px 24px' }}>{children}</main>
    </div>
  );
}
