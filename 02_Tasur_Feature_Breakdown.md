# Tasur — Feature Breakdown by Version

## Versioning Philosophy

Each version must be **independently valuable** — a student should get real benefit from v0.1 even if we never build v0.5. We don't ship scaffolding; we ship usable learning experiences at every stage.

The guiding principle: **prove the core loop first, then expand modalities, then optimize.**

---

## v0.1 — "Prove the Thesis" (Solo build, ~6–8 weeks)

**Goal:** A student uploads notes, gets a mindmap, has a concept-by-concept chat, and can practice with flashcards. Three phases of the five-phase flow, working end-to-end for theoretical engineering subjects.

### Core Features

| # | Feature | Description | Why v0.1 |
|---|---------|-------------|----------|
| 1 | **Document Upload & Parsing** | Accept PDF, DOCX, TXT, images of notes. Extract raw text, then generate a comprehensive Freeplane-format mindmap (.mm) in a single LLM call. The .mm becomes the single source of truth — concept registry, knowledge graph, teaching sequence, and visual mindmap all derive from it deterministically. Handle messy inputs gracefully (partial slides, photo of whiteboard). | Nothing works without this. It's the entry point. |
| 2 | **Web Search Augmentation** | After parsing, the system searches the web for supplementary context on identified topics. Fills gaps in sparse or incomplete uploads. | Directly improves quality of every downstream feature. Low effort, high impact. |
| 3 | **Mindmap Generation (Phase 1)** | Display the .mm-derived mindmap as an interactive, collapsible tree. The mindmap is not generated separately — it's derived deterministically from the .mm file produced during upload. Viewable, zoomable, clickable. Each trackable node links to concepts for chat and flashcard anchoring. | This is the "wow moment." The student uploads notes and immediately sees the landscape — derived from the same artifact that drives the entire learning experience. First impression = first retention. |
| 4 | **Concept Breakdown Chat (Phase 2)** | AI study partner that walks through concepts conversationally. Prioritizes foundational concepts first. Uses analogies and examples. Includes micro-assessments after each concept. | This is the core learning interaction. If this is good, the product works. |
| 5 | **Basic Flashcards (Phase 4)** | Auto-generated flashcards from the uploaded material. Simple spaced repetition scheduling (SM-2 algorithm or similar). Weighted by orchestrator's understanding signals from Phase 2. | Closes the loop: learn → test → reinforce. Without retrieval practice, the other phases are just fancy reading. |
| 6 | **Student Understanding Model (Basic)** | Per-concept confidence tracking. Updated by micro-assessment responses and flashcard performance. Informs orchestrator routing decisions. | The orchestrator needs this to be adaptive rather than scripted. Even a simple model makes the experience feel intelligent. |
| 7 | **Learning Mode Toggle** | Fast-paced vs. steady mode. Affects concept breakdown depth, flashcard frequency, and orchestrator pacing. | Two students with the same material but different time pressure need different experiences. Simple flag with big UX impact. |
| 8 | **Orchestrator (Basic)** | Central LLM that manages the student understanding model and routes to specialist agents. With the .mm-first architecture, concept sequencing is a deterministic tree walk — the orchestrator focuses on assessment evaluation, teaching approach selection, and mode adaptation. In v0.1: routing between phases 1, 2, and 4 with tree-aware traversal. | The brain of the system. The .mm tree handles sequencing; the orchestrator handles judgment — making Tasur adaptive rather than static. |
| 9 | **Auth & User Accounts** | Simple authentication (email + password or OAuth). User sessions persist so returning students resume where they left off. | Required for any per-user state tracking. Keep it minimal — no profiles, no social, just login and session persistence. |
| 10 | **Subject Domain Prompts (Tier 1)** | Curated base prompts for theoretical engineering subjects: DBMS, OS, SQA, CN, SE, DC (Distributed Computing). Include domain-specific examples, visual vocabulary hints, and common student misconceptions. | This is where engineering subjects get the premium experience. The quality difference between a generic and a tuned prompt is massive. |

### Specialist Agent Quality Framework (v0.1)

| Strategy | Implementation |
|----------|----------------|
| **Few-shot system prompts** | The .mm Generator agent gets a complete worked example (a real .mm file) in its system prompt. Other specialist agents get 3–5 curated input→output examples. Examples are hand-crafted for each Tier 1 subject. |
| **Structured output schemas** | Every specialist returns JSON conforming to a defined schema. No free-form generation. The frontend renders structured data, not raw LLM text. |
| **Orchestrator validation** | The .mm Parser validates structural integrity (valid XML, TRACKABLE nodes have CONCEPT_IDs, minimum depth). Before serving other specialist output, the orchestrator does a lightweight quality check: "Is this flashcard actually testing the right thing?" |
| **Domain prompt templates** | Tier 1 subjects each get a tailored prompt template. Tier 2 subjects use a general-purpose template. Templates include subject-specific examples, terminology, and common diagram types. |

### What v0.1 Explicitly Excludes
- Phase 3 (Connect & Visualize — interactive diagram manipulation)
- Phase 5 (Exam Simulation)
- Coding subject track
- Excalidraw / external tool integration
- Cross-user relevance tuning
- Mobile optimization
- Any social/community features
- Payment/subscription system

### Tech Stack (v0.1)
- **Frontend:** Next.js (React) — fast to build, good ecosystem for interactive components
- **Mindmap rendering:** react-flow, d3, or markmap for interactive mindmaps
- **Backend:** Next.js API routes + server actions (keep it monorepo for solo speed)
- **Database:** Supabase (PostgreSQL) for user data, understanding model state, and file storage
- **Auth:** BetterAuth — handles auth independently of Supabase, avoids India-region access issues. Proxy-friendly deployment.
- **Agent Framework:** Mastra (primary) + Vercel AI SDK (fallback). Dual-path architecture — one env var switches between them. All business logic is framework-agnostic behind a `TasurAgent` interface.
- **LLM Orchestrator:** Claude / GPT-4 class model via API
- **Specialist Agents:** Smaller, faster models (Claude Haiku / GPT-4o-mini class) with structured output
- **File parsing:** Libraries for PDF, DOCX, image OCR extraction
- **.mm parsing:** `fast-xml-parser` for deterministic Freeplane XML parsing — derives concepts, graph edges, and visual tree from the .mm single source of truth
- **Hosting:** Vercel (frontend) + self-hosted or proxied Supabase instance for reliability in target regions
- **Dev Tooling:** Prettier (formatting), ESLint + @typescript-eslint (linting), Divio documentation system, ADRs for architectural decisions

---

## v0.5 — "Real Students, Real Feedback" (~4–6 weeks after v0.1)

**Goal:** The product is usable enough for a small group of engineering students to study for actual exams. Add the interactive visualization phase, exam simulation, and polish the experience based on v0.1 learnings.

### New Features

| # | Feature | Description | Why v0.5 |
|---|---------|-------------|----------|
| 11 | **Interactive Visualization (Phase 3)** | Students can manipulate visual artifacts: drag concepts to connect them, fill in missing nodes on a mindmap, construct flow diagrams. The system evaluates their constructions. | "Teaching back" through visual construction is one of our strongest differentiators. Requires Phase 1 & 2 to be solid first. |
| 12 | **Exam Simulation (Phase 5)** | Timed, exam-style question sets generated from the material. Multiple question types (MCQ, short answer, explain, compare). Detailed feedback and gap identification after completion. | Students want to know "am I ready?" This answers that question and builds confidence. |
| 13 | **Improved Spaced Repetition** | Move beyond basic SM-2. Factor in concept difficulty, modality effectiveness per student, and time-to-exam. Flashcard format variety: recall, application, "explain simply," compare-and-contrast. | Basic flashcards prove the concept; smart flashcards prove the product. The orchestrator now has enough data to make genuinely intelligent spacing decisions. |
| 14 | **Session History & Progress Dashboard** | Visual progress tracking: concepts mastered, confidence trends over time, study streaks, weak areas highlighted. The knowledge graph shows what's green (solid), yellow (shaky), and red (untouched). | Students need to feel progress. This also becomes the "resume studying" entry point for returning users. |
| 15 | **Multi-Document Support** | Upload multiple documents for the same subject/exam. The system merges and deduplicates concepts across sources. | Real students don't have one clean document — they have slides + notes + a textbook chapter. |
| 16 | **Adaptive Modality Switching** | If a student isn't retaining a concept through one approach, the orchestrator automatically tries a different modality: switch from mindmap to story-based explanation, or from flashcards to Socratic dialogue. | This is the "AI tutor that learns how you learn" promise. Requires sufficient understanding model data from v0.1 usage. |
| 17 | **Improved Parsing Pipeline** | Better OCR for handwritten notes and whiteboard photos. Handle slide decks with diagrams (extract and describe visual content). Smarter chunking for very large documents — chunk and generate .mm per chunk, then merge into a unified tree. | v0.1 feedback will reveal parsing pain points. Address the biggest ones here. |
| 18 | **Subject Domain Prompts (Expanded)** | Extend Tier 1 quality to more engineering subjects. Refine existing prompts based on v0.1 usage data. | Broader coverage = more students served well. |

### What v0.5 Explicitly Excludes
- Coding subject track (deferred to v1.0)
- Excalidraw/external MCP connectors
- Cross-user relevance tuning
- Payment system
- Mobile app

---

## v1.0 — "Launch-Ready" (~6–8 weeks after v0.5)

**Goal:** A polished, monetizable product that engineering students actively choose over their current study methods. Includes the coding track and external tool integrations.

### New Features

| # | Feature | Description | Why v1.0 |
|---|---------|-------------|----------|
| 19 | **Coding Subject Track** | Separate learning flow for programming courses: progressive roadmaps, code examples with syntax highlighting, "write code to solve this" challenges with automated evaluation, concept-to-code bridging exercises. | This doubles the addressable audience within engineering students. Deferred to v1.0 because it needs its own UX, a code execution sandbox, and different specialist agents. |
| 20 | **Excalidraw Integration (MCP)** | External connector for hand-drawn style diagrams. Students can sketch and the AI evaluates their drawings. Provides a more natural, less "generated" visual experience. | The modular MCP pattern is proven by now. Excalidraw adds a tactile dimension that static mindmaps can't match. |
| 21 | **External Tool Connectors (MCP Pattern)** | Pluggable architecture for additional visualization and learning tools. The orchestrator can invoke any registered MCP tool as part of the learning flow. | Future-proofs the platform. New tools can be added without touching core architecture. |
| 22 | **Payment & Subscription** | Freemium model: free tier (limited uploads/month, basic flashcards) + premium (unlimited, all phases, exam simulation, priority model access). | Revenue enables sustainability. By v1.0 we have enough user signal to know what's worth paying for. |
| 23 | **Onboarding Flow** | Guided first-time experience: upload your first document, see your first mindmap, try your first flashcard. Designed to get to the "aha moment" in under 3 minutes. | Conversion depends on first impressions. A polished onboarding dramatically improves retention. |
| 24 | **Performance & Cost Optimization** | Response caching, specialist model fine-tuning on accumulated data, smart batching of LLM calls, edge deployment for low-latency parsing. | At scale, LLM costs are the biggest expense. Optimization here directly improves unit economics. |
| 25 | **Analytics Dashboard (Internal)** | Usage metrics, feature adoption, drop-off points, model cost tracking, specialist quality scores. For the founder, not the user. | You need visibility into what's working and what's burning money. |

---

## v2.0+ — "Platform Evolution" (Future)

These features are on the roadmap but intentionally unscheduled. They're captured here so we don't lose the ideas, but building them before v1.0 is proven would be premature.

| # | Feature | Description |
|---|---------|-------------|
| 26 | **Cross-User Relevance Tuning** | Aggregate learning patterns across students. "Students similar to you found this explanation most helpful." Requires meaningful data volume. |
| 27 | **Math Subject Track** | LaTeX rendering, step-by-step equation solving, symbolic computation, proof visualization. Needs a fundamentally different rendering pipeline. |
| 28 | **Collaborative Study** | Study groups where students share mindmaps, compare understanding models, and quiz each other with AI moderation. |
| 29 | **Professor/Instructor Dashboard** | Educators upload course material and see aggregate understanding data across their students. Identifies which concepts the class struggles with most. |
| 30 | **Mobile App** | Native iOS/Android app. Offline flashcard support. Push notifications for spaced repetition reminders. |
| 31 | **Voice Interaction** | "Explain normalization to me" via voice. Teach-back via speech. Particularly powerful for commute-time studying. |
| 32 | **LMS Integration** | Connect with Canvas, Blackboard, Moodle. Auto-import course materials and sync with assignment deadlines. |
| 33 | **Custom Fine-Tuned Models** | Train specialist models on accumulated high-quality input→output pairs. Reduce cost while improving quality for the most common subject areas. |
| 34 | **Gamification Layer** | XP, streaks, leaderboards, achievement badges. Carefully designed to reward genuine learning, not just activity. |
| 35 | **Multi-Language Support** | UI and content generation in Urdu, Hindi, Arabic, and other languages. Massive market expansion potential. |

---

## Version Summary

| Version | Timeline | Core Delivery | Key Metric |
|---------|----------|---------------|------------|
| **v0.1** | Weeks 1–8 | Upload → Mindmap → Chat → Flashcards | "Does a student learn better with Tasur than without?" |
| **v0.5** | Weeks 9–14 | + Interactive visuals, exam sim, progress tracking | "Do students come back voluntarily?" |
| **v1.0** | Weeks 15–22 | + Coding track, Excalidraw, payments, onboarding | "Will students pay for this?" |
| **v2.0+** | TBD | Platform features, collaboration, mobile, integrations | "Can this scale beyond engineering students?" |

---

*Document 2 of 4 — Tasur Planning Series*
*Previous: Product Vision & Goal Statement*
*Next: System Architecture → .mm-First Architecture Redesign*
