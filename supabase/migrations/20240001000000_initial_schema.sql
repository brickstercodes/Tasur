-- ============================================================
-- Tasur — Initial Schema
-- Module 3: Database Schema & Migrations
-- ============================================================
--
-- WHY this migration exists:
-- Creates the complete Supabase/PostgreSQL schema for v0.1 of Tasur.
-- All tables, enums, indexes, and RLS policies live here so the schema
-- can be reproduced from scratch with `supabase db reset`. A single
-- migration (rather than many small ones) was chosen for the initial
-- schema because nothing existed before — splitting it would only add
-- ordering complexity with no rollback benefit at this stage.
-- ============================================================

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase default).
-- No extension needed.

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE learning_mode_enum AS ENUM ('fast', 'steady');
CREATE TYPE session_status_enum AS ENUM ('active', 'paused', 'completed');
CREATE TYPE file_type_enum AS ENUM ('pdf', 'docx', 'txt', 'image');
CREATE TYPE complexity_enum AS ENUM ('foundational', 'intermediate', 'advanced');
CREATE TYPE card_type_enum AS ENUM ('recall', 'application', 'explain', 'compare');
CREATE TYPE difficulty_enum AS ENUM ('easy', 'intermediate', 'hard');
CREATE TYPE chat_role_enum AS ENUM ('user', 'assistant', 'system');

-- ============================================================
-- TABLE 1: users
-- Extended profile — BetterAuth manages core auth
-- ============================================================

CREATE TABLE users (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT          NOT NULL UNIQUE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  learning_preferences  JSONB         -- accumulated modality prefs
);

-- ============================================================
-- TABLE 2: study_sessions
-- ============================================================

CREATE TABLE study_sessions (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT                  NOT NULL,
  learning_mode   learning_mode_enum    NOT NULL DEFAULT 'steady',
  subject_domain  TEXT,                 -- e.g. "dbms"
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  status          session_status_enum   NOT NULL DEFAULT 'active'
);

-- ============================================================
-- TABLE 3: documents
-- Uploaded files, parsed content, and web augmentations
-- ============================================================

CREATE TABLE documents (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID              NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  file_path           TEXT              NOT NULL, -- Supabase Storage reference
  file_type           file_type_enum    NOT NULL,
  raw_text            TEXT,             -- extracted content
  parsed_structure    JSONB,            -- Agent 1 output
  web_augmentations   JSONB,            -- Agent 2 output
  uploaded_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 4: concepts
-- The knowledge graph nodes
-- ============================================================

CREATE TABLE concepts (
  id          TEXT              PRIMARY KEY, -- e.g. "normalization_3NF"
  session_id  UUID              NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  name        TEXT              NOT NULL,
  content     TEXT,             -- full explanation content
  complexity  complexity_enum,
  keywords    TEXT[],
  metadata    JSONB
);

-- ============================================================
-- TABLE 5: concept_relationships
-- The knowledge graph edges
-- ============================================================

CREATE TABLE concept_relationships (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID    NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  from_concept_id     TEXT    NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  to_concept_id       TEXT    NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  relationship_type   TEXT    NOT NULL -- 'prerequisite', 'related', 'contrasts_with'
);

-- ============================================================
-- TABLE 6: understanding_state
-- Student Understanding Model — per concept per session
-- ============================================================

CREATE TABLE understanding_state (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id            UUID          NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  concept_id            TEXT          NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  confidence_score      FLOAT         NOT NULL DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  exposure_count        INT           NOT NULL DEFAULT 0,
  last_assessed_at      TIMESTAMPTZ,
  assessment_history    JSONB,        -- array of {timestamp, score, method}
  effective_modalities  TEXT[]        -- what has worked for this concept
);

-- ============================================================
-- TABLE 7: flashcards
-- ============================================================

CREATE TABLE flashcards (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID              NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  concept_id  TEXT              NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  card_type   card_type_enum    NOT NULL DEFAULT 'recall',
  front       TEXT              NOT NULL,
  back        TEXT              NOT NULL,
  hints       TEXT[],
  difficulty  difficulty_enum   NOT NULL DEFAULT 'intermediate',
  sr_state    JSONB,            -- SM-2 state: {interval, ease_factor, repetitions, next_review}
  created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 8: mindmaps
-- Generated content cache
-- ============================================================

CREATE TABLE mindmaps (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID          NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  mindmap_data  JSONB         NOT NULL, -- Agent 3 output (nodes + edges)
  version       INT           NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE 9: chat_messages
-- Chat history for concept explainer context
-- ============================================================

CREATE TABLE chat_messages (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID              NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  concept_id    TEXT              REFERENCES concepts(id) ON DELETE SET NULL,
  role          chat_role_enum    NOT NULL,
  content       TEXT              NOT NULL,
  message_type  TEXT,             -- 'explanation', 'micro_assessment', etc.
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Fast lookups for active sessions
CREATE INDEX idx_sessions_user_active
  ON study_sessions(user_id, status)
  WHERE status = 'active';

-- Understanding model queries (orchestrator reads this constantly)
CREATE INDEX idx_understanding_user_session
  ON understanding_state(user_id, session_id);

CREATE INDEX idx_understanding_confidence
  ON understanding_state(session_id, confidence_score);

-- Flashcard scheduling (which cards are due)
CREATE INDEX idx_flashcards_session
  ON flashcards(session_id);

-- Chat context retrieval
CREATE INDEX idx_chat_session_concept
  ON chat_messages(session_id, concept_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE understanding_state   ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindmaps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages         ENABLE ROW LEVEL SECURITY;

-- -------- users --------
CREATE POLICY "users_self_read" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_self_update" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_self_insert" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- -------- study_sessions --------
CREATE POLICY "sessions_owner_all" ON study_sessions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------- documents --------
-- Access via session ownership
CREATE POLICY "documents_owner_all" ON documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = documents.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = documents.session_id
        AND s.user_id = auth.uid()
    )
  );

-- -------- concepts --------
CREATE POLICY "concepts_owner_all" ON concepts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = concepts.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = concepts.session_id
        AND s.user_id = auth.uid()
    )
  );

-- -------- concept_relationships --------
CREATE POLICY "concept_relationships_owner_all" ON concept_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = concept_relationships.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = concept_relationships.session_id
        AND s.user_id = auth.uid()
    )
  );

-- -------- understanding_state --------
CREATE POLICY "understanding_owner_all" ON understanding_state
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------- flashcards --------
CREATE POLICY "flashcards_owner_all" ON flashcards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = flashcards.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = flashcards.session_id
        AND s.user_id = auth.uid()
    )
  );

-- -------- mindmaps --------
CREATE POLICY "mindmaps_owner_all" ON mindmaps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = mindmaps.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = mindmaps.session_id
        AND s.user_id = auth.uid()
    )
  );

-- -------- chat_messages --------
CREATE POLICY "chat_messages_owner_all" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  );
