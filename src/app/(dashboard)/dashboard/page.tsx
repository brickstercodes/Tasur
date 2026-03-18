/**
 * WHY: Placeholder dashboard — the landing page after sign-in.
 *
 * Module 4 only needs auth to work end-to-end (signup → login → dashboard → logout).
 * This page satisfies that without building any study features yet. It will be
 * replaced in Module 5 when the document upload and session management UI lands.
 *
 * No session read here — the parent layout (src/app/(dashboard)/layout.tsx) already
 * validated the session and would have redirected if it was missing. This page just
 * renders content.
 */

export default function DashboardPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-white">
        Dashboard
      </h1>
      <p className="text-zinc-500">Welcome to Tasur. Your sessions will appear here.</p>
    </div>
  );
}
