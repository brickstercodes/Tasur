/**
 * WHY: Framework-agnostic agent contracts.
 *
 * Every piece of business logic in Tasur talks to these interfaces, never to Mastra
 * or Vercel AI SDK directly. This is the isolation layer that makes the dual-path
 * architecture possible — swapping providers is a one-line env var change, not a
 * codebase refactor. No imports from any agent framework or external library.
 */

/**
 * Standardised return type for every agent call.
 *
 * `data`     — the validated, schema-conforming output
 * `usage`    — token counts from the underlying LLM call (for cost tracking)
 * `duration` — wall-clock time in milliseconds
 */
export interface AgentResult<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  duration: number;
}

/**
 * Base contract for all Tasur specialist agents.
 * Implementations live in src/mastra/ (Mastra) or src/manual/ (Vercel AI SDK).
 */
export interface TasurAgent<TInput, TOutput> {
  execute(input: TInput): Promise<AgentResult<TOutput>>;
}

/**
 * Extension for agents that support real-time text streaming (SSE).
 * Used by the Concept Explainer for the Phase 2 chat interface.
 *
 * `stream`  — yields raw text chunks for server-sent events
 * `execute` — returns the full response once all chunks are complete
 */
export interface TasurStreamingAgent<TInput, TOutput> extends TasurAgent<TInput, TOutput> {
  stream(input: TInput): AsyncIterable<string>;
}
