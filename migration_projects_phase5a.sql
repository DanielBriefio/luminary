-- ── PROJECTS ──────────────────────────────────────────────────────────────────

create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  group_id       uuid references groups(id) on delete cascade,
  name           text not null,
  description    text default '',
  template_type  text default 'blank',
  cover_color    text default '#6c63ff',
  icon           text default '✏️',
  status         text default 'active', -- 'active' | 'archived'
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  constraint projects_owner check (
    (user_id is not null) != (group_id is not null)
  )
);

-- ── PROJECT MEMBERS ───────────────────────────────────────────────────────────

create table if not exists project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  role       text default 'member', -- 'owner' | 'member'
  joined_at  timestamptz default now(),
  unique(project_id, user_id)
);

-- ── PROJECT FOLDERS ───────────────────────────────────────────────────────────

create table if not exists project_folders (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name       text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ── PROJECT POSTS ─────────────────────────────────────────────────────────────

create table if not exists project_posts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete cascade not null,
  folder_id         uuid references project_folders(id) on delete set null,
  user_id           uuid references profiles(id) on delete cascade not null,

  post_type         text default 'text',
  content           text default '',
  content_iv        text default '',
  content_encrypted boolean default false,

  paper_doi         text default '',
  paper_title       text default '',
  paper_journal     text default '',
  paper_authors     text default '',
  paper_abstract    text default '',
  paper_year        text default '',
  paper_citation    text default '',

  image_url         text default '',
  file_type         text default '',
  file_name         text default '',

  tags              text[] default '{}',
  tier1             text default '',
  tier2             text[] default '{}',

  is_sticky         boolean default false,
  is_starter        boolean default false,
  edited_at         timestamptz default null,
  created_at        timestamptz default now()
);

-- ── INTERACTIONS ─────────────────────────────────────────────────────────────

create table if not exists project_post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references project_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

create table if not exists project_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references project_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  content    text not null,
  created_at timestamptz default now()
);

-- ── VIEW ─────────────────────────────────────────────────────────────────────

create or replace view project_posts_with_meta as
select
  pp.*,
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier2 as author_identity_tier2,
  pf.name           as folder_name,
  p.name            as project_name,
  p.icon            as project_icon,
  p.cover_color     as project_color,
  p.group_id        as project_group_id,
  (select count(*) from project_post_likes    l where l.post_id = pp.id)
    as like_count,
  (select count(*) from project_post_comments c where c.post_id = pp.id)
    as comment_count
from project_posts pp
join profiles pr on pr.id = pp.user_id
join projects p  on p.id  = pp.project_id
left join project_folders pf on pf.id = pp.folder_id;

grant select on project_posts_with_meta to anon, authenticated;

-- ── INDEXES ──────────────────────────────────────────────────────────────────

create index if not exists idx_project_posts_project
  on project_posts(project_id, created_at desc);
create index if not exists idx_project_posts_folder
  on project_posts(folder_id);
create index if not exists idx_projects_user
  on projects(user_id) where user_id is not null;
create index if not exists idx_projects_group
  on projects(group_id) where group_id is not null;
create index if not exists idx_project_members_user
  on project_members(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table project_folders       enable row level security;
alter table project_posts         enable row level security;
alter table project_post_likes    enable row level security;
alter table project_post_comments enable row level security;

-- Projects
create policy "proj_select" on projects for select using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role in ('admin','member')
  ))
);
create policy "proj_insert" on projects for insert
  with check (auth.uid() = created_by);
create policy "proj_update" on projects for update using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
create policy "proj_delete" on projects for delete using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);

-- Project members
create policy "pm_select" on project_members for select using (
  project_id in (select id from projects)
);
create policy "pm_insert" on project_members for insert with check (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "pm_delete" on project_members for delete using (
  auth.uid() = user_id or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

-- Folders
create policy "pf_select" on project_folders for select using (
  project_id in (select id from projects)
);
create policy "pf_insert" on project_folders for insert with check (
  project_id in (select id from projects)
);
create policy "pf_update" on project_folders for update using (
  project_id in (select id from projects)
);
create policy "pf_delete" on project_folders for delete using (
  project_id in (select id from projects)
);

-- Posts
create policy "pp_select" on project_posts for select using (
  project_id in (select id from projects)
);
create policy "pp_insert" on project_posts for insert with check (
  auth.uid() = user_id and project_id in (select id from projects)
);
create policy "pp_update" on project_posts for update using (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "pp_delete" on project_posts for delete using (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

create policy "ppl_select" on project_post_likes for select using (
  post_id in (select id from project_posts)
);
create policy "ppl_insert" on project_post_likes for insert
  with check (auth.uid() = user_id);
create policy "ppl_delete" on project_post_likes for delete
  using (auth.uid() = user_id);

create policy "ppc_select" on project_post_comments for select using (
  post_id in (select id from project_posts)
);
create policy "ppc_insert" on project_post_comments for insert
  with check (auth.uid() = user_id);
create policy "ppc_delete" on project_post_comments for delete
  using (auth.uid() = user_id);
