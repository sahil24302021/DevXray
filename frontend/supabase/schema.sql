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
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username)
);

CREATE INDEX IF NOT EXISTS idx_candidates_score ON candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_scanned ON candidates(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_tier ON candidates(tier);

-- Enable Row Level Security (when you add auth)
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- For now, allow all access (tighten after adding user_id column)
CREATE POLICY "Allow all" ON candidates FOR ALL USING (true);
