# Tasur — .mm-First Architecture Redesign

> **Status — April 2026:** Migration **COMPLETE**. All four phases shipped. The .mm-first pipeline is the sole production path. Key implementation details that differed from this design document: (1) PDF/image extraction uses **Gemini vision exclusively** (heuristic text extraction abandoned after hallucination issues); (2) a **three-pass XML repair step** was added before parsing to handle malformed .mm output; (3) in production, the entire pipeline runs inside a **Go microservice** (not Next.js), embedded prompts at build time via `//go:embed`; (4) the Go mmparser.go mirrors the TypeScript mm-parser logic.

## Document Purpose

This document describes a fundamental architectural change to Tasur's content pipeline: replacing the current multi-step extraction pipeline (Document Parser + Mindmap Generator as separate agents) with a single **.mm-first generation step** that produces a Freeplane-format mindmap as the **primary artifact** from which all other data structures (knowledge graph, concept registry, flashcard anchors, teaching roadmap) are derived.

This change was motivated by real-world testing: the .mm generation approach consistently produces richer, more study-ready output than the current Parser-then-Mindmap pipeline, and eliminates an entire class of drift bugs where the mindmap and knowledge graph disagree.

---

## The Problem With the Current Architecture

### Current Pipeline (03_System_Architecture.md)

```
Upload Document
    --> Document Parser Agent (LLM call #1)
        --> Flat concept list + relationships + gaps
    --> Web Search Agent (conditional, LLM call #2)
        --> Augmentations merged into concept list
    --> Mindmap Generator Agent (LLM call #3)
        --> Hierarchical visual tree (MindmapTreeOutput JSON)
    --> Flashcard Generator Agent (LLM call #4)
        --> Cards anchored to concept_ids
    --> Orchestrator initializes StudentGraph from Parser output
```

### Three Problems This Creates

**1. Two representations of the same content that can drift.**
The Parser produces a flat concept list with relationships. The Mindmap Generator produces a hierarchical tree. Both are supposed to represent the same knowledge structure, but they're generated independently. The Orchestrator routes based on the graph (from Parser output), while the student sees the mindmap (from Generator output). When they disagree — a concept exists in the graph but not the mindmap, or the mindmap shows a hierarchy the graph doesn't encode — the student's experience becomes inconsistent.

**2. The Parser extracts labels, not teaching content.**
The Document Parser outputs concept names, 2-4 sentence `raw_content`, prerequisites, and keywords. This is metadata about concepts, not the actual content a student needs to study. The .mm approach, by contrast, produces leaf nodes that contain the actual teaching points: definitions, properties, steps, examples, diagram callouts. The Concept Explainer currently has to reconstruct this depth from the thin Parser output + the original document — a lossy and unnecessary round-trip.

**3. Two LLM calls where one suffices.**
The Parser and Mindmap Generator are both doing structural analysis of the same document. The Parser identifies what concepts exist; the Generator arranges them hierarchically. A single .mm generation step does both simultaneously, producing a richer result because the model reasons about structure and content in one pass rather than two disconnected passes.

---

## The .mm-First Architecture

### New Pipeline

```
Upload Document
    --> File extraction (pdf-parse, mammoth, tesseract — unchanged)
    --> Raw text
    --> .mm Generator Agent (single LLM call — replaces Parser + Mindmap Generator)
        --> Freeplane XML (.mm format)
    --> .mm Parser (deterministic code, NOT an LLM call)
        --> Derives: concept registry, knowledge graph edges, teaching roadmap, mindmap tree
    --> Web Search Agent (conditional, same as before)
        --> Augmentations merged into tree
    --> Flashcard Generator Agent (same as before, anchors to concept_ids from tree)
    --> Orchestrator walks the tree for teaching sequence
```

### What the .mm Generator Produces

A Freeplane-format XML document that serves as the **single source of truth** for the entire study session. Example structure:

```xml
<map version="freeplane 1.11.9">
<node TEXT="Unit 3: Synchronization in Distributed Computing" FOLDED="false">
  <font BOLD="true" NAME="SansSerif" SIZE="16"/>

  <node TEXT="1. Introduction" POSITION="right" FOLDED="false" TRACKABLE="true" CONCEPT_ID="dc_sync_intro">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="Challenges in Distributed Systems" TRACKABLE="true" CONCEPT_ID="dc_sync_challenges">
      <node TEXT="Synchronization is much more difficult compared to uniprocessor/multiprocessor systems."/>
      <node TEXT="Two clocks do not agree perfectly."/>
      <node TEXT="Time synchronization is required for Correctness and Fairness."/>
      <node TEXT="Needed for sender-receiver sync and coordination of joint activity."/>
      <node TEXT="[DIAGRAM TO STUDY: Clock Synchronization issue - output.c vs output.o compile mismatch]"/>
    </node>

    <node TEXT="Clock Skew vs. Clock Drift" TRACKABLE="true" CONCEPT_ID="dc_clock_skew_drift">
      <node TEXT="Clock Skew: Relative difference in clock values of two processes."/>
      <node TEXT="Clock Drift: Relative difference in clock frequencies of two processes."/>
      <node TEXT="A non-zero clock skew implies clocks are not synchronized."/>
      <node TEXT="For a perfect clock, skew = drift = 0."/>
    </node>
  </node>
</node>
</map>
```

### Key Design Decisions in the .mm Format

**Custom attributes for tracking:**
- `TRACKABLE="true"` — This node gets a confidence score in the StudentGraph. Only present on nodes that represent assessable concepts (typically second and third-level nodes). Leaf detail nodes do NOT get this attribute.
- `CONCEPT_ID="dc_clock_skew_drift"` — Stable identifier for linking to flashcards, understanding state, and chat history. Only present on TRACKABLE nodes.

**The prompt instructs the generator to flag these explicitly.** The generator decides which nodes are trackable based on granularity rules: a trackable concept should be at the level of a textbook sub-section — not broader ("Computer Science") and not narrower ("the letter B in B-tree"). This replaces the Parser's concept extraction heuristics with a single integrated judgment.

**Diagram callouts are preserved as leaf nodes** with the `[DIAGRAM TO STUDY: ...]` convention. This ensures students don't miss visual content from the source material.

**No emojis.** The prompt explicitly prohibits emoji usage for clean, professional output.

---

## What Gets Derived From the .mm (Deterministic Code)

The .mm XML is parsed by a utility function (not an LLM) that extracts all downstream data structures:

### 1. Concept Registry

Every node with `TRACKABLE="true"` becomes a concept entry:

```typescript
interface DerivedConcept {
  id: string;               // From CONCEPT_ID attribute
  name: string;             // From TEXT attribute
  depth: number;            // Tree depth (1 = top-level branch, 2 = sub-topic, etc.)
  parentId: string | null;  // Parent CONCEPT_ID (null for root-level concepts)
  childConceptIds: string[]; // Direct trackable children
  leafContent: string[];    // TEXT values of non-trackable child nodes (the teaching points)
  hasDiagram: boolean;      // true if any leaf contains "[DIAGRAM TO STUDY:"
  position: number;         // Order within siblings (preserves teaching sequence)
}
```

**Key insight:** `leafContent` contains the actual teaching material — the bullet points under each concept. This is richer than the current Parser's `raw_content` field because the .mm generator has already organized the source material into structured, study-ready points.

### 2. Knowledge Graph Edges

Derived from tree structure (deterministic, no LLM needed):

```typescript
// Parent-child in tree = prerequisite relationship
// (understanding "Introduction" is prerequisite for "Physical Clocks")
edges = treeNodes
  .filter(n => n.trackable && n.parentTrackable)
  .map(n => ({
    from: n.parentConceptId,
    to: n.conceptId,
    type: 'prerequisite' as const,
    weight: 1.0
  }));

// Sibling trackable nodes at same level = sequential relationship
// (within "Introduction": "Challenges" comes before "Clock Skew vs Drift")
siblings = groupBySameParent(trackableNodes)
  .flatMap(group => consecutive_pairs(group))
  .map(([prev, next]) => ({
    from: prev.conceptId,
    to: next.conceptId,
    type: 'sequential' as const,
    weight: 0.5
  }));
```

This replaces the Parser's `concept_relationships` array. The tree structure IS the relationship graph — no separate extraction needed. The `related` and `contrasts_with` edge types from the current schema can be added later via an optional enrichment step if needed, but for v0.1 the tree-derived edges are sufficient.

### 3. Teaching Roadmap (Orchestrator Input)

The tree order IS the teaching sequence. The Orchestrator no longer needs to reason about "what concept comes next" for basic sequencing — it's a depth-first walk:

```
1. Introduction (branch)
   1.1 Challenges in Distributed Systems (teach + assess)
   1.2 Clock Skew vs. Clock Drift (teach + assess)
   1.3 Handling Skew (teach + assess)
   1.4 External vs. Internal Synchronization (teach + assess)
2. Physical Clocks (branch)
   2.1 Basic Concepts (teach + assess)
   2.2 Time Standards (teach + assess)
   2.3 Cristian's Algorithm (teach + assess)
   ...
```

The Orchestrator's job shifts from "decide which concept to teach next" (graph traversal + reasoning) to "deeply understand where the student is right now and adapt the teaching approach." It still makes routing decisions — but those decisions are about HOW to teach (approach, depth, modality), not WHAT to teach (sequence).

The Orchestrator can still override the tree order when needed (e.g., student explicitly asks about a later topic, or assessment reveals a prerequisite gap). But the default path is deterministic tree traversal, not LLM reasoning.

### 4. Flashcard Anchoring

Flashcards anchor to `CONCEPT_ID` values from trackable nodes, exactly as they do today. The schema doesn't change:

```typescript
{
  id: "card_001",
  concept_id: "dc_clock_skew_drift",  // From .mm CONCEPT_ID attribute
  type: "recall",
  front: "What is the difference between clock skew and clock drift?",
  back: "Clock skew is the relative difference in clock values...",
  ...
}
```

The Flashcard Generator agent receives the same input shape it does now — a concept with its content. The content is now richer (the `leafContent` array from the .mm) rather than the Parser's thin `raw_content`.

### 5. Visual Mindmap for Student

The .mm XML is either:
- **Option A:** Rendered directly by the frontend using a Freeplane-compatible renderer or converted to the existing `MindmapTreeOutput` JSON for react-flow/markmap rendering.
- **Option B:** Converted to `MindmapTreeOutput` JSON by the same deterministic parser that extracts concepts. This is the simpler path — the existing frontend rendering code doesn't change.

**Recommended: Option B.** The .mm is the source of truth stored in the database. The `MindmapTreeOutput` JSON is derived on read for the frontend. This means the existing mindmap rendering code and API endpoints don't need to change at all.

---

## What Changes in the Codebase

### Agents

| Component | Current State | Change Required |
|-----------|--------------|-----------------|
| **Document Parser Agent** | Exists in manual path (deprecated, retained for testing). Extracted flat concept list. | **REPLACED** by .mm Generator Agent. The file text extraction logic (pdf-parse, mammoth, etc.) stays — it's the LLM prompt and output schema that changed. |
| **Mindmap Generator Agent** | Exists in both paths. Takes Parser output, produces MindmapTreeOutput JSON. | **REMOVED.** Its job is now done by the .mm Generator in a single step. |
| **.mm Generator Agent** | Does not exist. | **NEW.** Single agent that takes raw extracted text and produces Freeplane XML. Replaces both Document Parser and Mindmap Generator. |
| **Concept Explainer Agent** | Exists and works. | **MINOR CHANGE.** Input now includes `leafContent` (richer teaching points from .mm) instead of `raw_content` (thin Parser output). The prompt may need slight adjustment to leverage the richer input. |
| **Flashcard Generator Agent** | Exists and works. | **MINOR CHANGE.** Input concept data is now derived from .mm (richer content). No schema change needed — `concept_id` anchoring works the same way. |
| **Orchestrator** | Exists. Routes based on StudentGraph queries. | **SIMPLIFIED.** Default teaching sequence is now tree traversal (deterministic code). Orchestrator focuses on assessment evaluation, approach selection, and mode adaptation rather than concept sequencing. |
| **Web Search Agent** | Exists. Fills gaps detected by Parser. | **MINOR CHANGE.** Gaps are now detected from the .mm (e.g., concepts mentioned but not expanded). The agent's core behavior doesn't change. |
| **Mock agents** | Exist for all 6 agents. | **UPDATE** mock .mm generator to return a static .mm fixture. Remove mock document-parser and mock mindmap-generator. |

### New Utility: .mm Parser

A new deterministic utility (NOT an LLM agent) that parses the Freeplane XML:

```
src/lib/mm-parser/
  index.ts          -- Main parser: XML string --> ParsedMindmap
  types.ts          -- ParsedMindmap, MmNode, DerivedConcept types
  concept-extractor.ts  -- Extracts DerivedConcept[] from tree
  graph-builder.ts      -- Builds ConceptNode[] + ConceptEdge[] for StudentGraph
  tree-converter.ts     -- Converts to MindmapTreeOutput JSON for frontend
```

This is pure TypeScript with an XML parsing library (e.g., `fast-xml-parser`). Zero LLM calls. It replaces the `buildInitialGraphState()` function in `session-utils.ts` that currently converts Parser output to graph state.

### Schemas

| Schema | Change |
|--------|--------|
| `parser-output.ts` (DocumentParserOutput) | **DEPRECATED.** No longer the primary extraction format. May be kept temporarily for comparison testing. |
| `mindmap-tree-output.ts` (MindmapTreeOutput) | **UNCHANGED.** Still the format the frontend renders. Now derived from .mm by deterministic code instead of generated by an LLM. |
| `mm-generator-output.ts` (NEW) | **NEW.** Simple schema — the output is a string (the .mm XML). Validation is structural (valid XML, has expected attributes) rather than Zod field-level. |
| `orchestrator-output.ts` | **MINOR UPDATE.** The `next_action` field no longer needs to specify concept sequencing — just teaching approach and mode. |
| `flashcard-output.ts` | **UNCHANGED.** |
| `explainer-output.ts` | **UNCHANGED.** |

### Prompts

| Prompt File | Change |
|-------------|--------|
| `base/document-parser.md` | **DEPRECATED.** Replaced by `base/mm-generator.md`. |
| `base/mindmap-generator.md` | **DEPRECATED.** Merged into `base/mm-generator.md`. |
| `base/mm-generator.md` (NEW) | **NEW.** The most critical prompt in the system. Detailed below. |
| `base/orchestrator.md` | **UPDATE.** Remove concept sequencing logic. Add tree-walk awareness. Shift focus to assessment evaluation and approach selection. |
| `base/concept-explainer.md` | **MINOR UPDATE.** Reference `leafContent` as the primary teaching material input. |
| `base/flashcard-generator.md` | **UNCHANGED.** |
| `domains/*.md` | **UNCHANGED.** Domain overlays still apply to the .mm generator the same way they applied to Parser + Mindmap Generator. |

### Data Model

| Table | Change |
|-------|--------|
| `documents.parsed_structure` (jsonb) | **REPURPOSED.** Now stores the raw .mm XML string instead of DocumentParserOutput JSON. |
| `mindmaps.tree_data` (jsonb) | **UNCHANGED.** Still stores MindmapTreeOutput JSON (now derived from .mm). |
| `concepts` table | **UNCHANGED.** Populated from .mm-derived DerivedConcept[] instead of Parser output. |
| `concept_relationships` table | **UNCHANGED.** Populated from tree-derived edges instead of Parser's relationship array. |
| `understanding_state` table | **UNCHANGED.** Confidence tracked per concept_id, which now comes from TRACKABLE .mm nodes. |

### Request Flow Change

**Before (current):**
```
Upload --> Extract text --> Parser Agent (LLM) --> Orchestrator initializes graph
                                                --> Mindmap Agent (LLM) --> Store tree
                                                --> Flashcard Agent (LLM) --> Store cards
```

**After (.mm-first):**
```
Upload --> Extract text --> .mm Generator Agent (LLM) --> .mm Parser (code)
                                                          --> Derive concepts + graph
                                                          --> Derive MindmapTreeOutput
                                                          --> Store everything
                                                      --> Flashcard Agent (LLM) --> Store cards
```

**Net effect:** One fewer LLM call in the critical path. The Mindmap Generator LLM call is completely eliminated. The Parser LLM call is replaced by the .mm Generator LLM call (same cost, richer output). The .mm parsing step is deterministic code (sub-millisecond).

### Learning Session Orchestration

`src/manual/orchestration/learning-session.ts` needs updating:

**Current 4-phase flow:**
1. Ingest: Parser Agent
2. Augment: Web Search Agent (conditional)
3. Orient: Mindmap Generator + Flashcard Generator (parallel)
4. Route: Orchestrator loop

**New 4-phase flow:**
1. Ingest: .mm Generator Agent + .mm Parser (code)
2. Augment: Web Search Agent (conditional — gaps detected from .mm)
3. Orient: Tree-to-MindmapTreeOutput conversion (code) + Flashcard Generator (parallel)
4. Route: Orchestrator loop (tree-walk default + assessment-driven overrides)

Phase 3 (Orient) becomes cheaper — the mindmap conversion is deterministic code, not an LLM call. Only the Flashcard Generator still needs an LLM call here.

---

## The .mm Generator Prompt — Design Principles

This is the most important prompt in Tasur. Every downstream agent works on its output. The prompt must enforce:

### Content Completeness
The student relies on this mindmap for exam preparation. The prompt must instruct: "Assume the student will use this mindmap as their primary study resource. Cover ALL information from the source material. Do not summarize or omit details — every definition, property, step, example, and formula must appear as a leaf node."

### Granularity Control
- Top-level branches = major sections/units (bold, size 16)
- Second-level nodes = sub-topics (bold, size 14) — these are typically TRACKABLE
- Third-level nodes = concept groups within sub-topics — some TRACKABLE
- Leaf nodes = individual facts, definitions, steps, properties — NOT trackable

### TRACKABLE Node Rules
The prompt specifies: "Mark a node as TRACKABLE='true' and assign a CONCEPT_ID when it represents a concept that a student should be ASSESSED on. This means:
- It's at the granularity of a textbook sub-section heading
- A student could be asked an exam question about it specifically
- It has enough substance to warrant 2+ flashcards
- It is NOT just a category label (like 'Advantages') or a single fact"

### Diagram Callouts
"Wherever the source material contains a diagram, figure, chart, or visual representation, include a leaf node with the format: [DIAGRAM TO STUDY: brief description of what the diagram shows]. This ensures the student knows to refer back to the original material for visual content."

### Negative Constraints (Critical)
```
Do NOT:
- Generate nodes for content not present in the source material
- Use emojis anywhere in the output
- Create TRACKABLE nodes for simple lists (e.g., "Advantages" is not a concept)
- Produce a flat structure — minimum 3 levels of depth
- Exceed 5 levels of depth (readability degrades)
- Duplicate content across different branches
- Use vague labels like "Overview" or "Misc" without specific content beneath them
```

### Output Format Enforcement
The prompt includes a complete worked example (the Architectural Design .mm from the user's real usage) and specifies: "Output ONLY the XML. No markdown fencing, no explanations, no preamble. The first character must be `<map` and the last character must be `</map>`."

---

## Orchestrator Changes — Detailed

### What the Orchestrator No Longer Does
- **Concept sequencing:** The tree order defines the default teaching sequence. No LLM reasoning needed for "what to teach next" in the normal flow.
- **Coverage validation:** The .mm IS the coverage. There's no separate concept list to validate against.
- **Graph initialization from Parser output:** Replaced by deterministic .mm parsing.

### What the Orchestrator Still Does (and Does Better)
- **Assessment evaluation:** "Did the student actually understand clock skew vs. clock drift?" — this still requires LLM judgment.
- **Approach selection:** "This student is confused — should I re-explain with a different analogy, show a comparison table, or move on and reinforce with flashcards?" — still an LLM decision.
- **Mode adaptation:** Fast mode skips deeper sub-branches and moves to assessment sooner. Steady mode explores every leaf. The tree structure makes this trivial — it's just controlling traversal depth.
- **Prerequisite enforcement:** If a student jumps to "Logical Clocks" without understanding "Physical Clocks," the Orchestrator redirects. The tree hierarchy makes this check deterministic (is parent mastered?), but the Orchestrator can use LLM judgment for edge cases.
- **Session management:** Resume points, fatigue detection, flashcard-to-concept transitions — unchanged.

### New Orchestrator Capability: Tree-Aware Routing

```typescript
// Pseudocode for the new default routing logic
function getNextTeachingTarget(tree: ParsedMindmap, graph: StudentGraph): ConceptId {
  // Walk the tree depth-first
  for (const node of depthFirstTraversal(tree)) {
    if (!node.trackable) continue;
    const confidence = graph.getConfidence(node.conceptId);

    // Skip mastered concepts
    if (confidence >= masteryThreshold) continue;

    // Check prerequisites (parent must be mastered or in-progress)
    if (node.parentConceptId) {
      const parentConfidence = graph.getConfidence(node.parentConceptId);
      if (parentConfidence < masteryThreshold) {
        return node.parentConceptId; // Redirect to prerequisite
      }
    }

    return node.conceptId; // This is the next concept to teach
  }

  return null; // All concepts mastered
}
```

This is deterministic code. The Orchestrator LLM is only called when:
1. A micro-assessment needs evaluation (understanding judgment)
2. The approach needs selection (how to teach, not what)
3. A non-standard routing decision is needed (student jumps ahead, fatigue detected)

**Cost impact:** Orchestrator LLM calls per session drop from ~12 to ~6-8, since half the current calls are sequencing decisions that become deterministic.

---

## Migration Strategy

### Phase 1: Build .mm Generator + Parser ✓ DONE

1. ~~Create `src/agents/mm-generator/` with the new agent (both manual and mastra paths)~~ → Built in `src/manual/agents/mm-generator.ts`; Go version in `go-pipeline/mmgenerator.go`
2. ~~Create `src/lib/mm-parser/`~~ → Built in `src/lib/mm-parser/` (TypeScript) and `go-pipeline/mmparser.go` (Go mirror)
3. ~~Create `src/prompts/base/mm-generator.md`~~ → Built; Go version embedded in `go-pipeline/prompts/`
4. ~~Add `fast-xml-parser`~~ → Added; three-pass XML repair added on top for malformed output handling
5. Tests written against fixture files ✓

### Phase 2: Wire into learning session ✓ DONE

1. `learning-session.ts` uses .mm Generator ✓
2. `buildInitialGraphState()` takes .mm XML input ✓
3. Flashcard Generator uses .mm-derived concept content ✓
4. Orchestrator prompt updated for tree-walk awareness ✓
5. Domain overlays removed from mm-generator prompt (simplification) ✓

### Phase 3: Clean up ✓ DONE

1. Document Parser and Mindmap Generator agents deprecated and removed ✓
2. Mastra path removed entirely (2026-03-29) ✓
3. API routes updated ✓

### Phase 4: Prompt iteration ✓ ONGOING

1. .mm Generator runs in production against all document types ✓
2. Gemini 2.5 Pro with 5000-token thinking budget for exhaustive concept enumeration ✓
3. PDF always uses Gemini vision (text heuristic abandoned) ✓
4. Negative constraints and granularity rules iterated through beta testing ✓

---

## Prompt Iteration Log Template

| Date | Change Description | Fixture | Concepts Before | Concepts After | Quality Notes |
|------|-------------------|---------|----------------|----------------|---------------|
| | Initial .mm-generator prompt | normalization.txt | (current parser: N) | | |
| | Initial .mm-generator prompt | transactions.pdf | (current parser: N) | | |
| | Initial .mm-generator prompt | er-modeling.docx | (current parser: N) | | |

Track these metrics per iteration:
- **Concept count:** Number of TRACKABLE nodes generated
- **Leaf richness:** Average number of leaf detail nodes per trackable concept
- **Diagram callouts:** Number of [DIAGRAM TO STUDY] nodes (should match source material)
- **Depth distribution:** How many nodes at each level (should be balanced, not flat)
- **False trackables:** Nodes marked TRACKABLE that shouldn't be (category labels, single facts)
- **Missing content:** Information in source material not captured in .mm

---

## Risk Assessment (updated with outcomes)

| Risk | Outcome | How It Was Resolved |
|------|---------|---------------------|
| .mm XML generation is inconsistent (malformed XML) | **Occurred** — especially unclosed `<node>` tags | Three-pass XML repair step added before parsing: pass 1 closes unclosed tags, pass 2 strips invalid attributes, pass 3 validates structural integrity. Retry path retained for complete failures. |
| Model produces flat trees instead of rich hierarchies | **Partially occurred** — quality varies by document type | Negative constraints + few-shot example address this. Gemini 2.5 Pro thinking budget (5000 tokens) significantly improved depth vs. earlier models. |
| TRACKABLE attribution is inconsistent | **Manageable** — occasional false trackables | Prompt rules enforce CONCEPT_ID requirement; parser skips TRACKABLE nodes without valid IDs. |
| Large documents exceed context window | **Addressed proactively** — 175K char limit enforced | Text truncated at 175K characters before sending to generator. Sparse slide decks may lose tail content. Chunking deferred to v0.5. |
| Performance regression vs. current pipeline | **Did not occur** — but latency is a concern | Pipeline takes 60-120s+ for large documents. This drove the Go service migration (Railway, no timeout). Next.js Vercel was the bottleneck, not the .mm approach itself. |
| PDF hallucination (wrong text extracted) | **New risk discovered in production** | Heuristic PDF text extraction caused topic hallucinations (e.g., HCI → DC misidentification). Resolved by switching all PDFs to Gemini vision processing — no heuristic path. |

---

## Summary of Architectural Benefits

1. **Single source of truth.** One artifact (.mm) drives the mindmap display, knowledge graph, concept registry, teaching sequence, and flashcard anchoring. No drift between representations.

2. **Richer content at extraction time.** The .mm leaf nodes contain actual teaching points, not just concept metadata. Downstream agents (Explainer, Flashcard Generator) work with better input.

3. **One fewer LLM call.** Parser + Mindmap Generator (2 calls) becomes .mm Generator (1 call). Same or lower cost, richer output.

4. **Simpler Orchestrator.** Teaching sequence is tree traversal (deterministic code). Orchestrator LLM focuses on understanding assessment and approach selection — the high-value judgments.

5. **Proven format.** The .mm generation approach has been validated through real study use. The output quality for exam preparation is established, not theoretical.

6. **Natural teaching UX.** "Pick branch 1, walk through each concept, assess, move on" maps directly to how students actually study with a mindmap. The architecture now matches the user experience.

---

*Document 4 of 4 — Tasur Planning Series*
*Previous: System Architecture*
*Related: 01_Product_Vision, 02_Feature_Breakdown, 03_System_Architecture*
