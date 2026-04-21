# Tasur — Product Vision & Goal Statement

> **Status — April 2026:** v0.1 is complete and live on Railway. Phases 1, 2, and 4 from the five-phase flow are fully implemented (upload → mindmap → chat → flashcards). Session sharing, reCaptcha, and a Go pipeline microservice (bypassing Vercel's 60s timeout) have also shipped. The product is in active beta.

## The Name

**Tasur** (تصور) — Urdu for "conception" / "visualization." A platform built on the belief that understanding begins when you can *see* it.

---

## The Problem

College students face a broken study cycle. Lecture notes, textbook chapters, and slides present information as walls of text — a format optimized for storage, not understanding. When exams approach, students re-read the same material repeatedly, mistaking familiarity for mastery. The result: poor retention, exam anxiety, and surface-level understanding that evaporates within weeks.

The gap is not in access to information — it's in the *transformation* of information into understanding.

Existing tools address fragments of this problem. Anki handles spaced repetition but requires manual card creation. ChatGPT can explain concepts but has no memory of what you know or don't know. Notion organizes notes but doesn't make them learnable. No product takes raw study material and turns it into a complete, adaptive, multi-modal learning experience.

---

## The Solution

Tasur takes a student's study material — lecture notes, slides, PDFs, syllabi — and transforms it into an interactive, AI-orchestrated learning experience that adapts in real-time to how the student learns.

The system uses visual learning (mindmaps, flow diagrams, concept sketches), active recall (flashcards, teach-back exercises), and spaced repetition — all coordinated by an AI orchestrator that tracks the student's understanding and decides what to present next.

---

## Core Thesis

Humans retain information through **encoding richness** — the more pathways (visual, verbal, spatial, experiential) through which a concept is processed, the stronger and more retrievable the memory. Tasur's architecture is built around this principle: every concept is presented through multiple modalities, and the system learns which modalities work best for each student.

---

## Target User (v1)

**Primary:** College students (18–25) preparing for exams, particularly in engineering programs.

**Persona — "Aisha":** Third-year CS student. Has 4 exams in 3 weeks. Her DBMS professor is hard to follow, and she has 200 pages of notes she hasn't internalized. She's tried re-reading, highlighting, and making her own flashcards — but it's slow and she's not confident she actually *knows* the material. She needs a system that takes her notes and tells her: "Here's what you need to learn, here's how the pieces connect, and here's proof that you actually understand it."

---

## Subject Focus (v1)

### Tier 1 — Premium Experience (deeply tuned)
- **Theoretical CS/Engineering subjects:** DBMS, Operating Systems, Software Quality Assurance, Computer Networks, Software Engineering, Distributed Computing — subjects with vast conceptual content that's hard to retain through text alone.
- **Coding/Programming subjects:** Data Structures, Algorithms, specific language courses — with progressive roadmaps, code examples, and interactive "solve this" challenges.

### Tier 2 — Functional Experience (general-purpose)
- All other college subjects. The core learning engine (mindmaps, flashcards, concept breakdown) works universally. Domain-specific prompt tuning and visual templates are less refined but still valuable.

**Not in v1:** Math-heavy subjects requiring LaTeX rendering, step-by-step equation solving, or symbolic computation. These require a separate rendering pipeline and will be addressed in a future version.

---

## Learning Modes

### Fast-Paced Mode ("Exam in 48 hours")
- Aggressive prioritization: focus on high-yield concepts first
- Shorter explanation cycles, faster progression to retrieval practice
- The orchestrator skips deep exploration and prioritizes breadth + retention testing
- Flashcard frequency increases, concept breakdowns are compressed

### Steady Mode ("I want to actually understand this")
- Full concept scaffolding with deep explanations
- More time in the "connect & visualize" phase
- Richer examples, analogies, and Socratic dialogue
- Spaced repetition intervals are longer and more deliberate
- "Teaching back" exercises where the student explains concepts to the AI

---

## The Five-Phase Learning Flow

The orchestrator moves students between these phases based on observed understanding, not a fixed sequence.

### Phase 1 — Ingest & Orient
User uploads material. The system parses it and generates a comprehensive mindmap in a single step — a Freeplane-format .mm file that serves as the single source of truth. From this one artifact, the system derives the concept registry, knowledge graph, teaching sequence, and visual mindmap. Web search augments gaps in the uploaded material. The student sees the full landscape before diving in.

*Implementation note (v0.1):* This phase runs inside a Go pipeline microservice deployed separately on Railway, bypassing Next.js's 60-second timeout limit. PDF and image files are always processed through Gemini vision (no heuristic text extraction) for accuracy. A three-pass XML repair step handles any malformed .mm output before parsing.

### Phase 2 — Concept Breakdown
The AI study partner walks through concepts following the mindmap's natural structure — foundational concepts first, complex ones after prerequisites are solid. The teaching sequence is derived from the mindmap tree, ensuring the student's journey matches the visual structure they see. Uses analogies, real-world examples, and conversational explanations. Micro-assessments after each concept ("If a process is in waiting state and gets a CPU signal, what happens?") feed understanding data back to the orchestrator.

### Phase 3 — Connect & Visualize
Interactive visual artifacts — mindmaps, flow diagrams, concept sketches — that the student can manipulate. "Fill in the missing node." "Drag this concept to where it connects." The act of constructing the visual is itself a learning event. This phase also includes the "teaching back" mechanic: the student explains a concept, and the AI evaluates their understanding.

### Phase 4 — Retrieval Practice
Spaced repetition flashcards weighted by the orchestrator's understanding model. Multiple retrieval formats: pure recall, application scenarios, "explain this simply," compare-and-contrast. The system knows which concepts the student struggled with and weights them accordingly.

### Phase 5 — Exam Simulation
Exam-style questions (timed, under pressure) with detailed feedback. For coding subjects, this includes "write code to solve this" challenges with automated evaluation. Builds confidence and identifies last-minute gaps.

---

## Orchestrator Philosophy

The central LLM orchestrator **never teaches directly**. It observes, models the student's understanding state, and routes to the appropriate specialist agent. With the .mm-first architecture, the orchestrator no longer spends compute on sequencing decisions — the mindmap tree determines the default teaching path. Its intelligence is focused purely on *judgment*: evaluating understanding, selecting teaching approaches, and adapting when students struggle or jump ahead.

Each feature reduces to a **tool + specialist agent**. The .mm-derived teaching tree determines the default learning sequence; the orchestrator decides *how* to teach each concept and *when to adapt* — the agent decides the specifics.

The orchestrator maintains a **Student Understanding Model** — a real-time map of:
- Which concepts the student has been exposed to
- Confidence level per concept (derived from micro-assessments and interaction patterns)
- Which modalities have been most effective for this student
- Current engagement/fatigue signals
- Time pressure context (exam date, material volume)

---

## Relevance Tuning (v1)

Per-user adaptive learning: the system tracks which explanation styles, visual formats, and retrieval methods work best for each individual student. This data improves the experience over time within a single user's journey.

Cross-user learning (aggregating patterns across students) is deferred to v2+ when sufficient data volume exists.

---

## Architecture Philosophy

- **Single source of truth:** One .mm file drives the mindmap display, knowledge graph, concept registry, teaching sequence, and flashcard anchoring. No drift between representations.
- **.mm-first pipeline:** A single LLM call produces a rich Freeplane-format mindmap from which all downstream data structures are derived deterministically — replacing the previous two-step Parser + Mindmap Generator approach
- **Go pipeline microservice:** Long-running document processing (extraction → .mm generation → flashcard generation → DB writes) runs in a dedicated Go service on Railway, avoiding Next.js's 60-second function timeout. Next.js proxies upload routes to this service.
- **MCP connector pattern:** External tools (Excalidraw, diagram renderers, code execution) are integrated as modular connectors, not monolithic dependencies
- **Web-first:** Browser-based application, responsive but not mobile-optimized in v1
- **LLM cost awareness:** The orchestrator runs Gemini 2.5 Pro (high-capability reasoning); specialist agents use Gemini 2.5 Flash (fast, cheap structured generation). Provider is configurable via env var — Anthropic and OpenAI are also supported.

---

## What Success Looks Like

A student uploads her DBMS notes at 10 PM before an exam. Within 2 minutes, the system generates a comprehensive mindmap — a single artifact from which her entire study experience flows. She taps on "Normalization" and gets a conversational breakdown with examples. She tries to explain 3NF back to the AI and realizes she's confusing it with BCNF — the system catches this and corrects her mental model. She runs through 30 flashcards, nailing 22 and getting targeted re-explanations on the 8 she missed. She takes a simulated exam section, scores 78%, and gets a clear list of what to review in the morning.

She walks into the exam feeling like she *understands* the material, not just recognizes it.

---

*Document 1 of 4 — Tasur Planning Series*
*Next: Feature Breakdown by Version → System Architecture → .mm-First Architecture Redesign*
