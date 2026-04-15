-- Run this in Supabase SQL Editor.
-- Fixes three invite_codes issues:
--   1. generate_user_invites lacked SECURITY DEFINER → RLS blocked inserts
--   2. No UPDATE policy → claiming a code silently failed
--   3. No INSERT policy for authenticated users (belt-and-suspenders)

-- 1. Recreate generate_user_invites with SECURITY DEFINER so it bypasses RLS
create or replace function generate_user_invites(user_id uuid, count integer default 5)
returns void language plpgsql security definer as $$
begin
  insert into invite_codes (code, created_by, batch_label)
  select
    'LM-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    user_id,
    'personal'
  from generate_series(1, count);
end;
$$;

-- 2. Allow authenticated users to claim an unclaimed code (used during sign-up)
--    The new user is authenticated by the time they claim (signUp returns a session)
drop policy if exists "invite_claim" on invite_codes;
create policy "invite_claim" on invite_codes for update
  using (claimed_by is null)
  with check (true);   -- SECURITY DEFINER on the fn handles business logic; any authed user can claim

-- 3. Allow authenticated users to insert codes they own (fallback for direct inserts)
drop policy if exists "invite_insert_own" on invite_codes;
create policy "invite_insert_own" on invite_codes for insert
  with check (auth.uid() = created_by or created_by is null);
