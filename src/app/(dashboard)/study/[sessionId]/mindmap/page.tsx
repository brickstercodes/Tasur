/**
 * WHY: Server component that fetches mindmap and confidence data for a session,
 * then renders the full-screen interactive MindmapViewer.
 *
 * Data flow:
 *   1. Fetch `mindmap_data` (MindmapTreeOutput JSON) from the `mindmaps` table —
 *      the latest version for this session.
 *   2. Fetch `confidence_score` per `concept_id` from `understanding_state` —
 *      used for the green/amber/red confidence overlay on concept nodes.
 *   3. Fetch the session's `learning_mode` and `title` for the toolbar indicator.
 *
 * The MindmapViewer is a 'use client' component that takes over full-screen
 * rendering. We use negative margins to escape the dashboard layout's max-width
 * and padding constraints — the mindmap is the only view that needs full viewport.
 *
 * notFound() is returned when no mindmap exists for the session yet (e.g., the
 * upload pipeline hasn't completed). The student will be redirected by the
 * upload flow once processing finishes.
 */

import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { resolveSessionAccess } from '@/lib/session-access';
import { loadFromSupabase } from '@/lib/graph/sync';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import { MindmapViewer } from '@/components/mindmap/MindmapViewer';
import { TutorialTour } from '@/components/study/TutorialTour';
import { mindmapTourSteps } from '@/components/study/tourSteps';

// ── Page component ────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function MindmapPage({ params }: PageProps) {
  const { sessionId } = await params;

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect('/login');
  const appUserId = await resolveAppUserId(authSession.user);

  const access = await resolveSessionAccess(sessionId, appUserId);
  if (!access) notFound();

  const supabase = createServerClient();

  // Fetch in parallel — all three queries are independent.
  const [mindmapResult, understandingResult, sessionResult, docResult] = await Promise.all([
    supabase
      .from('mindmaps')
      .select('mindmap_data')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single(),

    supabase
      .from('understanding_state')
      .select('concept_id, confidence_score')
      .eq('session_id', sessionId)
      .eq('user_id', appUserId),

    supabase
      .from('study_sessions')
      .select('learning_mode, title')
      .eq('id', sessionId)
      .single(),

    supabase
      .from('documents')
      .select('file_path, file_type')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (mindmapResult.error || !mindmapResult.data) {
    notFound();
  }

  const tree = mindmapResult.data.mindmap_data as MindmapTreeOutput;

  // Build a plain Record<conceptId, score> — Maps are not serializable across
  // the server/client boundary, so MindmapViewer converts it internally.
  const confidenceData: Record<string, number> = {};
  for (const row of understandingResult.data ?? []) {
    confidenceData[row.concept_id] = row.confidence_score;
  }

  const learningMode = sessionResult.data?.learning_mode ?? 'steady';
  const sessionTitle = sessionResult.data?.title ?? '';

  const docFilePath = docResult.data?.file_path ?? undefined;
  const docFileType = docResult.data?.file_type ?? '';
  const isPdf = docFileType === 'application/pdf' || (docFilePath ? docFilePath.toLowerCase().endsWith('.pdf') : false);
  const diagramDocumentFileName = docFilePath
    ? (docFilePath.includes('/') ? docFilePath.split('/').pop() : docFilePath)
    : undefined;

  let diagramDocumentUrl: string | undefined;
  if (isPdf && docFilePath && docFilePath.includes('/')) {
    try {
      const { data: signedUrlData } = await supabase.storage
        .from('tasur-documents')
        .createSignedUrl(docFilePath, 3600);
      if (signedUrlData?.signedUrl) {
        diagramDocumentUrl = signedUrlData.signedUrl;
      }
    } catch {
      // Fall through without a signed URL
    }
  }

  // Determine the recommended next concept without an LLM call — the StudentGraph
  // already encodes all the logic needed (priority, prerequisites, confidence).
  // Non-fatal: if the graph doesn't exist yet (race condition on new session) or
  // the query fails, we simply show no resume indicator.
  let resumeConceptId: string | null = null;
  try {
    const graph = await loadFromSupabase(sessionId);
    const nextNode = graph?.getNextRecommended(learningMode) ?? null;
    resumeConceptId = nextNode?.id ?? null;
  } catch {
    // Non-fatal — mindmap renders normally without the resume indicator.
  }

  return (
    /*
     * The dashboard layout applies max-w-5xl + px-6 py-10 to <main>.
     * Negative margins cancel that padding so the mindmap fills the viewport
     * below the header (≈52px: py-4 × 2 + text height + border).
     * `fixed` positioning is avoided because it would layer over the header.
     */
    <div
      style={{
        // Viewport minus: dashboard header (52px) + session nav layout (48px) = 100px.
        // The session layout's nav occupies 48px above this div; no marginTop needed
        // to escape main's padding-top because the session nav fills that space.
        height: 'calc(100vh - 100px)',
        marginTop: 0,
        marginBottom: '-40px',
        marginLeft: '-24px',
        marginRight: '-24px',
        overflow: 'hidden',
      }}
    >
      {sessionId === process.env.NEXT_PUBLIC_TUTORIAL_SESSION_ID && <TutorialTour steps={mindmapTourSteps} />}
      <MindmapViewer
        tree={tree}
        confidenceData={confidenceData}
        sessionId={sessionId}
        learningMode={learningMode}
        sessionTitle={sessionTitle}
        diagramDocumentUrl={diagramDocumentUrl}
        diagramDocumentFileName={diagramDocumentFileName}
        resumeConceptId={resumeConceptId}
        isOwner={access.isOwner}
      />
    </div>
  );
}
