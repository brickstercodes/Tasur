-- Subject share links: one link covers a static snapshot of sessions under a subject
-- session_ids is frozen at generation time — new sessions added later are NOT included
CREATE TABLE subject_share_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code         TEXT UNIQUE NOT NULL,
  subject_name TEXT NOT NULL,
  session_ids  UUID[] NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subject_share_links_code ON subject_share_links (code) WHERE is_active = true;
CREATE INDEX idx_subject_share_links_owner ON subject_share_links (created_by, subject_name) WHERE is_active = true;

ALTER TABLE subject_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subject_share_links_owner_all" ON subject_share_links
  FOR ALL USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "subject_share_links_read_active" ON subject_share_links
  FOR SELECT USING (is_active = true);
