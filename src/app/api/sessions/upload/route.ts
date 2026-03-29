/**
 * WHY: Upload endpoint for the .mm-first pipeline — runs the full 5-phase flow
 * and streams progress back to the client as Server-Sent Events (SSE).
 *
 * The client (UploadFlow component) reads the SSE stream and updates the progress
 * UI in real-time. On success, the final SSE event carries the new sessionId so
 * the client can redirect to /study/[sessionId]/mindmap.
 *
 * Pipeline phases (with SSE events):
 *   a) "Extracting text..."       — parseDocument() (pdf-parse / mammoth / OCR)
 *   b) "Generating study mindmap..." — .mm Generator agent (single LLM call)
 *   c) "Analyzing structure..."   — .mm Parser (deterministic code, instant)
 *   d) "Filling in gaps..."       — Web Search agent (conditional, only if gaps found)
 *   e) "Creating flashcards..."   — Flashcard Generator agent
 *   f) "Saving your session..."   — All DB writes (session + all artifacts)
 *   done event carries sessionId
 *
 * Design: The session row is created ONLY after the pipeline succeeds (step f),
 * so no orphaned rows exist in the DB if the LLM step fails. The sessionId is
 * not known until this final step — it's emitted in the "done" event.
 *
 * Auth: Reads the BetterAuth session from request headers.
 * Accepts: multipart/form-data { file, domain, mode, title }
 * Returns: text/event-stream
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { parseDocument } from '@/lib/parsing';
import type { FileType } from '@/lib/parsing';
import { parseMmXml } from '@/lib/mm-parser';
import { extractConcepts } from '@/lib/mm-parser/concept-extractor';
import { buildGraphEdges } from '@/lib/mm-parser/graph-builder';
import { toMindmapTreeOutput } from '@/lib/mm-parser/tree-converter';
import { getAgentRegistry } from '@/config/agent-provider';
import {
  buildInitialGraphStateFromMm,
  buildParserOutputFromDerivedConcepts,
  mergeAugmentations,
} from '@/lib/orchestration/session-utils';
import {
  createStudySession,
  persistPipelineResults,
  getSessionCount,
  incrementSessionTokenUsage,
} from '@/lib/session-persistence';
import type { LearningMode } from '@/types/sessions';
import { validateCustomInstructions } from '@/lib/guardrails';

// ── Constants ─────────────────────────────────────────────────────────────────

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DOMAIN_LENGTH = 100;

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse FormData before opening the SSE stream — body can't be read twice.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) {
    return new Response('No file provided', { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return new Response('File exceeds 50 MB limit', { status: 413 });
  }

  const domain = sanitizeDomain((formData.get('domain') as string | null)?.trim() || 'general');
  const rawMode = formData.get('mode') as string | null;
  const mode: LearningMode = rawMode === 'fast' ? 'fast' : 'steady';
  const title =
    (formData.get('title') as string | null)?.trim() ||
    file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

  const guardrail = validateCustomInstructions(formData.get('customInstructions') as string | null);
  if (!guardrail.ok) {
    return new Response(guardrail.reason, { status: 422 });
  }
  const customInstructions = guardrail.sanitised || undefined;

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const mimeType = file.type;
  const fileType = resolveFileType(mimeType, filename);

  const userId = await resolveAppUserId(session.user);

  const maxSessions = parseInt(process.env.MAX_SESSIONS_PER_USER ?? '10', 10);
  const sessionCount = await getSessionCount(userId);
  if (sessionCount >= maxSessions) {
    return new Response(
      `Session limit reached (${maxSessions} sessions per user during beta)`,
      { status: 429 },
    );
  }

  const agents = getAgentRegistry();

  // SSE ReadableStream — all pipeline work happens inside start()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) =>
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);

      try {
        // ── Phase 1a: Text extraction ──────────────────────────────────────
        // For PDFs, extraction failure is non-fatal: Gemini vision reads the bytes
        // directly and generates the mindmap from the visual content. rawText will be
        // empty (scanned / image-only PDF) but the pipeline continues normally.
        // For all other file types there is no vision fallback, so we fail hard.
        emit({ type: 'progress', step: 'extracting', label: 'Extracting text…', percent: 8 });
        let rawText = '';
        try {
          const parseResult = await parseDocument(fileBuffer, fileType);
          if (parseResult.success) {
            rawText = parseResult.data.rawText;
          } else if (fileType !== 'pdf') {
            throw new Error(`Text extraction failed: ${parseResult.error}`);
          }
          // PDF with no text layer → rawText stays '' and Gemini vision takes over
        } catch (parseErr) {
          if (fileType !== 'pdf') throw parseErr;
          // PDF parser threw an unhandled exception (e.g. corrupt page tree).
          // Non-fatal for PDFs — Gemini vision reads the bytes directly.
        }

        // ── Phase 1b: .mm Generator (single LLM call) ──────────────────────
        emit({ type: 'progress', step: 'generating_mm', label: 'Generating study mindmap…', percent: 25 });
        const mmResult = await agents.get('mm-generator').execute({
          rawText,
          fileType,
          subjectHint: domain,
          customInstructions,
          // PDF-native path: pass raw bytes so Gemini vision can see diagrams on the page
          fileBuffer: fileType === 'pdf' ? fileBuffer : undefined,
        });
        const mmXml = mmResult.data;

        // ── Phase 2: .mm Parser (deterministic — instant) ──────────────────
        emit({ type: 'progress', step: 'analyzing', label: 'Analysing structure…', percent: 48 });
        const parsedTree = parseMmXml(mmXml);
        const derivedConcepts = extractConcepts(parsedTree);
        const graphEdges = buildGraphEdges(derivedConcepts);
        const mindmapTree = toMindmapTreeOutput(parsedTree, domain);
        const richParsedContent = buildParserOutputFromDerivedConcepts(
          derivedConcepts,
          graphEdges,
          domain,
          parsedTree.metadata.title,
        );
        const graphState = buildInitialGraphStateFromMm(
          'pending', // sessionId placeholder — real ID assigned at persistence step
          derivedConcepts,
          graphEdges,
          domain,
        );

        // ── Phase 3: Web search augmentation (conditional) ─────────────────
        let webSearchUsage = { inputTokens: 0, outputTokens: 0 };
        let flashcardInputContent = richParsedContent;
        if (richParsedContent.gaps_detected.length > 0) {
          emit({ type: 'progress', step: 'searching', label: 'Filling in gaps…', percent: 60 });
          const webResult = await agents.get('web-search').execute({
            gaps: richParsedContent.gaps_detected,
            domain,
          });
          webSearchUsage = webResult.usage;
          flashcardInputContent = mergeAugmentations(richParsedContent, webResult.data);
        }

        // ── Phase 4: Flashcard generation ─────────────────────────────────
        emit({ type: 'progress', step: 'flashcards', label: 'Creating flashcards…', percent: 72 });
        const flashcardResult = await agents.get('flashcard-generator').execute({
          parsedContent: flashcardInputContent,
          domain,
          learningMode: mode,
        });

        // ── Phase 5: DB persistence ────────────────────────────────────────
        emit({ type: 'progress', step: 'saving', label: 'Saving your study session…', percent: 88 });
        const sessionId = await createStudySession(userId, title, domain, mode);

        await persistPipelineResults({
          sessionId,
          userId,
          derivedConcepts,
          graphEdges,
          mindmapTree,
          flashcardOutput: flashcardResult.data,
          graphState: { ...graphState, sessionId },
          mmXml,
          rawText,
          filename,
          fileType,
          fileBuffer,
          mimeType,
        });

        await incrementSessionTokenUsage(
          sessionId,
          mmResult.usage.inputTokens + webSearchUsage.inputTokens + flashcardResult.usage.inputTokens,
          mmResult.usage.outputTokens + webSearchUsage.outputTokens + flashcardResult.usage.outputTokens,
        );

        emit({ type: 'done', sessionId, label: "Ready! Let's study." });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed — please try again.';
        emit({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeDomain(input: string): string {
  // Keep only word characters, spaces, and hyphens. Prevents prompt injection
  // into the web-search agent query via the domain field.
  return input.replace(/[^\w\s-]/g, '').slice(0, MAX_DOMAIN_LENGTH).trim() || 'general';
}

function resolveFileType(mimeType: string, filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || mimeType.includes('wordprocessingml')) return 'docx';
  if (ext === 'txt' || mimeType === 'text/plain') return 'txt';
  if (ext === 'png' || mimeType === 'image/png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg' || mimeType.startsWith('image/jpeg')) return 'jpg';
  return 'txt';
}
