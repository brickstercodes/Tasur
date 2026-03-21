/**
 * WHY: Fully typed registry of all Tasur specialist agents.
 *
 * Centralises every agent's input/output types in one place and provides a single
 * `AgentRegistry.get<N>()` API so callers receive narrowed return types without
 * casting. Stub implementations (Mastra or manual) satisfy the interface with a
 * simple throw — keeping the type system honest without forcing early wiring.
 * No imports from any agent framework or external library.
 */

import type { ExplainerOutput } from '@/lib/schemas/explainer-output';
import type { FlashcardOutput } from '@/lib/schemas/flashcard-output';
import type { MindmapTreeOutput } from '@/lib/schemas/mindmap-tree-output';
import type { OrchestratorOutputSchema } from '@/lib/schemas/orchestrator-output';
import type { DocumentParserOutput } from '@/lib/schemas/parser-output';
import type { TasurAgent, TasurStreamingAgent } from './agents';
import type { AgentName, OrchestratorInput, OrchestratorOutput } from './types';

// ── Per-agent input types ───────────────────────────────────────────────────

/**
 * Input to the .mm Generator Agent — the primary extraction agent in the
 * .mm-first pipeline. Receives raw text already extracted from the source file
 * (the session layer handles file parsing before calling this agent).
 */
export interface MmGeneratorInput {
  rawText: string;
  fileType: string;          // e.g. "pdf", "docx", "txt" — for context in the prompt
  subjectHint?: string;      // e.g. "dbms" — helps the model use domain terminology
}

/** Raw file buffer + metadata sent to the Document Parser Agent (DEPRECATED). */
export interface DocumentParserInput {
  fileBuffer: Buffer;
  mimeType: string;
  filename: string;
}

/** Parsed concept structure + domain sent to the Mindmap Generator (DEPRECATED). */
export interface MindmapInput {
  parsedContent: DocumentParserOutput;
  domain: string;
}

/** Parsed concept structure + mode sent to the Flashcard Generator. */
export interface FlashcardGeneratorInput {
  parsedContent: DocumentParserOutput;
  domain: string;
  learningMode: 'fast' | 'steady';
}

/** Context for one Concept Explainer conversation turn. */
export interface ConceptExplainerInput {
  conceptId: string;
  domain: string;
  learningMode: 'fast' | 'steady';
  /** Serialised summary injected by the orchestrator (what the student currently knows). */
  studentContext: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentMessage: string;
}

/** Gaps from the Document Parser Agent sent to the Web Search Augmentor. */
export interface WebSearchInput {
  gaps: string[];
  domain: string;
}

// ── AgentMap ────────────────────────────────────────────────────────────────
//
// Canonical map of every registered agent's name → its concrete TasurAgent type.
// `AgentName` is derived from the keys so it is always in sync.
// `AnyTasurAgent` is the value union — used when the specific agent is unknown.

type AgentMap = {
  // Active pipeline agents:
  'mm-generator': TasurAgent<MmGeneratorInput, string>;
  'web-search': TasurAgent<WebSearchInput, unknown>;
  'concept-explainer': TasurStreamingAgent<ConceptExplainerInput, ExplainerOutput>;
  'flashcard-generator': TasurAgent<FlashcardGeneratorInput, FlashcardOutput>;
  orchestrator: TasurAgent<OrchestratorInput, OrchestratorOutputSchema>;
  // Deprecated — retained for comparison testing, not in the active pipeline:
  'document-parser': TasurAgent<DocumentParserInput, DocumentParserOutput>;
  'mindmap-generator': TasurAgent<MindmapInput, MindmapTreeOutput>;
};

export type AnyTasurAgent = AgentMap[AgentName];

// ── AgentRegistry ───────────────────────────────────────────────────────────

/**
 * The single access point for all six Tasur specialist agents.
 *
 * Using `get<N extends AgentName>` means callers get the narrowed return type
 * automatically — no casting required — while stub implementations can satisfy
 * the contract with a simple `throw` (never is assignable to any type).
 *
 * Usage:
 *   const parser = registry.get('document-parser');
 *   // parser is TasurAgent<DocumentParserInput, DocumentParserOutput>
 */
export interface AgentRegistry {
  get<N extends AgentName>(name: N): AgentMap[N];
}

// Re-export OrchestratorOutput (TS interface) alongside OrchestratorOutputSchema
// (Zod-inferred type) so consumers can import both from this file.
export type { OrchestratorOutput };
