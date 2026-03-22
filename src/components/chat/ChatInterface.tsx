'use client';

/**
 * WHY: Root client component for the Phase 2 conversational study-partner interface.
 *
 * Responsibilities:
 *   - Loads previous chat history for the current concept on mount (GET request).
 *   - Sends user messages to the SSE endpoint and parses the token/metadata/done
 *     event stream to build a progressive typing effect.
 *   - Renders each message styled by its message_type (explanation, analogy, etc.).
 *   - Inlines MicroAssessment when the explainer triggers a comprehension check,
 *     and routes the student's answer back through the orchestrator path.
 *   - Inlines VisualSuggestion when the explainer suggests a table or comparison.
 *
 * SSE reading uses fetch() + ReadableStream.getReader() rather than EventSource
 * because EventSource only supports GET requests and cannot send a JSON body.
 *
 * The `isNewConcept` flag tracks whether this is the first message in a concept's
 * conversation — it is reset to false after the first send so subsequent messages
 * go directly to the explainer without the orchestrator overhead.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { MicroAssessment } from './MicroAssessment';
import { VisualSuggestion } from './VisualSuggestion';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  messageType?: string;
  microAssessment?: {
    question: string;
    expected_understanding: string;
    difficulty: 'easy' | 'intermediate' | 'hard';
    question_type?: 'self_check' | 'open';
  };
  visualSuggestion?: {
    type: 'diagram' | 'table' | 'comparison';
    data: Record<string, unknown>;
  };
  isStreaming?: boolean;
  conversationComplete?: boolean;
}

interface HistoryRow {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: string | null;
  created_at: string;
}

export interface ChatInterfaceProps {
  sessionId: string;
  conceptId: string;
  conceptName: string;
  domain: string;
  learningMode: 'fast' | 'steady';
  userInitial?: string;
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

// Consistent warm palette — pick by char code so the same initial always maps to same colour
const AVATAR_COLORS = ['#C2692A', '#3B5E8C', '#3D7A5E', '#7A6C2A', '#6B4E8A', '#9B5C4A', '#944604', '#2E6B8A'];

function avatarColorForInitial(initial: string): string {
  return AVATAR_COLORS[initial.charCodeAt(0) % AVATAR_COLORS.length];
}

// ── Colour map for message types (warm earthy palette) ────────────────────────

const MESSAGE_TYPE_ACCENT: Record<string, string> = {
  explanation: '#3B5E8C',   // warm blue
  analogy:     '#6B4E8A',   // warm plum
  example:     '#3D7A5E',   // warm forest green
  micro_assessment: '#7A6C2A', // warm gold
  clarification:   '#944604',  // amber
};

// ── Main component ────────────────────────────────────────────────────────────

export function ChatInterface({
  sessionId,
  conceptId,
  conceptName,
  domain,
  learningMode,
  userInitial = 'U',
}: ChatInterfaceProps) {
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // True when the latest assistant message signals the concept is fully covered.
  const isConversationComplete = messages
    .filter((m) => m.role === 'assistant' && !m.isStreaming)
    .some((m) => m.conversationComplete === true);

  // Tracks whether the next send is the first for this concept (triggers orchestrator).
  const isNewConceptRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load history on mount ──────────────────────────────────────────────────

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/chat?conceptId=${encodeURIComponent(conceptId)}`,
        );
        if (!res.ok) return;

        const json = await res.json() as { messages: HistoryRow[] };
        const loaded: ChatMessage[] = json.messages
          .filter((row) => row.role !== 'system')
          .map((row) => ({
            id: row.id,
            role: row.role as 'user' | 'assistant',
            content: row.content,
            messageType: row.message_type ?? undefined,
          }));

        setMessages(loaded);

        // If there is prior history, the concept is not "new" — skip orchestrator.
        if (loaded.length > 0) {
          isNewConceptRef.current = false;
        }
      } catch {
        // History load failure is non-fatal — the student can still chat.
      }
    }

    loadHistory();
  }, [sessionId, conceptId]);

  // ── Auto-scroll when messages update ──────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string, isAssessmentSubmit = false) => {
      if (!text.trim() || isStreaming) return;

      setError(null);
      setIsStreaming(true);

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      };

      const streamingId = `assistant-${Date.now()}`;
      const streamingPlaceholder: ChatMessage = {
        id: streamingId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, streamingPlaceholder]);
      setInputText('');

      const isNewConcept = isNewConceptRef.current && !isAssessmentSubmit;
      isNewConceptRef.current = false;

      try {
        const response = await fetch(`/api/sessions/${sessionId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conceptId,
            message: text,
            isNewConcept,
            isAssessmentSubmit,
            domain,
            learningMode,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`Server error: ${response.status}`);
        }

        await readSSEStream(response.body, streamingId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);

        // Remove the streaming placeholder on error so the UI stays consistent.
        setMessages((prev) => prev.filter((m) => m.id !== streamingId));
      } finally {
        setIsStreaming(false);
      }
    },
    [sessionId, conceptId, domain, learningMode, isStreaming],
  );

  // ── SSE stream reader ──────────────────────────────────────────────────────

  async function readSSEStream(body: ReadableStream<Uint8Array>, streamingId: string) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = extractSSEEvents(buffer);

        // Keep the incomplete trailing bytes in buffer for the next chunk.
        const lastDoubleNewline = buffer.lastIndexOf('\n\n');
        buffer = lastDoubleNewline >= 0 ? buffer.slice(lastDoubleNewline + 2) : buffer;

        for (const event of events) {
          applySSEEvent(event.name, event.data, streamingId);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  function applySSEEvent(
    eventName: string,
    data: unknown,
    streamingId: string,
  ) {
    if (eventName === 'token' && isTokenData(data)) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? { ...m, content: m.content + data.text }
            : m,
        ),
      );
      return;
    }

    if (eventName === 'metadata' && isMetadata(data)) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId
            ? {
                ...m,
                messageType: data.message_type,
                conversationComplete: data.conversation_complete ?? false,
                microAssessment: data.micro_assessment
                  ? {
                      question: data.micro_assessment.question,
                      expected_understanding: data.micro_assessment.expected_understanding,
                      difficulty: data.micro_assessment.difficulty,
                      question_type: data.micro_assessment.question_type,
                    }
                  : undefined,
                visualSuggestion:
                  data.visual_suggestion
                    ? {
                        type: data.visual_suggestion.type,
                        data: data.visual_suggestion.data as Record<string, unknown>,
                      }
                    : undefined,
              }
            : m,
        ),
      );
      return;
    }

    if (eventName === 'done') {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingId ? { ...m, isStreaming: false } : m,
        ),
      );
      return;
    }

    if (eventName === 'error' && isErrorData(data)) {
      throw new Error(data.message);
    }
  }

  // ── Assessment answer handler ──────────────────────────────────────────────

  function handleAssessmentSubmit(answer: string) {
    sendMessage(answer, true);
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes cursor-fade { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .chat-scroll::-webkit-scrollbar { width: 4px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: #DDD8CC; border-radius: 10px; }
        .send-btn:hover:not(:disabled) { background: #7A3803 !important; }
        .moveon-btn:hover { opacity: 0.88; transform: translateY(-1px); }
      `}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          fontFamily: "'Georgia', 'Times New Roman', serif",
        }}
      >
        {/* Message list */}
        <div
          className="chat-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 0 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {messages.length === 0 && !isStreaming && (
            <div
              style={{
                textAlign: 'center',
                marginTop: 48,
                padding: '0 24px',
              }}
            >
              <p
                style={{
                  fontFamily: "'Instrument Serif', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 18,
                  color: '#887367',
                  margin: 0,
                }}
              >
                Ask anything about {conceptName}
              </p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              learningMode={learningMode}
              userInitial={userInitial}
              onAssessmentSubmit={handleAssessmentSubmit}
            />
          ))}

          {error && (
            <div
              style={{
                background: '#fef6f0',
                border: '1px solid #F5C4A0',
                borderLeft: '3px solid #944604',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#7A3803',
                fontSize: 13,
                margin: '8px 0',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Move-on CTA */}
        {isConversationComplete && (
          <div style={{ padding: '12px 0 4px' }}>
            <button
              className="moveon-btn"
              onClick={() => router.push(`/study/${sessionId}/mindmap`)}
              style={{
                width: '100%',
                padding: '13px 24px',
                border: 'none',
                borderRadius: 10,
                background: '#944604',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.02em',
                boxShadow: '0 2px 12px rgba(148,70,4,0.28)',
                transition: 'opacity 0.15s ease, transform 0.12s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Move on to the next concept →
            </button>
          </div>
        )}

        {/* Input area */}
        <div
          style={{
            borderTop: '1px solid #ECEAE2',
            padding: '14px 0 4px',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? 'Thinking…'
                : 'Ask a question… (Enter to send, Shift+Enter for newline)'
            }
            rows={2}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid #ECEAE2',
              borderRadius: 10,
              fontSize: 13.5,
              color: '#2D2318',
              background: isStreaming ? '#FAF8F4' : '#FDFAF6',
              resize: 'none',
              outline: 'none',
              fontFamily: "'Georgia', serif",
              lineHeight: 1.55,
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#C2892A';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#ECEAE2';
            }}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isStreaming}
            style={{
              width: 40,
              height: 40,
              border: 'none',
              borderRadius: 10,
              background: inputText.trim() && !isStreaming ? '#944604' : '#ECEAE2',
              color: inputText.trim() && !isStreaming ? '#fff' : '#B8AFA6',
              fontSize: 16,
              cursor: inputText.trim() && !isStreaming ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              alignSelf: 'flex-end',
              flexShrink: 0,
              transition: 'background 0.12s ease',
            }}
            title="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

const AVATAR_SIZE = 30;

function MessageBubble({
  message,
  learningMode,
  userInitial,
  onAssessmentSubmit,
}: {
  message: ChatMessage;
  learningMode: 'fast' | 'steady';
  userInitial: string;
  onAssessmentSubmit: (answer: string) => void;
}) {
  const isUser = message.role === 'user';
  const accent = message.messageType
    ? MESSAGE_TYPE_ACCENT[message.messageType] ?? '#887367'
    : '#887367';
  const userAvatarColor = avatarColorForInitial(userInitial);

  if (isUser) {
    // ── User bubble: parchment float, right-aligned with avatar ──────────────
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 10, margin: '10px 0' }}>
        <div
          style={{
            maxWidth: '72%',
            padding: '11px 16px',
            borderRadius: '16px 16px 4px 16px',
            background: 'linear-gradient(145deg, #EDE5D5 0%, #E6DCC8 100%)',
            border: '1px solid #D4C4A8',
            boxShadow: '0 2px 8px rgba(61,43,31,0.10), inset 0 1px 0 rgba(255,250,240,0.6)',
            color: '#2D1F0E',
            fontSize: 13.5,
            lineHeight: 1.65,
            fontFamily: "'Georgia', serif",
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message.content}
        </div>
        {/* User avatar */}
        <div
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: '50%',
            background: userAvatarColor,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 700,
            fontSize: 12,
            color: '#fff',
            letterSpacing: '0.02em',
            marginTop: 2,
          }}
        >
          {userInitial}
        </div>
      </div>
    );
  }

  // ── Assistant message: manuscript block with Tasur logo avatar ────────────
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0' }}>
      {/* Tasur logo avatar */}
      <div
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: '50%',
          background: '#F4F0E8',
          border: '1px solid #E8DFC8',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Tasur" width={18} height={18} style={{ objectFit: 'contain' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Message type label */}
        {message.messageType && (
          <div
            style={{
              fontSize: 9,
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontWeight: 700,
              color: accent,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              marginBottom: 8,
            }}
          >
            {message.messageType.replace('_', ' ')}
          </div>
        )}

      {/* Parchment manuscript block */}
      <div
        style={{
          width: '100%',
          padding: '18px 20px 18px 20px',
          // Old paper: warm cream gradient, slightly yellowed edges
          background: 'linear-gradient(180deg, #FDFAF2 0%, #FAF5E8 60%, #F7F0E0 100%)',
          border: '1px solid #E8DFC8',
          borderLeft: `3px solid ${accent}`,
          borderRadius: '0 8px 8px 0',
          // Subtle aged shadow — deeper on bottom/right like held paper
          boxShadow: `
            0 2px 12px rgba(61,43,31,0.07),
            0 1px 3px rgba(61,43,31,0.05),
            inset 0 1px 0 rgba(255,252,240,0.8),
            inset 0 -1px 0 rgba(180,160,120,0.12)
          `,
          fontSize: 13.5,
          lineHeight: 1.78,
          color: '#2D1F0E',
          fontFamily: "'Georgia', serif",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          position: 'relative',
        }}
      >
        {message.content}
        {message.isStreaming && (
          <span
            style={{
              display: 'inline-block',
              width: 2,
              height: 16,
              background: accent,
              borderRadius: 1,
              marginLeft: 3,
              verticalAlign: 'text-bottom',
              opacity: 0.7,
              animation: 'cursor-fade 0.9s ease-in-out infinite',
            }}
          />
        )}
      </div>

      {/* Inline visual suggestion */}
      {message.visualSuggestion && (
        <div style={{ width: '100%', marginTop: 8 }}>
          <VisualSuggestion
            type={message.visualSuggestion.type}
            data={message.visualSuggestion.data}
          />
        </div>
      )}

      {/* Inline micro assessment */}
      {message.microAssessment && !message.isStreaming && (
        <div style={{ width: '100%', marginTop: 8 }}>
          <MicroAssessment
            question={message.microAssessment.question}
            difficulty={message.microAssessment.difficulty}
            learningMode={learningMode}
            questionType={message.microAssessment.question_type}
            onSubmit={onAssessmentSubmit}
          />
        </div>
      )}
      </div>
    </div>
  );
}

// ── SSE event parsing ─────────────────────────────────────────────────────────

interface SSEEvent {
  name: string;
  data: unknown;
}

function extractSSEEvents(buffer: string): SSEEvent[] {
  const blocks = buffer.split('\n\n');
  const events: SSEEvent[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);

    if (!eventMatch || !dataMatch) continue;

    try {
      events.push({
        name: eventMatch[1].trim(),
        data: JSON.parse(dataMatch[1].trim()),
      });
    } catch {
      // Malformed JSON in SSE data — skip this event.
    }
  }

  return events;
}

// ── Type guards for SSE data payloads ─────────────────────────────────────────

function isTokenData(data: unknown): data is { text: string } {
  return typeof data === 'object' && data !== null && 'text' in data;
}

function isErrorData(data: unknown): data is { message: string } {
  return typeof data === 'object' && data !== null && 'message' in data;
}

interface MetadataPayload {
  message_type: string;
  conversation_complete?: boolean;
  micro_assessment?: {
    question: string;
    expected_understanding: string;
    difficulty: 'easy' | 'intermediate' | 'hard';
    question_type?: 'self_check' | 'open';
  } | null;
  visual_suggestion?: {
    type: 'diagram' | 'table' | 'comparison';
    data: unknown;
  } | null;
}

function isMetadata(data: unknown): data is MetadataPayload {
  return typeof data === 'object' && data !== null && 'message_type' in data;
}
