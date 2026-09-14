-- ===========================================================================
-- DevXray Master Database Setup & Synchronization Script
-- ===========================================================================
-- Run this ONCE in your Supabase SQL Editor:
-- Supabase Dashboard -> Project Dev-Xray -> SQL Editor -> New Query -> Paste & Run (Cmd/Ctrl + Enter)
--
-- This creates and aligns all 6 required tables, indexes, RLS policies,
-- and sets up the automatic profile creation trigger for Google OAuth and Email signups.
-- ===========================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1. PROFILES TABLE (User Accounts, Plans & Scan Quotas)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  github_scans_used INTEGER DEFAULT 0,
  resume_scans_used INTEGER DEFAULT 0,
  subscription_status TEXT DEFAULT 'inactive',
  subscription_end_date TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure all columns exist if table was already created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_scans_used INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resume_scans_used INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razorpay_customer_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can do anything on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_all" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_service_role_all"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. AUTOMATIC USER PROFILE TRIGGER (For Google OAuth & Email Signups)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, plan, subscription_status)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    'free',
    'inactive'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. CANDIDATES TABLE (Saved Scan Reports & History)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  source TEXT DEFAULT 'github' CHECK (source IN ('github', 'resume', 'both')),
  score INTEGER DEFAULT 0,
  tier TEXT DEFAULT 'D-Tier',
  risk_level TEXT DEFAULT 'High',
  recommendation_summary TEXT DEFAULT '',
  trust_score INTEGER DEFAULT 0,
  hire_recommendation TEXT DEFAULT 'NO',
  confidence FLOAT DEFAULT 0.5,
  top_skills TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  full_report JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'github';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'D-Tier';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'High';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS recommendation_summary TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS hire_recommendation TEXT DEFAULT 'NO';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.5;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS top_skills TEXT[] DEFAULT '{}';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS full_report JSONB;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_candidates_score ON public.candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_scanned ON public.candidates(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_tier ON public.candidates(tier);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_username ON public.candidates(username);
CREATE INDEX IF NOT EXISTS idx_candidates_user_scanned ON public.candidates(user_id, scanned_at DESC);

ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_username_user
  ON public.candidates(username, user_id);

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_own" ON public.candidates;
DROP POLICY IF EXISTS "Users can view own candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users can insert own candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users can update own candidates" ON public.candidates;
DROP POLICY IF EXISTS "Users can delete own candidates" ON public.candidates;
DROP POLICY IF EXISTS "candidates_service_role_all" ON public.candidates;

CREATE POLICY "candidates_select_own"
  ON public.candidates FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "candidates_insert_own"
  ON public.candidates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "candidates_update_own"
  ON public.candidates FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "candidates_delete_own"
  ON public.candidates FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "candidates_service_role_all"
  ON public.candidates FOR ALL
  USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. PAYMENTS TABLE (Razorpay Order & Transaction Records)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  plan TEXT,
  amount INTEGER,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;
DROP POLICY IF EXISTS "payments_service_role_all" ON public.payments;

CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "payments_service_role_all"
  ON public.payments FOR ALL
  USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. GITHUB_SCANS TABLE (Backend Scan Persistence & Caching)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.github_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  report_data JSONB,
  final_score NUMERIC DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_scans_username ON public.github_scans(username);
CREATE INDEX IF NOT EXISTS idx_github_scans_user_id ON public.github_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_github_scans_scanned_at ON public.github_scans(scanned_at DESC);

ALTER TABLE public.github_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access" ON public.github_scans;
DROP POLICY IF EXISTS "Users can view their own scans" ON public.github_scans;
DROP POLICY IF EXISTS "Users can insert their own scans" ON public.github_scans;
DROP POLICY IF EXISTS "Public can view scans by username" ON public.github_scans;
DROP POLICY IF EXISTS "github_scans_service_role" ON public.github_scans;
DROP POLICY IF EXISTS "github_scans_select_own" ON public.github_scans;
DROP POLICY IF EXISTS "github_scans_insert_own" ON public.github_scans;
DROP POLICY IF EXISTS "github_scans_public_view" ON public.github_scans;

CREATE POLICY "github_scans_service_role"
  ON public.github_scans FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "github_scans_select_own"
  ON public.github_scans FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "github_scans_insert_own"
  ON public.github_scans FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "github_scans_public_view"
  ON public.github_scans FOR SELECT
  TO anon
  USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. SHARED_REPORTS TABLE (Public Shareable Report Links)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shared_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  candidate_name TEXT DEFAULT '',
  report_data TEXT,
  expires_at TIMESTAMPTZ,
  view_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_reports_token ON public.shared_reports(token);

ALTER TABLE public.shared_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shared_reports_select_public" ON public.shared_reports;
DROP POLICY IF EXISTS "shared_reports_insert_auth" ON public.shared_reports;
DROP POLICY IF EXISTS "shared_reports_service_role" ON public.shared_reports;

CREATE POLICY "shared_reports_select_public"
  ON public.shared_reports FOR SELECT
  USING (true);

CREATE POLICY "shared_reports_insert_auth"
  ON public.shared_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shared_reports_service_role"
  ON public.shared_reports FOR ALL
  USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────────
-- 7. SETTINGS TABLE (Backend Configuration & Scraper Session Persistence)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_service_role" ON public.settings;
DROP POLICY IF EXISTS "Service role full access" ON public.settings;

CREATE POLICY "settings_service_role"
  ON public.settings FOR ALL
  USING (auth.role() = 'service_role');

-- ───────────────────────────────────────────────────────────────────────────
-- 8. GRANT PERMISSIONS TO ROLES
-- ───────────────────────────────────────────────────────────────────────────
GRANT ALL ON public.profiles TO authenticated, service_role;
GRANT SELECT ON public.profiles TO anon;

GRANT ALL ON public.candidates TO authenticated, service_role;
GRANT SELECT ON public.candidates TO anon;

GRANT ALL ON public.payments TO authenticated, service_role;

GRANT ALL ON public.github_scans TO authenticated, service_role, anon;

GRANT ALL ON public.shared_reports TO authenticated, service_role, anon;

GRANT ALL ON public.settings TO service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
