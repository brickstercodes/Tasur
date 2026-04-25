/**
 * WHY: When an unauthenticated user clicks "Study with Tasur" on a partner
 * site, the /import page stashes the import params in sessionStorage and
 * redirects to /signup. After a successful sign-up the router pushes to
 * /dashboard — but the user actually wants to be back on /import to
 * complete the action that sent them here in the first place.
 *
 * This component mounts once on the dashboard, checks sessionStorage for
 * a pending import, and (if present) replaces the URL with /import?...
 * before the dashboard fully renders. The session storage entry is
 * cleared so a future sign-in doesn't redirect again.
 *
 * Renders nothing — it's a side-effect-only component.
 */

'use client';

import { useEffect } from 'react';

import {
  AUTOSUBMIT_FLAG_STORAGE_KEY,
  PENDING_IMPORT_STORAGE_KEY,
} from './ImportLanding';

interface PendingImport {
  source?: string;
  sourceId?: string;
  fileUrl?: string;
  title?: string;
  subject?: string;
}

export function PendingImportRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_IMPORT_STORAGE_KEY);
    } catch {
      return; // private mode or storage disabled
    }
    if (!raw) return;

    let pending: PendingImport;
    try {
      pending = JSON.parse(raw) as PendingImport;
    } catch {
      sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY);
      return;
    }

    // Defensive: require the four fields the import page itself requires.
    if (!pending.source || !pending.sourceId || !pending.fileUrl || !pending.title) {
      sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY);
      return;
    }

    // One-shot — clear before navigating so this never loops. Set the
    // autosubmit flag so /import auto-fires the submit on arrival (the
    // user's intent was already captured before signup).
    try {
      sessionStorage.removeItem(PENDING_IMPORT_STORAGE_KEY);
      sessionStorage.setItem(AUTOSUBMIT_FLAG_STORAGE_KEY, '1');
    } catch {
      /* non-fatal */
    }

    const url = new URL('/import', window.location.origin);
    url.searchParams.set('source', pending.source);
    url.searchParams.set('sourceId', pending.sourceId);
    url.searchParams.set('fileUrl', pending.fileUrl);
    url.searchParams.set('title', pending.title);
    if (pending.subject) url.searchParams.set('subject', pending.subject);

    // Use replace so the dashboard doesn't sit in history between hops.
    window.location.replace(url.toString());
  }, []);

  return null;
}
