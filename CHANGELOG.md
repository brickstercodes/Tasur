# Changelog

All notable changes to Tasur are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — Module 7: Agent Implementations Dual-Path

### Added

- **Dual-path agent architecture**: every agent now has two implementations — `src/mastra/` (production path) and `src/manual/` (reference path) — both satisfying the same `TasurAgent<TInput, TOutput>` interface
- **Mastra agents** (`src/mastra/agents/`):
  - `document-parser.ts` — parses uploaded documents into structured concept lists
  - `flashcard-generator.ts` — generates spaced-repetition flashcards from parsed concepts
  - `concept-explainer.ts` — Socratic tutor with streaming support via `TasurStreamingAgent`
  - `mindmap-generator.ts` — builds hierarchical mindmap tree from concept list
  - `web-search.ts` — fills knowledge gaps via Tavily Search API + LLM structuring
- **Manual agents** (`src/manual/agents/`): mirror implementations calling AI SDK directly (no Mastra layer)
- **`scripts/demo-agents.ts`**: end-to-end demo running Document Parser → Flashcard Generator → Concept Explainer (streaming) on sample DBMS text; run with `npx tsx scripts/demo-agents.ts`

### Fixed

- **Mastra 0.24.9 + AI SDK v6 incompatibility**: `Agent.generate()` and `Agent.stream()` both internally route through Mastra's streaming layer which rejects AI SDK v6 models (`specificationVersion: 'v3'`). Resolved by bypassing the `Agent` class entirely — all agents now call `generateObject()` / `streamText()` from `ai` directly
- **AI SDK v6 usage field rename**: `promptTokens`/`completionTokens` → `inputTokens`/`outputTokens` fixed across all agents in both paths
- **`gemini-2.0-flash` deprecation**: switched `ORCHESTRATOR_MODEL` and `SPECIALIST_MODEL` to `gemini-2.5-flash` for compatibility with new Google AI Studio accounts
- **Vitest env loading**: rewrote `vitest.config.mts` to function form using `vite.loadEnv` so integration tests correctly pick up vars from `.env`
- **`.env.local` override bug**: removed blank/stale LLM-related entries from `.env.local` that were silently shadowing real values in `.env`

### Tests

- 109/109 tests passing (unit + integration)

---

## [0.6.0] — Module 6: In-Memory Student Graph

### Added

- In-memory student knowledge graph tracking which concepts a student has seen, understood, and needs review
- Graph edges represent prerequisite relationships between concepts
- Traversal utilities: find learning path, identify gaps, suggest next concept

---

## [0.5.0] — Module 5: Parsing Pipeline

### Added

- End-to-end document parsing pipeline: file upload → text extraction → concept detection → gap analysis
- Support for PDF, DOCX, and plain-text inputs via `mammoth` and `pdf-parse`
- `DocumentParserOutput` schema: title, subject detection, concepts (id, name, complexity, prerequisites), concept relationships, detected gaps
- `.mm` mindmap file format changes

---

## [0.4.0] — Module 1.5: Retroactive Standards & Tooling

### Added

- Module 1.5: Retroactive Standards & Tooling (this module)
  - Prettier with `.prettierrc` config (singleQuote, trailingComma all, printWidth 100)
  - ESLint with `@typescript-eslint`, `eslint-plugin-import`; rules: `max-lines-per-function` (warn 100), `max-params` (warn 6), `import/order`
  - npm scripts: `lint`, `lint:fix`, `format`, `format:check`
  - File-level WHY block comments on every `.ts` / `.tsx` file in `src/`
  - `.env.example` with alphabetized keys and placeholder values
  - `.gitignore` updated: explicit env file exclusions, `.env.example` whitelisted for commit
  - `/docs` directory with Divio structure: quickstart, architecture overview, troubleshooting
  - `docs/adr/ADR-0001-dual-path-agent-framework.md`
  - `docs/adr/ADR-0002-in-memory-graph-storage.md`
  - `CHANGELOG.md` (this file)

---

## [0.3.0] — Module 3: Database Migrations

### Added

- Supabase PostgreSQL schema migrations in `supabase/migrations/`
- Tables: `users`, `study_sessions`, `documents`, `concepts`, `concept_relationships`,
  `understanding_state`, `flashcards`, `mindmaps`, `chat_messages`
- Database enums: `learning_mode_enum`, `session_status_enum`, `file_type_enum`,
  `complexity_enum`, `card_type_enum`, `difficulty_enum`, `chat_role_enum`
- Row Level Security (RLS) policies: users can only access their own session data
- Convenience row types and SM-2 state shape in `src/types/database.ts`
- `SM2State` interface for spaced repetition state stored in `flashcards.sr_state` JSONB
- `AssessmentEntry` interface for assessment history stored in `understanding_state.assessment_history` JSONB

---

## [0.2.0] — Module 2: Interfaces, Types, and Schemas

### Added

- Framework-agnostic agent contracts in `src/interfaces/agents.ts`
  - `TasurAgent<TInput, TOutput>` — base execute contract
  - `TasurStreamingAgent<TInput, TOutput>` — streaming extension for Phase 2 chat
  - `AgentResult<T>` — standardised return type with usage tracking
- Agent registry in `src/interfaces/registry.ts`
  - `AgentRegistry` — typed `get<N>()` interface
  - Per-agent input types: `DocumentParserInput`, `MindmapInput`, `FlashcardGeneratorInput`,
    `ConceptExplainerInput`, `WebSearchInput`
  - `AgentMap` — canonical name → TasurAgent type mapping
- Orchestrator I/O types in `src/interfaces/types.ts`
  - `AgentName` union type
  - `OrchestratorInput`, `OrchestratorOutput`, `NextAction`, `UnderstandingUpdate`
- Domain types in `src/types/`
  - `src/types/concepts.ts` — `ConceptNode`, `ConceptEdge`, `ConceptComplexity`, `RelationshipType`
  - `src/types/graph.ts` — `StudentGraphState`
  - `src/types/sessions.ts` — `StudySession`, `LearningMode`, `SessionStatus`
  - `src/types/understanding.ts` — `UnderstandingState`, `AssessmentHistory`, `ConfidenceScore`
- Zod output schemas for all five specialist agents in `src/lib/schemas/`
  - `parser-output.ts` — `DocumentParserOutput` (concepts, relationships, gaps)
  - `mindmap-output.ts` — `MindmapOutput` (nodes, edges, layout hint, clusters)
  - `explainer-output.ts` — `ExplainerOutput` (message type, content, micro-assessment, handoff)
  - `flashcard-output.ts` — `FlashcardOutput` (cards with type, front, back, hints)
  - `orchestrator-output.ts` — `OrchestratorOutputSchema` (understanding update, next action, reasoning)
- Dual-path agent toggle in `src/config/agent-provider.ts`
  - `getAgentRegistry()` — reads `AGENT_PROVIDER` env var and returns the correct registry
- Stub registry factories (throw with helpful error messages until wired up)
  - `src/mastra/index.ts` — `createMastraRegistry()`
  - `src/manual/index.ts` — `createManualRegistry()`

---

## [0.1.0] — Module 1: Project Scaffolding

### Added

- Next.js 16 project with App Router, TypeScript strict mode, Tailwind CSS v4
- Supabase client factory in `src/lib/supabase.ts`
  - `createServerClient()` — service role key, no session persistence (for API routes)
  - `createBrowserClient()` — anon key, subject to RLS (for client components)
  - `getBrowserClient()` — singleton browser client for non-component use
- Base prompt templates in `src/prompts/base/`
  - `orchestrator.md`, `document-parser.md`, `mindmap-generator.md`,
    `concept-explainer.md`, `flashcard-generator.md`
- Domain-specific prompt templates in `src/prompts/domains/`
  - `dbms.md`, `os.md`, `cn.md`, `se.md`, `sqa.md`, `dc.md`
- Placeholder landing page (`src/app/page.tsx`) — "Tasur — Coming Soon"
- Root layout with Geist font and site metadata (`src/app/layout.tsx`)
- Dependencies: `@mastra/core`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`,
  `@supabase/supabase-js`, `better-auth`, `reactflow`, `zod`, `mammoth`,
  `pdf-parse`, `tesseract.js`
