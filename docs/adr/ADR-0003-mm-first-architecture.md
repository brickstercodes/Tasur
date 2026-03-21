# ADR-0003: .mm-First Architecture — Single Source of Truth for Study Content

**Status:** Accepted
**Date:** 2026-03-21
**Module:** 8.5 — .mm-First Architecture Refactor
**Deciders:** Solo build — Anugrah Shetty

---

## Context

### The Problem Being Solved

Tasur's original content pipeline used two sequential LLM agents:

```
Upload
  → Document Parser Agent (LLM call #1)
      → Flat concept list (id, name, raw_content, prerequisites)
  → Mindmap Generator Agent (LLM call #2)
      → MindmapTreeOutput JSON
  → Flashcard Generator (LLM call #3)
  → Orchestrator loop
```

Three problems emerged from real-world testing of this pipeline:

**1. Two representations of the same content that drifted.**
The Parser produced a flat concept graph. The Mindmap Generator produced a hierarchical tree. Both were supposed to represent the same knowledge structure, generated independently. The Orchestrator routed based on the graph while the student saw the mindmap — when they disagreed, the experience was inconsistent. A concept could appear in the graph but not the mindmap, or the mindmap showed a hierarchy that the graph didn't encode.

**2. The Parser produced metadata, not teaching content.**
The Parser's `raw_content` was 2–4 LLM-generated summary sentences. This is metadata about concepts, not actual study material. The Concept Explainer had to reconstruct depth from thin metadata + the original document — a lossy round-trip that degraded flashcard and explanation quality.

**3. Two LLM calls where one sufficed.**
The Parser identified concepts; the Generator arranged them hierarchically. Both were doing structural analysis of the same document in two disconnected passes. A single pass produces richer output because the model reasons about structure and content simultaneously.

---

## Decision

Replace the Document Parser + Mindmap Generator two-agent pipeline with a single **.mm Generator** + deterministic **.mm Parser** approach.

### New Pipeline

```
Upload
  → File text extraction (pdf-parse / mammoth / tesseract — unchanged)
  → .mm Generator Agent (single LLM call)
      → Freeplane XML (.mm format) — the SINGLE SOURCE OF TRUTH
  → .mm Parser (deterministic TypeScript code — zero LLM calls)
      → DerivedConcept[] (concept registry)
      → ConceptEdge[] (knowledge graph)
      → MindmapTreeOutput (visual tree for frontend)
  → Flashcard Generator (LLM call — unchanged)
  → Orchestrator loop (tree-walk for sequencing, LLM for judgment only)
```

### Key Design Choices

**Freeplane .mm XML as the single source of truth.**
The same artifact drives the visual mindmap, concept registry, knowledge graph, teaching sequence, and flashcard anchoring. Drift between representations is impossible — they're all derived from one file.

**Deterministic parsing, not LLM derivation.**
All downstream data structures (concepts, graph edges, visual tree) are computed by `src/lib/mm-parser/` — pure TypeScript + fast-xml-parser. These computations are sub-millisecond and perfectly reproducible.

**Custom TRACKABLE attributes for assessability.**
The .mm format is extended with `TRACKABLE="true"` and `CONCEPT_ID="..."` attributes. The LLM decides which nodes are assessable concepts (per explicit prompt rules), and the parser enforces that every TRACKABLE node has a CONCEPT_ID.

**Tree-walk sequencing (deterministic).**
The default teaching sequence is now a depth-first walk of the .mm tree — code, not LLM reasoning. The Orchestrator focuses its intelligence on assessment evaluation and approach selection, not on "what concept comes next?"

**leafContent = actual teaching material.**
The `.mm` leaf nodes contain the actual study bullet points: definitions, properties, steps, examples. This is fundamentally richer than the old Parser's 2-4 sentence summaries, producing better flashcards and more specific concept explanations.

---

## Alternatives Considered

### Alternative A: Keep the two-agent pipeline, fix drift in post-processing

**Rejected because:** Post-processing to align two independently-generated representations adds complexity without eliminating the root cause (two LLM calls generating the same knowledge in two formats). Any alignment step requires either another LLM call or brittle heuristic matching.

### Alternative B: Use JSON instead of Freeplane .mm XML

**Rejected because:** Freeplane .mm is a proven format with a real-world mindmap application (Freeplane). Using it means students can open the exported file in Freeplane directly. The XML format is also more amenable to human authoring and inspection. The TRACKABLE custom attribute pattern is idiomatic in Freeplane's extension model. The prompt already has validated worked examples in this format from real study use.

### Alternative C: Replace both agents with a single JSON-output agent

**Considered as a variant.** The reason for choosing XML over JSON is that Freeplane's tree structure naturally enforces depth and hierarchy in a way that flat JSON arrays don't. LLMs tend to produce well-structured XML trees when given a concrete Freeplane example in the prompt, whereas they flatten hierarchies when generating JSON tree structures.

---

## Consequences

### Positive

- **One fewer LLM call in the critical path.** Parser + Mindmap Generator (2 calls) → .mm Generator (1 call). The .mm parsing step is sub-millisecond code.

- **Richer content at extraction time.** `leafContent` arrays contain actual teaching bullet points, not 2-4 sentence summaries. Flashcard and explainer agents work with better input.

- **No drift between representations.** One .mm file drives everything. The visual mindmap the student sees matches the knowledge graph the orchestrator uses.

- **Simpler orchestrator.** Removed concept sequencing logic from the orchestrator prompt. Default teaching sequence is tree-traversal code. ~6-8 orchestrator LLM calls per session instead of ~12.

- **Natural teaching UX.** "Pick branch 1, walk through each concept, assess, move on" maps directly to how students use physical mindmaps. Architecture now matches the user experience.

- **Validated format.** The .mm generation approach was validated through real study use before being incorporated into the pipeline. Output quality for exam preparation is established, not theoretical.

### Negative / Trade-offs

- **XML parsing complexity.** fast-xml-parser requires careful configuration (isArray, attributeNamePrefix, allowBooleanAttributes) to handle Freeplane's attribute-heavy format. Edge cases in malformed XML require the retry logic in the .mm Generator agent.

- **LLM must follow a strict format.** The .mm Generator prompt is more constrained than the old Parser prompt — the model must produce valid XML with specific attributes. The retry mechanism handles failures but adds latency on the failure path.

- **Flashcard Generator still expects DocumentParserOutput.** To avoid breaking the Flashcard Generator interface, `buildParserOutputFromDerivedConcepts()` converts DerivedConcept[] to a DocumentParserOutput-shaped object. This adapter will be cleaned up in a future module when FlashcardGeneratorInput is updated to accept DerivedConcept[] directly.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/mm-parser/` (new) | Deterministic .mm XML parser — 5 new files |
| `src/lib/schemas/mm-generator-output.ts` (new) | XML string validation (not Zod) |
| `src/prompts/base/mm-generator.md` (new) | The critical .mm generation prompt |
| `src/mastra/agents/mm-generator.ts` (new) | Mastra .mm Generator agent |
| `src/manual/agents/mm-generator.ts` (new) | Manual .mm Generator agent |
| `src/mock/agents/mm-generator.ts` (new) | Mock .mm Generator agent |
| `src/mock/fixtures/dbms-normalization.mm` (new) | Static .mm fixture for tests |
| `src/lib/orchestration/session-utils.ts` | Added buildInitialGraphStateFromMm, getNextTeachingTarget, buildParserOutputFromDerivedConcepts |
| `src/mastra/workflows/learning-session.ts` | Complete pipeline rewrite |
| `src/manual/orchestration/learning-session.ts` | Complete pipeline rewrite |
| `src/mastra/index.ts` | Added mm-generator to registry |
| `src/manual/index.ts` | Added mm-generator to registry |
| `src/mock/index.ts` | Added mm-generator, deprecated doc-parser + mindmap-generator |
| `src/interfaces/types.ts` | Added mm-generator to AgentName, deprecated old agents |
| `src/interfaces/registry.ts` | Added MmGeneratorInput, updated AgentMap |
| `src/types/concepts.ts` | Added 'sequential' to RelationshipType |
| `src/prompts/base/orchestrator.md` | Removed sequencing logic, added tree-walk awareness |
| `src/prompts/base/document-parser.md` | DEPRECATED header added |
| `src/prompts/base/mindmap-generator.md` | DEPRECATED header added |
| `src/mastra/agents/document-parser.ts` | DEPRECATED comment added |
| `src/mastra/agents/mindmap-generator.ts` | DEPRECATED comment added |
| `src/manual/agents/document-parser.ts` | DEPRECATED comment added |
| `src/manual/agents/mindmap-generator.ts` | DEPRECATED comment added |
| `src/lib/schemas/parser-output.ts` | DEPRECATED comment added |

---

## Related Documents

- [01_Tasur_Product_Vision.md] — Architecture philosophy section
- [04_MM_First_Architecture.md] — Full design specification for this decision
