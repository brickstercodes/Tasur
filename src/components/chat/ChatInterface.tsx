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
  };
  visualSuggestion?: {
    type: 'diagram' | 'table' | 'comparison';
    data: Record<string, unknown>;
  };
  isStreaming?: boolean;
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
}

// ── Colour map for message types ──────────────────────────────────────────────

const MESSAGE_TYPE_ACCENT: Record<string, string> = {
  explanation: '#2563eb',
  analogy: '#7c3aed',
  example: '#059669',
  micro_assessment: '#6366f1',
  clarification: '#d97706',
};

// ── Main component ────────────────────────────────────────────────────────────

export function ChatInterface({
  sessionId,
  conceptId,
  conceptName,
  domain,
  learningMode,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                microAssessment: data.micro_assessment ?? undefined,
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {messages.length === 0 && !isStreaming && (
          <p
            style={{
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: 14,
              marginTop: 40,
            }}
          >
            Ask anything about <strong>{conceptName}</strong>
          </p>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            learningMode={learningMode}
            onAssessmentSubmit={handleAssessmentSubmit}
          />
        ))}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '8px 14px',
              color: '#dc2626',
              fontSize: 13,
              margin: '4px 0',
            }}
          >
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid #e2e8f0',
          padding: '12px 0 4px',
          display: 'flex',
          gap: 8,
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
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            fontSize: 14,
            color: '#1e293b',
            background: isStreaming ? '#f8fafc' : '#fff',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
          }}
        />
        <button
          onClick={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isStreaming}
          style={{
            padding: '8px 18px',
            border: 'none',
            borderRadius: 8,
            background: inputText.trim() && !isStreaming ? '#6366f1' : '#e2e8f0',
            color: inputText.trim() && !isStreaming ? '#fff' : '#94a3b8',
            fontSize: 14,
            fontWeight: 500,
            cursor: inputText.trim() && !isStreaming ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
            transition: 'background 0.1s ease',
            alignSelf: 'flex-end',
            height: 40,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  learningMode,
  onAssessmentSubmit,
}: {
  message: ChatMessage;
  learningMode: 'fast' | 'steady';
  onAssessmentSubmit: (answer: string) => void;
}) {
  const isUser = message.role === 'user';
  const accent = message.messageType
    ? MESSAGE_TYPE_ACCENT[message.messageType] ?? '#475569'
    : '#475569';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        margin: '6px 0',
      }}
    >
      {/* Role label + message type tag for assistant messages */}
      {!isUser && message.messageType && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: accent,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 3,
            paddingLeft: 2,
          }}
        >
          {message.messageType.replace('_', ' ')}
        </span>
      )}

      {/* Bubble */}
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
          background: isUser ? '#6366f1' : '#f8fafc',
          color: isUser ? '#fff' : '#1e293b',
          border: isUser ? 'none' : `1px solid ${accent}22`,
          borderLeft: isUser ? 'none' : `3px solid ${accent}`,
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
        {message.isStreaming && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 14,
              background: '#94a3b8',
              borderRadius: 1,
              marginLeft: 2,
              verticalAlign: 'text-bottom',
              animation: 'blink 0.8s step-start infinite',
            }}
          />
        )}
      </div>

      {/* Inline visual suggestion */}
      {!isUser && message.visualSuggestion && (
        <div style={{ maxWidth: '80%', width: '100%', marginTop: 6 }}>
          <VisualSuggestion
            type={message.visualSuggestion.type}
            data={message.visualSuggestion.data}
          />
        </div>
      )}

      {/* Inline micro assessment */}
      {!isUser && message.microAssessment && !message.isStreaming && (
        <div style={{ maxWidth: '80%', width: '100%', marginTop: 6 }}>
          <MicroAssessment
            question={message.microAssessment.question}
            difficulty={message.microAssessment.difficulty}
            learningMode={learningMode}
            onSubmit={onAssessmentSubmit}
          />
        </div>
      )}
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
  micro_assessment?: {
    question: string;
    expected_understanding: string;
    difficulty: 'easy' | 'intermediate' | 'hard';
  } | null;
  visual_suggestion?: {
    type: 'diagram' | 'table' | 'comparison';
    data: unknown;
  } | null;
}

function isMetadata(data: unknown): data is MetadataPayload {
  return typeof data === 'object' && data !== null && 'message_type' in data;
}
