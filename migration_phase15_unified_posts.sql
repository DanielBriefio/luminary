-- Phase 15: Unified posts schema
--
-- Collapses posts / group_posts / project_posts into a single `posts`
-- table with `context_kind` (feed|group|project) + `context_id`. Same
-- collapse for likes and comments. Visibility is an explicit column
-- driving the RLS branches and the public-URL gate.
--
-- DESTRUCTIVE — must be run AFTER /admin → Storage → Danger zone wipe.
-- Drops the three old post tables, their per-context likes/comments,
-- their _with_meta views, and the post_reports table (recreated with
-- single post_id). reposts and saved_posts have their schemas adjusted
-- to the unified posts.id and are truncated.
--
-- Rebuilds:
--   * posts                   — unified
--   * likes                   — unified
--   * comments                — unified
--   * post_reports            — unified (drops group_post_id branch)
--   * posts_with_meta         — view joining profiles, groups, projects
--   * RLS policies            — author / feed / group / project / admin
--   * helper functions        — can_see_post, get_my_group_ids (kept)
--   * RPCs                    — get_admin_posts, get_content_health,
--                               get_moderation_queue, get_paper_stats_public,
--                               get_hot_papers, get_content_performance,
--                               get_power_posters, get_power_commenters,
--                               get_at_risk_users, get_quiet_champions,
--                               get_signup_method_breakdown,
--                               get_work_mode_stats, send_admin_post,
--                               get_post_likers (NEW)

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Drop old structure
-- ──────────────────────────────────────────────────────────────────────────

-- Views first (they depend on tables)
drop view  if exists posts_with_meta              cascade;
drop view  if exists group_posts_with_meta       cascade;
drop view  if exists project_posts_with_meta     cascade;

-- RPCs that reference dropped tables/columns (drop now, recreate at the end)
drop function if exists get_admin_posts(int, int, text, text, boolean, boolean) cascade;
drop function if exists get_admin_posts(int, int, text, text, boolean)          cascade;
drop function if exists get_content_health()                                    cascade;
drop function if exists get_moderation_queue(text)                              cascade;
drop function if exists get_paper_stats_public()                                cascade;
drop function if exists get_hot_papers(int)                                     cascade;
drop function if exists get_content_performance(int)                            cascade;
drop function if exists get_power_posters(int, int)                             cascade;
drop function if exists get_power_commenters(int, int)                          cascade;
drop function if exists get_at_risk_users(int)                                  cascade;
drop function if exists get_quiet_champions(int)                                cascade;
drop function if exists get_signup_method_breakdown(int)                        cascade;
drop function if exists get_work_mode_stats(int)                                cascade;
drop function if exists get_at_risk_alerts()                                    cascade;
drop function if exists send_admin_post(text, text, uuid, text, text, text, text, text, text, text[], uuid, uuid) cascade;
drop function if exists send_admin_post(text, text, uuid, text, text, text, text, text, text, text[], uuid)       cascade;
drop function if exists send_admin_post(text, text, uuid)                       cascade;
drop function if exists get_post_likers(uuid, int, int)                         cascade;
drop function if exists can_see_post(uuid)                                      cascade;
-- Storage RPCs that hardcoded the group_posts branch
drop function if exists delete_user_file(uuid)                                  cascade;
drop function if exists get_my_storage_usage()                                  cascade;
drop function if exists get_admin_user_storage_files(uuid)                      cascade;

-- Tables (in dependency order)
drop table if exists post_reports                cascade;
drop table if exists project_post_likes          cascade;
drop table if exists project_post_comments       cascade;
drop table if exists project_posts               cascade;
drop table if exists group_post_likes            cascade;
drop table if exists group_post_comments         cascade;
drop table if exists group_posts                 cascade;
drop table if exists likes                       cascade;
drop table if exists comments                    cascade;
drop table if exists posts                       cascade;

-- reposts and saved_posts survive but their FKs and rows are stale.
-- Truncate them; they're empty anyway after the wipe but be explicit.
truncate reposts;
truncate saved_posts;

-- saved_posts has a legacy group_post_id column from the split world. Drop it.
alter table saved_posts drop column if exists group_post_id;
alter table saved_posts drop constraint if exists saved_posts_group_post_id_key;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Unified posts table
-- ──────────────────────────────────────────────────────────────────────────

create table posts (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references profiles(id) on delete cascade,
  content                  text default '',
  post_type                text default 'text',
    -- 'text'|'paper'|'image'|'video'|'audio'|'pdf'|'data'|'file'

  -- Paper attachment
  paper_doi                text,
  paper_title              text,
  paper_journal            text,
  paper_year               text,
  paper_authors            text,
  paper_abstract           text,
  paper_citation           text,

  -- File attachment
  image_url                text,
  file_name                text,
  file_type                text,
  file_deleted_at          timestamptz,

  -- Deep dive
  is_deep_dive             boolean default false,
  deep_dive_title          text,
  deep_dive_cover_url      text,
  deep_dive_cover_position text default '50% 50%',

  -- Tags / topic metadata (existing fields kept for parity)
  tags                     text[] default '{}',
  tier1                    text default '',
  tier2                    text[] default '{}',

  -- Admin / targeting
  is_admin_post            boolean default false,
  target_user_id           uuid references profiles(id) on delete cascade,

  -- Moderation
  hidden                   boolean default false,

  -- Context
  context_kind             text not null
                             check (context_kind in ('feed','group','project')),
  context_id               uuid,
    -- null for feed; group.id for group; project.id for project

  -- Visibility
  visibility               text not null default 'public'
                             check (visibility in ('public','members','private')),

  edited_at                timestamptz,
  created_at               timestamptz default now(),

  -- A feed post must have null context_id; a group/project post must have one.
  constraint posts_context_id_consistent
    check ((context_kind = 'feed') = (context_id is null))
);

-- Conditional FKs for context_id: a trigger validates against groups/projects
-- (a single column can't FK to two tables at once, and a polymorphic FK isn't
-- worth the complexity given the simple membership shape).
create or replace function posts_validate_context()
returns trigger
language plpgsql
as $$
begin
  if new.context_kind = 'group' then
    if not exists (select 1 from groups where id = new.context_id) then
      raise exception 'context_id % is not a group', new.context_id;
    end if;
  elsif new.context_kind = 'project' then
    if not exists (select 1 from projects where id = new.context_id) then
      raise exception 'context_id % is not a project', new.context_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_posts_validate_context
  before insert or update on posts
  for each row execute function posts_validate_context();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. likes + comments (unified)
-- ──────────────────────────────────────────────────────────────────────────

create table likes (
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (post_id, user_id)
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid     references profiles(id) on delete set null,
    -- SET NULL preserves thread structure when the author is purged
    -- (Phase 12.4 tombstone pattern)
  content     text not null,
  hidden      boolean default false,
  created_at  timestamptz default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. post_reports — single post_id covers all contexts now
-- ──────────────────────────────────────────────────────────────────────────

create table post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      text not null,
    -- 'spam'|'misinformation'|'inappropriate'|'off_topic'|'other'
  note        text,
  status      text default 'pending',
    -- 'pending'|'dismissed'|'actioned'
  created_at  timestamptz default now(),
  unique (post_id, reporter_id)
);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ──────────────────────────────────────────────────────────────────────────

create index posts_user_idx           on posts (user_id, created_at desc);
create index posts_feed_idx           on posts (created_at desc)
                                      where context_kind = 'feed' and not hidden;
create index posts_group_idx          on posts (context_id, created_at desc)
                                      where context_kind = 'group' and not hidden;
create index posts_project_idx        on posts (context_id, created_at desc)
                                      where context_kind = 'project' and not hidden;
create index posts_paper_doi_idx      on posts (paper_doi)
                                      where paper_doi is not null;
create index posts_target_idx         on posts (target_user_id)
                                      where target_user_id is not null;
create index posts_admin_post_idx     on posts (is_admin_post, created_at desc)
                                      where is_admin_post = true;

create index likes_user_idx           on likes (user_id, created_at desc);

create index comments_post_idx        on comments (post_id, created_at);
create index comments_user_idx        on comments (user_id) where user_id is not null;

create index post_reports_status_idx  on post_reports (status);
create index post_reports_post_idx    on post_reports (post_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. RLS — posts
-- ──────────────────────────────────────────────────────────────────────────

alter table posts enable row level security;

-- Author always sees own
create policy posts_select_own on posts
  for select
  using (user_id = auth.uid());

-- Feed posts: visible to anyone authenticated unless targeted at someone else.
-- 'public' visibility surfaces in /s/:id without auth too — that's enforced
-- in the route, not at RLS, because anon can't pass any policy here.
create policy posts_select_feed on posts
  for select
  using (
    context_kind = 'feed'
    and not hidden
    and (target_user_id is null or target_user_id = auth.uid())
  );

-- Group posts: members of the group OR anyone (authed) if group is public.
-- Uses the existing SECURITY DEFINER helper get_my_group_ids() to avoid the
-- group_members RLS round-trip from inside this policy.
create policy posts_select_group on posts
  for select
  using (
    context_kind = 'group'
    and not hidden
    and (
      context_id in (select get_my_group_ids())
      or context_id in (select id from groups where is_public = true)
    )
  );

-- Project posts: project members OR group members of the parent group
-- (the "user-guide group containing user-guide projects" pattern).
create policy posts_select_project on posts
  for select
  using (
    context_kind = 'project'
    and not hidden
    and (
      context_id in (select project_id from project_members where user_id = auth.uid())
      or context_id in (
        select p.id
          from projects p
         where p.group_id in (select get_my_group_ids())
      )
    )
  );

-- Admin sees everything (including hidden, for moderation)
create policy posts_select_admin on posts
  for select
  using ((select is_admin from profiles where profiles.id = auth.uid()));

-- Author writes own posts. INSERT also gates the context: the user must be
-- a member of the group/project they're posting into. Feed posts have no
-- context membership.
create policy posts_insert_own on posts
  for insert
  with check (
    user_id = auth.uid()
    and (
      context_kind = 'feed'
      or (
        context_kind = 'group'
        and context_id in (select get_my_group_ids())
      )
      or (
        context_kind = 'project'
        and context_id in (select project_id from project_members where user_id = auth.uid())
      )
    )
  );

create policy posts_update_own on posts
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy posts_delete_own on posts
  for delete
  using (user_id = auth.uid());

-- Admin override for moderation (hide/edit/delete)
create policy posts_admin_all on posts
  for all
  using ((select is_admin from profiles where profiles.id = auth.uid()))
  with check ((select is_admin from profiles where profiles.id = auth.uid()));

-- ──────────────────────────────────────────────────────────────────────────
-- 6. RLS — likes
-- ──────────────────────────────────────────────────────────────────────────

alter table likes enable row level security;

create policy likes_select on likes
  for select
  using (exists (select 1 from posts where posts.id = likes.post_id));

create policy likes_insert on likes
  for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from posts where posts.id = likes.post_id)
  );

create policy likes_delete on likes
  for delete
  using (user_id = auth.uid());

-- ──────────────────────────────────────────────────────────────────────────
-- 7. RLS — comments
-- ──────────────────────────────────────────────────────────────────────────

alter table comments enable row level security;

create policy comments_select on comments
  for select
  using (
    not hidden
    and exists (select 1 from posts where posts.id = comments.post_id)
  );

create policy comments_insert on comments
  for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from posts where posts.id = comments.post_id)
  );

create policy comments_update_own on comments
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy comments_delete_own on comments
  for delete
  using (user_id = auth.uid());

create policy comments_admin_all on comments
  for all
  using ((select is_admin from profiles where profiles.id = auth.uid()))
  with check ((select is_admin from profiles where profiles.id = auth.uid()));

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RLS — post_reports (port of Phase 7 admin policies)
-- ──────────────────────────────────────────────────────────────────────────

alter table post_reports enable row level security;

create policy pr_insert on post_reports
  for insert with check (auth.uid() = reporter_id);

create policy pr_select_own on post_reports
  for select using (
    auth.uid() = reporter_id
    or (select is_admin from profiles where profiles.id = auth.uid())
  );

create policy pr_update_admin on post_reports
  for update using (
    (select is_admin from profiles where profiles.id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────────────────
-- 9. posts_with_meta view
-- ──────────────────────────────────────────────────────────────────────────

create view posts_with_meta as
select
  p.*,

  -- Author
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier1 as author_identity_tier1,
  pr.identity_tier2 as author_identity_tier2,
  pr.work_mode      as author_work_mode,
  pr.profile_slug   as author_slug,

  -- Group context (null for feed/project)
  g.name            as group_name,
  g.slug            as group_slug,
  g.is_public       as group_is_public,

  -- Project context (null for feed/group)
  pj.name           as project_name,
  pj.icon           as project_icon,
  pj.cover_color    as project_cover_color,
  pj.group_id       as project_group_id,
    -- The parent group of a group-owned project. NULL for personal projects.
    -- Used by the composer to surface the "this project is owned by Group X
    -- — posts here are visible to all Group X members" heads-up.

  -- Aggregates
  (select count(*)::int from likes    l where l.post_id = p.id)                                    as like_count,
  (select count(*)::int from comments c where c.post_id = p.id and not c.hidden)                   as comment_count,
  (select count(*)::int from reposts  r where r.post_id = p.id)                                    as repost_count,
  (select exists(select 1 from likes   l where l.post_id = p.id and l.user_id = auth.uid()))       as user_liked,
  (select exists(select 1 from reposts r where r.post_id = p.id and r.user_id = auth.uid()))       as user_reposted,
  (select count(*)::int from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending') as report_count

from posts p
join profiles pr on pr.id = p.user_id and pr.deletion_scheduled_at is null
left join groups   g  on g.id  = p.context_id and p.context_kind = 'group'
left join projects pj on pj.id = p.context_id and p.context_kind = 'project';

grant select on posts_with_meta to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. Helper: can_see_post  (reused by RPCs that drill into a single post)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function can_see_post(p_post_id uuid)
returns boolean
language sql
stable
security invoker
as $$
  -- Returns true if the caller has SELECT on the post via one of the four
  -- RLS branches. Implementation mirrors the policies but written as a
  -- plain SELECT so it can be called from RPC bodies.
  select exists (select 1 from posts where id = p_post_id);
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 11. RPC — get_admin_posts (rewritten; no link_*/featured args)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_admin_posts(
  p_limit  int     default 50,
  p_offset int     default 0,
  p_search text    default null,
  p_type   text    default null,
  p_hidden boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*) over(),
      'posts', coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    )
    from (
      select
        p.id,
        p.content,
        p.post_type,
        p.context_kind,
        p.context_id,
        p.visibility,
        p.hidden,
        p.is_admin_post,
        p.is_deep_dive,
        p.deep_dive_title,
        p.paper_title,
        p.tags,
        p.created_at,
        pr.name         as author_name,
        pr.avatar_color as author_avatar_color,
        pr.avatar_url   as author_avatar_url,
        pr.work_mode    as author_work_mode,
        (
          select count(*)::int from post_reports
           where post_id = p.id and status = 'pending'
        ) as report_count
      from posts p
      join profiles pr on pr.id = p.user_id
      where (p_search is null
        or p.content      ilike '%' || p_search || '%'
        or p.paper_title  ilike '%' || p_search || '%'
        or pr.name        ilike '%' || p_search || '%')
        and (p_type   is null or p.post_type = p_type)
        and (p_hidden is null or p.hidden    = p_hidden)
      order by
        (select count(*) from post_reports
          where post_id = p.id and status = 'pending') desc,
        p.created_at desc
      limit  p_limit
      offset p_offset
    ) t
  );
end;
$$;

grant execute on function get_admin_posts(int, int, text, text, boolean) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 12. RPC — get_content_health
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_content_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'groups', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.last_post_at desc nulls last), '[]'::jsonb)
        from (
          select
            g.id, g.name, g.is_public,
            (select count(*)::int from group_members
              where group_id = g.id and role in ('admin','member')) as member_count,
            (select count(*)::int from posts
              where context_kind = 'group' and context_id = g.id
                and created_at >= now() - interval '7 days')        as posts_this_week,
            (select max(created_at) from posts
              where context_kind = 'group' and context_id = g.id)   as last_post_at,
            case
              when (select max(created_at) from posts
                     where context_kind = 'group' and context_id = g.id)
                   >= now() - interval '7 days'  then 'active'
              when (select max(created_at) from posts
                     where context_kind = 'group' and context_id = g.id)
                   >= now() - interval '14 days' then 'quiet'
              else 'dead'
            end as health
          from groups g
        ) t
    ),
    'projects', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.last_post_at desc nulls last), '[]'::jsonb)
        from (
          select
            pj.id, pj.name, pj.status, pj.icon, pj.cover_color,
            (select count(*)::int from project_members where project_id = pj.id) as member_count,
            (select count(*)::int from posts
              where context_kind = 'project' and context_id = pj.id
                and created_at >= now() - interval '7 days')        as posts_this_week,
            (select max(created_at) from posts
              where context_kind = 'project' and context_id = pj.id) as last_post_at,
            case
              when (select max(created_at) from posts
                     where context_kind = 'project' and context_id = pj.id)
                   >= now() - interval '7 days'  then 'active'
              when (select max(created_at) from posts
                     where context_kind = 'project' and context_id = pj.id)
                   >= now() - interval '14 days' then 'quiet'
              else 'dead'
            end as health
          from projects pj
          where pj.status = 'active'
        ) t
    )
  );
end;
$$;

grant execute on function get_content_health() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 13. RPC — get_moderation_queue (single posts table now)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_moderation_queue(p_status text default 'pending')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.report_count desc, t.latest_report desc), '[]'::jsonb)
      from (
        select
          p.id            as post_id,
          p.content,
          p.post_type,
          p.context_kind,
          p.context_id,
          p.created_at    as post_created_at,
          p.hidden,
          pa.name         as author_name,
          pa.avatar_color as author_avatar_color,
          count(rep.id)::int      as report_count,
          max(rep.created_at)     as latest_report,
          jsonb_agg(jsonb_build_object(
            'reporter',   rpr.name,
            'reason',     rep.reason,
            'note',       rep.note,
            'created_at', rep.created_at
          ) order by rep.created_at desc) as reports
        from post_reports rep
        join posts    p   on p.id   = rep.post_id
        join profiles pa  on pa.id  = p.user_id
        join profiles rpr on rpr.id = rep.reporter_id
       where rep.status = p_status
       group by p.id, p.content, p.post_type, p.context_kind, p.context_id,
                p.created_at, p.hidden, pa.name, pa.avatar_color
      ) t
  );
end;
$$;

grant execute on function get_moderation_queue(text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 14. RPC — get_paper_stats_public  (POTW algorithm input)
-- ──────────────────────────────────────────────────────────────────────────
-- Aggregates papers across ALL contexts now (a paper discussed in a group
-- and the feed counts as one paper). Filters hidden posts and the bot's
-- own admin posts. Min engagement: ≥2 distinct posts OR ≥1 comment.

create or replace function get_paper_stats_public()
returns table (
  paper_doi      text,
  paper_title    text,
  paper_journal  text,
  paper_year     text,
  discussions    int,
  participants   int,
  total_comments int
)
language sql
stable
security definer
set search_path = public
as $$
  with paper_posts as (
    select p.id, p.paper_doi, p.paper_title, p.paper_journal, p.paper_year, p.user_id
      from posts p
     where p.paper_doi is not null and p.paper_doi <> ''
       and p.paper_title is not null and p.paper_title <> ''
       and not p.hidden
       and not p.is_admin_post
  )
  select
    pp.paper_doi,
    max(pp.paper_title)                                         as paper_title,
    max(pp.paper_journal)                                       as paper_journal,
    max(pp.paper_year)                                          as paper_year,
    count(distinct pp.id)::int                                  as discussions,
    count(distinct pp.user_id)::int                             as participants,
    coalesce(sum((select count(*) from comments c where c.post_id = pp.id))::int, 0) as total_comments
    from paper_posts pp
   group by pp.paper_doi
  having count(distinct pp.id) >= 2
      or coalesce(sum((select count(*) from comments c where c.post_id = pp.id)), 0) >= 1
   order by discussions desc, total_comments desc;
$$;

grant execute on function get_paper_stats_public() to anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 15. RPC — get_hot_papers  (admin variant; lower threshold than POTW)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_hot_papers(p_limit int default 20)
returns table (
  paper_doi      text,
  paper_title    text,
  paper_journal  text,
  paper_year     text,
  discussions    int,
  participants   int,
  total_comments int
)
language sql
stable
security definer
set search_path = public
as $$
  with paper_posts as (
    select p.id, p.paper_doi, p.paper_title, p.paper_journal, p.paper_year, p.user_id
      from posts p
     where p.paper_doi is not null and p.paper_doi <> ''
       and p.paper_title is not null and p.paper_title <> ''
       and not p.hidden
       and not p.is_admin_post
  )
  select
    pp.paper_doi,
    max(pp.paper_title)                                         as paper_title,
    max(pp.paper_journal)                                       as paper_journal,
    max(pp.paper_year)                                          as paper_year,
    count(distinct pp.id)::int                                  as discussions,
    count(distinct pp.user_id)::int                             as participants,
    coalesce(sum((select count(*) from comments c where c.post_id = pp.id))::int, 0) as total_comments
    from paper_posts pp
   group by pp.paper_doi
  having count(distinct pp.user_id) >= 2
   order by discussions desc, total_comments desc
   limit p_limit;
$$;

grant execute on function get_hot_papers(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 16. RPC — get_content_performance (text vs paper vs deep dive, all contexts)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_content_performance(p_days int default 30)
returns table (
  category        text,
  posts           int,
  avg_likes       numeric,
  avg_comments    numeric,
  pct_3plus_chat  numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with windowed as (
    select
      p.id,
      case
        when p.is_deep_dive             then 'deep_dive'
        when p.paper_doi is not null
         and p.paper_doi <> ''          then 'paper'
        else                                 'text'
      end as category
    from posts p
    where not p.hidden
      and not p.is_admin_post
      and p.created_at >= now() - (p_days || ' days')::interval
  )
  select
    w.category,
    count(*)::int                                                                                        as posts,
    round(avg((select count(*) from likes    l where l.post_id = w.id))::numeric, 1)                     as avg_likes,
    round(avg((select count(*) from comments c where c.post_id = w.id))::numeric, 1)                     as avg_comments,
    round(
      100.0 * avg(case
        when (select count(distinct c.user_id) from comments c where c.post_id = w.id) >= 3 then 1.0
        else 0.0 end)::numeric,
      1
    ) as pct_3plus_chat
  from windowed w
  group by w.category
  order by posts desc;
end;
$$;

grant execute on function get_content_performance(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 17. RPC — get_power_posters (across ALL contexts)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_power_posters(p_days int default 30, p_limit int default 20)
returns table (
  user_id      uuid,
  name         text,
  avatar_color text,
  avatar_url   text,
  work_mode    text,
  lumens       int,
  post_count   int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    pr.id,
    pr.name,
    pr.avatar_color,
    pr.avatar_url,
    pr.work_mode,
    pr.lumens_current_period,
    count(p.id)::int as post_count
  from profiles pr
  join posts p on p.user_id = pr.id
  where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid  -- bot
    and not p.is_admin_post
    and not p.hidden
    and p.created_at >= now() - (p_days || ' days')::interval
  group by pr.id, pr.name, pr.avatar_color, pr.avatar_url, pr.work_mode, pr.lumens_current_period
  order by post_count desc
  limit p_limit;
end;
$$;

grant execute on function get_power_posters(int, int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 18. RPC — get_power_commenters
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_power_commenters(p_days int default 30, p_limit int default 20)
returns table (
  user_id       uuid,
  name          text,
  avatar_color  text,
  avatar_url    text,
  work_mode     text,
  lumens        int,
  comment_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    pr.id,
    pr.name,
    pr.avatar_color,
    pr.avatar_url,
    pr.work_mode,
    pr.lumens_current_period,
    count(c.id)::int
  from profiles pr
  join comments c on c.user_id = pr.id
  where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid
    and not c.hidden
    and length(coalesce(c.content, '')) > 50
    and c.created_at >= now() - (p_days || ' days')::interval
  group by pr.id, pr.name, pr.avatar_color, pr.avatar_url, pr.work_mode, pr.lumens_current_period
  order by count(c.id) desc
  limit p_limit;
end;
$$;

grant execute on function get_power_commenters(int, int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 19. RPC — get_at_risk_users (post_count from unified posts)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_at_risk_users(p_limit int default 30)
returns table (
  user_id     uuid,
  name        text,
  avatar_color text,
  avatar_url  text,
  work_mode   text,
  lumens      int,
  days_silent int,
  total_posts int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with last_action as (
    select user_id, max(at) as last_at from (
      select user_id, created_at as at from posts    where not is_admin_post
      union all
      select user_id, created_at as at from comments where user_id is not null
      union all
      select user_id, created_at as at from likes
    ) x
    group by user_id
  ),
  total_actions as (
    select user_id, count(*) as cnt from (
      select user_id, 1 as one from posts    where not is_admin_post
      union all
      select user_id, 1        from comments where user_id is not null
      union all
      select user_id, 1        from likes
    ) y
    group by user_id
  )
  select
    pr.id, pr.name, pr.avatar_color, pr.avatar_url, pr.work_mode,
    pr.lumens_current_period,
    extract(day from now() - la.last_at)::int as days_silent,
    (select count(*)::int from posts p
       where p.user_id = pr.id and not p.is_admin_post)
  from profiles pr
  join last_action la    on la.user_id = pr.id
  join total_actions ta  on ta.user_id = pr.id
  where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid
    and ta.cnt >= 3
    and la.last_at < now() - interval '7 days'
    and pr.created_at < now() - interval '14 days'
    and pr.deletion_scheduled_at is null
  order by days_silent desc
  limit p_limit;
end;
$$;

grant execute on function get_at_risk_users(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 20. RPC — get_quiet_champions (followers >= 3 but posts < 3)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_quiet_champions(p_limit int default 20)
returns table (
  user_id        uuid,
  name           text,
  avatar_color   text,
  avatar_url     text,
  work_mode      text,
  follower_count int,
  post_count     int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select
    pr.id, pr.name, pr.avatar_color, pr.avatar_url, pr.work_mode,
    (select count(*)::int from follows f
      where f.target_id = pr.id and f.target_type = 'user') as follower_count,
    (select count(*)::int from posts p
      where p.user_id = pr.id and not p.is_admin_post)      as post_count
  from profiles pr
  where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid
    and pr.deletion_scheduled_at is null
    and (select count(*) from follows f
          where f.target_id = pr.id and f.target_type = 'user') >= 3
    and (select count(*) from posts p
          where p.user_id = pr.id and not p.is_admin_post)  < 3
  order by follower_count desc
  limit p_limit;
end;
$$;

grant execute on function get_quiet_champions(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 21. RPC — get_signup_method_breakdown
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_signup_method_breakdown(p_days int default 30)
returns table (
  method        text,
  user_count    int,
  avg_posts     numeric,
  avg_comments  numeric,
  avg_lumens    numeric,
  pct_activated numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with cohort as (
    select pr.id, pr.lumens_lifetime,
      case when pr.orcid_verified then 'orcid' else 'invite' end as method,
      (select count(*) from posts    p where p.user_id = pr.id and not p.is_admin_post) as posts,
      (select count(*) from comments c where c.user_id = pr.id)                          as comments
    from profiles pr
    where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid
      and pr.created_at >= now() - (p_days || ' days')::interval
      and pr.deletion_scheduled_at is null
  )
  select
    c.method,
    count(*)::int                                          as user_count,
    round(avg(c.posts)::numeric,    1)                     as avg_posts,
    round(avg(c.comments)::numeric, 1)                     as avg_comments,
    round(avg(c.lumens_lifetime)::numeric, 1)              as avg_lumens,
    round(100.0 * avg(case when c.posts > 0 or c.comments > 0
                           then 1.0 else 0.0 end)::numeric, 1) as pct_activated
  from cohort c
  group by c.method;
end;
$$;

grant execute on function get_signup_method_breakdown(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 22. RPC — get_work_mode_stats
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_work_mode_stats(p_days int default 30)
returns table (
  work_mode      text,
  user_count     int,
  avg_posts      numeric,
  avg_comments   numeric,
  avg_lumens     numeric,
  avg_groups     numeric,
  pct_pub        numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with users as (
    select pr.id, pr.work_mode, pr.lumens_lifetime,
      (select count(*) from posts    p where p.user_id = pr.id and not p.is_admin_post
         and p.created_at >= now() - (p_days || ' days')::interval) as posts,
      (select count(*) from comments c where c.user_id = pr.id
         and c.created_at >= now() - (p_days || ' days')::interval) as comments,
      (select count(*) from group_members gm where gm.user_id = pr.id)            as groups,
      (select count(*) > 0 from publications pub where pub.user_id = pr.id)       as has_pub
    from profiles pr
    where pr.id <> 'af56ef6f-635a-438b-8c8a-41cc84751bca'::uuid
      and pr.deletion_scheduled_at is null
      and pr.work_mode is not null and pr.work_mode <> ''
  )
  select
    u.work_mode,
    count(*)::int,
    round(avg(u.posts)::numeric,    1),
    round(avg(u.comments)::numeric, 1),
    round(avg(u.lumens_lifetime)::numeric, 1),
    round(avg(u.groups)::numeric,   1),
    round(100.0 * avg(case when u.has_pub then 1.0 else 0.0 end)::numeric, 1)
  from users u
  group by u.work_mode
  order by count(*) desc;
end;
$$;

grant execute on function get_work_mode_stats(int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 23. RPC — send_admin_post (rewritten for unified posts)
-- ──────────────────────────────────────────────────────────────────────────
-- Modes:
--   'broadcast' — single feed post visible to everyone (no target_user_id)
--   'targeted'  — one feed post per p_target_user_ids[i] with target_user_id set
--   'group'     — one group post in p_group_id; visibility derived from group.is_public

create or replace function send_admin_post(
  p_mode             text,
  p_content          text,
  p_bot_user_id      uuid,
  p_post_type        text default 'text',
  p_paper_doi        text default null,
  p_paper_title      text default null,
  p_paper_journal    text default null,
  p_paper_year       text default null,
  p_paper_authors    text default null,
  p_paper_abstract   text default null,
  p_paper_citation   text default null,
  p_tags             text[] default '{}',
  p_group_id         uuid   default null,
  p_target_user_ids  uuid[] default null,
  p_is_deep_dive     boolean default false,
  p_deep_dive_title  text   default null,
  p_deep_dive_cover_url text default null,
  p_image_url        text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin_caller boolean;
  target_id       uuid;
  group_public    boolean;
  inserted_count  int := 0;
  target_post_id  uuid;
begin
  is_admin_caller := coalesce((select is_admin from profiles where profiles.id = auth.uid()), false);
  if not is_admin_caller then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_mode = 'broadcast' then
    insert into posts (
      user_id, content, post_type,
      paper_doi, paper_title, paper_journal, paper_year, paper_authors,
      paper_abstract, paper_citation, tags,
      is_deep_dive, deep_dive_title, deep_dive_cover_url, image_url,
      is_admin_post,
      context_kind, context_id, visibility
    ) values (
      p_bot_user_id, p_content, p_post_type,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_year, p_paper_authors,
      p_paper_abstract, p_paper_citation, p_tags,
      p_is_deep_dive, p_deep_dive_title, p_deep_dive_cover_url, p_image_url,
      true,
      'feed', null, 'public'
    );
    inserted_count := 1;

  elsif p_mode = 'targeted' then
    if p_target_user_ids is null or array_length(p_target_user_ids, 1) is null then
      raise exception 'targeted mode requires p_target_user_ids';
    end if;
    foreach target_id in array p_target_user_ids
    loop
      insert into posts (
        user_id, content, post_type,
        paper_doi, paper_title, paper_journal, paper_year, paper_authors,
        paper_abstract, paper_citation, tags,
        is_deep_dive, deep_dive_title, deep_dive_cover_url, image_url,
        is_admin_post, target_user_id,
        context_kind, context_id, visibility
      ) values (
        p_bot_user_id, p_content, p_post_type,
        p_paper_doi, p_paper_title, p_paper_journal, p_paper_year, p_paper_authors,
        p_paper_abstract, p_paper_citation, p_tags,
        p_is_deep_dive, p_deep_dive_title, p_deep_dive_cover_url, p_image_url,
        true, target_id,
        'feed', null, 'private'
      ) returning id into target_post_id;

      insert into notifications (user_id, notif_type, actor_id, target_id, meta)
      values (target_id, 'admin_post', p_bot_user_id, target_post_id,
              jsonb_build_object('post_id', target_post_id));

      inserted_count := inserted_count + 1;
    end loop;

  elsif p_mode = 'group' then
    if p_group_id is null then
      raise exception 'group mode requires p_group_id';
    end if;
    select is_public into group_public from groups where id = p_group_id;
    insert into posts (
      user_id, content, post_type,
      paper_doi, paper_title, paper_journal, paper_year, paper_authors,
      paper_abstract, paper_citation, tags,
      is_deep_dive, deep_dive_title, deep_dive_cover_url, image_url,
      is_admin_post,
      context_kind, context_id, visibility
    ) values (
      p_bot_user_id, p_content, p_post_type,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_year, p_paper_authors,
      p_paper_abstract, p_paper_citation, p_tags,
      p_is_deep_dive, p_deep_dive_title, p_deep_dive_cover_url, p_image_url,
      true,
      'group', p_group_id, case when coalesce(group_public, false) then 'public' else 'members' end
    );
    inserted_count := 1;

  else
    raise exception 'unknown mode %', p_mode;
  end if;

  return jsonb_build_object('inserted', inserted_count);
end;
$$;

grant execute on function send_admin_post(text, text, uuid, text, text, text, text, text, text, text, text, text[], uuid, uuid[], boolean, text, text, text) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 24. RPC — get_post_likers (NEW)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_post_likers(
  p_post_id uuid,
  p_limit   int default 50,
  p_offset  int default 0
)
returns table (
  user_id      uuid,
  name         text,
  slug         text,
  avatar_color text,
  avatar_url   text,
  work_mode    text,
  is_following boolean,
  liked_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  -- Visibility check via the SECURITY INVOKER helper. If the caller can't
  -- SELECT the post via RLS, return nothing.
  if not exists (
    select 1
      from posts p
     where p.id = p_post_id
       and (
         -- inline the four-policy logic so this RPC works as SECURITY DEFINER
         p.user_id = caller
         or (p.context_kind = 'feed' and not p.hidden
             and (p.target_user_id is null or p.target_user_id = caller))
         or (p.context_kind = 'group' and not p.hidden
             and (
               p.context_id in (select group_id from group_members where user_id = caller)
               or p.context_id in (select id from groups where is_public = true)
             ))
         or (p.context_kind = 'project' and not p.hidden
             and (
               p.context_id in (select project_id from project_members where user_id = caller)
               or p.context_id in (
                 select pj.id from projects pj
                   join group_members gm on gm.group_id = pj.group_id
                  where gm.user_id = caller
               )
             ))
         or coalesce((select is_admin from profiles where profiles.id = caller), false)
       )
  ) then
    return;
  end if;

  return query
  select
    pr.id,
    pr.name,
    pr.profile_slug,
    pr.avatar_color,
    pr.avatar_url,
    pr.work_mode,
    exists(
      select 1 from follows f
       where f.follower_id = caller
         and f.target_id   = pr.id
         and f.target_type = 'user'
    ),
    l.created_at
  from likes l
  join profiles pr on pr.id = l.user_id and pr.deletion_scheduled_at is null
  where l.post_id = p_post_id
  order by l.created_at desc
  limit  p_limit
  offset p_offset;
end;
$$;

grant execute on function get_post_likers(uuid, int, int) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 25. RPC — get_at_risk_alerts (rewrite: query unified posts, not group_posts)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function get_at_risk_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ghost_users       int;
  v_quiet_groups      int;
  v_pending_templates int;
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- Ghost users: signed up 2–5 days ago, zero actions
  select count(*)::int into v_ghost_users
    from profiles p
   where p.created_at >= now() - interval '5 days'
     and p.created_at <  now() - interval '2 days'
     and (p.is_admin = false or p.is_admin is null)
     and not exists (select 1 from posts         where user_id     = p.id)
     and not exists (select 1 from comments      where user_id     = p.id)
     and not exists (select 1 from likes         where user_id     = p.id)
     and not exists (select 1 from follows       where follower_id = p.id)
     and not exists (select 1 from group_members where user_id     = p.id);

  -- Quiet groups: ≥2 members, no posts in last 7 days
  select count(*)::int into v_quiet_groups
    from groups g
   where (
     select count(*) from group_members
      where group_id = g.id and role in ('admin','member')
   ) >= 2
     and not exists (
       select 1 from posts
        where context_kind = 'group'
          and context_id   = g.id
          and created_at  >= now() - interval '7 days'
     );

  select count(*)::int into v_pending_templates
    from community_templates where status = 'pending';

  return jsonb_build_object(
    'ghost_users',       v_ghost_users,
    'quiet_groups',      v_quiet_groups,
    'pending_templates', v_pending_templates
  );
end;
$$;

grant execute on function get_at_risk_alerts() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 26. Storage RPCs (drop group_post branch — all post uploads are 'post' now)
-- ──────────────────────────────────────────────────────────────────────────

create or replace function delete_user_file(p_id uuid)
returns table (bucket text, path text)
language plpgsql security definer
set search_path = public as $$
declare
  v_row              user_storage_files%rowtype;
  v_url_pattern      text;
  v_post_image_url   text;
  v_post_cover_url   text;
begin
  select * into v_row from user_storage_files where id = p_id;
  if not found then
    raise exception 'file not found';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'not allowed';
  end if;

  if v_row.source_kind in ('avatar','group_avatar','group_cover','profile_cover') then
    raise exception 'avatar / cover images must be replaced, not deleted';
  end if;

  if v_row.source_kind = 'post' and v_row.source_id is not null then
    v_url_pattern := '%' || v_row.path || '%';
    select image_url, deep_dive_cover_url
      into v_post_image_url, v_post_cover_url
      from posts where id = v_row.source_id and user_id = auth.uid();

    if v_post_image_url is not null and v_post_image_url like v_url_pattern then
      update posts
         set file_deleted_at = now(),
             image_url       = null,
             file_name       = null,
             file_type       = null
       where id = v_row.source_id and user_id = auth.uid();
    elsif v_post_cover_url is not null and v_post_cover_url like v_url_pattern then
      update posts
         set deep_dive_cover_url      = '',
             deep_dive_cover_position = '50% 50%'
       where id = v_row.source_id and user_id = auth.uid();
    end if;

  elsif v_row.source_kind = 'library' and v_row.source_id is not null then
    delete from library_items where id = v_row.source_id and added_by = auth.uid();
  end if;

  delete from user_storage_files where id = p_id;
  bucket := v_row.bucket;
  path   := v_row.path;
  return next;
end;
$$;

grant execute on function delete_user_file(uuid) to authenticated;

create or replace function get_my_storage_usage()
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_total bigint;
  v_files int;
  v_buckets jsonb;
  v_rows  jsonb;
begin
  select coalesce(sum(size_bytes),0)::bigint, count(*)::int
    into v_total, v_files
    from user_storage_files where user_id = auth.uid();

  select coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb)
    into v_rows
    from (
      select
        usf.id,
        usf.bucket,
        usf.path,
        usf.size_bytes,
        usf.mime_type,
        usf.file_name,
        usf.source_kind,
        usf.source_id,
        usf.created_at,
        case usf.source_kind
          when 'post' then (
            select coalesce(
              nullif(p.paper_title, ''),
              nullif(p.deep_dive_title, ''),
              nullif(substring(regexp_replace(p.content, '<[^>]+>', '', 'g') from 1 for 80), ''),
              '(post)'
            ) from posts p where p.id = usf.source_id
          )
          when 'library'        then (
            select coalesce(nullif(li.title, ''), li.pdf_name, '(library file)')
              from library_items li where li.id = usf.source_id
          )
          when 'avatar'         then 'Profile photo'
          when 'profile_cover'  then 'Profile cover'
          when 'group_avatar'   then (select 'Group: ' || g.name from groups g where g.id = usf.source_id)
          when 'group_cover'    then (select 'Cover: ' || g.name from groups g where g.id = usf.source_id)
          else null
        end as context_label,
        case usf.source_kind
          when 'post' then (
            -- For group/project posts, surface a parent-group slug so the UI
            -- can deep-link to /g/:slug. Direct group context first; for
            -- project posts that belong to a group-owned project, the parent
            -- group's slug.
            select coalesce(g.slug, g2.slug)
              from posts p
              left join groups   g  on g.id  = p.context_id and p.context_kind = 'group'
              left join projects pj on pj.id = p.context_id and p.context_kind = 'project'
              left join groups   g2 on g2.id = pj.group_id
             where p.id = usf.source_id
          )
          when 'group_avatar' then (select g.slug from groups g where g.id = usf.source_id)
          when 'group_cover'  then (select g.slug from groups g where g.id = usf.source_id)
          else null
        end as context_group_slug,
        case usf.source_kind
          when 'post' then (select p.file_deleted_at is not null from posts p where p.id = usf.source_id)
          else false
        end as already_deleted
      from user_storage_files usf
      where usf.user_id = auth.uid()
      order by usf.created_at desc
    ) f;

  select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb)
    into v_buckets
    from (
      select bucket, sum(size_bytes)::bigint as bytes, count(*)::int as files
        from user_storage_files
       where user_id = auth.uid()
       group by bucket
    ) b;

  return jsonb_build_object(
    'total_bytes', v_total,
    'total_files', v_files,
    'buckets',     v_buckets,
    'files',       v_rows
  );
end;
$$;

grant execute on function get_my_storage_usage() to authenticated;

create or replace function get_admin_user_storage_files(p_user_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_files jsonb;
begin
  if not coalesce((select is_admin from profiles where profiles.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(f) order by f.created_at desc), '[]'::jsonb)
    into v_files
    from (
      select
        usf.id, usf.bucket, usf.path, usf.size_bytes, usf.mime_type,
        usf.file_name, usf.source_kind, usf.source_id, usf.created_at,
        case usf.source_kind
          when 'post' then (
            select coalesce(
              nullif(p.paper_title, ''),
              nullif(p.deep_dive_title, ''),
              nullif(substring(regexp_replace(p.content, '<[^>]+>', '', 'g') from 1 for 80), ''),
              '(post)'
            ) from posts p where p.id = usf.source_id
          )
          when 'library'       then (
            select coalesce(nullif(li.title, ''), li.pdf_name, '(library file)')
              from library_items li where li.id = usf.source_id
          )
          when 'avatar'        then 'Profile photo'
          when 'profile_cover' then 'Profile cover'
          when 'group_avatar'  then (select 'Group: ' || g.name from groups g where g.id = usf.source_id)
          when 'group_cover'   then (select 'Cover: ' || g.name from groups g where g.id = usf.source_id)
          else null
        end as context_label,
        case usf.source_kind
          when 'post' then (
            select g.slug
              from posts p
              left join groups g on g.id = p.context_id and p.context_kind = 'group'
              left join projects pj on pj.id = p.context_id and p.context_kind = 'project'
              left join groups g2 on g2.id = pj.group_id
             where p.id = usf.source_id
          )
          when 'group_avatar' then (select g.slug from groups g where g.id = usf.source_id)
          when 'group_cover'  then (select g.slug from groups g where g.id = usf.source_id)
          else null
        end as context_group_slug,
        case usf.source_kind
          when 'post' then (select p.file_deleted_at is not null from posts p where p.id = usf.source_id)
          else false
        end as already_deleted
      from user_storage_files usf
      where usf.user_id = p_user_id
      order by usf.created_at desc
    ) f;

  return v_files;
end;
$$;

grant execute on function get_admin_user_storage_files(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- 27. Realtime publications (likes/comments need the same as profiles did
--     for Phase 8). Idempotent.
-- ──────────────────────────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table posts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table likes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table comments;
  exception when duplicate_object then null;
  end;
end $$;

commit;
