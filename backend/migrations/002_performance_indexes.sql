-- Performance indexes for the candidates table
-- Run this in Supabase SQL Editor after deploying

-- Fast lookup by GitHub username (most common query)
CREATE INDEX IF NOT EXISTS idx_candidates_username ON candidates(username);

-- Fast lookup by authenticated user (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);

-- Fast sorting by scan date (recent scans first)
CREATE INDEX IF NOT EXISTS idx_candidates_scanned_at ON candidates(scanned_at DESC);

-- Composite index for user's scan history (user_id + scanned_at)
CREATE INDEX IF NOT EXISTS idx_candidates_user_scanned ON candidates(user_id, scanned_at DESC);
