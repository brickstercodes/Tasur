-- Add 'processing' to session_status_enum so the Go pipeline can create
-- sessions early (status='processing') and flip them to 'active' after
-- all artifacts are persisted. This enables background processing where
-- the user navigates away while the pipeline runs.

ALTER TYPE session_status_enum ADD VALUE IF NOT EXISTS 'processing' BEFORE 'active';
