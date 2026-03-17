# Architecture Overview

Tasur is an AI-orchestrated study platform. This document is a brief orientation — the three planning documents contain the full detail.

---

## Planning documents (read these first)

| Document                          | Contents                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `01_Tasur_Product_Vision.md`      | The problem, the five-phase learning flow, the orchestrator philosophy              |
| `02_Tasur_Feature_Breakdown.md`   | Feature scope by version (v0.1 → v1.0 → v2.0+)                                      |
| `03_Tasur_System_Architecture.md` | System diagram, dual-path agent design, knowledge graph, DB schema, prompt strategy |

---

## Key architectural decisions

### Dual-path agent system

Every agent in Tasur (document parser, mindmap generator, concept explainer, flashcard generator, orchestrator) is implemented behind a framework-agnostic `TasurAgent<TInput, TOutput>` interface. Two implementations exist:

- **Mastra** (`src/mastra/`) — primary path, registers agents as Mastra tools
- **Manual** (`src/manual/`) — fallback path, direct Vercel AI SDK calls

`AGENT_PROVIDER` env var switches between them. Business logic (prompts, schemas, graph traversal, SR algorithm) never imports from either framework.

→ See [ADR-0001](adr/ADR-0001-dual-path-agent-framework.md) for the full decision record.

### In-memory knowledge graph

The student's understanding state lives in an in-memory TypeScript graph (`StudentGraph`) during an active session. Sub-millisecond traversal keeps orchestrator routing fast. The graph is periodically serialized to Supabase as `StudentGraphState` so sessions survive page refreshes and device switches.

→ See [ADR-0002](adr/ADR-0002-in-memory-graph-storage.md) for the full decision record.

### Framework-agnostic business logic

All business logic lives in `src/`:

| Directory          | What lives here                                                        |
| ------------------ | ---------------------------------------------------------------------- |
| `src/interfaces/`  | TasurAgent contracts, AgentRegistry, orchestrator I/O types            |
| `src/types/`       | Domain types (concepts, sessions, graph, understanding model)          |
| `src/lib/schemas/` | Zod schemas for every agent's output (validated at framework boundary) |
| `src/prompts/`     | Markdown prompt templates (base + per-domain)                          |
| `src/config/`      | The dual-path toggle (`getAgentRegistry()`)                            |
| `src/mastra/`      | Mastra agent implementations                                           |
| `src/manual/`      | Vercel AI SDK agent implementations                                    |

---

## Tech stack

| Layer             | Technology                                         |
| ----------------- | -------------------------------------------------- |
| Frontend          | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Mindmap rendering | react-flow                                         |
| Backend           | Next.js API routes + server actions                |
| Database          | Supabase (PostgreSQL + Storage)                    |
| Auth              | BetterAuth                                         |
| Agent framework   | Mastra (primary) + Vercel AI SDK (fallback)        |
| Schema validation | Zod v4                                             |
| LLM APIs          | Anthropic (Claude) + OpenAI                        |
