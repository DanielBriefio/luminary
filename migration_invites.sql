-- Invite codes table
create table if not exists invite_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  created_by   uuid references profiles(id) on delete set null, -- null = admin
  claimed_by   uuid references profiles(id) on delete set null,
  claimed_at   timestamptz,
  batch_label  text default '',   -- e.g. 'AACR2026', 'personal'
  created_at   timestamptz default now()
);

-- Index for fast code lookup
create index if not exists idx_invite_codes_code
  on invite_codes(code);
create index if not exists idx_invite_codes_created_by
  on invite_codes(created_by);

-- RLS: users can only read their own codes
alter table invite_codes enable row level security;

create policy "invite_select_own" on invite_codes for select
  using (
    auth.uid() = created_by or
    auth.uid() = claimed_by
  );

-- Profiles: track ORCID uniqueness and sign-up method
alter table profiles
  add column if not exists signup_method text default 'invite', -- 'invite' | 'orcid'
  add column if not exists orcid_verified boolean default false;

-- Function to generate invite codes for a user (called after account creation)
create or replace function generate_user_invites(user_id uuid, count integer default 5)
returns void language plpgsql as $$
begin
  insert into invite_codes (code, created_by, batch_label)
  select
    'LM-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    user_id,
    'personal'
  from generate_series(1, count);
end;
$$;

-- Generate invites for all existing users who don't have any yet
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

-- -----------------------------------------------------------------------
-- To generate conference batch codes, run the query below separately
-- (change the label and count as needed):
--
-- insert into invite_codes (code, batch_label, created_by)
-- select
--   'CONF-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
--   'AACR2026',   -- change this label
--   null          -- null = admin-generated
-- from generate_series(1, 20);  -- change count as needed
-- -----------------------------------------------------------------------
