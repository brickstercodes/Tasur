-- ============================================================
-- Tasur — Imported Sources (third-party integrations)
-- ============================================================
--
-- WHY this migration exists:
-- Maps an external partner's stable document ID (e.g. Notesportal's note
-- slug `CS_UNIT_2_CRYPTOGRAPHY`) to the Tasur study_session that was
-- created from it. This is the dedup key for the "Study with Tasur"
-- partner button: when a second user clicks the same note, we look up
-- this table to find the already-processed session, then attach them
-- via session_shares (fresh per-user understanding_state, shared
-- concepts/mindmap/flashcards). Avoids re-running the expensive .mm
-- pipeline for documents we've already processed.
--
-- Design notes:
--   - Composite PK (source, source_id) — partners are namespaced so two
--     integrations can both have a sourceId of "X" without collision.
--   - ON DELETE CASCADE from study_sessions: if the underlying processed
--     session is deleted, the mapping disappears too. A future click on
--     the same note will simply re-process from scratch.
--   - No file hash / version columns by design: the Notesportal contract
--     guarantees source_id is permanent and the file behind it is
--     immutable (delete + reupload creates a new note with a new
--     source_id). If a future partner doesn't make that guarantee, add a
--     `content_hash` column then.
-- ============================================================

CREATE TABLE imported_sources (
  source       TEXT          NOT NULL,
  source_id    TEXT          NOT NULL,
  session_id   UUID          NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  imported_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, source_id)
);

CREATE INDEX idx_imported_sources_session ON imported_sources(session_id);

-- RLS: read-only via service role (server-side lookups only). No direct
-- client access — partner endpoints are the only consumers.
ALTER TABLE imported_sources ENABLE ROW LEVEL SECURITY;
