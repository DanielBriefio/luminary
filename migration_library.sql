-- ── SAVED POSTS ────────────────────────────────────────────────────────────────

create table if not exists saved_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete cascade not null,
  post_id       uuid references posts(id) on delete cascade,
  group_post_id uuid references group_posts(id) on delete cascade,
  saved_at      timestamptz default now(),
  unique(user_id, post_id),
  unique(user_id, group_post_id)
);

alter table saved_posts enable row level security;
create policy "sp_select" on saved_posts for select
  using (auth.uid() = user_id);
create policy "sp_insert" on saved_posts for insert
  with check (auth.uid() = user_id);
create policy "sp_delete" on saved_posts for delete
  using (auth.uid() = user_id);

create index if not exists idx_saved_posts_user
  on saved_posts(user_id, saved_at desc);

-- ── LIBRARY FOLDERS ─────────────────────────────────────────────────────────────

create table if not exists library_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  group_id    uuid references groups(id) on delete cascade,
  name        text not null,
  description text default '',
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  constraint lf_owner check (
    (user_id is not null) != (group_id is not null)
  )
);

alter table library_folders enable row level security;

create policy "lf_select" on library_folders for select using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role in ('admin','member')
  ))
);
create policy "lf_insert" on library_folders for insert with check (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
create policy "lf_update" on library_folders for update using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
create policy "lf_delete" on library_folders for delete using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);

-- ── LIBRARY ITEMS ───────────────────────────────────────────────────────────────

create table if not exists library_items (
  id                   uuid primary key default gen_random_uuid(),
  folder_id            uuid references library_folders(id) on delete cascade not null,
  added_by             uuid references profiles(id) on delete set null,
  title                text not null,
  authors              text default '',
  journal              text default '',
  year                 text default '',
  doi                  text default '',
  pmid                 text default '',
  epmc_id              text default '',
  abstract             text default '',
  cited_by_count       integer default 0,
  is_open_access       boolean default false,
  full_text_url        text default '',
  pdf_url              text default '',
  pdf_name             text default '',
  notes                text default '',
  is_group_publication boolean default false,
  added_at             timestamptz default now()
);

alter table library_items enable row level security;

create policy "li_select" on library_items for select using (
  folder_id in (select id from library_folders)
);
create policy "li_insert" on library_items for insert with check (
  auth.uid() = added_by and
  folder_id in (select id from library_folders)
);
create policy "li_update" on library_items for update using (
  auth.uid() = added_by or
  folder_id in (
    select lf.id from library_folders lf
    join group_members gm on gm.group_id = lf.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "li_delete" on library_items for delete using (
  auth.uid() = added_by or
  folder_id in (
    select lf.id from library_folders lf
    join group_members gm on gm.group_id = lf.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

create index if not exists idx_library_items_folder
  on library_items(folder_id, added_at desc);
create index if not exists idx_library_items_doi
  on library_items(doi) where doi != '';

-- ── GROUP LIBRARY DEFAULTS ─────────────────────────────────────────────────────

create or replace function create_group_library_defaults(p_group_id uuid)
returns void language plpgsql as $$
begin
  insert into library_folders (group_id, name, description, sort_order)
  values
    (p_group_id, 'Journal Club',
      'Papers for group reading and discussion', 0),
    (p_group_id, 'Our Group''s Publications',
      'Papers authored by group members', 1);
end;
$$;

-- ── UPDATE group_stats VIEW ────────────────────────────────────────────────────

drop view if exists group_stats;
create view group_stats as
select
  g.id                                                    as group_id,
  count(gm.id) filter (where gm.role = 'member')         as member_count,
  count(gm.id) filter (where gm.role = 'admin')          as admin_count,
  count(gm.id) filter (where gm.role = 'alumni')         as alumni_count,
  count(gm.id) filter (
    where gm.role in ('admin','member')
  )                                                       as active_member_count,
  (
    select count(*) from library_items li
    join library_folders lf on lf.id = li.folder_id
    where lf.group_id = g.id and li.is_group_publication = true
  )                                                       as publication_count
from groups g
left join group_members gm on gm.group_id = g.id
group by g.id;

grant select on group_stats to anon, authenticated;
