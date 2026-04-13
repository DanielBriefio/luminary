-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- Adds public profile sharing support

-- 1. New columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_slug        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS profile_visibility  JSONB NOT NULL DEFAULT
    '{"work_history":true,"education":true,"volunteering":true,"organizations":true,"skills":true,"publications":true,"posts":true}'::jsonb;

-- 2. Index for fast slug lookups
CREATE INDEX IF NOT EXISTS profiles_slug_idx ON profiles (profile_slug);

-- 3. RLS: allow anyone (including anon) to read profiles that have a slug set
--    (profiles without a slug stay private)
CREATE POLICY "Public profiles viewable by all"
  ON profiles FOR SELECT
  USING (profile_slug IS NOT NULL);

-- 4. RLS: allow anyone to read publications belonging to a public profile
CREATE POLICY "Publications of public profiles viewable by all"
  ON publications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = publications.user_id
        AND profiles.profile_slug IS NOT NULL
    )
  );

-- NOTE: if you already have a SELECT policy on profiles/publications that covers
-- authenticated users, make sure it still applies. The policies above are
-- additive — Supabase evaluates them with OR logic per role.
