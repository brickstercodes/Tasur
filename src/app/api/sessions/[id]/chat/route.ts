/**
 * WHY: Chat API endpoint for the Phase 2 study-partner interface.
 *
 * Two handlers:
 *   GET  — loads conversation history for a concept (last 15 messages).
 *   POST — accepts a user message, calls the appropriate agent(s), streams
 *          the response as SSE, and persists both messages to chat_messages.
 *
 * Routing logic (SSE POST):
 *   isNewConcept=true  → orchestrator called first to select teaching approach,
 *                         then concept explainer streams the response.
 *   isAssessmentSubmit → orchestrator called to evaluate the answer and update
 *                         understanding_state, then explainer continues.
 *   otherwise          → explainer called directly (mid-conversation).
 *
 * SSE event protocol:
 *   event: token    data: { text: string }          — streaming content chunk
 *   event: metadata data: ExplainerOutput (full)    — structured output (end)
 *   event: done     data: {}                         — stream complete
 *   event: error    data: { message: string }        — error (stream closes)
 *
 * No mock agents — all calls use real LLM API keys.
 */

import { type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';

import { auth } from '@/lib/auth';
import { resolveAppUserId } from '@/lib/app-user';
import { createServerClient } from '@/lib/supabase';
import { getAgentRegistry } from '@/config/agent-provider';
import { loadFromSupabase, syncToSupabase } from '@/lib/graph/sync';
import type { ConceptExplainerInput } from '@/interfaces/registry';
import type { ExplainerOutput } from '@/lib/schemas/explainer-output';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHAT_HISTORY_LIMIT = 15;

// ── SSE helpers ───────────────────────────────────────────────────────────────

const TEXT_ENCODER = new TextEncoder();

function encodeSSE(eventName: string, data: unknown): Uint8Array {
  return TEXT_ENCODER.encode(
    `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

// ── GET: load conversation history ────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const { id: sessionId } = await params;
  const conceptId = request.nextUrl.searchParams.get('conceptId');

  if (!conceptId) {
    return Response.json({ error: 'conceptId query param required' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, message_type, created_at')
    .eq('session_id', sessionId)
    .eq('concept_id', conceptId)
    .order('created_at', { ascending: true })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) {
    return Response.json({ error: 'Failed to load chat history' }, { status: 500 });
  }

  return Response.json({ messages: messages ?? [] });
}

// ── POST request shape ────────────────────────────────────────────────────────

interface ChatRequestBody {
  conceptId: string;
  message: string;
  /** True on the very first message for this concept → orchestrator selects approach. */
  isNewConcept: boolean;
  /** True when the message is an assessment answer → orchestrator evaluates. */
  isAssessmentSubmit: boolean;
  domain: string;
  learningMode: 'fast' | 'steady';
}

// ── POST: send message, stream response ───────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const appUserId = await resolveAppUserId(session.user);

  const { id: sessionId } = await params;
  const body: ChatRequestBody = await request.json();
  const { conceptId, message, isNewConcept, isAssessmentSubmit, domain, learningMode } = body;

  const supabase = createServerClient();

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', appUserId)
    .single();

  if (!sessionRow) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Persist the user's message immediately so it is in history for the next turn.
  await supabase.from('chat_messages').insert({
    session_id: sessionId,
    concept_id: conceptId,
    role: 'user',
    content: message,
    message_type: null,
  });

  // Fetch all three context sources in parallel — they are independent queries.
  const [historyResult, understandingResult, conceptResult] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .eq('concept_id', conceptId)
      .order('created_at', { ascending: true })
      .limit(CHAT_HISTORY_LIMIT),

    supabase
      .from('understanding_state')
      .select('concept_id, confidence_score')
      .eq('session_id', sessionId),

    supabase
      .from('concepts')
      .select('name, content')
      .eq('id', conceptId)
      .eq('session_id', sessionId)
      .single(),
  ]);

  // Exclude the message we just inserted — it becomes `currentMessage` below.
  const conversationHistory = (historyResult.data ?? [])
    .filter((row) => !(row.role === 'user' && row.content === message))
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));

  const studentContext = buildStudentContext(
    understandingResult.data ?? [],
    conceptResult.data?.content ?? null,
  );

  const explainerInput: ConceptExplainerInput = {
    conceptId,
    domain,
    learningMode,
    studentContext,
    conversationHistory,
    currentMessage: message,
  };

  // Build the SSE stream — does not resolve until all chunks have been sent.
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const registry = getAgentRegistry();

        // ── Orchestrator call (on new concept or assessment) ─────────────────
        if (isNewConcept || isAssessmentSubmit) {
          const graph = await loadFromSupabase(sessionId);

          if (graph) {
            const orchestrator = registry.get('orchestrator');
            const lastEvent = isAssessmentSubmit
              ? `micro_assessment_complete: ${message}`
              : 'concept_entry';

            try {
              const orchestratorResult = await orchestrator.execute({
                studentState: graph.serialize(),
                mode: learningMode,
                lastEvent,
                domain,
                currentConceptId: conceptId,
              });

              const orchestratorData = orchestratorResult.data;

              // Persist the understanding update when the orchestrator evaluates an answer.
              if (isAssessmentSubmit && orchestratorData.understanding_update) {
                const { concept_id: updatedConceptId, new_confidence: newConfidence } =
                  orchestratorData.understanding_update;

                await updateUnderstandingState(
                  supabase,
                  sessionId,
                  appUserId,
                  updatedConceptId,
                  newConfidence,
                  'micro_assessment',
                );

                // Invalidate the RSC cache for the mindmap page so the fresh
                // confidence scores are fetched the next time it renders.
                revalidatePath(`/study/${sessionId}/mindmap`);

                // Mirror the confidence update into the StudentGraph snapshot so the
                // orchestrator sees fresh scores on its next call. The `graph` object
                // was loaded above and is still in scope — reuse it to avoid a second
                // Supabase round-trip.
                graph.updateConfidence(updatedConceptId, newConfidence, learningMode, 'micro_assessment');
                await syncToSupabase(graph);
              }

              // Inject orchestrator reasoning into context so explainer knows the approach.
              explainerInput.studentContext =
                `${studentContext}\n\nOrchestrator approach: ${orchestratorData.reasoning}`;
            } catch (orchErr) {
              // Non-fatal — explainer proceeds without orchestrator guidance.
              // Log so we can diagnose silent failures in understanding_update.
              console.error('[orchestrator] failed, skipping confidence update:', orchErr);
            }
          }
        }

        // ── Explainer call ───────────────────────────────────────────────────
        const explainer = registry.get('concept-explainer');
        const result = await explainer.execute(explainerInput);
        const output: ExplainerOutput = result.data;

        // Stream content word-by-word so the client receives progressive chunks.
        // Each word is a separate SSE token event — browser renders them as they arrive.
        const words = output.content.split(' ');
        for (let i = 0; i < words.length; i++) {
          const text = i === 0 ? words[i] : ` ${words[i]}`;
          controller.enqueue(encodeSSE('token', { text }));
          // Yield to the event loop between chunks to allow backpressure handling.
          await Promise.resolve();
        }

        // Send the full structured output so the client can render micro_assessment
        // and visual_suggestion without a second request.
        controller.enqueue(encodeSSE('metadata', output));

        // ── Confidence: conversation_complete path ───────────────────────────
        // When the explainer marks a concept as fully covered, ensure the
        // understanding_state reflects at least "Reviewing" (≥ 0.3).  We only
        // write if the stored score is still below 0.45 so we never downgrade
        // a concept the student has already demonstrated mastery of.
        if (output.conversation_complete) {
          const REVIEWED_BASELINE = 0.45;
          const { data: currentState } = await supabase
            .from('understanding_state')
            .select('confidence_score')
            .eq('session_id', sessionId)
            .eq('concept_id', conceptId)
            .maybeSingle();

          const existingScore = currentState?.confidence_score ?? 0;
          if (existingScore < REVIEWED_BASELINE) {
            await updateUnderstandingState(
              supabase,
              sessionId,
              appUserId,
              conceptId,
              REVIEWED_BASELINE,
              'explanation',
            );
          }
          // Invalidate the mindmap RSC cache regardless of whether we wrote,
          // so any score change (including higher existing scores) is visible.
          revalidatePath(`/study/${sessionId}/mindmap`);
        }

        // Persist the assistant turn.
        await supabase.from('chat_messages').insert({
          session_id: sessionId,
          concept_id: conceptId,
          role: 'assistant',
          content: output.content,
          message_type: output.message_type,
        });

        controller.enqueue(encodeSSE('done', {}));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSSE('error', { message }));
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formats concept content + understanding scores into a plain-text summary
 * that the explainer agent receives as `studentContext` in its system prompt.
 *
 * Concept content (leafContent from the .mm parser) is the primary teaching
 * material — including it here means the explainer works from actual source
 * material rather than having to infer what to teach.
 */
function buildStudentContext(
  understandingRows: { concept_id: string; confidence_score: number }[],
  conceptContent: string | null,
): string {
  const parts: string[] = [];

  if (conceptContent) {
    parts.push(`Concept material (from .mm source):\n${conceptContent}`);
  }

  if (understandingRows.length > 0) {
    const scores = understandingRows
      .map((row) => `${row.concept_id}: ${(row.confidence_score * 100).toFixed(0)}%`)
      .join(', ');
    parts.push(`Student confidence per concept: ${scores}`);
  }

  return parts.join('\n\n') || 'No prior context available.';
}

/**
 * Upserts a confidence score for a single concept in understanding_state and
 * appends an entry to the assessment_history JSONB array.
 *
 * Uses select-then-insert/update pattern because the table has a generated
 * UUID PK rather than a unique constraint on (session_id, concept_id).
 */
async function updateUnderstandingState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sessionId: string,
  userId: string,
  conceptId: string,
  newConfidence: number,
  method: string = 'micro_assessment',
): Promise<void> {
  const now = new Date().toISOString();
  const newEntry = { timestamp: now, score: newConfidence, method };

  const { data: existing } = await supabase
    .from('understanding_state')
    .select('id, exposure_count, assessment_history')
    .eq('session_id', sessionId)
    .eq('concept_id', conceptId)
    .maybeSingle();

  if (existing) {
    const history = Array.isArray(existing.assessment_history)
      ? existing.assessment_history
      : [];

    await supabase
      .from('understanding_state')
      .update({
        confidence_score: newConfidence,
        exposure_count: existing.exposure_count + 1,
        last_assessed_at: now,
        assessment_history: [...history, newEntry],
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('understanding_state').insert({
      session_id: sessionId,
      user_id: userId,
      concept_id: conceptId,
      confidence_score: newConfidence,
      exposure_count: 1,
      last_assessed_at: now,
      assessment_history: [newEntry],
    });
  }
}
