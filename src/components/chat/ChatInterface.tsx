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
  createdAt?: number;
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
  streamCompleteTick?: number;
  conversationComplete?: boolean;
}

interface HistoryRow {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: string | null;
  metadata?: {
    micro_assessment?: {
      question: string;
      expected_understanding: string;
      difficulty: 'easy' | 'intermediate' | 'hard';
      question_type?: 'self_check' | 'open';
    } | null;
    visual_suggestion?: {
      type: 'diagram' | 'table' | 'comparison';
      data: Record<string, unknown>;
    } | null;
  } | null;
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

// ── Markdown renderer ─────────────────────────────────────────────────────────
//
// Lightweight inline renderer for the assistant's Georgia-serif message blocks.
// Handles the patterns the LLM actually emits: bold, italic, bullets, headings.
// No external dependency — keeps the rendering tied to the app's font stack.

function parseInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part || null;
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line === '') {
      if (i > 0 && i < lines.length - 1) {
        result.push(<div key={i} style={{ height: '0.55em' }} />);
      }
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      result.push(
        <div key={i} style={{ fontWeight: 700, marginTop: i > 0 ? 6 : 0, marginBottom: 2 }}>
          {parseInline(line.slice(4))}
        </div>
      );
      i++;
      continue;
    }

    if (line.startsWith('## ') || line.startsWith('# ')) {
      const depth = line.startsWith('## ') ? 3 : 2;
      const prefix = line.startsWith('## ') ? '## ' : '# ';
      result.push(
        <div key={i} style={{ fontWeight: 700, fontSize: `${1 + 0.05 * depth}em`, marginTop: i > 0 ? 8 : 0, marginBottom: 3 }}>
          {parseInline(line.slice(prefix.length))}
        </div>
      );
      i++;
      continue;
    }

    // Collect consecutive bullet items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const bulletStart = i;
      const bullets: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        bullets.push(lines[i].slice(2));
        i++;
      }
      result.push(
        <div key={bulletStart} style={{ marginTop: 4, marginBottom: 4 }}>
          {bullets.map((b, bi) => (
            <div key={bi} style={{ display: 'flex', gap: 8, marginBottom: bi < bullets.length - 1 ? 3 : 0 }}>
              <span style={{ flexShrink: 0, opacity: 0.6, marginTop: 1 }}>•</span>
              <span>{parseInline(b)}</span>
            </div>
          ))}
        </div>
      );
      continue;
    }

    result.push(<div key={i}>{parseInline(line)}</div>);
    i++;
  }

  return <>{result}</>;
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
            createdAt: new Date(row.created_at).getTime(),
            messageType: row.message_type ?? undefined,
            microAssessment: row.metadata?.micro_assessment ?? undefined,
            visualSuggestion: row.metadata?.visual_suggestion ?? undefined,
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
        createdAt: Date.now(),
      };

      const streamingId = `assistant-${Date.now()}`;
      const streamingPlaceholder: ChatMessage = {
        id: streamingId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        createdAt: Date.now(),
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
          m.id === streamingId
            ? {
                ...m,
                isStreaming: false,
                streamCompleteTick: Date.now(),
              }
            : m,
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
        @keyframes bubble-in-user {
          from { opacity: 0; transform: translateX(10px) translateY(4px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
        @keyframes bubble-in-assistant {
          from { opacity: 0; transform: translateX(-10px) translateY(5px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) translateY(0) scale(1); }
        }
        @keyframes ink-settle {
          0% { filter: blur(1.8px); transform: translateY(2px); opacity: 0.72; }
          100% { filter: blur(0); transform: translateY(0); opacity: 1; }
        }
        @keyframes thinking-pulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 0%, transparent); }
          50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary) 24%, transparent); }
        }
        @keyframes send-spin {
          0% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(0.9) rotate(18deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .chat-scroll::-webkit-scrollbar { width: 4px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        .chat-scroll::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 10px; }
        .send-btn:hover:not(:disabled) { background: #7A3803 !important; }
        .moveon-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .bubble-enter-user { animation: bubble-in-user 260ms cubic-bezier(0.2, 0.78, 0.28, 1) both; }
        .bubble-enter-assistant { animation: bubble-in-assistant 280ms cubic-bezier(0.2, 0.78, 0.28, 1) both; }
        .assistant-paper-stream-complete { animation: ink-settle 420ms ease-out both; }
        .assistant-avatar-thinking { animation: thinking-pulse 1.25s ease-in-out infinite; }
        .message-type-label { animation: bubble-in-assistant 220ms cubic-bezier(0.2, 0.78, 0.28, 1) both; }
        .send-btn-streaming .send-icon { animation: send-spin 700ms ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .bubble-enter-user,
          .bubble-enter-assistant,
          .assistant-paper-stream-complete,
          .assistant-avatar-thinking,
          .message-type-label,
          .send-btn-streaming .send-icon {
            animation: none !important;
          }
        }
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
                  fontStyle: 'italic' as const,
                  fontSize: 18,
                  color: 'var(--text-muted)',
                  margin: 0,
                }}
              >
                Ask anything about {conceptName}
              </p>
            </div>
          )}

          {messages.map((message, idx) => (
            <MessageBubble
              key={message.id}
              message={message}
              learningMode={learningMode}
              userInitial={userInitial}
              onAssessmentSubmit={handleAssessmentSubmit}
              assessmentSubmitted={
                // Mark as submitted if a user message follows this one in the history,
                // meaning the student already answered this assessment.
                message.microAssessment != null &&
                idx < messages.length - 1 &&
                messages[idx + 1].role === 'user'
              }
            />
          ))}

          {error && (
            <div
              style={{
                background: 'var(--error-bg)',
                border: '1px solid var(--error-border)',
                borderLeft: '3px solid var(--primary)',
                borderRadius: 8,
                padding: '10px 14px',
                color: 'var(--error-text)',
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
              onClick={() => {
                // router.refresh() purges the RSC cache for the current tree so
                // the mindmap page re-fetches fresh confidence scores from the DB.
                router.refresh();
                router.push(`/study/${sessionId}/mindmap`);
              }}
              style={{
                width: '100%',
                padding: '13px 24px',
                border: 'none',
                borderRadius: 10,
                background: 'var(--primary)',
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
            borderTop: '1px solid var(--border)',
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
              border: '1px solid var(--input-border)',
              borderRadius: 10,
              fontSize: 13.5,
              color: 'var(--text)',
              background: isStreaming ? 'var(--bg)' : 'var(--input-bg)',
              resize: 'none',
              outline: 'none',
              fontFamily: "'Georgia', serif",
              lineHeight: 1.55,
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--input-border)';
            }}
          />
          <button
            className={`send-btn ${isStreaming ? 'send-btn-streaming' : ''}`}
            onClick={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isStreaming}
            style={{
              width: 40,
              height: 40,
              border: 'none',
              borderRadius: 10,
              background: inputText.trim() && !isStreaming ? 'var(--primary)' : 'var(--border)',
              color: inputText.trim() && !isStreaming ? '#fff' : 'var(--text-muted)',
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
            <span className="send-icon">↑</span>
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
  assessmentSubmitted = false,
}: {
  message: ChatMessage;
  learningMode: 'fast' | 'steady';
  userInitial: string;
  onAssessmentSubmit: (answer: string) => void;
  assessmentSubmitted?: boolean;
}) {
  const isUser = message.role === 'user';
  const accent = message.messageType
    ? (MESSAGE_TYPE_ACCENT[message.messageType] ?? 'var(--text-muted)')
    : 'var(--text-muted)';
  const userAvatarColor = avatarColorForInitial(userInitial);

  if (isUser) {
    // ── User bubble: parchment float, right-aligned with avatar ──────────────
    return (
      <div className="bubble-enter-user" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', gap: 10, margin: '10px 0' }}>
        <div
          style={{
            maxWidth: '72%',
            padding: '11px 16px',
            borderRadius: '16px 16px 4px 16px',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(28,25,23,0.08)',
            color: 'var(--text)',
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
    <div className="bubble-enter-assistant" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '14px 0' }}>
      {/* Tasur logo avatar */}
      <div
        className={message.isStreaming && message.content.length === 0 ? 'assistant-avatar-thinking' : undefined}
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: '50%',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border)',
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
            className="message-type-label"
            style={{
              fontSize: 11,
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

      {/* Manuscript block */}
      <div
        className={!message.isStreaming && message.streamCompleteTick ? 'assistant-paper-stream-complete' : undefined}
        style={{
          width: '100%',
          padding: '18px 20px 18px 20px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${accent}`,
          borderRadius: '0 8px 8px 0',
          boxShadow: `
            0 2px 12px rgba(28,25,23,0.07),
            0 1px 3px rgba(28,25,23,0.05)
          `,
          fontSize: 13.5,
          lineHeight: 1.78,
          color: 'var(--text)',
          fontFamily: "'Georgia', serif",
          wordBreak: 'break-word',
          position: 'relative',
        }}
      >
        {message.isStreaming ? (
          <>
            <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
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
          </>
        ) : (
          renderMarkdown(message.content)
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
            initialSubmitted={assessmentSubmitted}
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
