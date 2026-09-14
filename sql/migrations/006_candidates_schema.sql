-- ═══════════════════════════════════════════════════════
-- DevXray: candidates table (SECURE version)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  source TEXT DEFAULT 'github' CHECK (source IN ('github', 'resume', 'both')),
  score INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'D-Tier',
  risk_level TEXT DEFAULT 'High',
  recommendation_summary TEXT DEFAULT '',
  languages TEXT[] DEFAULT '{}',
  full_report JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, user_id)
);

CREATE INDEX IF NOT EXISTS idx_candidates_score ON candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_scanned ON candidates(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_tier ON candidates(tier);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);

-- Enable Row Level Security
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- SECURE: Users can only access their own candidates
CREATE POLICY "candidates_select_own"
  ON candidates FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "candidates_insert_own"
  ON candidates FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "candidates_update_own"
  ON candidates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "candidates_delete_own"
  ON candidates FOR DELETE TO authenticated
  USING (user_id = auth.uid());
