-- Track notesportal imports for traffic analytics
CREATE TABLE notesportal_imports (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  is_dedup BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT notesportal_imports_user_id_check CHECK (char_length(user_id::text) > 0)
);

CREATE INDEX notesportal_imports_created_at_idx ON notesportal_imports(created_at DESC);
CREATE INDEX notesportal_imports_user_id_idx ON notesportal_imports(user_id);
CREATE INDEX notesportal_imports_is_dedup_idx ON notesportal_imports(is_dedup);

-- Enable RLS for privacy
ALTER TABLE notesportal_imports ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (from the API endpoint)
CREATE POLICY "allow_insert_via_service_role" ON notesportal_imports
  FOR INSERT
  WITH CHECK (true);

-- Users can see their own imports
CREATE POLICY "users_can_view_own_imports" ON notesportal_imports
  FOR SELECT
  USING (auth.uid() = user_id);


To monitor notesportal converts,
Traffic by day:                                                                                                                                                                                           
  SELECT DATE(created_at) as day, COUNT(*) as total                                                                                                                                                         
  FROM notesportal_imports                         
  GROUP BY DATE(created_at)
  ORDER BY day DESC;
                                                                                                                                                                                                            
  First-time vs shared:
  SELECT is_dedup, COUNT(*) as count                                                                                                                                                                        
  FROM notesportal_imports
  GROUP BY is_dedup;

  Weekly trends:
  SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as imports
  FROM notesportal_imports                                          
  GROUP BY week                                                                                                                                                                                             
  ORDER BY week DESC;
                                                                                                                                                                                                            
  Unique users joining from notesportal:
  SELECT COUNT(DISTINCT user_id) as unique_users                                                                                                                                                            
  FROM notesportal_imports