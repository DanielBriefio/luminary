-- ── GROUPS ────────────────────────────────────────────────────────────────────

create table if not exists groups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text default '',
  research_topic text default '',
  avatar_url     text default '',
  cover_url      text default '',
  is_public      boolean default true,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Add columns that may be missing on a pre-existing groups table
alter table groups alter column owner_id drop not null;
alter table groups add column if not exists description    text default '';
alter table groups add column if not exists research_topic text default '';
alter table groups add column if not exists avatar_url     text default '';
alter table groups add column if not exists cover_url      text default '';
alter table groups add column if not exists is_public      boolean default true;
alter table groups add column if not exists created_by     uuid references profiles(id) on delete set null;
alter table groups add column if not exists updated_at     timestamptz default now();

-- ── GROUP ROLE ENUM ────────────────────────────────────────────────────────────

do $$ begin
  create type group_role as enum ('admin', 'member', 'alumni');
exception when duplicate_object then null;
end $$;

-- ── GROUP MEMBERS ──────────────────────────────────────────────────────────────

create table if not exists group_members (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references groups(id) on delete cascade not null,
  user_id      uuid references profiles(id) on delete cascade not null,
  role         group_role default 'member',
  display_role text default '',
  joined_at    timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_members add column if not exists display_role text default '';
alter table group_members add column if not exists joined_at    timestamptz default now();

-- ── GROUP JOIN REQUESTS ────────────────────────────────────────────────────────

create table if not exists group_join_requests (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  message    text default '',
  status     text default 'pending',
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

-- ── GROUP POSTS ────────────────────────────────────────────────────────────────

create table if not exists group_posts (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid references groups(id) on delete cascade not null,
  user_id            uuid references profiles(id) on delete cascade not null,
  post_type          text default 'text',
  content            text default '',
  content_iv         text default '',
  content_encrypted  boolean default false,
  paper_doi          text default '',
  paper_title        text default '',
  paper_journal      text default '',
  paper_authors      text default '',
  paper_abstract     text default '',
  paper_year         text default '',
  link_url           text default '',
  link_title         text default '',
  link_description   text default '',
  image_url          text default '',
  file_type          text default '',
  file_name          text default '',
  tags               text[] default '{}',
  tier1              text default '',
  tier2              text[] default '{}',
  is_sticky          boolean default false,
  is_announcement    boolean default false,
  is_reposted_public boolean default false,
  edited_at          timestamptz default null,
  created_at         timestamptz default now()
);

-- ── GROUP POST INTERACTIONS ───────────────────────────────────────────────────

create table if not exists group_post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references group_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

create table if not exists group_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references group_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  content    text not null,
  read_at    timestamptz default null,
  created_at timestamptz default now()
);

-- ── VIEW ──────────────────────────────────────────────────────────────────────

create or replace view group_posts_with_meta as
select
  gp.*,
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier1 as author_identity_tier1,
  pr.identity_tier2 as author_identity_tier2,
  gm.role           as author_group_role,
  gm.display_role   as author_display_role,
  (select count(*) from group_post_likes    l where l.post_id = gp.id) as like_count,
  (select count(*) from group_post_comments c where c.post_id = gp.id) as comment_count
from group_posts gp
join profiles pr on pr.id = gp.user_id
left join group_members gm on gm.group_id = gp.group_id and gm.user_id = gp.user_id;

grant select on group_posts_with_meta to anon, authenticated;

-- ── INDEXES ───────────────────────────────────────────────────────────────────

create index if not exists idx_group_posts_group_id on group_posts(group_id, created_at desc);
create index if not exists idx_group_members_user   on group_members(user_id);
create index if not exists idx_group_members_group  on group_members(group_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table groups              enable row level security;
alter table group_members       enable row level security;
alter table group_join_requests enable row level security;
alter table group_posts         enable row level security;
alter table group_post_likes    enable row level security;
alter table group_post_comments enable row level security;

-- Drop all policies before recreating so this script is safely re-runnable
drop policy if exists "groups_select" on groups;
drop policy if exists "groups_insert" on groups;
drop policy if exists "groups_update" on groups;

drop policy if exists "gm_select" on group_members;
drop policy if exists "gm_insert" on group_members;
drop policy if exists "gm_update" on group_members;
drop policy if exists "gm_delete" on group_members;

drop policy if exists "gjr_select" on group_join_requests;
drop policy if exists "gjr_insert" on group_join_requests;
drop policy if exists "gjr_update" on group_join_requests;

drop policy if exists "gp_select"  on group_posts;
drop policy if exists "gp_insert"  on group_posts;
drop policy if exists "gp_update"  on group_posts;
drop policy if exists "gp_delete"  on group_posts;

drop policy if exists "gpl_select" on group_post_likes;
drop policy if exists "gpl_insert" on group_post_likes;
drop policy if exists "gpl_delete" on group_post_likes;

drop policy if exists "gpc_select" on group_post_comments;
drop policy if exists "gpc_insert" on group_post_comments;
drop policy if exists "gpc_delete" on group_post_comments;

-- ── SECURITY DEFINER HELPERS ─────────────────────────────────────────────────
-- Drop first so the script is re-runnable
drop function if exists get_my_group_ids();
drop function if exists get_my_admin_group_ids();
drop function if exists get_my_member_group_ids();
drop function if exists get_public_group_ids();
drop function if exists get_my_member_post_ids();
-- All membership checks go through these functions so RLS on group_members /
-- groups is never re-entered, preventing infinite recursion in every policy.

create or replace function get_my_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select group_id from group_members where user_id = auth.uid();
$$;

create or replace function get_my_admin_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select group_id from group_members where user_id = auth.uid() and role = 'admin';
$$;

create or replace function get_my_member_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select group_id from group_members where user_id = auth.uid() and role in ('admin','member');
$$;

create or replace function get_public_group_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select id from groups where is_public = true;
$$;

create or replace function get_my_member_post_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select gp.id from group_posts gp
  join group_members gm on gm.group_id = gp.group_id
  where gm.user_id = auth.uid() and gm.role in ('admin','member');
$$;

-- Groups
create policy "groups_select" on groups for select using (
  is_public = true or
  id in (select get_my_group_ids())
);
create policy "groups_insert" on groups for insert
  with check (auth.uid() = created_by);
create policy "groups_update" on groups for update
  using (id in (select get_my_admin_group_ids()));

-- Group members
create policy "gm_select" on group_members for select using (
  user_id = auth.uid()
  or group_id in (select get_public_group_ids())
  or group_id in (select get_my_group_ids())
);
create policy "gm_insert" on group_members for insert
  with check (auth.uid() = user_id);
create policy "gm_update" on group_members for update
  using (
    auth.uid() = user_id or
    group_id in (select get_my_admin_group_ids())
  );
create policy "gm_delete" on group_members for delete
  using (
    auth.uid() = user_id or
    group_id in (select get_my_admin_group_ids())
  );

-- Join requests
create policy "gjr_select" on group_join_requests for select using (
  auth.uid() = user_id or
  group_id in (select get_my_admin_group_ids())
);
create policy "gjr_insert" on group_join_requests for insert
  with check (auth.uid() = user_id);
create policy "gjr_update" on group_join_requests for update
  using (group_id in (select get_my_admin_group_ids()));

-- Group posts
create policy "gp_select" on group_posts for select using (
  group_id in (select get_my_member_group_ids())
);
create policy "gp_insert" on group_posts for insert
  with check (
    auth.uid() = user_id and
    group_id in (select get_my_member_group_ids())
  );
create policy "gp_update" on group_posts for update
  using (
    auth.uid() = user_id or
    group_id in (select get_my_admin_group_ids())
  );
create policy "gp_delete" on group_posts for delete
  using (
    auth.uid() = user_id or
    group_id in (select get_my_admin_group_ids())
  );

-- Likes
create policy "gpl_select" on group_post_likes for select using (
  post_id in (select get_my_member_post_ids())
);
create policy "gpl_insert" on group_post_likes for insert
  with check (auth.uid() = user_id);
create policy "gpl_delete" on group_post_likes for delete
  using (auth.uid() = user_id);

-- Comments
create policy "gpc_select" on group_post_comments for select using (
  post_id in (select get_my_member_post_ids())
);
create policy "gpc_insert" on group_post_comments for insert
  with check (auth.uid() = user_id);
create policy "gpc_delete" on group_post_comments for delete
  using (auth.uid() = user_id);
