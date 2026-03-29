-- ============================================================
-- Tasur — Migration 3: Indexes, Unique Constraint, student_graphs
-- ============================================================
--
-- WHY this migration exists:
-- 1. Missing session_id indexes on hot-path tables (concepts, concept_relationships,
--    mindmaps, documents). Without these, every mindmap/graph page load causes a
--    full table scan. Not visible at 1–10 users; becomes a problem at 100–200.
-- 2. Full user_id index on study_sessions to complement the existing partial index
--    (which only covers status='active'). Dashboard queries that show all sessions
--    need this.
-- 3. UNIQUE constraint on understanding_state(user_id, session_id, concept_id) to
--    prevent silent duplicate rows if the orchestrator retries a write.
-- 4. student_graphs table — existed in production but was created manually outside
--    of migrations. Captured here with IF NOT EXISTS so this migration is safe to
--    apply on both production (table already exists) and fresh resets (creates it).
-- ============================================================

-- ============================================================
-- SECTION 1: student_graphs (capture manually-created table)
-- ============================================================

-- Production schema: session_id is the PK (no separate id column).
-- IF NOT EXISTS makes this safe to apply on production where the table already exists.
CREATE TABLE IF NOT EXISTS student_graphs (
  session_id  UUID        PRIMARY KEY REFERENCES study_sessions(id) ON DELETE CASCADE,
  graph_state JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent — safe to run even if RLS is already enabled.
ALTER TABLE student_graphs ENABLE ROW LEVEL SECURITY;

-- A policy already exists on production ("Users can manage their own student graphs").
-- This DO block skips creation silently if any policy by this name already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'student_graphs'
      AND policyname = 'student_graphs_owner_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "student_graphs_owner_all" ON student_graphs
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM study_sessions s
            WHERE s.id = student_graphs.session_id
              AND s.user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM study_sessions s
            WHERE s.id = student_graphs.session_id
              AND s.user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END
$$;

-- ============================================================
-- SECTION 2: Missing indexes on session_id FK columns
-- ============================================================

-- concepts(session_id): read on every mindmap page load
CREATE INDEX IF NOT EXISTS idx_concepts_session
  ON concepts(session_id);

-- concept_relationships(session_id): read when rendering the knowledge graph
CREATE INDEX IF NOT EXISTS idx_relationships_session
  ON concept_relationships(session_id);

-- mindmaps(session_id): read on mindmap page server component fetch
CREATE INDEX IF NOT EXISTS idx_mindmaps_session
  ON mindmaps(session_id);

-- documents(session_id): read on document list and preview routes
CREATE INDEX IF NOT EXISTS idx_documents_session
  ON documents(session_id);

-- ============================================================
-- SECTION 3: Full user_id index on study_sessions
-- ============================================================

-- Complements the existing partial index (status='active' only).
-- Dashboard list queries that include paused/completed sessions need this.
CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON study_sessions(user_id);

-- ============================================================
-- SECTION 4: UNIQUE constraint on understanding_state
-- ============================================================

-- Prevents duplicate rows if the orchestrator retries a write for the same
-- concept in the same session. Without this, confidence queries silently
-- aggregate across duplicates and return wrong values.
ALTER TABLE understanding_state
  ADD CONSTRAINT uq_understanding_user_session_concept
  UNIQUE (user_id, session_id, concept_id);
