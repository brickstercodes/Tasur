/**
 * WHY: Helpers for partner-integration imports (e.g. Notesportal's
 * "Study with Tasur" button).
 *
 * Owns three operations:
 *   1. lookup(source, sourceId)   → existing sessionId or null
 *   2. record(source, sourceId, sessionId) → insert mapping after first import
 *   3. attachUserToExistingSession(...)    → share-link-style accept + bootstrap
 *
 * Operation 3 mirrors the logic in /share/[code]/page.tsx so a second user
 * who imports the same Notesportal note gets a fresh per-user
 * understanding_state pointing at the already-processed concepts.
 */

import { createServerClient } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type ImportSource = 'notesportal';

export const ALLOWED_SOURCES: readonly ImportSource[] = ['notesportal'] as const;

/** Hostnames we accept for `fileUrl` per source.
 *  Notesportal serves files from both `.tech` (main app) and `.live`
 *  (file CDN). Keep both — we accept either. */
export const ALLOWED_FILE_HOSTS: Record<ImportSource, string[]> = {
  notesportal: [
    'notesportal.tech',
    'www.notesportal.tech',
    'note.notesportal.tech',
    'notesportal.live',
    'www.notesportal.live',
    'note.notesportal.live',
  ],
};

// ── Lookup ─────────────────────────────────────────────────────────────────

export async function lookupImportedSession(
  source: ImportSource,
  sourceId: string,
): Promise<{ sessionId: string; ownerId: string } | null> {
  const supabase = createServerClient();

  const { data } = await supabase
    .from('imported_sources')
    .select('session_id, study_sessions!inner(user_id)')
    .eq('source', source)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (!data) return null;

  // study_sessions!inner returns nested object; defensive in case shape varies.
  const studySession = (data as unknown as {
    session_id: string;
    study_sessions: { user_id: string } | { user_id: string }[];
  });

  const ownerId = Array.isArray(studySession.study_sessions)
    ? studySession.study_sessions[0]?.user_id
    : studySession.study_sessions?.user_id;

  if (!ownerId) return null;
  return { sessionId: studySession.session_id, ownerId };
}

// ── Record (after first successful import) ─────────────────────────────────

export async function recordImportedSession(
  source: ImportSource,
  sourceId: string,
  sessionId: string,
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('imported_sources')
    .upsert(
      { source, source_id: sourceId, session_id: sessionId },
      { onConflict: 'source,source_id', ignoreDuplicates: true },
    );

  if (error) {
    // Non-fatal: dedup will just miss next time. Log and continue.
    console.error('[imported-source] failed to record mapping', { source, sourceId, sessionId, error });
  }
}

// ── Record import for metrics/analytics ──────────────────────────────────────

export async function recordImportMetric(
  userId: string,
  sourceId: string,
  sessionId: string,
  isDedup: boolean,
): Promise<void> {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('notesportal_imports')
    .insert({
      user_id: userId,
      source_id: sourceId,
      session_id: sessionId,
      is_dedup: isDedup,
    });

  if (error) {
    // Non-fatal: don't block the import if metrics recording fails.
    console.error('[import-metrics] failed to record', { userId, sourceId, sessionId, error });
  }
}

// ── Attach a (different) user to an existing imported session ──────────────

/**
 * Mirrors /share/[code]/page.tsx — creates the share row + bootstraps
 * understanding_state so the user has fresh per-user progress on a
 * shared concept set.
 *
 * Idempotent: if the user is already attached (or owns the session),
 * this is a no-op.
 */
export async function attachUserToImportedSession(
  sessionId: string,
  ownerId: string,
  userId: string,
): Promise<void> {
  // Owner accessing their own session — nothing to do.
  if (ownerId === userId) return;

  const supabase = createServerClient();

  // Idempotent share record.
  await supabase
    .from('session_shares')
    .upsert(
      { session_id: sessionId, user_id: userId, shared_by: ownerId },
      { onConflict: 'session_id,user_id', ignoreDuplicates: true },
    );

  // Bootstrap understanding_state for the new user — one row per concept,
  // confidence_score=0. Idempotent via the unique index
  // idx_understanding_user_session_concept(session_id, concept_id, user_id).
  const { data: concepts } = await supabase
    .from('concepts')
    .select('id')
    .eq('session_id', sessionId);

  if (concepts?.length) {
    const rows = concepts.map((c) => ({
      session_id: sessionId,
      concept_id: c.id,
      user_id: userId,
      confidence_score: 0,
      exposure_count: 0,
    }));

    await supabase
      .from('understanding_state')
      .upsert(rows, {
        onConflict: 'session_id,concept_id,user_id',
        ignoreDuplicates: true,
      });
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

export function isAllowedSource(source: string): source is ImportSource {
  return (ALLOWED_SOURCES as readonly string[]).includes(source);
}

export function isAllowedFileUrl(source: ImportSource, fileUrl: string): boolean {
  try {
    const parsed = new URL(fileUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return ALLOWED_FILE_HOSTS[source].includes(parsed.hostname);
  } catch {
    return false;
  }
}
