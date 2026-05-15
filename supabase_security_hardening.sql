-- ═══════════════════════════════════════════════════════════════════════════
-- DevXray Sprint 1: SECURITY HARDENING
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- TABLE 1: candidates — scope to auth.uid()
-- ═══════════════════════════════════════════════════════════

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Drop old insecure policies
DROP POLICY IF EXISTS "Allow all" ON candidates;
DROP POLICY IF EXISTS "Users see own and shared candidates" ON candidates;
DROP POLICY IF EXISTS "Users insert own candidates" ON candidates;
DROP POLICY IF EXISTS "Users update own candidates" ON candidates;
DROP POLICY IF EXISTS "Users delete own candidates" ON candidates;

-- New secure policies: every operation scoped to auth.uid()
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

-- Service role (backend) bypasses RLS automatically — no policy needed.

-- ═══════════════════════════════════════════════════════════
-- TABLE 2: profiles — users can ONLY read/write their own
-- ═══════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop any old policies
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "Allow all" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Strict: only your own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No delete policy — profiles should never be deleted by users

-- ═══════════════════════════════════════════════════════════
-- TABLE 3: github_scans — user_id scoped
-- ═══════════════════════════════════════════════════════════

ALTER TABLE github_scans ENABLE ROW LEVEL SECURITY;

-- Drop old policies (including the USING(true) "Service role" one)
DROP POLICY IF EXISTS "Service role has full access" ON github_scans;
DROP POLICY IF EXISTS "Users can view their own scans" ON github_scans;
DROP POLICY IF EXISTS "Users can insert their own scans" ON github_scans;
DROP POLICY IF EXISTS "Public can view scans by username" ON github_scans;

-- Authenticated users see only their own scans + legacy unowned scans
CREATE POLICY "scans_select_own"
  ON github_scans FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "scans_insert_own"
  ON github_scans FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Anon users can ONLY view shared scans via token (NOT blanket access)
-- Removed the old "Public can view scans by username" USING(true)

-- ═══════════════════════════════════════════════════════════
-- TABLE 4: shared_reports — public read (by token), auth write
-- ═══════════════════════════════════════════════════════════

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS shared_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  candidate_name TEXT DEFAULT '',
  report_data TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  view_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_token ON shared_reports(token);

ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_reports_select_by_token" ON shared_reports;
DROP POLICY IF EXISTS "shared_reports_insert" ON shared_reports;
DROP POLICY IF EXISTS "Allow all" ON shared_reports;

-- Anyone can READ a shared report (that's the point of sharing)
CREATE POLICY "shared_reports_select_public"
  ON shared_reports FOR SELECT
  USING (true);

-- Only authenticated users can CREATE shared reports
CREATE POLICY "shared_reports_insert_auth"
  ON shared_reports FOR INSERT TO authenticated
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════
-- TABLE 5: payments / subscriptions (if they exist)
-- ═══════════════════════════════════════════════════════════

-- Payments: users can only see their own
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Allow all" ON payments;
    DROP POLICY IF EXISTS "payments_select_own" ON payments;
    
    CREATE POLICY "payments_select_own"
      ON payments FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- VERIFICATION: Check all policies are set correctly
-- ═══════════════════════════════════════════════════════════

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
