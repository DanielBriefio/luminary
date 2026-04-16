-- ── Invite code brute-force protection ───────────────────────────────────────

-- Add attempts counter to invite codes
alter table invite_codes
  add column if not exists attempts    integer default 0,
  add column if not exists locked_at   timestamptz default null;

-- Function to safely increment attempts and lock if over threshold
create or replace function increment_invite_attempts(p_code text)
returns void language plpgsql as $$
begin
  update invite_codes
  set
    attempts  = attempts + 1,
    locked_at = case when attempts + 1 >= 5 then now() else locked_at end
  where code = upper(p_code) and claimed_by is null;
end;
$$;

-- ── ORCID OAuth pending sign-ups ──────────────────────────────────────────────

-- Temporary storage for ORCID data between OAuth callback and account creation
create table if not exists orcid_pending (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null,
  orcid_id     text not null,
  name         text default '',
  bio          text default '',
  institution  text default '',
  title        text default '',
  work_history text default '[]',  -- JSON string
  education    text default '[]',
  publications text default '[]',
  keywords     text default '[]',
  expires_at   timestamptz not null,
  created_at   timestamptz default now()
);

-- Clean up expired pending records automatically
create or replace function cleanup_orcid_pending()
returns void language sql as $$
  delete from orcid_pending where expires_at < now();
$$;

-- No RLS needed — accessed only via service role from Edge Function
