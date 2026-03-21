/**
 * WHY: Single source of truth for the orchestrator call decision.
 *
 * The orchestrator uses a high-capability model and is the most expensive
 * component in Tasur. We call it at "decision points" only — moments where
 * student state has changed and a new routing decision is needed. All other
 * events (mid-conversation chat turns, individual flashcard flips) are handled
 * locally with zero orchestrator involvement.
 *
 * Centralising this logic here ensures every callsite uses the same table and
 * prevents accidental orchestrator calls from being introduced as new event
 * types are added to the system.
 *
 * Target: 8–15 orchestrator calls per 30-minute session.
 *
 * No imports from Mastra, Vercel AI SDK, or Supabase.
 */

// ── Events that TRIGGER an orchestrator call ──────────────────────────────────

/**
 * Events that represent decision points — moments where the orchestrator needs
 * to re-evaluate student state and route to the next specialist agent.
 *
 * Rule of thumb: if a student interaction has CHANGED what the system knows
 * about the student, or if the session has transitioned between major phases,
 * an orchestrator call is needed.
 */
const ORCHESTRATOR_TRIGGER_EVENTS = new Set([
  'session_start',           // New session — orchestrator initialises the routing plan
  'document_parsed',         // Parser done — route to mindmap generator
  'mindmap_generated',       // Mindmap ready — route to web search (if gaps) or concept explainer
  'web_search_complete',     // Augmentation done — route to first concept explanation
  'concept_selected',        // Student clicked a concept on the mindmap — decide approach
  'micro_assessment_complete', // Student answered an in-chat assessment — update confidence + route
  'flashcard_session_start', // Student opens flashcard deck — orchestrator orders cards by model
  'flashcards_generated',    // Flashcard generation done — route to session complete or next action
  'mode_switch',             // Student changed fast ↔ steady — re-evaluate current plan
  'session_resume',          // Student returns after a break — decide where to pick up
]);

// ── Events handled LOCALLY (no orchestrator call) ─────────────────────────────

/**
 * Events that do not require a new routing decision. These are handled by the
 * relevant specialist or by the SM-2 algorithm running client-side.
 *
 * Adding a new event here is a deliberate cost-control choice — document the
 * reason in a comment so future maintainers understand why it's local.
 */
const LOCAL_EVENTS = new Set([
  'mindmap_displayed',   // Pure UI event — mindmap already rendered, no new knowledge
  'chat_turn',           // Mid-concept conversation — concept explainer handles its own turns
  'flashcard_flip',      // Student revealed the answer — SM-2 runs locally, no routing needed
  'flashcard_rated',     // Student rated a card — SM-2 updates interval locally
  'concept_hovered',     // UI hover event — no state change
]);

// ── Return type ───────────────────────────────────────────────────────────────

export interface OrchestratorCallDecision {
  shouldCall: boolean;
  reason: string;
}

// ── Decision functions ────────────────────────────────────────────────────────

/**
 * Returns true if this event should trigger an orchestrator call.
 *
 * Prefer this for simple boolean branching. Use `getCallDecision` when you
 * need the human-readable reason for logging or debugging.
 */
export function shouldCallOrchestrator(event: string): boolean {
  return ORCHESTRATOR_TRIGGER_EVENTS.has(event);
}

/**
 * Returns the full decision with a human-readable reason.
 *
 * Unknown events default to `shouldCall: false` — this is intentional.
 * New event types must be explicitly added to ORCHESTRATOR_TRIGGER_EVENTS;
 * they should not silently trigger expensive orchestrator calls.
 */
export function getCallDecision(event: string): OrchestratorCallDecision {
  if (ORCHESTRATOR_TRIGGER_EVENTS.has(event)) {
    return {
      shouldCall: true,
      reason: `"${event}" is a decision point — orchestrator evaluates student state and routes to the next agent.`,
    };
  }

  if (LOCAL_EVENTS.has(event)) {
    return {
      shouldCall: false,
      reason: `"${event}" is handled locally — no orchestrator call needed (cost control).`,
    };
  }

  return {
    shouldCall: false,
    reason:
      `"${event}" is an unrecognised event — defaulting to no orchestrator call. ` +
      `Add it to ORCHESTRATOR_TRIGGER_EVENTS or LOCAL_EVENTS in call-frequency.ts.`,
  };
}
