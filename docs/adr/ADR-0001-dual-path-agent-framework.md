# ADR-0001: Dual-Path Agent Framework

## Status

Accepted

## Context

Tasur is a solo build with a hard constraint: it needs an agent framework that can route LLM calls, handle structured output validation, and support streaming — but the agent framework ecosystem is young and none of the options are proven at production scale.

The primary candidate is **Mastra** — a TypeScript-native agent framework with tool registration, workflow orchestration, and structured output built in. But it's actively evolving (pre-1.0), and a single breaking change could stall development. A fallback path is needed that doesn't require rewriting every agent when something breaks.

The second risk is lock-in: if all business logic (prompts, schemas, the knowledge graph, the SR algorithm) imports directly from the framework, switching providers later becomes a multi-week refactor.

## Decision

All six specialist agents implement the framework-agnostic `TasurAgent<TInput, TOutput>` interface from `src/interfaces/agents.ts`. Two concrete registry factories exist behind `AgentRegistry`:

- **`src/mastra/`** — Mastra implementation (primary). `AGENT_PROVIDER=mastra`
- **`src/manual/`** — Vercel AI SDK implementation (fallback). `AGENT_PROVIDER=manual`

`src/config/agent-provider.ts` is the only place that knows both exist. All API routes call `getAgentRegistry()` and never import from either framework directly.

Business logic — Zod schemas (`src/lib/schemas/`), prompt templates (`src/prompts/`), domain types (`src/types/`), and the orchestrator types (`src/interfaces/types.ts`) — never imports from Mastra or Vercel AI SDK.

Switching providers is a single env var change: `AGENT_PROVIDER=manual`.

## Alternatives Considered

### Pure Mastra (no fallback)

- **Pros:** Simpler codebase, less boilerplate, full Mastra feature set immediately
- **Cons:** Single point of failure — if Mastra breaks or introduces breaking changes, all agents break simultaneously
- **Why not:** The framework is pre-1.0 and the solo build context makes framework instability a high-impact risk

### Pure manual (Vercel AI SDK only, no Mastra)

- **Pros:** Maximum control, no framework dependency, simpler mental model
- **Cons:** More boilerplate per agent (streaming, tool registration, workflow state management), misses Mastra's orchestration primitives
- **Why not:** Mastra's tool+workflow primitives are genuinely valuable for the multi-agent orchestration pattern Tasur uses

### LangChain / LangGraph

- **Pros:** Mature ecosystem, well-documented, large community
- **Cons:** Originally Python-first, TypeScript port is less ergonomic, heavy abstraction layers that fight Next.js's server component model
- **Why not:** Not TypeScript-native; the abstraction overhead outweighs the ecosystem benefit for a focused solo build

## Consequences

### Positive

- Framework lock-in is eliminated at the architectural level, not patched later
- Development can continue using `AGENT_PROVIDER=manual` even if Mastra is unavailable
- Adding a third provider (e.g., LlamaIndex, custom) requires touching one file (`agent-provider.ts`) and implementing `AgentRegistry`
- Business logic files are testable without mocking any framework

### Negative

- Slightly more boilerplate: each new agent needs an interface definition plus two implementations (Mastra and manual)
- Stub implementations (current state) throw at runtime — developers must set `AGENT_PROVIDER=manual` and wire the manual agent before testing

### Risks

- If Mastra and manual implementations diverge subtly (e.g., different token counting, slightly different streaming behaviour), bugs may be environment-specific
- Mitigation: both paths validate output against the same Zod schemas, so structural divergence is caught at the boundary

## References

- `src/interfaces/agents.ts` — TasurAgent and TasurStreamingAgent interfaces
- `src/interfaces/registry.ts` — AgentRegistry interface and agent input types
- `src/config/agent-provider.ts` — dual-path toggle
- `03_Tasur_System_Architecture.md` — full system diagram and agent descriptions
