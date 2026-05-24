-- ===========================================================================
-- DevXray Production Supabase Synchronization Script
-- ===========================================================================
-- Run this in the Supabase SQL Editor to synchronize the schema.

-- 1. Ensure Profiles table has all necessary fields
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apply schema tracking columns to existing profiles table if they don't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS github_scans_used INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS resume_scans_used INTEGER DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can do anything" ON public.profiles FOR ALL USING (auth.role() = 'service_role');

-- 2. Standardize Candidates table schema
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, user_id)
);

-- ADD ALL MISSING BASE COLUMNS FIRST (must exist before indexes are created)
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'D-Tier';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'High';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS name TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'github';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS languages TEXT[] DEFAULT '{}';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS full_report JSONB;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ DEFAULT NOW();

-- Add extended columns
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS recommendation_summary TEXT DEFAULT '';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS hire_recommendation TEXT DEFAULT 'NO';
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.5;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS top_skills TEXT[] DEFAULT '{}';

-- NOW create indexes (all columns guaranteed to exist)
CREATE INDEX IF NOT EXISTS idx_candidates_score ON public.candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_scanned ON public.candidates(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_tier ON public.candidates(tier);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);

-- Enable RLS for candidates
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidates_select_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_insert_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_update_own" ON public.candidates;
DROP POLICY IF EXISTS "candidates_delete_own" ON public.candidates;

CREATE POLICY "candidates_select_own" ON public.candidates FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "candidates_insert_own" ON public.candidates FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "candidates_update_own" ON public.candidates FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "candidates_delete_own" ON public.candidates FOR DELETE USING (user_id = auth.uid());

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';