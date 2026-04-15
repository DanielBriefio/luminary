-- Run this in Supabase SQL Editor.
-- Replaces migration_invite_fixes.sql — run this even if you already ran that one.
--
-- Root problem: after signUp() with email confirmation enabled, there is no
-- authenticated session, so any RLS-protected insert/update silently fails.
-- Solution: DB-level trigger + SECURITY DEFINER functions bypass RLS entirely.

-- ── 1. generate_user_invites: SECURITY DEFINER so it bypasses RLS ──────────
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

-- ── 2. Auto-trigger: generate 5 invites whenever a new profile is created ──
--    Fires in the same transaction as the auth trigger — no frontend call needed.
create or replace function _auto_generate_invites()
returns trigger language plpgsql security definer as $$
begin
  perform generate_user_invites(NEW.id, 5);
  return NEW;
end;
$$;

drop trigger if exists trg_auto_generate_invites on profiles;
create trigger trg_auto_generate_invites
  after insert on profiles
  for each row execute function _auto_generate_invites();

-- ── 3. claim_invite_code: SECURITY DEFINER so it works without a session ───
--    Called after signUp; works whether or not email confirmation is required.
create or replace function claim_invite_code(p_code text, p_user_id uuid)
returns boolean language plpgsql security definer as $$
begin
  update invite_codes
  set claimed_by = p_user_id, claimed_at = now()
  where code = upper(trim(p_code)) and claimed_by is null;
  return found;
end;
$$;

-- Allow any authenticated user to call these functions
grant execute on function generate_user_invites(uuid, integer) to authenticated;
grant execute on function claim_invite_code(text, uuid)        to authenticated, anon;

-- ── 4. RLS policies (idempotent) ────────────────────────────────────────────
-- Drop old policies so we can recreate cleanly
drop policy if exists "invite_select_own"  on invite_codes;
drop policy if exists "invite_claim"        on invite_codes;
drop policy if exists "invite_insert_own"   on invite_codes;

-- Unclaimed codes visible to all (sign-up validation before auth exists)
-- Claimed codes visible only to creator or claimer
create policy "invite_select_own" on invite_codes for select
  using (
    claimed_by is null or
    auth.uid() = created_by or
    auth.uid() = claimed_by
  );

-- Authenticated users can update unclaimed codes (belt-and-suspenders alongside the fn)
create policy "invite_claim" on invite_codes for update
  using  (claimed_by is null)
  with check (true);

-- ── 5. Back-fill: generate codes for existing users who have none ───────────
do $$
declare r record;
begin
  for r in select id from profiles loop
    if (select count(*) from invite_codes where created_by = r.id) = 0 then
      perform generate_user_invites(r.id, 5);
    end if;
  end loop;
end;
$$;
