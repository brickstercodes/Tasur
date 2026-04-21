# Tasur — System Architecture (v0.1)

> **Status — April 2026:** This document describes the designed architecture. The system is fully built and live. Key divergences from original design: (1) Mastra sunset 2026-03-29, Vercel AI SDK is now the sole agent framework; (2) Gemini 2.5 Pro/Flash via Vertex AI are the production LLMs, not Claude/GPT-4; (3) a Go pipeline microservice on Railway handles document processing to bypass Vercel's 60s timeout; (4) six migrations have been applied adding `token_usage`, `share_links`, `session_shares`, `student_graphs` tables, and a `processing` session status. Sections marked **[SUPERSEDED]** reflect original plans that changed during implementation.

## Architecture Philosophy

Every feature reduces to a **tool + specialist agent**. The .mm-derived teaching tree determines the default learning sequence; the orchestrator decides *how* to teach each concept and *when to adapt* — the specialist decides the specifics. The orchestrator is the most capable and expensive model — it spends compute on judgment (assessment evaluation, approach selection), not sequencing or content generation. Specialist agents are smaller, faster, cheaper models constrained by structured output schemas and rich few-shot prompts.

The system is built on a **.mm-first pipeline**: a single LLM call produces a Freeplane-format mindmap (.mm file) from which all downstream data structures — concept registry, knowledge graph, teaching sequence, visual mindmap tree — are derived deterministically. This eliminates drift between representations and reduces the critical-path LLM calls.

The system is designed for **modularity from day one**. Adding a new learning modality means registering a new tool+agent pair, not rewriting the core loop.

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Mindmap  │ │  Chat    │ │Flashcard │ │ Progress/Dashboard│  │
│  │ Viewer   │ │ Interface│ │  Deck    │ │                   │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬──────────┘  │
│       │             │            │                 │             │
│       └─────────────┴────────────┴─────────────────┘             │
│                             │                                    │
│                     WebSocket + REST                             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                     API LAYER (Next.js API Routes)              │
│                                                                  │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Upload Handler │  │ Session Mgr  │  │ Auth (BetterAuth)   │  │
│  │ (extract+.mm)  │  │              │  │                     │  │
│  └───────┬────────┘  └──────┬───────┘  └─────────────────────┘  │
│          │                  │                                    │
└──────────┴──────────────────┴────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                                                                  │
│                    THE ORCHESTRATOR (Gemini Pro / Claude class)   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Student Understanding Model                  │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │   │
│  │  │ .mm-derived │ │  Confidence  │ │ Modality Prefs   │  │   │
│  │  │ Concept Tree│ │  Scores      │ │ (what works for  │  │   │
│  │  │ (from .mm)  │ │  (per concept│ │  this student)   │  │   │
│  │  └─────────────┘ └──────────────┘ └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                Tree-Aware Routing Engine                   │   │
│  │   Default: depth-first tree walk for concept sequence     │   │
│  │   LLM judgment: assessment evaluation, approach selection │   │
│  │                                                           │   │
│  │   Inputs:  understanding model, learning mode,            │   │
│  │            tree position, session history                  │   │
│  │   Outputs: next_action (which agent, what parameters)     │   │
│  └──────────┬───────────────────────────────────────────────┘   │
│             │                                                    │
│      ┌──────┴──────┐                                             │
│      │  Validator  │  (lightweight quality check on agent output)│
│      └──────┬──────┘                                             │
│             │                                                    │
└─────────────┼────────────────────────────────────────────────────┘
              │
              │  Structured JSON calls (tool invocations)
              │
┌─────────────┴────────────────────────────────────────────────────┐
│                    SPECIALIST AGENT LAYER                         │
│                    (Gemini Flash / Haiku class)                   │
│                                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  .mm        │ │  Concept    │ │ Flashcard   │ │ Web Search│ │
│  │  Generator  │ │  Explainer  │ │ Generator   │ │ Agent     │ │
│  │  Agent      │ │  Agent      │ │ Agent       │ │           │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬─────┘ │
│         │               │               │               │       │
│  ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐ ┌─────┴─────┐ │
│  │ System      │ │ System      │ │ System      │ │ System    │ │
│  │ Prompt +    │ │ Prompt +    │ │ Prompt +    │ │ Prompt +  │ │
│  │ Worked .mm  │ │ Few-shot    │ │ Few-shot    │ │ Few-shot  │ │
│  │ Example +   │ │ Examples +  │ │ Examples +  │ │ Examples +│ │
│  │ XML Output  │ │ Output      │ │ Output      │ │ Output   │ │
│  │             │ │ Schema      │ │ Schema      │ │ Schema   │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  .mm Parser (deterministic code — NOT an LLM agent)         │ │
│  │  Derives: concept registry, graph edges, teaching roadmap,  │ │
│  │           MindmapTreeOutput JSON for frontend rendering     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Future (v0.5+):                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                │
│  │  Exam Sim   │ │  Visual     │ │  Code Eval  │                │
│  │  Agent      │ │  Builder    │ │  Agent      │                │
│  │  (v0.5)     │ │  Agent(v0.5)│ │  (v1.0)     │                │
│  └─────────────┘ └─────────────┘ └─────────────┘                │
│                                                                   │
│  Future (v1.0+):                                                 │
│  ┌─────────────────────────────────────────────┐                 │
│  │  MCP Connector Layer                        │                 │
│  │  (Excalidraw, external viz tools, etc.)     │                 │
│  └─────────────────────────────────────────────┘                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
              │
┌─────────────┴────────────────────────────────────────────────────┐
│                    DATA LAYER (Supabase)                          │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Users &      │ │ Study        │ │ Understanding            │ │
│  │ Auth State   │ │ Sessions     │ │ Model State              │ │
│  │ (BetterAuth) │ │              │ │                          │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Uploaded     │ │ Generated    │ │ Flashcard State          │ │
│  │ Documents    │ │ Content      │ │ (SR schedule, scores)    │ │
│  │ (Storage)    │ │ (.mm XML,    │ │                          │ │
│  │              │ │  cards, etc.)│ │                          │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## The Orchestrator — Detailed Design

The orchestrator is the central intelligence of Tasur. It is the **only component** that sees the full picture: the student's understanding state, their learning mode, session history, and available specialist agents.

### Orchestrator Responsibilities

1. **Session Initialization** — When a student uploads material, the .mm Generator produces a Freeplane mindmap, and the deterministic .mm Parser derives the concept registry and knowledge graph. The orchestrator initializes the Student Understanding Model from this derived data.

2. **Tree-Aware Routing** — The default teaching sequence is a depth-first walk of the .mm tree (deterministic code). The orchestrator intervenes with LLM judgment when: a micro-assessment needs evaluation, a teaching approach needs selection, a non-standard routing decision is needed (student jumps ahead, fatigue detected, prerequisite gap). It outputs a structured action: `{ agent: "concept_explainer", concept_id: "normalization_3NF", params: { depth: "detailed", mode: "steady", approach: "compare_contrast_with_2NF" } }`

3. **Quality Validation** — Before specialist output reaches the student, the orchestrator performs a lightweight check. This is NOT a full re-generation — it's a boolean gate: "Is this output acceptable?" with specific criteria per agent type.

4. **Understanding Model Updates** — After every student interaction (chat response, flashcard answer, micro-assessment), the orchestrator updates the Student Understanding Model.

5. **Mode Adaptation** — Continuously adjusts behavior based on learning mode (fast/steady) and observed engagement signals. Fast mode skips deeper sub-branches and moves to assessment sooner. Steady mode explores every leaf. The tree structure makes this trivial — it's just controlling traversal depth. See "Learning Modes — Behavioral Spec" section below.

### Orchestrator Prompt Structure

```
SYSTEM PROMPT (persistent per session):
├── Role definition ("You are the learning orchestrator for Tasur...")
├── Student Understanding Model (current state, updated after each interaction)
├── Teaching tree context (current position in .mm tree, completed/pending branches)
├── Available tools/agents (registry of what can be invoked)
├── Learning mode context (fast-paced / steady)
├── Subject domain context (loaded from domain prompt template)
└── Decision framework ("Given state X, prefer action Y because...")

USER MESSAGE (per decision point):
├── Trigger event ("student completed flashcard", "student asked question", etc.)
├── Event data (the student's response, score, question text, etc.)
├── Current tree position (which concept, which branch)
└── Request for next action

EXPECTED OUTPUT (structured JSON):
{
  "understanding_update": {
    "concept_id": "normalization_3NF",
    "new_confidence": 0.6,
    "evidence": "Confused BCNF with 3NF in micro-assessment"
  },
  "next_action": {
    "agent": "concept_explainer",
    "params": {
      "concept_id": "normalization_bcnf",
      "approach": "compare_contrast_with_3NF",
      "depth": "detailed"
    }
  },
  "reasoning": "Student shows partial 3NF understanding but conflates with BCNF.
                Before progressing, clarify the distinction."
}
```

### Orchestrator Cost Management

The orchestrator is called at **decision points**, not on every message. With the .mm-first architecture, sequencing decisions are now deterministic tree walks, further reducing orchestrator LLM calls.

| Event | Orchestrator Involved? |
|-------|----------------------|
| Student uploads document | No — .mm Generator + .mm Parser handle extraction and initialization |
| Mindmap is displayed | No — rendered from .mm-derived MindmapTreeOutput |
| Student clicks a concept to explore | Yes — decides approach (but NOT which concept — tree determines that) |
| Mid-explanation chat message | No — specialist handles the conversation turn |
| Micro-assessment after concept | Yes — evaluates response, updates model, may override tree sequence |
| Student opens flashcard deck | Yes — selects and orders cards based on understanding model |
| Individual flashcard flip/answer | No — SM-2 algorithm handles scheduling locally |
| Student toggles learning mode | Yes — re-evaluates traversal depth |
| Student returns after break | Yes — decides where to resume (typically next unmastered tree node) |

**Estimated orchestrator calls per 30-min session:** 6–10 (down from 8–15 in the previous architecture). The reduction comes from eliminating sequencing decisions that are now handled by deterministic tree traversal.

---

## Specialist Agents — Detailed Design

### Agent 1: .mm Generator (replaces Document Parser + Mindmap Generator)

**Purpose:** Transforms raw uploaded text into a comprehensive Freeplane-format mindmap (.mm XML) that serves as the **single source of truth** for the entire study session. This single LLM call replaces the previous two-step pipeline (Document Parser + Mindmap Generator).

**Input:** Raw extracted text (from pdf-parse, mammoth, tesseract) + file metadata
**Output:** Freeplane XML string (.mm format)

Example output structure:
```xml
<map version="freeplane 1.11.9">
<node TEXT="Unit 3: Synchronization" FOLDED="false">
  <font BOLD="true" NAME="SansSerif" SIZE="16"/>

  <node TEXT="1. Introduction" POSITION="right" FOLDED="false"
        TRACKABLE="true" CONCEPT_ID="dc_sync_intro">
    <font BOLD="true" NAME="SansSerif" SIZE="14"/>

    <node TEXT="Challenges in Distributed Systems"
          TRACKABLE="true" CONCEPT_ID="dc_sync_challenges">
      <node TEXT="Synchronization is much more difficult compared to
                  uniprocessor/multiprocessor systems."/>
      <node TEXT="Two clocks do not agree perfectly."/>
      <node TEXT="[DIAGRAM TO STUDY: Clock Synchronization issue]"/>
    </node>

    <node TEXT="Clock Skew vs. Clock Drift"
          TRACKABLE="true" CONCEPT_ID="dc_clock_skew_drift">
      <node TEXT="Clock Skew: Relative difference in clock values."/>
      <node TEXT="Clock Drift: Relative difference in clock frequencies."/>
    </node>
  </node>
</node>
</map>
```

**Key design decisions in .mm format:**
- `TRACKABLE="true"` — Node gets a confidence score in StudentGraph. Only on assessable concept nodes (typically 2nd/3rd level). Leaf detail nodes do NOT get this.
- `CONCEPT_ID="dc_clock_skew_drift"` — Stable identifier for flashcard anchoring, understanding state, chat history. Only on TRACKABLE nodes.
- `[DIAGRAM TO STUDY: ...]` — Leaf node convention for diagrams the student should review in original material.
- No emojis. Clean, professional output.

**Model:** Specialist model (Gemini Flash / Haiku class) — structural analysis, not creative.
**Quality lever:** Complete worked .mm example in prompt. XML structural validation before downstream processing. Retry with stricter prompt on malformed output.

### Deterministic Utility: .mm Parser (NOT an LLM agent)

**Purpose:** Parses the .mm XML and derives all downstream data structures. Pure TypeScript with `fast-xml-parser`. Zero LLM calls.

**Derives from .mm:**

1. **Concept Registry** — Every TRACKABLE node becomes a `DerivedConcept`:
```typescript
interface DerivedConcept {
  id: string;               // From CONCEPT_ID attribute
  name: string;             // From TEXT attribute
  depth: number;            // Tree depth (1 = top-level, 2 = sub-topic, etc.)
  parentId: string | null;  // Parent CONCEPT_ID (null for root)
  childConceptIds: string[];
  leafContent: string[];    // TEXT values of non-trackable children (teaching points)
  hasDiagram: boolean;      // true if any leaf contains "[DIAGRAM TO STUDY:"
  position: number;         // Order within siblings (preserves teaching sequence)
}
```

2. **Knowledge Graph Edges** — Derived from tree structure:
```typescript
// Parent-child = prerequisite relationship
edges = trackableNodes
  .filter(n => n.parentTrackable)
  .map(n => ({ from: n.parentConceptId, to: n.conceptId, type: 'prerequisite', weight: 1.0 }));

// Siblings at same level = sequential relationship
siblings = groupBySameParent(trackableNodes)
  .flatMap(group => consecutive_pairs(group))
  .map(([prev, next]) => ({ from: prev.conceptId, to: next.conceptId, type: 'sequential', weight: 0.5 }));
```

3. **Teaching Roadmap** — The tree order IS the teaching sequence. Depth-first walk produces the default concept progression.

4. **MindmapTreeOutput JSON** — Converted for frontend rendering (existing markmap/react-flow code unchanged).

### Agent 2: Web Search Augmentor

**Purpose:** Fills knowledge gaps detected from the .mm. Searches for supplementary context and integrates it into the concept structure.

**Input:** Gaps detected from .mm (concepts mentioned but not expanded) + subject domain context
**Output Schema:**
```json
{
  "augmentations": [
    {
      "concept_id": "normalization_bcnf",
      "source_summary": "BCNF context from web search",
      "additional_content": "structured explanation...",
      "examples_found": ["example 1...", "example 2..."],
      "confidence": 0.85,
      "sources": ["url1", "url2"]
    }
  ]
}
```

**Model:** Haiku/4o-mini class with web search tool access.
**Quality lever:** Source relevance scoring + orchestrator review of augmented content.

### Agent 3: Concept Explainer (Study Partner)

**Purpose:** The conversational study partner. Explains concepts, uses analogies, gives examples, runs micro-assessments. Now receives richer input — the `leafContent` array from the .mm (actual teaching points) rather than thin Parser metadata.

**Input:** Concept to explain (including `leafContent` from .mm) + student context (what they already know, learning mode, subject domain)
**Output Schema (per turn):**
```json
{
  "message_type": "explanation | analogy | example | micro_assessment | clarification",
  "content": "The explanation text...",
  "visual_suggestion": {
    "type": "diagram | table | comparison",
    "data": { ... }
  },
  "micro_assessment": {
    "question": "If a table has partial dependency on a candidate key, what normal form is it in?",
    "expected_understanding": "Student should identify this as a 2NF violation",
    "difficulty": "intermediate"
  },
  "conversation_complete": false,
  "handoff_signal": null
}
```

**Model:** This is the ONE specialist that may need a more capable model (Sonnet/4o class) because conversational quality directly impacts learning. Evaluate during v0.1 whether Haiku-class is sufficient.

**Quality lever:** Domain prompt templates with subject-specific analogies and examples. The `leafContent` from the .mm gives the explainer structured teaching points to work from — richer than the old Parser's thin `raw_content`.

**Multi-turn handling:** The Concept Explainer maintains its own conversation context within a concept. The orchestrator is NOT involved in every chat turn — only when a concept transition is needed (micro-assessment signals understanding, or student explicitly moves on).

### Agent 4: Flashcard Generator

**Purpose:** Creates spaced repetition flashcards from the concept structure. Anchors to `CONCEPT_ID` values from trackable .mm nodes.

**Input:** Concept data (including `leafContent` from .mm) + understanding model (which concepts need reinforcement)
**Output Schema:**
```json
{
  "cards": [
    {
      "id": "card_001",
      "concept_id": "normalization_3NF",
      "type": "recall | application | explain_simply | compare_contrast",
      "front": "What is the key difference between 3NF and BCNF?",
      "back": "3NF allows non-prime attributes to determine other non-prime attributes if...",
      "difficulty": "intermediate",
      "tags": ["normalization", "normal_forms"],
      "hints": ["Think about which attributes can be determinants..."]
    }
  ]
}
```

**Model:** Haiku/4o-mini class — card generation is template-driven.
**Quality lever:** Multiple card types (not just recall) + orchestrator validates card relevance against understanding model. Domain prompts include example cards per subject. Flashcard Generator now receives richer concept content from .mm `leafContent`.

---

## Data Model (Supabase / PostgreSQL)

### Core Tables

```sql
-- Users (managed by BetterAuth, we extend with profile)
users
├── id (uuid, PK)
├── email
├── created_at
└── learning_preferences (jsonb)  -- accumulated modality prefs

-- Study Sessions
study_sessions
├── id (uuid, PK)
├── user_id (FK → users)
├── title (e.g., "DBMS Chapter 5")
├── learning_mode (enum: 'fast' | 'steady')
├── subject_domain (e.g., "dbms")
├── created_at
├── last_active_at
├── token_usage (jsonb)  -- aggregate {inputTokens, outputTokens} for cost tracking
└── status (enum: 'active' | 'paused' | 'completed' | 'processing')  -- 'processing' added in migration 6

-- Uploaded Documents
documents
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── file_path (Supabase Storage reference)
├── file_type (enum: 'pdf' | 'docx' | 'txt' | 'image')
├── raw_text (text)  -- extracted content
├── mm_xml (text)  -- .mm Generator output (Freeplane XML — single source of truth)
├── web_augmentations (jsonb)  -- Web Search Agent output
└── uploaded_at

-- Concepts (derived from .mm by deterministic parser)
concepts
├── id (text, PK)  -- e.g., "normalization_3NF" (from CONCEPT_ID attribute)
├── session_id (FK → study_sessions)
├── name (text)  -- from TEXT attribute of TRACKABLE node
├── leaf_content (text[])  -- teaching points from non-trackable children
├── depth (int)  -- tree depth level
├── parent_concept_id (text, nullable)  -- parent TRACKABLE node
├── has_diagram (boolean)  -- true if any leaf contains [DIAGRAM TO STUDY:]
├── position (int)  -- order within siblings (preserves teaching sequence)
└── metadata (jsonb)

-- Concept Relationships (derived from .mm tree structure)
concept_relationships
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── from_concept_id (FK → concepts)
├── to_concept_id (FK → concepts)
└── relationship_type (text)  -- 'prerequisite' (parent→child), 'sequential' (sibling order)

-- Student Understanding Model
understanding_state
├── id (uuid, PK)
├── user_id (FK → users)
├── session_id (FK → study_sessions)
├── concept_id (FK → concepts)
├── confidence_score (float, 0.0–1.0)
├── exposure_count (int)  -- how many times seen
├── last_assessed_at (timestamp)
├── assessment_history (jsonb)  -- array of {timestamp, score, method}
└── effective_modalities (text[])  -- what's worked for this concept

-- Flashcards
flashcards
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── concept_id (FK → concepts)
├── card_type (enum: 'recall' | 'application' | 'explain' | 'compare')
├── front (text)
├── back (text)
├── hints (text[])
├── difficulty (enum: 'easy' | 'intermediate' | 'hard')
├── sr_state (jsonb)  -- SM-2 state: {interval, ease_factor, repetitions, next_review}
└── created_at

-- Mindmaps (derived from .mm for frontend rendering)
mindmaps
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── tree_data (jsonb)    -- MindmapTreeOutput (derived from .mm by deterministic code)
├── version (int)        -- increments if regenerated or expanded
└── created_at

-- Chat History (for concept explainer context)
chat_messages
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── concept_id (FK → concepts)  -- which concept this conversation is about
├── role (enum: 'user' | 'assistant' | 'system')
├── content (text)
├── message_type (text)  -- explanation, micro_assessment, etc.
└── created_at

-- Token Usage Tracking (migration 4)
token_usage
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── user_id (FK → users)
├── model (text)
├── input_tokens (int)
├── output_tokens (int)
├── cost_cents (float)
└── created_at

-- Session Sharing (migration 5)
share_links
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── created_by (FK → users)
├── code (text, UNIQUE)  -- 9-byte base64url random code
├── is_active (boolean)
└── created_at

session_shares
├── id (uuid, PK)
├── session_id (FK → study_sessions)
├── user_id (FK → users)    -- user who accepted the share
├── shared_by (FK → users)  -- who created the link
├── created_at
└── UNIQUE(session_id, user_id)

-- In-Memory Knowledge Graph Serialization (migration 3)
student_graphs
├── id (uuid, PK)
├── session_id (FK → study_sessions, UNIQUE)
├── graph_state (jsonb)    -- serialized StudentGraphState (nodes + edges + adjacency)
└── last_synced_at

-- NOTE: study_sessions.status enum also includes 'processing' (migration 6)
-- Sessions begin in 'processing' state when pipeline starts, transition to 'active' on completion.
```

### Key Indexes
```sql
-- Fast lookups for active sessions
CREATE INDEX idx_sessions_user_active ON study_sessions(user_id, status) WHERE status = 'active';

-- Understanding model queries (orchestrator reads this constantly)
CREATE INDEX idx_understanding_user_session ON understanding_state(user_id, session_id);
CREATE INDEX idx_understanding_confidence ON understanding_state(session_id, confidence_score);

-- Flashcard scheduling (which cards are due)
CREATE INDEX idx_flashcards_session ON flashcards(session_id);

-- Chat context retrieval
CREATE INDEX idx_chat_session_concept ON chat_messages(session_id, concept_id, created_at);
```

---

## Request Flow — "Student Uploads a Document"

This is the most important flow in v0.1. Here's exactly what happens:

*Note (as built):* Steps 2–4b run inside the **Go pipeline service** on Railway, not inside Next.js. Next.js receives the multipart upload and immediately proxies the request (with file bytes + metadata headers) to `GO_SERVICE_URL`. The Go service streams SSE events back through Next.js to the client. This bypasses Vercel's 60s hard timeout.

```
1. STUDENT uploads a PDF via the frontend
   │
2. NEXT.JS PROXY validates session limit, then forwards to GO PIPELINE SERVICE (SSE proxy)
   │
3. GO PIPELINE SERVICE: Text Extraction
   ├── TXT: direct UTF-8 read
   ├── DOCX: unzip + XML parsing
   ├── PDF: always Gemini vision (no heuristic text path — abandoned after hallucination issues)
   ├── Images (PNG/JPG): Gemini vision
   ├── Stores raw file in Supabase Storage
   ├── Creates study_session record (status = 'processing')
   └── Emits: event: session_created (early ID for dashboard tile)
   │
4. .mm GENERATOR AGENT processes text/PDF bytes (single Gemini 2.5 Pro call, thinking budget 5000)
   ├── Produces Freeplane XML (.mm format)
   ├── Contains TRACKABLE nodes with CONCEPT_IDs
   ├── Contains leaf detail nodes with teaching points
   ├── Three-pass XML repair on malformed output (unclosed tags, etc.)
   └── Stores .mm XML in documents table
   │
5. .mm PARSER (deterministic Go code, NOT an LLM call)
   ├── Validates XML structure
   ├── Extracts DerivedConcept[] from TRACKABLE nodes
   ├── Builds knowledge graph edges from tree structure
   ├── Converts to MindmapTreeOutput JSON for frontend
   ├── Remaps user-generated CONCEPT_IDs → deterministic UUIDs (prevents collision on re-upload)
   ├── Stores concepts + relationships in database
   ├── Stores MindmapTreeOutput in mindmaps table
   └── Initializes understanding_state (all concepts at 0.0 confidence)
   │
   └── 5a. FLASHCARD GENERATOR creates initial deck (Gemini 2.5 Flash, structured JSON)
       └── Returns cards → stored in flashcards table with initial SR state
   │
6. GO PIPELINE updates session status → 'active', emits: event: done
   │
5. FRONTEND receives mindmap data + session ready signal
   ├── Renders interactive mindmap from MindmapTreeOutput (Phase 1)
   ├── Shows concept list with "unexplored" indicators
   └── Student begins exploring → clicks a concept
   │
6. ORCHESTRATOR receives "student selected concept X"
   ├── Tree-walk logic checks: is this the next concept in sequence?
   ├── If out of order: checks prerequisites (parent mastered?)
   ├── Selects approach based on learning mode and student state
   └── Routes to Concept Explainer Agent with parameters + leafContent
   │
7. CONCEPT EXPLAINER conducts multi-turn conversation (Phase 2)
   ├── Explains concept using leafContent as structured teaching material
   ├── Uses analogies and examples from domain prompt
   ├── Runs micro-assessment
   └── Returns assessment result → ORCHESTRATOR updates understanding model
   │
8. ORCHESTRATOR decides next action
   ├── Default: advance to next unmastered node in tree (deterministic)
   ├── Override: re-explain if assessment shows confusion
   ├── If student shows fatigue → suggests flashcard practice (Phase 4)
   └── If branch completed → transitions to flashcard review (Phase 4)
   │
9. FLASHCARD DECK presented to student (Phase 4)
   ├── Cards ordered by: low confidence first, then SR schedule
   ├── Student responses update SR state locally (no orchestrator call per card)
   └── Session summary sent to orchestrator at end of review
   │
10. ORCHESTRATOR updates understanding model from flashcard results
    └── Prepares recommendations for next session
```

---

## Request Flow — "Concept Breakdown Chat Turn"

A detailed view of what happens during Phase 2 conversation:

```
STUDENT sends message in concept chat
   │
   ├── Is this a new concept entry? → ORCHESTRATOR decides approach
   │     └── Calls Concept Explainer with: concept data + leafContent,
   │         student context, approach, depth, mode
   │
   └── Is this a mid-conversation turn? → CONCEPT EXPLAINER handles directly
         │  (No orchestrator call — the explainer maintains conversation state)
         │
         ├── Student asks clarifying question → Explainer responds
         ├── Student seems confused → Explainer tries different angle
         └── Explainer reaches natural endpoint → triggers micro-assessment
               │
               └── MICRO-ASSESSMENT RESULT → sent to ORCHESTRATOR
                     ├── Updates understanding_state for this concept
                     ├── If confidence > threshold → concept marked as "understood"
                     │     └── Tree walk advances to next unmastered node
                     ├── If confidence < threshold → orchestrator decides:
                     │     ├── Re-explain with different approach?
                     │     ├── Suggest prerequisite review? (check parent node)
                     │     └── Move on and reinforce via flashcards?
                     └── Routes to next action
```

**Key design decision:** The Concept Explainer handles its own multi-turn conversation without calling the orchestrator on every message. The orchestrator is only invoked at:
- Concept entry (initial routing + approach selection)
- Micro-assessment completion (understanding update + tree advancement)
- Student explicitly asks to move to a different topic

This keeps orchestrator costs low while maintaining adaptive intelligence.

---

## Specialist Agent Prompt Architecture

### Prompt Layering System

Each specialist agent's prompt is composed of three layers:

```
┌──────────────────────────────────────────────┐
│  LAYER 1: Base Agent Prompt (universal)       │
│  - Role definition                            │
│  - Output format specification                │
│  - General quality guidelines                 │
│  - Error handling instructions                │
│  - For .mm Generator: complete worked example │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────┴───────────────────────────┐
│  LAYER 2: Domain Template (per subject)       │
│  - Subject-specific terminology               │
│  - Common diagram types for this domain       │
│  - Typical student misconceptions             │
│  - Domain-specific analogies bank             │
│  - 3–5 curated few-shot examples              │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────┴───────────────────────────┐
│  LAYER 3: Runtime Context (per invocation)    │
│  - Specific concept / raw text to work with   │
│  - Student's current understanding state      │
│  - Learning mode (fast/steady)                │
│  - Current tree position (for orchestrator)   │
│  - Orchestrator instructions for this call    │
└──────────────────────────────────────────────┘
```

### Domain Template Example: DBMS

```
DOMAIN: Database Management Systems (DBMS)

VISUAL VOCABULARY:
- ER diagrams for entity relationships
- Table structures for normalization examples
- Dependency arrows for functional dependencies
- Venn diagrams for join types
- State diagrams for transaction management (ACID)
- B-tree/hash visualizations for indexing

COMMON MISCONCEPTIONS:
- Confusing 3NF with BCNF (the determinant distinction)
- Thinking normalization always improves performance
- Mixing up candidate keys and primary keys
- Believing NULL = NULL in comparisons
- Confusing serializable with serial schedules

ANALOGY BANK:
- Normalization: "Like organizing a messy filing cabinet —
  you split drawers so each drawer has one clear purpose"
- ACID transactions: "Like a bank transfer — either both accounts
  update or neither does"
- Indexing: "Like the index in a textbook — you look up the topic,
  get the page number, then go directly there instead of reading
  every page"

FEW-SHOT EXAMPLES:
[3–5 complete input→output examples for this agent type
 in the DBMS domain — these are hand-crafted for maximum quality]
```

### Domain Templates to Build for v0.1

| Domain | Key Visual Types | Priority Misconceptions |
|--------|-----------------|------------------------|
| **DBMS** | ER diagrams, dependency arrows, table structures | 3NF vs BCNF, normalization performance myths |
| **OS** | Process state diagrams, scheduling timelines, memory layouts | Deadlock conditions, virtual vs physical memory |
| **SQA** | Testing pyramids, V-model flows, defect lifecycle | Testing vs QA, white-box vs black-box boundaries |
| **CN** | OSI/TCP-IP layer diagrams, packet flow, topology maps | OSI vs TCP/IP model confusion, routing vs switching |
| **SE** | SDLC flows, UML diagrams, architecture patterns | Agile vs waterfall oversimplifications, design pattern misuse |
| **DC** | CAP theorem triangles, consensus flows, replication diagrams | CAP theorem absolutism, consistency model confusion |

---

## Mindmap Visual Design Spec

The mindmap is the first thing a student sees after upload — it must look like a proper study tool, not a developer visualization. The visual design is modeled after Freeplane's balanced layout with color-coded branches and professional typography.

### Layout: Balanced Left-Right Tree

```
                                    ┌──────────┐
               ┌── Branch A ◄──────│          │──────► Branch D ──┐
               │                    │   ROOT   │                    │
               ├── Branch B ◄──────│  (dark)  │──────► Branch E ──┤
               │                    │          │                    │
               └── Branch C ◄──────└──────────┘──────► Branch F ──┘
```

The root node sits at the center. Top-level branches split evenly — first half goes right, second half goes left. This is the Freeplane default and produces a balanced, readable tree that uses horizontal space efficiently. The layout algorithm must handle this split natively (not just a top-down tree pushed sideways).

### Color System: Branch-Level Palette

Each top-level branch gets its own color from a fixed palette. All descendants inherit that color. This makes branch ownership instantly visible without labels.

```
Branch Palette (8 colors, cycle for >8 branches):
  #2C7BB6  (blue)
  #1A9641  (green)
  #D7191C  (red)
  #756BB1  (purple)
  #E6550D  (orange)
  #0E7F7F  (teal)
  #8C510A  (brown)
  #C51B7D  (pink)
```

**Node fill:** Light pastel tint of the branch color (lighten by ~80%). This is NOT the branch color at full saturation — it's the branch color pushed toward white. The formula: `r = base.r + (1 - base.r) * 0.82` for each channel.

**Node border:** The full branch color at original saturation. This creates a subtle but clear box boundary.

**Root node:** Dark background (#2C3E50) with white text. Visually anchors the entire tree.

**Page background:** Light warm gray (#F8F9FA), not pure white. Prevents eye strain on large trees.

### Typography

```
Depth 0 (root):     12pt, Helvetica-Bold, white on dark
Depth 1 (sections): 10pt, Helvetica-Bold, dark text on pastel
Depth 2 (concepts):  8.5pt, Helvetica, dark text on pastel
Depth 3 (details):   7.5pt, Helvetica, dark text on pastel
Depth 4+ (leaves):   7.0pt, Helvetica, dark text on pastel
```

Text color for all non-root nodes: #1A1A2E (near-black with slight warmth). Bold only at depth 0 and 1.

Text wraps at ~50 characters. Maximum node width: 240px equivalent. Padding: 7px horizontal, 4px vertical.

### Connectors

Curved bezier connectors between parent and child — not straight lines. The connector attaches to the parent's edge closest to the child (right edge for rightward children, left edge for leftward children) and curves to the child's nearest edge.

Connector color matches the branch color. Connector thickness decreases with depth:
```
Depth 1: 1.5px
Depth 2: 1.3px
Depth 3: 1.1px
Depth 4+: 0.8px (minimum)
```

### Interactive Additions (beyond static PDF)

The static PDF layout above is the baseline. The interactive web version adds:

- **Expand/collapse:** Click a node's toggle to hide/show children. Collapsed nodes show a "+" indicator with child count.
- **Confidence overlay:** Concept nodes (those with `concept_id`) get a small colored dot or left-border accent: green (#1A9641) for mastered (>0.7), amber (#E6AB02) for partial (0.3–0.7), red (#D7191C) for untouched (<0.3). This overlays on top of the branch color — it's additive, not a replacement.
- **Click-to-explore:** Concept nodes (with `concept_id`) have a subtle hover state (border thickens, slight shadow) and navigate to concept chat on click.
- **study_cue tooltip:** Hover on a concept node → tooltip shows the `study_cue` text in a small popover.
- **Zoom + pan:** Standard map-like controls. Scroll to zoom, drag to pan, double-click to fit-to-view.
- **Search highlight:** Type to search → matching nodes pulse/highlight, non-matching nodes fade to 30% opacity.

### Implementation Guidance

**Recommended library: react-flow** with a custom tree layout (dagre or elk in left-right mode). Markmap is simpler but doesn't support the balanced left-right split natively. react-flow gives us the bezier connectors, custom node components, zoom/pan, and the interactive features we need.

The layout algorithm must:
1. Split top-level children into left and right groups
2. Layout each side independently (children expand outward from root)
3. Center-align each subtree vertically relative to its parent
4. Compute bounding box and auto-fit on initial render

Custom node component (`MindmapNode.tsx`) handles: pastel fill + saturated border from branch color, depth-aware font sizing, confidence dot overlay, expand/collapse toggle, click handler for concept navigation.

Custom edge component (`MindmapEdge.tsx`) handles: bezier curves, branch color inheritance, depth-aware stroke width.

---

## API Endpoint Design (v0.1)

```
Authentication (BetterAuth handles these):
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session

Study Sessions:
POST   /api/sessions                    -- Create new session (triggers upload flow)
GET    /api/sessions                    -- List user's sessions
GET    /api/sessions/:id                -- Get session details + understanding model
PATCH  /api/sessions/:id                -- Update mode, status
DELETE /api/sessions/:id                -- Soft delete

Document Upload:
POST   /api/sessions/:id/documents      -- Upload file (multipart) → triggers .mm generation
GET    /api/sessions/:id/documents      -- List documents in session

Mindmap:
GET    /api/sessions/:id/mindmap        -- Get MindmapTreeOutput JSON (derived from .mm)

Chat (Concept Explainer):
POST   /api/sessions/:id/chat           -- Send message (streaming response)
GET    /api/sessions/:id/chat/:conceptId -- Get chat history for concept

Flashcards:
GET    /api/sessions/:id/flashcards             -- Get due cards (SR-scheduled)
POST   /api/sessions/:id/flashcards/:cardId     -- Submit answer + update SR state

Understanding Model:
GET    /api/sessions/:id/understanding          -- Get current understanding state
```

### Streaming Architecture

The chat endpoint (`POST /api/sessions/:id/chat`) uses **Server-Sent Events (SSE)** for streaming responses from the Concept Explainer. This gives real-time typing feedback to the student.

```
Client                          Server                    LLM Agent
  │                                │                          │
  ├── POST /chat {message} ──────►│                          │
  │                                ├── invoke explainer ────►│
  │                                │                          │
  │   ◄── SSE: {type: "chunk",    │◄── streaming tokens ────│
  │        content: "The key..."}  │                          │
  │   ◄── SSE: {type: "chunk",    │◄── streaming tokens ────│
  │        content: " difference"}│                          │
  │   ...                          │                          │
  │   ◄── SSE: {type: "complete", │◄── generation done ─────│
  │        micro_assessment: {...}}│                          │
  │                                │                          │
  │                                ├── call orchestrator      │
  │                                │   (if assessment present)│
  │   ◄── SSE: {type: "routing",  │                          │
  │        next: "flashcards"}     │                          │
  │                                │                          │
  │   ◄── SSE: {type: "done"}     │                          │
  └────────────────────────────────┘                          │
```

---

## File Parsing Pipeline

```
Input File
    │
    ├── PDF ──► pdf-parse (text extraction)
    │           └── If scanned/image PDF ──► Tesseract OCR
    │
    ├── DOCX ──► mammoth.js (text extraction with structure)
    │
    ├── TXT ──► Direct read (utf-8)
    │
    └── Image ──► Tesseract OCR
    │
    ▼
Raw Text + Structure Hints
    │
    ▼
.mm Generator Agent (single LLM call)
    ├── Produces Freeplane XML with TRACKABLE + CONCEPT_ID attributes
    └── Complete worked example in prompt ensures format compliance
    │
    ▼
.mm Parser (deterministic code — fast-xml-parser)
    ├── Concept registry extraction
    ├── Knowledge graph edge derivation
    ├── Teaching roadmap (tree order)
    └── MindmapTreeOutput JSON conversion
```

**v0.1 scope:** Support PDF and TXT well. DOCX as secondary. Image OCR as experimental. Don't let parsing perfection block the core loop.

---

## Spaced Repetition Implementation (v0.1)

Using the **SM-2 algorithm** (same foundation as Anki) with orchestrator-informed weighting:

```
Card State:
{
  interval: 1,          // days until next review
  ease_factor: 2.5,     // difficulty modifier
  repetitions: 0,       // successful reviews in a row
  next_review: "2026-03-16T00:00:00Z"
}

After each review, student rates: 0–5 (fail → perfect)

Update rules:
- Score < 3: reset repetitions to 0, interval to 1 day
- Score >= 3:
    - repetitions++
    - interval = previous_interval × ease_factor
    - ease_factor adjusted based on score

Orchestrator override:
- If understanding_state.confidence is LOW for a concept,
  the orchestrator can FORCE its flashcards to the front
  of the deck regardless of SM-2 scheduling.
```

---

## LLM Provider Strategy

Tasur uses a **configurable LLM provider** system. The production provider is **Google Gemini via Vertex AI**. Anthropic and OpenAI are also supported via env var toggle, but Gemini is the default and all prompt tuning targets Gemini.

### Provider Configuration

```typescript
// src/config/model-provider.ts
// LLM_PROVIDER env var: 'gemini' (default) | 'anthropic' | 'openai'
// ORCHESTRATOR_MODEL: model name override for orchestrator
// SPECIALIST_MODEL: model name override for specialist agents
// MM_GENERATOR_MODEL: override for mindmap generator (defaults to gemini-2.5-pro)
```

```typescript
// src/config/agent-provider.ts — single path (Mastra sunset 2026-03-29)
export function getAgentRegistry(): AgentRegistry {
  return createManualRegistry();  // Vercel AI SDK — no env var toggle needed
}
```

### Model Mapping (Production)

| Role | Model | Notes |
|------|-------|-------|
| Orchestrator | gemini-2.5-pro | High-capability reasoning, tree-aware routing |
| .mm Generator | gemini-2.5-pro | Thinking budget: 5000 tokens (Go service); always Gemini |
| Flashcard Generator | gemini-2.5-flash | Structured JSON output |
| Concept Explainer | gemini-2.5-flash | Streaming SSE |
| Web Search Agent | gemini-2.5-flash | Research augmentation (conditional) |

The `TasurAgent` interface remains LLM-agnostic — prompts, schemas, and business logic never reference a model directly.

### Cost Estimation (Production, per student per 30-min session)

| Component | Model | Calls | Est. Tokens/Call | Est. Cost |
|-----------|-------|-------|-----------------|-----------|
| Orchestrator | gemini-2.5-pro | ~8 | ~2K in + ~500 out | ~$0.02 |
| .mm Generator | gemini-2.5-pro | 1 | ~8K in + ~5K out (thinking) | ~$0.01 |
| Concept Explainer | gemini-2.5-flash | ~15 turns | ~2K in + ~500 out | ~$0.01 |
| Flashcard Generator | gemini-2.5-flash | 1 | ~3K in + ~2K out | ~$0.002 |
| **Total per session** | | | | **~$0.04** |

The .mm-first pipeline (1 LLM call instead of 2) and deterministic tree sequencing reduce orchestrator call frequency vs. original estimates. Gemini pricing is also lower than Claude Sonnet equivalents at comparable quality for this workload.

---

## Folder Structure (v0.1 — As Built)

*Note: `src/mastra/` was deleted 2026-03-29 (Mastra sunset). `src/manual/` is the sole agent implementation. `agent-provider.ts` no longer has a toggle — it directly returns `createManualRegistry()`.*

```
tasur/
├── src/
│   ├── app/                          # Next.js 16 App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── signup/
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/            # Session list + upload UI
│   │   │   ├── settings/             # User preferences
│   │   │   └── study/[sessionId]/
│   │   │       ├── layout.tsx        # Sticky session nav (StudyTabs)
│   │   │       ├── mindmap/          # Phase 1 — interactive mindmap viewer
│   │   │       ├── chat/             # Phase 2 — concept breakdown chat
│   │   │       └── flashcards/       # Phase 4 — SM-2 review
│   │   ├── share/[code]/             # Share link acceptance handler
│   │   └── api/
│   │       ├── auth/                 # BetterAuth routes + reCaptcha verify
│   │       └── sessions/
│   │           ├── route.ts          # GET: list sessions
│   │           ├── upload/route.ts   # POST: proxy to Go pipeline (SSE)
│   │           └── [id]/
│   │               ├── route.ts      # GET/DELETE: single session
│   │               ├── chat/route.ts # POST: streaming chat (SSE)
│   │               ├── flashcards/route.ts  # GET/POST: flashcard review
│   │               ├── documents/route.ts   # POST: add doc (proxy to Go)
│   │               └── share/route.ts       # POST/DELETE: share link mgmt
│   │
│   ├── interfaces/                   # FRAMEWORK-AGNOSTIC agent contracts
│   │   ├── agents.ts                 # TasurAgent, TasurStreamingAgent interfaces
│   │   ├── registry.ts               # AgentRegistry type
│   │   └── types.ts                  # AgentResult, AgentName types
│   │
│   ├── manual/                       # Vercel AI SDK agents (sole implementation)
│   │   ├── index.ts                  # createManualRegistry() factory
│   │   ├── agents/
│   │   │   ├── orchestrator.ts       # Study decision: next concept, teaching approach
│   │   │   ├── mm-generator.ts       # .mm XML generation (Next.js path, rarely called)
│   │   │   ├── concept-explainer.ts  # Streaming concept explanation
│   │   │   ├── flashcard-generator.ts
│   │   │   └── web-search.ts
│   │   └── orchestration/
│   │       └── learning-session.ts   # Full session orchestration loop
│   │
│   ├── config/
│   │   ├── agent-provider.ts         # Returns createManualRegistry() directly (no toggle)
│   │   └── model-provider.ts         # LLM_PROVIDER + model name config (gemini/anthropic/openai)
│   │
│   ├── lib/
│   │   ├── auth.ts                   # BetterAuth server config (pg pool, session cookie)
│   │   ├── auth-client.ts            # Client-side auth helpers
│   │   ├── app-user.ts               # Maps BetterAuth user.id → users table UUID
│   │   ├── supabase.ts               # Service-role Supabase client factory
│   │   ├── session-access.ts         # resolveSessionAccess(): owner OR session_shares member
│   │   ├── session-persistence.ts    # All DB write operations (25KB, pipeline result writes)
│   │   ├── sr-algorithm.ts           # SM-2 spaced repetition + confidence blending
│   │   ├── recaptcha.ts              # reCaptcha v3 verification
│   │   ├── guardrails.ts             # Content safety validations
│   │   ├── mm-parser/                # Deterministic .mm XML parser (mirrors Go mmparser.go)
│   │   │   └── index.ts              # XML string → ParsedMindmap → DerivedConcept[]
│   │   ├── graph/
│   │   │   ├── student-graph.ts      # In-memory knowledge graph (mastery, prerequisites)
│   │   │   ├── traversal.ts          # Graph algorithms (BFS, topo sort, shortest path)
│   │   │   └── sync.ts               # Load/save StudentGraph from student_graphs table
│   │   ├── parsing/                  # File text extraction utilities (used by Next.js path)
│   │   │   ├── pdf.ts
│   │   │   ├── docx.ts
│   │   │   └── ocr.ts
│   │   └── schemas/                  # Zod schemas for agent I/O validation
│   │
│   ├── components/
│   │   ├── mindmap/
│   │   │   ├── MindmapViewer.tsx     # ReactFlow wrapper, collapse/search state
│   │   │   ├── MindmapNode.tsx       # Custom node: confidence dot, click-to-chat
│   │   │   ├── MindmapEdge.tsx       # Custom edge: curved, labeled
│   │   │   ├── ShareButton.tsx       # Owner-only share link generator
│   │   │   ├── layout/balanced-tree.ts  # Balanced tree layout algorithm
│   │   │   └── color-utils.ts        # Branch palette + confidence coloring
│   │   ├── chat/                     # ChatInterface, FocusZone sidebar
│   │   ├── flashcards/               # FlashcardDeck, SM-2 rating UI
│   │   ├── dashboard/                # SessionCard, DeleteButton, ProcessingTiles
│   │   ├── upload/                   # UploadFlow: drag-drop + SSE progress reader
│   │   ├── study/                    # StudyTabs, StudyBackLink
│   │   └── ui/                       # TasurWordmark, ThemeToggle, CustomCursor
│   │
│   ├── contexts/                     # ThemeContext
│   ├── types/
│   │   ├── concepts.ts
│   │   ├── graph.ts
│   │   ├── sessions.ts
│   │   ├── understanding.ts
│   │   └── database.ts               # Supabase-generated types (supabase gen types typescript)
│   └── middleware.ts                 # Auth gate on /(dashboard)/ routes
│
├── go-pipeline/                      # Go pipeline microservice (separate Railway service)
│   ├── main.go                       # HTTP server startup
│   ├── pipeline.go                   # HTTP handlers + SSE emitter (26KB)
│   ├── extraction.go                 # Text extraction (PDF/DOCX/TXT/images)
│   ├── mmgenerator.go                # .mm XML generation via Vertex AI REST
│   ├── mmparser.go                   # Parse .mm XML → DerivedConcepts + edges
│   ├── flashcards.go                 # Flashcard generation via Vertex AI
│   ├── supabase.go                   # REST client for Supabase writes
│   ├── vertex.go                     # Vertex AI REST API wrapper
│   ├── ratelimit.go                  # Serial processing queue (position N in queue)
│   ├── types.go                      # Type definitions
│   ├── Dockerfile                    # Alpine-based container
│   ├── railway.toml
│   └── prompts/                      # Embedded at build time (//go:embed)
│       ├── mm-generator-system.md
│       ├── mm-generator-example.xml
│       └── flashcard-generator.md
│
├── prompts/                          # Next.js-side prompts (concept explainer, orchestrator)
│
├── supabase/
│   └── migrations/                   # 6 migrations applied
│       ├── 20240001_initial_schema.sql
│       ├── 20240002_chat_messages_metadata.sql
│       ├── 20240003_indexes_and_student_graphs.sql
│       ├── 20240004_token_usage.sql
│       ├── 20240005_session_shares.sql
│       └── 20240006_processing_status.sql
│
├── Dockerfile                        # Next.js standalone container (node:22-alpine)
├── railway.toml                      # Railway deployment config (Next.js service)
├── next.config.ts                    # output: standalone, serverExternalPackages
├── package.json
├── tsconfig.json
└── CHANGELOG.md

---

## Learning Modes — Behavioral Spec

The learning mode (fast-paced vs. steady) is not just a UI toggle — it fundamentally changes how every agent behaves and how the orchestrator traverses the .mm tree.

### Mode: Fast-Paced ("Exam in 48 hours")

| Component | Behavior Change |
|-----------|----------------|
| **Orchestrator** | Prioritizes breadth over depth. Tree traversal skips deeper sub-branches (stops at depth 2). Moves to flashcards (Phase 4) aggressively after brief concept exposure. Thresholds for "understood" are lower (0.5 confidence vs 0.7 in steady). Routes away from struggling concepts faster — "mark it, revisit via flashcards." |
| **.mm Generator** | Same generation (the .mm is produced once). But the orchestrator's tree traversal uses only top-level TRACKABLE nodes, skipping deeper granularity. |
| **Concept Explainer** | Shorter explanations (2–3 paragraphs max, not deep dives). Fewer analogies, more direct definitions. Uses `leafContent` as bullet points, not deep-dive material. Micro-assessments are faster (yes/no, MCQ — not open-ended). Limits conversation to 3–4 turns per concept before moving on. |
| **Flashcard Generator** | Generates more cards but simpler ones (pure recall, key definitions). Skips complex "application scenario" cards. Higher card volume, lower individual complexity. |
| **SR Algorithm** | Shorter initial intervals (hours, not days). More aggressive repetition. "Cram mode" scheduling that front-loads reviews. |

### Mode: Steady ("I want to actually understand this")

| Component | Behavior Change |
|-----------|----------------|
| **Orchestrator** | Prioritizes depth over breadth. Full tree traversal including deepest TRACKABLE nodes. Higher confidence thresholds (0.7+) before marking concepts as understood. Willing to spend 10+ minutes on a single concept. Encourages "teaching back" exercises. |
| **.mm Generator** | Same generation. The orchestrator's tree traversal explores every branch to maximum depth. |
| **Concept Explainer** | Full deep-dive explanations leveraging all `leafContent` points. Multiple analogies, real-world examples, and edge cases. Open-ended micro-assessments ("explain in your own words"). Socratic dialogue style — asks probing questions rather than just explaining. No conversation turn limit per concept. |
| **Flashcard Generator** | Fewer cards but more complex. Includes application scenarios, "explain simply" prompts, compare-contrast cards. Quality over quantity. |
| **SR Algorithm** | Standard SM-2 intervals (days, weeks). Spaced for long-term retention rather than short-term cramming. |

### Mode Selection Logic

```
Session Creation:
├── User selects mode explicitly (toggle in UI)
├── OR orchestrator infers from context:
│     ├── "exam_date" field provided → calculate urgency
│     │     ├── < 3 days → suggest fast-paced
│     │     ├── 3–14 days → suggest steady with acceleration near exam
│     │     └── > 14 days → suggest steady
│     └── No exam date → default to steady
│
Mid-Session Mode Switch:
├── User can switch modes at any time via UI toggle
├── Orchestrator re-evaluates tree traversal depth with new mode parameters
└── Understanding model persists — only pacing/depth changes
```

---

## Agent Framework — Vercel AI SDK (Manual Path)

Mastra was evaluated and **sunset on 2026-03-29** (`src/mastra/` deleted, `@mastra/core` uninstalled, 341 packages removed). The Vercel AI SDK manual path is the sole implementation.

### Why the Isolation Layer Mattered

The codebase was designed with framework-agnostic `TasurAgent` / `TasurStreamingAgent` interfaces from the start. When Mastra was sunset, only the adapter layer needed changing — prompts, schemas, graph logic, .mm parser, SR algorithm, and frontend were untouched. The rule held: **the framework owned the plumbing, we owned the intelligence.**

### Current Implementation

```typescript
// src/config/agent-provider.ts
export function getAgentRegistry(): AgentRegistry {
  return createManualRegistry();  // direct, no toggle needed
}
```

```typescript
// src/manual/agents/mm-generator.ts (representative example)
import { generateText } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';

class ManualMmGeneratorAgent implements TasurAgent<MmGeneratorInput, string> {
  async execute(input: MmGeneratorInput): Promise<AgentResult<string>> {
    const result = await generateText({
      model: vertex('gemini-2.5-pro', { useSearchGrounding: false }),
      providerOptions: { vertex: { thinkingConfig: { thinkingBudget: 5000 } } },
      system: loadPrompt('mm-generator'),
      messages: [{ role: 'user', content: input.text }],
    });
    return { data: result.text, usage: result.usage, duration: result.experimental_providerMetadata?.duration ?? 0 };
  }
}
```

### What Lives Where

```
FRAMEWORK-AGNOSTIC:                            VERCEL AI SDK ADAPTER:
─────────────────────────────────────────       ──────────────────────────────
src/interfaces/agents.ts (TasurAgent, etc.)    src/manual/agents/*.ts
src/prompts/**/*.md (all prompts)              src/manual/orchestration/learning-session.ts
src/lib/schemas/*.ts (Zod output schemas)      src/manual/index.ts
src/lib/graph/ (StudentGraph)
src/lib/mm-parser/ (.mm XML parser)
src/lib/sr-algorithm.ts
src/components/** (all frontend)
src/app/** (all routes)
src/config/model-provider.ts
```

### What We Build Ourselves (Regardless of Framework)

- **Prompts and domain templates** — our IP, framework-agnostic `.md` files
- **Output schemas** — Zod for JSON agents, XML validation for .mm generator
- **Student Understanding Model** — scoring, confidence calculations, graph traversal
- **.mm Parser** — deterministic XML parsing: concepts, edges, teaching roadmap
- **SM-2 spaced repetition** — pure business logic
- **Frontend** — all React components and UI
- **Supabase data layer** — primary persistence for all application data
- **Agent interface definitions** — the `TasurAgent` abstraction that both implementations satisfy

---

## Knowledge Graph — .mm-Derived Design

### Inspiration: MindGraph by Yohei Nakajima

MindGraph (https://github.com/yoheinakajima/mindgraph) — from the creator of BabyAGI — demonstrates a key architectural pattern: an **ever-expanding knowledge graph** generated from natural language input that is both visual and queryable.

Key ideas we adopt from MindGraph's approach:
- **The graph is the core data structure**, not a visualization afterthought. Everything (concepts, relationships, confidence scores, learning history) lives in the graph.
- **Natural language in, structured graph out.** Upload messy notes → get a structured, explorable knowledge graph.
- **The graph expands over time.** Each new document upload doesn't create an isolated mindmap — it merges into and extends the student's existing knowledge graph for that subject.
- **Queryable, not just viewable.** "What are the prerequisites I haven't mastered?" is a graph traversal query, not a UI filter.

### .mm-First Graph Derivation

With the .mm-first architecture, the knowledge graph is no longer built by an LLM (the old Document Parser). It's **derived deterministically from the .mm tree structure**:

- **Tree parent→child = prerequisite edge** (understanding "Introduction" is prerequisite for "Physical Clocks")
- **Tree siblings = sequential edges** (within "Introduction": "Challenges" comes before "Clock Skew")
- **TRACKABLE nodes = graph nodes** with confidence tracking
- **leafContent = teaching material** attached to each graph node

This is simpler and more reliable than the previous approach (LLM extracting relationships). The tree structure IS the relationship graph. Additional edge types (`related`, `contrasts_with`) can be added via optional enrichment in v0.5+.

### Concept Graph Structure

```
Node: Concept (derived from TRACKABLE .mm node)
├── id: "normalization_3NF"  (from CONCEPT_ID)
├── name: "Third Normal Form"  (from TEXT)
├── domain: "dbms"
├── leafContent: ["No transitive dependencies...", "Fix: decompose..."]
├── depth: 2
├── parentId: "normalization_overview"
├── student_state: {
│     confidence: 0.65,
│     exposure_count: 3,
│     last_assessed: "2026-03-15T14:30:00Z",
│     effective_modalities: ["analogy", "compare_contrast"],
│     mode_performance: { fast: 0.5, steady: 0.8 }
│   }
└── metadata: { has_diagram, position, keywords }

Edge: Relationship (derived from .mm tree structure)
├── from → to
├── type: "prerequisite" | "sequential"
├── weight: 1.0 (prerequisite) | 0.5 (sequential)
└── bidirectional: false
```

### Graph Expansion on New Upload

```
Student uploads "Chapter 6: Indexing" to existing DBMS session
   │
   ├── .mm Generator produces .mm for new chapter
   ├── .mm Parser extracts new concepts: B-trees, Hash indexes, etc.
   ├── Orchestrator checks existing graph for overlaps
   │     ├── "Indexing" already exists as a leaf node → EXPAND it
   │     └── New relationship detected: Indexing ↔ Query Optimization
   ├── New nodes + edges merged into existing graph
   ├── Mindmap re-derived from updated .mm (or merged .mm files)
   └── Understanding model updated: new concepts at 0.0 confidence
```

---

## Student Understanding Model — Storage Strategy

### The Core Question: Relational DB vs. Graph DB

The Student Understanding Model (SUM) is inherently graph-shaped: concepts are nodes with properties (confidence, exposure), connected by typed edges (prerequisite, sequential). The queries the orchestrator needs are graph-native:

- "What are all prerequisites of Concept X with confidence < 0.5?"
- "What's the next unmastered concept in tree order?" (depth-first walk)
- "Which cluster of related concepts is weakest?" (subgraph analysis)
- "If I teach Concept Y, what downstream concepts become unblocked?" (forward traversal)

### Options Evaluated

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **PostgreSQL (flat tables)** | Simple, Supabase-native, familiar | Recursive CTEs for traversal are awkward, multi-hop queries get expensive | Good enough for v0.1 with <100 concepts per session |
| **PostgreSQL + Apache AGE** | Cypher queries on PostgreSQL, stays in Supabase ecosystem | AGE extension may not be available on all Supabase plans, less mature than Neo4j | Ideal middle ground if Supabase supports it |
| **Neo4j (dedicated graph DB)** | Native graph traversal, Cypher is purpose-built for these queries, excellent for pathfinding | Extra infrastructure, another service to manage, data sync with Supabase | Overkill for v0.1, strong candidate for v0.5+ |
| **In-memory graph (per session)** | Fastest queries, zero latency for orchestrator, simple implementation | Doesn't persist natively, must sync to Supabase, memory limits | Best for runtime, backed by Supabase for persistence |

### Recommended Strategy: Hybrid (v0.1)

```
┌──────────────────────────────────────────────────┐
│              RUNTIME (per active session)          │
│                                                    │
│  In-Memory Concept Graph (TypeScript object)       │
│  ├── Built from .mm-derived concepts + edges       │
│  ├── Tree structure preserved for traversal        │
│  ├── All orchestrator queries run against this     │
│  ├── Updated in real-time during session           │
│  └── Synced back to Supabase on:                   │
│        ├── Every understanding model update         │
│        ├── Session pause/end                        │
│        └── Periodic checkpoint (every 5 min)        │
│                                                    │
└──────────────────────┬───────────────────────────┘
                       │ sync
┌──────────────────────┴───────────────────────────┐
│              PERSISTENCE (Supabase/PostgreSQL)     │
│                                                    │
│  concepts table + concept_relationships table      │
│  + understanding_state table                       │
│  (graph-shaped schema, relational storage)         │
│                                                    │
│  v0.5 evaluation:                                  │
│  ├── If traversal queries become painful →          │
│  │   evaluate Apache AGE extension                  │
│  └── If multi-session cross-subject graphs grow →   │
│      evaluate Neo4j as dedicated graph layer        │
│                                                    │
└──────────────────────────────────────────────────┘
```

**Why this works for v0.1:** A typical study session has 20–80 concepts. An in-memory graph of this size is trivially fast to traverse in TypeScript (BFS/DFS over a Map/adjacency list). The orchestrator gets sub-millisecond query times. Supabase is the durable store, not the query engine for graph operations.

**When to upgrade:** If students start building cross-session, cross-subject knowledge graphs (v0.5+), the in-memory approach won't scale. That's when a dedicated graph layer (AGE or Neo4j) earns its complexity cost.

### In-Memory Graph Implementation Sketch

```typescript
// Lightweight in-memory graph for orchestrator queries
// Now initialized from .mm-derived data instead of Parser output

interface ConceptNode {
  id: string;           // From CONCEPT_ID
  name: string;         // From TEXT
  confidence: number;
  depth: number;        // Tree depth from .mm
  parentId: string | null;
  leafContent: string[];  // Teaching points from .mm leaf nodes
  exposureCount: number;
  effectiveModalities: string[];
}

interface ConceptEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'sequential';
  weight: number;
}

class StudentGraph {
  nodes: Map<string, ConceptNode>;
  edges: ConceptEdge[];
  adjacency: Map<string, string[]>;  // for fast traversal
  treeOrder: string[];  // depth-first order from .mm (the default teaching sequence)

  // Orchestrator queries:
  getUnmastered(threshold: number): ConceptNode[]
  getPrerequisites(conceptId: string): ConceptNode[]
  getUnblockedConcepts(): ConceptNode[]  // prereqs all above threshold
  getWeakestCluster(): ConceptNode[]      // connected subgraph with lowest avg confidence
  getNextInTreeOrder(): ConceptNode       // next unmastered in depth-first walk
  getPathTo(targetConceptId: string): ConceptNode[]  // learning path

  // Mutations:
  updateConfidence(conceptId: string, score: number, method: string): void
  addConcepts(newNodes: ConceptNode[], newEdges: ConceptEdge[]): void  // graph expansion

  // Persistence:
  static fromMmDerived(concepts: DerivedConcept[], edges: ConceptEdge[]): StudentGraph
  static fromSupabase(sessionId: string): Promise<StudentGraph>
  syncToSupabase(): Promise<void>
}
```

---

## Key Architectural Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Monorepo (Next.js full-stack)** | Solo developer. One repo, one deploy, one mental model. Split later if needed. |
| **.mm-first pipeline (single source of truth)** | One .mm file drives everything: mindmap display, knowledge graph, concept registry, teaching sequence, flashcard anchoring. Eliminates drift between Parser output and Mindmap Generator output. One LLM call instead of two. Richer content at extraction time (leaf nodes contain actual teaching points, not thin metadata). |
| **Vercel AI SDK as sole agent framework** | Mastra was evaluated and sunset 2026-03-29 (341 packages removed). `TasurAgent` / `AgentRegistry` interfaces are retained — framework-agnostic contracts proved their worth when swapping was needed. `agent-provider.ts` now directly returns `createManualRegistry()`, no toggle needed. |
| **LLM strategy (Gemini 2.5 Pro/Flash via Vertex AI)** | Gemini 2.5 Pro for orchestrator and .mm generation (thinking budget: 5000 tokens). Gemini 2.5 Flash for specialist agents (fast, cheap structured output). Provider is env-var config (`LLM_PROVIDER`), never hardcoded — Anthropic and OpenAI also supported. |
| **Go pipeline microservice on Railway** | Next.js Vercel 60s hard timeout causes silent failures on large documents (pipeline takes 60-120s+). Go service on Railway has no timeout. Next.js proxies upload routes to Go via `GO_SERVICE_URL`. PDFs always processed via Gemini vision (no heuristic text extraction — abandoned after hallucination issues). |
| **Deterministic .mm Parser (not LLM)** | The .mm XML is parsed by code (`fast-xml-parser`), not another LLM call. Concept extraction, graph edge derivation, and MindmapTreeOutput conversion are all deterministic — zero cost, sub-millisecond, reproducible. |
| **Tree-walk teaching sequence** | The .mm tree order IS the default teaching sequence. Depth-first traversal is deterministic code. The orchestrator LLM only intervenes for judgment calls (assessment evaluation, approach selection, non-standard routing). This cuts orchestrator calls from ~12 to ~8 per session. |
| **Prompts as .md files** | Version-controllable, easy to iterate, readable. The prompts ARE the product — treat them as first-class code. The .mm Generator prompt is the most critical prompt in the system. |
| **Structured output for all agents** | Decouples agent logic from frontend rendering. Frontend never parses free-text LLM output. .mm Generator outputs XML (validated structurally); other agents output JSON (validated by Zod). |
| **Orchestrator as LLM for judgment, not sequencing** | With .mm-first, the orchestrator no longer decides "what to teach next" — tree traversal handles that. The orchestrator's LLM is reserved for genuine judgment: "did the student understand?", "what approach should I try?", "should I override the tree order?" |
| **In-memory graph + Supabase persistence** | Concept graph lives in memory for sub-ms orchestrator queries. Supabase is the durable store, synced on every state change. Avoids graph DB complexity in v0.1 while keeping the door open for AGE/Neo4j in v0.5+. |
| **SM-2 locally, orchestrator override for weighting** | Standard SR algorithm is proven. Orchestrator adds intelligence on top without replacing it. |
| **Supabase for everything** | Auth-adjacent storage, real-time subscriptions (for streaming UI), file storage, and PostgreSQL — all in one. BetterAuth decouples auth from Supabase's own auth for regional flexibility. |
| **SSE for chat streaming** | Simpler than WebSockets for unidirectional streaming. Compatible with Next.js API routes. |
| **Domain prompts separate from code** | Subject experts (future collaborators, or you with deep domain knowledge) can improve prompts without touching code. |
| **Learning modes as behavioral config, not separate flows** | Same agent pipeline, different parameters. Avoids code duplication. Mode is a context variable that controls tree traversal depth and agent behavior. |
| **MindGraph-inspired expandable graph** | Concept graph grows with each upload, not reset. This enables cross-chapter learning and progressive knowledge building within a subject. |

---

*Document 3 of 4 — Tasur Planning Series*
*Previous: Feature Breakdown by Version*
*Next: .mm-First Architecture Redesign*
*See also: Product Vision & Goal Statement*
