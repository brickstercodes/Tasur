/**
 * WHY: Multi-document upload endpoint — adds a second (or third…) document
 * to an existing study session and expands the knowledge graph.
 *
 * POST /api/sessions/[id]/documents
 *   Accepts: multipart/form-data { file, domain? }
 *   Returns: text/event-stream (same SSE progress events as the primary upload)
 *
 * The new document is processed through the same .mm-first pipeline:
 *   a) Text extraction
 *   b) .mm Generator → new Freeplane XML
 *   c) .mm Parser → new DerivedConcept[] and graph edges
 *   d) Web search augmentation (conditional)
 *   e) Flashcard generation for new concepts
 *   f) DB persistence — concepts/flashcards/understanding_state are appended,
 *      the mindmap gets a new version that merges old + new branches,
 *      the student_graph snapshot is updated with new nodes.
 *
 * Session ownership is verified before processing. The domain defaults to the
 * session's subject_domain so subject context is preserved across documents.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { parseDocument } from '@/lib/parsing';
import type { FileType } from '@/lib/parsing';
import { parseMmXml } from '@/lib/mm-parser';
import { extractConcepts } from '@/lib/mm-parser/concept-extractor';
import { buildGraphEdges } from '@/lib/mm-parser/graph-builder';
import { toMindmapTreeOutput } from '@/lib/mm-parser/tree-converter';
import { getAgentRegistry } from '@/config/agent-provider';
import {
  buildParserOutputFromDerivedConcepts,
  mergeAugmentations,
} from '@/lib/orchestration/session-utils';
import { appendDocumentToSession } from '@/lib/session-persistence';
import type { StudentGraphState } from '@/types/graph';

// ── Constants ─────────────────────────────────────────────────────────────────

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

// ── Route handler ─────────────────────────────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id: sessionId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const supabase = createServerClient();

  // Verify ownership and get session metadata
  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('learning_mode, subject_domain')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return new Response('Session not found', { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return new Response('No file provided', { status: 400 });
  if (file.size > MAX_FILE_BYTES) return new Response('File exceeds 50 MB limit', { status: 413 });

  // Domain defaults to session's existing domain so context is consistent
  const domain = (formData.get('domain') as string | null)?.trim()
    || sessionRow.subject_domain
    || 'general';
  const mode = sessionRow.learning_mode as 'fast' | 'steady';

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const mimeType = file.type;
  const fileType = resolveFileType(mimeType, filename);
  const userId = appUserId;
  const agents = getAgentRegistry();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);

      try {
        // Load existing graph for merge
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: graphRow } = await (supabase as any)
          .from('student_graphs')
          .select('graph_state')
          .eq('session_id', sessionId)
          .maybeSingle();

        const existingGraphState = (graphRow?.graph_state ?? {
          sessionId,
          nodes: [],
          edges: [],
          lastSyncedAt: new Date().toISOString(),
        }) as StudentGraphState;

        emit({ type: 'progress', step: 'extracting', label: 'Extracting text…', percent: 8 });
        const parseResult = await parseDocument(fileBuffer, fileType);
        if (!parseResult.success) throw new Error(`Text extraction failed: ${parseResult.error}`);
        const rawText = parseResult.data.rawText;

        emit({ type: 'progress', step: 'generating_mm', label: 'Generating study mindmap…', percent: 30 });
        const mmResult = await agents.get('mm-generator').execute({
          rawText,
          fileType,
          subjectHint: domain,
        });
        const mmXml = mmResult.data;

        emit({ type: 'progress', step: 'analyzing', label: 'Analysing structure…', percent: 50 });
        const parsedTree = parseMmXml(mmXml);
        const newConcepts = extractConcepts(parsedTree);
        const newEdges = buildGraphEdges(newConcepts);
        const newMindmapBranches = toMindmapTreeOutput(parsedTree, domain);
        const richParsedContent = buildParserOutputFromDerivedConcepts(
          newConcepts, newEdges, domain, parsedTree.metadata.title,
        );

        let flashcardInputContent = richParsedContent;
        if (richParsedContent.gaps_detected.length > 0) {
          emit({ type: 'progress', step: 'searching', label: 'Filling in gaps…', percent: 62 });
          const webResult = await agents.get('web-search').execute({
            gaps: richParsedContent.gaps_detected,
            domain,
          });
          flashcardInputContent = mergeAugmentations(richParsedContent, webResult.data);
        }

        emit({ type: 'progress', step: 'flashcards', label: 'Creating flashcards…', percent: 75 });
        const flashcardResult = await agents.get('flashcard-generator').execute({
          parsedContent: flashcardInputContent,
          domain,
          learningMode: mode,
        });

        emit({ type: 'progress', step: 'saving', label: 'Expanding your study graph…', percent: 88 });
        await appendDocumentToSession(
          sessionId, userId,
          newConcepts, newEdges, newMindmapBranches,
          flashcardResult.data,
          existingGraphState,
          rawText, filename, fileType, mmXml,
        );

        // Touch last_active_at on the session
        await supabase
          .from('study_sessions')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', sessionId);

        emit({ type: 'done', sessionId: sessionId, label: 'Graph expanded! Back to studying.' });
      } catch (err) {
        emit({
          type: 'error',
          message: err instanceof Error ? err.message : 'Document add failed — please try again.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveFileType(mimeType: string, filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) return 'docx';
  if (ext === 'txt' || mimeType === 'text/plain') return 'txt';
  if (ext === 'png' || mimeType === 'image/png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg' || mimeType.startsWith('image/jpeg')) return 'jpg';
  return 'txt';
}


