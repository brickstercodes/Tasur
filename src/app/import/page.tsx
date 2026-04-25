/**
 * WHY: Public landing page for the partner-integration import flow.
 *
 * Reads URL params (source, sourceId, fileUrl, title, subject) and
 * delegates to the ImportLanding client component, which handles the
 * actual submit + auth-gate + dedup-aware redirect.
 *
 * Auth is intentionally NOT enforced here:
 *   - Unauthenticated visitors should still see the import card (gives
 *     a preview of what they're about to study before they sign up).
 *   - The auth gate sits inside the API route; the client redirects to
 *     /signup if the API returns 401.
 *
 * This is a thin server wrapper so we don't ship the page-shell HTML
 * via JS; the client component is hydrated only for interactivity.
 */

import { ImportLanding } from '@/components/import/ImportLanding';

export const metadata = {
  title: 'Import to Tasur',
  description: 'Bring this document into Tasur and start studying.',
};

export default function ImportPage() {
  return <ImportLanding />;
}
