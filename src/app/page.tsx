/**
 * WHY: Temporary landing page placeholder.
 *
 * Renders a minimal "Coming Soon" screen while core features are in development.
 * This will be replaced by the real session-start / upload flow in a later module.
 */

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--text)' }}>
        Tasur — Coming Soon
      </h1>
      <p className="mt-4 text-lg" style={{ color: 'var(--text-muted)' }}>
        تصور — conception, visualization.
      </p>
    </main>
  );
}
