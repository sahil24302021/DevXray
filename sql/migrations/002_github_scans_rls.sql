-- ═══════════════════════════════════════════════════════════════════════════
-- DevXray: github_scans table — user_id column + RLS policies
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add user_id column (nullable — existing rows won't have it)
ALTER TABLE github_scans
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create index for faster user-scoped queries
CREATE INDEX IF NOT EXISTS idx_github_scans_user_id ON github_scans(user_id);

-- 3. Enable RLS on github_scans
ALTER TABLE github_scans ENABLE ROW LEVEL SECURITY;

-- 4. Drop old policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view their own scans" ON github_scans;
DROP POLICY IF EXISTS "Users can insert their own scans" ON github_scans;
DROP POLICY IF EXISTS "Service role has full access" ON github_scans;
DROP POLICY IF EXISTS "Public can view scans by username" ON github_scans;

-- 5. RLS Policies

-- Service role (backend) can do everything — bypasses RLS by default,
-- but this explicit policy ensures it works even with force-RLS enabled
CREATE POLICY "Service role has full access"
  ON github_scans FOR ALL
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view their own scans
CREATE POLICY "Users can view their own scans"
  ON github_scans FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Authenticated users can insert scans tied to themselves
CREATE POLICY "Users can insert their own scans"
  ON github_scans FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Public/anonymous can still view scans by username (for shareable reports)
CREATE POLICY "Public can view scans by username"
  ON github_scans FOR SELECT
  TO anon
  USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- DONE: After running this, verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'github_scans' AND column_name = 'user_id';
-- ═══════════════════════════════════════════════════════════════════════════
