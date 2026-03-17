# ADR-0002: In-Memory Graph Storage for the Student Knowledge Graph

## Status

Accepted

## Context

The Tasur orchestrator makes routing decisions on every student interaction — after each micro-assessment, after each flashcard, after each message in the concept breakdown chat. Each decision requires traversing the student's knowledge graph: finding prerequisite concepts, checking confidence scores, identifying which modalities have been effective, and computing what to teach next.

These traversals must be **sub-millisecond**. If graph queries add 100–200ms to every orchestrator call, the interaction latency becomes noticeable and the product feels slow.

The student graph is also session-scoped: it starts from a parsed document, evolves as the student interacts, and needs to survive page refreshes and device switches (sessions can be resumed).

## Decision

The student knowledge graph lives in an **in-memory TypeScript data structure** (`StudentGraph`) during an active session. The canonical types are in `src/types/`:

- `ConceptNode` — a node with raw content, student state (confidence, exposure count, effective modalities), and metadata
- `ConceptEdge` — a directed edge with type and weight
- `StudentGraphState` — the serializable snapshot (nodes + edges + lastSyncedAt)

The in-memory graph is **periodically serialized to Supabase** as a `StudentGraphState` JSON blob on meaningful state changes (after each orchestrator update). At session resume, Tasur reads the snapshot back and reconstructs the in-memory graph.

The orchestrator receives `StudentGraphState` on every call — it reads the snapshot, not a live DB query.

## Alternatives Considered

### PostgreSQL only (no in-memory layer)

- **Pros:** No synchronization complexity, always durable, simple mental model
- **Cons:** Graph traversal in PostgreSQL requires recursive CTEs or multiple round trips; latency is 10–100ms per query vs. <1ms in memory
- **Why not:** Traversal performance is a hard constraint — the orchestrator runs on every student interaction. A 50ms graph query per call makes the system feel slow.

### Neo4j (dedicated graph database)

- **Pros:** Optimized for graph traversal, rich query language (Cypher), sub-millisecond local queries
- **Cons:** Additional infrastructure to host and manage; significant operational complexity for a solo build; not supported natively by Supabase
- **Why not:** The graph is per-user and session-scoped — Neo4j's advantages shine at cross-user graph queries. The added infrastructure cost is not justified for v0.1.

### Apache AGE (graph extension for PostgreSQL)

- **Pros:** Graph-native queries on top of PostgreSQL, single database
- **Cons:** Uncertain support on Supabase's managed PostgreSQL; limited documentation; immature extension ecosystem
- **Why not:** Too risky to rely on an uncertain Supabase-compatibility story for core functionality

## Consequences

### Positive

- Orchestrator graph traversal is effectively free (<1ms in memory)
- `StudentGraphState` is plain JSON — it round-trips cleanly through Supabase's `jsonb` column without any serialization ceremony
- The graph can be passed directly to LLM prompts as structured context without any additional DB queries

### Negative

- Memory usage grows with session size — very large documents with hundreds of concepts will use more RAM. Acceptable for v0.1's target of typical lecture note uploads (20–100 concepts).
- Synchronization complexity: writes to Supabase must happen at the right moments (after each orchestrator update) or state is lost on crash
- The in-memory graph is lost if the server process restarts mid-session — session resume mitigates this but adds latency on first load

### Risks

- If the server crashes between Supabase sync points, the student loses understanding state since the last sync. Mitigation: sync after every orchestrator update, not on a timer.
- Stale graph state if multiple tabs are open simultaneously. Mitigation: use session-level locking; out of scope for v0.1.

## References

- `src/types/graph.ts` — StudentGraphState type
- `src/types/concepts.ts` — ConceptNode and ConceptEdge types
- `src/types/understanding.ts` — UnderstandingState type
- `src/types/database.ts` — `understanding_state` and `concepts` table schemas
- `03_Tasur_System_Architecture.md` — Section: "In-Memory Knowledge Graph"
