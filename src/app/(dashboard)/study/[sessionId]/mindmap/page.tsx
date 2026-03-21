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

import { notFound } from 'next/navigation';

import { createServerClient } from '@/lib/supabase';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import { MindmapViewer } from '@/components/mindmap/MindmapViewer';

// ── Page component ────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function MindmapPage({ params }: PageProps) {
  const { sessionId } = await params;

  const supabase = createServerClient();

  // Fetch in parallel — all three queries are independent.
  const [mindmapResult, understandingResult, sessionResult] = await Promise.all([
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
      .eq('session_id', sessionId),

    supabase
      .from('study_sessions')
      .select('learning_mode, title')
      .eq('id', sessionId)
      .single(),
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

  return (
    /*
     * The dashboard layout applies max-w-5xl + px-6 py-10 to <main>.
     * Negative margins cancel that padding so the mindmap fills the viewport
     * below the header (≈52px: py-4 × 2 + text height + border).
     * `fixed` positioning is avoided because it would layer over the header.
     */
    <div
      style={{
        height: 'calc(100vh - 52px)',
        marginTop: '-40px',
        marginBottom: '-40px',
        marginLeft: '-24px',
        marginRight: '-24px',
        overflow: 'hidden',
      }}
    >
      <MindmapViewer
        tree={tree}
        confidenceData={confidenceData}
        sessionId={sessionId}
        learningMode={learningMode}
        sessionTitle={sessionTitle}
      />
    </div>
  );
}
