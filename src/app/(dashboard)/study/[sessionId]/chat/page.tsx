/**
 * WHY: Server component for the Phase 2 conversational study interface.
 *
 * Reached via `/study/[sessionId]/chat?conceptId=<id>` — the MindmapViewer
 * pushes students here when they click a concept node.
 *
 * This page:
 *   1. Validates auth + session ownership (guard before any DB queries).
 *   2. Fetches the concept name and session metadata in parallel.
 *   3. Fetches prerequisites, mindmap study cue, and source document in parallel.
 *   4. Renders a two-column layout: chat on the left, FocusZone sidebar on right.
 *
 * Missing conceptId or a concept that doesn't belong to the session both
 * return 404 — guards against URL manipulation.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { FocusZone } from '@/components/chat/FocusZone';

// ── Page props ────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ conceptId?: string }>;
}

// ── Helper: traverse mindmap tree to find study_cue for a concept ─────────────

function findStudyCue(node: Record<string, unknown>, targetConceptId: string): string | undefined {
  if (node.concept_id === targetConceptId && node.study_cue) {
    return node.study_cue as string;
  }
  const children = node.children as Record<string, unknown>[] | undefined;
  if (children) {
    for (const child of children) {
      const result = findStudyCue(child, targetConceptId);
      if (result) return result;
    }
  }
  return undefined;
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function ChatPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const { conceptId } = await searchParams;

  if (!conceptId) {
    notFound();
  }

  // Auth gate — layout also guards, but we check here to get the user id
  // for the session ownership query below.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect('/login');
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Fetch session metadata and concept details in parallel.
  const [sessionResult, conceptResult] = await Promise.all([
    supabase
      .from('study_sessions')
      .select('title, learning_mode, subject_domain, user_id')
      .eq('id', sessionId)
      .eq('user_id', appUserId)
      .single(),

    supabase
      .from('concepts')
      .select('id, name')
      .eq('id', conceptId)
      .eq('session_id', sessionId)
      .single(),
  ]);

  if (sessionResult.error || !sessionResult.data) {
    notFound();
  }

  if (conceptResult.error || !conceptResult.data) {
    notFound();
  }

  const { title: sessionTitle, learning_mode: learningMode, subject_domain } = sessionResult.data;
  const { name: conceptName } = conceptResult.data;
  const domain = subject_domain ?? 'general';

  // Derive user initial for the chat avatar (prefer display name, fall back to email)
  const userInitial = (session.user.name ?? session.user.email ?? 'U')
    .trim()
    .charAt(0)
    .toUpperCase();

  // Fetch prerequisites, mindmap data (for study_cue), and source document in parallel.
  // These are non-blocking: failures degrade gracefully.
  const [prereqRelsResult, mindmapResult, docResult] = await Promise.all([
    supabase
      .from('concept_relationships')
      .select('from_concept_id')
      .eq('to_concept_id', conceptId)
      .eq('relationship_type', 'prerequisite'),
    supabase
      .from('mindmaps')
      .select('mindmap_data')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('file_path, raw_text, file_type')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle(),
  ]);

  // Fetch prerequisite concept names.
  const prereqIds: string[] = prereqRelsResult.data?.map(
    (r: { from_concept_id: string }) => r.from_concept_id,
  ) ?? [];
  const prerequisites: string[] = [];
  if (prereqIds.length > 0) {
    const { data: prereqConcepts } = await supabase
      .from('concepts')
      .select('name')
      .in('id', prereqIds);
    prerequisites.push(...(prereqConcepts?.map((c: { name: string }) => c.name) ?? []));
  }

  // Extract study_cue from mindmap tree data.
  const studyCue = mindmapResult.data?.mindmap_data
    ? findStudyCue(mindmapResult.data.mindmap_data as Record<string, unknown>, conceptId)
    : undefined;

  // For storage-backed files, generate a signed URL server-side and pass it
  // directly to the iframe so the browser renders the original document (PDF, etc.)
  // natively. Fall back to the text preview API route for legacy text-only uploads.
  let documentUrl: string | undefined;
  const documentFileType: string | undefined = docResult.data?.file_type ?? undefined;
  const documentText: string | undefined = docResult.data?.raw_text ?? undefined;
  const documentFileName: string | undefined = docResult.data?.file_path ?? undefined;

  if (docResult.data) {
    const filePath = docResult.data.file_path;
    if (filePath && filePath.includes('/')) {
      // Storage-backed: generate a 1-hour signed URL → browser renders PDF natively.
      try {
        const { data: signedUrlData } = await supabase.storage
          .from('tasur-documents')
          .createSignedUrl(filePath, 3600);
        if (signedUrlData?.signedUrl) {
          documentUrl = signedUrlData.signedUrl;
        }
      } catch {
        // Fall through to text preview
      }
    }
    // Legacy or storage failure: use the text preview API route.
    if (!documentUrl) {
      documentUrl = `/api/sessions/${sessionId}/documents/preview`;
    }
  }

  return (
    /*
     * Two-column layout: left column is the chat conversation,
     * right column is the FocusZone sidebar.
     * Negative margins escape the dashboard layout's horizontal padding
     * so the sidebar can reach the edge.
     */
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: 'calc(100vh - 112px)',
        gap: 0,
        marginLeft: -24,
        marginRight: -24,
      }}
    >
      {/* ── Left column: chat conversation ──────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 24px',
          overflow: 'hidden',
        }}
      >
        {/* Breadcrumb */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
            marginBottom: 16,
            flexShrink: 0,
            paddingTop: 8,
          }}
        >
          <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
            Dashboard
          </Link>
          <span>›</span>
          <Link
            href={`/study/${sessionId}/mindmap`}
            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
          >
            {sessionTitle}
          </Link>
          <span>›</span>
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{conceptName}</span>
        </nav>

        {/* Concept header — simplified */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexShrink: 0,
            paddingBottom: 12,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: learningMode === 'fast' ? '#C2692A' : '#3D7A5E',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {learningMode === 'fast' ? '⚡ Fast' : '◎ Steady'}
            </span>
            {subject_domain && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {domain}
              </span>
            )}
          </div>
          <Link
            href={`/study/${sessionId}/mindmap`}
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontWeight: 500,
              padding: '4px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            ← Mindmap
          </Link>
        </div>

        {/* ChatInterface */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatInterface
            sessionId={sessionId}
            conceptId={conceptId}
            conceptName={conceptName}
            domain={domain}
            learningMode={learningMode}
            userInitial={userInitial}
          />
        </div>
      </div>

      {/* ── Right column: Focus Zone ─────────────────────────────────────────── */}
      <FocusZone
        sessionId={sessionId}
        conceptName={conceptName}
        prerequisites={prerequisites}
        studyCue={studyCue}
        documentText={documentText}
        documentFileName={documentFileName}
        documentUrl={documentUrl}
        documentFileType={documentFileType}
      />
    </div>
  );
}
