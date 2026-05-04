-- Pre-launch perf cleanup for `posts_with_meta`.
--
-- The view used to compute six correlated subqueries per row
-- (like/comment/repost/user_liked/user_reposted/report counts), and
-- PostCard.jsx then issued two more queries per post in the feed
-- (top comment + commenter avatars). For a 40-row feed that was 240
-- subqueries server-side + 80 client round-trips on every load.
--
-- This migration:
--   1. Denormalises like/comment/repost/report counts onto `posts`,
--      maintained by triggers on the source tables. The view reads
--      them directly; user_liked/user_reposted stay as cheap subqueries
--      because they depend on auth.uid().
--   2. Adds top_comment + commenter_avatars JSONB columns to
--      `posts_with_meta` so PostCard never has to round-trip for that
--      data. Subqueries are bounded (LIMIT 1 / LIMIT 3) and indexed.
--   3. Adds a partial index on comments(post_id) where not hidden so
--      the comment-derived subqueries (and any other "visible comments
--      for post X" lookups) hit an index that exactly matches the
--      predicate.
--
-- Apply order matters: backfill counts BEFORE creating triggers, or
-- the backfill races concurrent writes. Runs in a single transaction.

begin;

-- 1. Columns ───────────────────────────────────────────────────────────────
alter table posts
  add column if not exists like_count    int not null default 0,
  add column if not exists comment_count int not null default 0,
  add column if not exists repost_count  int not null default 0,
  add column if not exists report_count  int not null default 0;

-- 2. Backfill from current state ──────────────────────────────────────────
update posts p set
  like_count    = coalesce((select count(*) from likes    l   where l.post_id = p.id), 0),
  comment_count = coalesce((select count(*) from comments c   where c.post_id = p.id and not c.hidden), 0),
  repost_count  = coalesce((select count(*) from reposts  r   where r.post_id = p.id), 0),
  report_count  = coalesce((select count(*) from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending'), 0)
where true;

-- 3. Partial index on visible comments (also speeds the view's subqueries)
create index if not exists comments_post_visible_idx
  on comments (post_id, created_at desc)
  where not hidden;

-- 4. Trigger functions ────────────────────────────────────────────────────

-- Likes: every row counts.
create or replace function _bump_post_like_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

-- Reposts: every row counts.
create or replace function _bump_post_repost_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update posts set repost_count = repost_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update posts set repost_count = greatest(0, repost_count - 1) where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

-- Comments: only non-hidden rows count. UPDATE of `hidden` flips the count.
create or replace function _bump_post_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not coalesce(new.hidden, false) then
      update posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if not coalesce(old.hidden, false) then
      update posts set comment_count = greatest(0, comment_count - 1) where id = old.post_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.hidden, false) <> coalesce(new.hidden, false) then
      if coalesce(new.hidden, false) then
        update posts set comment_count = greatest(0, comment_count - 1) where id = new.post_id;
      else
        update posts set comment_count = comment_count + 1 where id = new.post_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end $$;

-- Reports: only `pending` status counts (mod-resolved reports drop out).
create or replace function _bump_post_report_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      update posts set report_count = report_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status = 'pending' then
      update posts set report_count = greatest(0, report_count - 1) where id = old.post_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'pending' and new.status <> 'pending' then
        update posts set report_count = greatest(0, report_count - 1) where id = new.post_id;
      elsif old.status <> 'pending' and new.status = 'pending' then
        update posts set report_count = report_count + 1 where id = new.post_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end $$;

-- 5. Wire triggers ────────────────────────────────────────────────────────
drop trigger if exists likes_bump_count        on likes;
drop trigger if exists reposts_bump_count      on reposts;
drop trigger if exists comments_bump_count     on comments;
drop trigger if exists post_reports_bump_count on post_reports;

create trigger likes_bump_count
  after insert or delete on likes
  for each row execute function _bump_post_like_count();

create trigger reposts_bump_count
  after insert or delete on reposts
  for each row execute function _bump_post_repost_count();

create trigger comments_bump_count
  after insert or delete or update of hidden on comments
  for each row execute function _bump_post_comment_count();

create trigger post_reports_bump_count
  after insert or delete or update of status on post_reports
  for each row execute function _bump_post_report_count();

-- 6. Recreate posts_with_meta ─────────────────────────────────────────────
-- Drop CASCADE because views referencing it would otherwise block. The
-- view body is otherwise identical to migration_post_image_urls.sql,
-- with two changes:
--   a. likes/comments/reposts/reports counts now read from posts.*
--   b. two new columns: top_comment + commenter_avatars (JSONB).

drop view if exists posts_with_meta cascade;

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

  -- Per-viewer flags (still subqueries — depend on auth.uid()). Bounded by
  -- PK lookup on (post_id, user_id) which both tables have.
  (select exists(select 1 from likes   l where l.post_id = p.id and l.user_id = auth.uid())) as user_liked,
  (select exists(select 1 from reposts r where r.post_id = p.id and r.user_id = auth.uid())) as user_reposted,

  -- Latest visible comment (for the inline preview in PostCard).
  (
    select jsonb_build_object(
      'id',         c.id,
      'content',    c.content,
      'created_at', c.created_at,
      'profiles',   jsonb_build_object(
        'name',         cp.name,
        'avatar_url',   cp.avatar_url,
        'avatar_color', cp.avatar_color
      )
    )
    from comments c
    left join profiles cp on cp.id = c.user_id
    where c.post_id = p.id and not c.hidden
    order by c.created_at desc
    limit 1
  ) as top_comment,

  -- First three distinct commenters (for the stacked avatar cluster).
  (
    select jsonb_agg(
      jsonb_build_object(
        'user_id',  x.user_id,
        'profiles', jsonb_build_object(
          'name',         cp.name,
          'avatar_url',   cp.avatar_url,
          'avatar_color', cp.avatar_color
        )
      ) order by x.first_at
    )
    from (
      select c.user_id, min(c.created_at) as first_at
      from comments c
      where c.post_id = p.id and not c.hidden and c.user_id is not null
      group by c.user_id
      order by min(c.created_at) asc
      limit 3
    ) x
    left join profiles cp on cp.id = x.user_id
  ) as commenter_avatars

from posts p
join profiles pr on pr.id = p.user_id and pr.deletion_scheduled_at is null
left join groups   g  on g.id  = p.context_id and p.context_kind = 'group'
left join projects pj on pj.id = p.context_id and p.context_kind = 'project';

grant select on posts_with_meta to anon, authenticated;

commit;
