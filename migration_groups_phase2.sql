-- Add group profile fields
alter table groups
  add column if not exists avatar_url          text    default '',
  add column if not exists cover_url           text    default '',
  add column if not exists leader_name         text    default '',
  add column if not exists contact_email       text    default '',
  add column if not exists website_url         text    default '',
  add column if not exists location            text    default '',
  add column if not exists collaborating_groups jsonb  default '[]',
  add column if not exists is_searchable       boolean default true;

-- Invitation links
create table if not exists group_invites (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references groups(id) on delete cascade not null,
  created_by   uuid references profiles(id) on delete cascade not null,
  token        text unique not null default
    lower(substring(replace(gen_random_uuid()::text,'-',''), 1, 12)),
  expires_at   timestamptz default (now() + interval '7 days'),
  max_uses     integer default 10,
  use_count    integer default 0,
  created_at   timestamptz default now()
);

alter table group_invites enable row level security;

create policy "ginv_select" on group_invites for select using (
  group_id in (
    select group_id from group_members where user_id = auth.uid()
  )
);
create policy "ginv_insert" on group_invites for insert
  with check (
    auth.uid() = created_by and
    group_id in (
      select group_id from group_members
      where user_id = auth.uid() and role = 'admin'
    )
  );
create policy "ginv_delete" on group_invites for delete
  using (auth.uid() = created_by);

create index if not exists idx_group_invites_token
  on group_invites(token);

-- Auto-updated stats view
create or replace view group_stats as
select
  g.id                                              as group_id,
  count(gm.id) filter (where gm.role = 'member')   as member_count,
  count(gm.id) filter (where gm.role = 'admin')    as admin_count,
  count(gm.id) filter (where gm.role = 'alumni')   as alumni_count,
  count(gm.id) filter (
    where gm.role in ('admin', 'member')
  )                                                 as active_member_count
from groups g
left join group_members gm on gm.group_id = g.id
group by g.id;

grant select on group_stats to anon, authenticated;
