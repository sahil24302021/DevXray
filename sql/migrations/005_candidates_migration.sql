-- =====================================================
-- DevXray: candidates table — add missing columns
-- Run this in Supabase SQL Editor to add columns
-- that the application now stores in full_report JSONB.
-- This migration is OPTIONAL — the app works without it
-- by storing extra data inside the full_report column.
-- =====================================================

-- Add user_id for auth isolation (if not already present)
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add full_report JSONB column (if not already present)
-- This stores the complete report payload for cached report loading
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS full_report JSONB;

-- Create index for faster user-scoped queries
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);

-- Update RLS to be user-scoped
DROP POLICY IF EXISTS "Allow all" ON candidates;
DROP POLICY IF EXISTS "Users can view own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can insert own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON candidates;
DROP POLICY IF EXISTS "Users can delete own candidates" ON candidates;

CREATE POLICY "Users can view own candidates"
  ON candidates FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own candidates"
  ON candidates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own candidates"
  ON candidates FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own candidates"
  ON candidates FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Remove UNIQUE constraint on username (allow multiple users to scan same username)
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_username_key;
-- Add composite unique on (username, user_id) instead
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_username_user
  ON candidates(username, user_id);

-- =====================================================
-- DONE! The candidates-store.ts now stores extra fields
-- inside full_report JSONB, so no more 400 errors.
-- =====================================================
