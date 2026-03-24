-- Add metadata JSONB column to chat_messages to persist structured agent output
-- (micro_assessment, visual_suggestion) so they survive page reloads.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;
