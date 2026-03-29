-- ============================================================
-- Tasur — Migration 4: Token usage tracking
-- ============================================================
--
-- WHY: Adds token_usage JSONB to study_sessions so every upload and
-- chat message can accumulate LLM token counts against the session.
-- This gives a queryable cost log without any external service.
--
-- Schema: { inputTokens: number, outputTokens: number }
-- Query example (run in Supabase SQL editor):
--
--   SELECT
--     u.email,
--     COUNT(s.id)                                         AS sessions,
--     SUM((s.token_usage->>'inputTokens')::int)           AS total_input,
--     SUM((s.token_usage->>'outputTokens')::int)          AS total_output
--   FROM study_sessions s
--   JOIN users u ON s.user_id = u.id
--   WHERE s.token_usage IS NOT NULL
--   GROUP BY u.email
--   ORDER BY total_input DESC;
-- ============================================================

ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS token_usage JSONB;
