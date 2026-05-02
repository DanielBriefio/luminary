-- Post pinning: group/project owners can pin posts to the top of their feed.
-- Feed (public) posts are unaffected — there's no feed-level "owner" concept.
--
-- Design notes:
-- * `pinned_at` is timestamptz nullable. NULL = not pinned. Recency of pin
--   gives natural ordering when multiple posts are pinned.
-- * No cap on pinned count — user explicitly opted out.
-- * Pin/unpin happens via SECURITY DEFINER RPCs so we don't have to relax
--   posts UPDATE RLS to allow non-author writes. The RPCs check ownership
--   in their body.
-- * `posts_with_meta` MUST be recreated to expose the new column — the view
--   was created with `select p.*`, which freezes the column list.

-- 1. Column + index ───────────────────────────────────────────────────────

alter table posts
  add column if not exists pinned_at timestamptz;

-- Partial index supports the pinned-first ordering in group/project feeds.
create index if not exists posts_pinned_idx
  on posts (context_id, pinned_at desc)
  where pinned_at is not null and context_kind in ('group', 'project');

-- 2. Refresh posts_with_meta ──────────────────────────────────────────────
-- The view must be dropped + recreated for `select p.*` to pick up
-- pinned_at. View body is identical to the prior version (see
-- migration_phase15_folder_id_view_refresh.sql) — only the implicit `p.*`
-- changes.

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

-- 3. RPCs ─────────────────────────────────────────────────────────────────
-- pin_post / unpin_post: caller must be the context owner.
--   group   → groups.created_by  = auth.uid()
--   project → project_members.role = 'owner' for the project's context_id
-- Feed posts can never be pinned — the function returns false.

create or replace function pin_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_ctx  uuid;
  v_uid  uuid := auth.uid();
  v_ok   boolean;
begin
  if v_uid is null then return false; end if;

  select context_kind, context_id into v_kind, v_ctx
    from posts where id = p_post_id;

  if v_kind is null then return false; end if;
  if v_kind = 'feed' then return false; end if;

  if v_kind = 'group' then
    select exists (select 1 from groups where id = v_ctx and created_by = v_uid)
      into v_ok;
  elsif v_kind = 'project' then
    select exists (
      select 1 from project_members
       where project_id = v_ctx and user_id = v_uid and role = 'owner'
    ) into v_ok;
  end if;

  if not v_ok then return false; end if;

  update posts set pinned_at = now() where id = p_post_id;
  return true;
end;
$$;

create or replace function unpin_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_ctx  uuid;
  v_uid  uuid := auth.uid();
  v_ok   boolean;
begin
  if v_uid is null then return false; end if;

  select context_kind, context_id into v_kind, v_ctx
    from posts where id = p_post_id;

  if v_kind is null then return false; end if;
  if v_kind = 'feed' then return false; end if;

  if v_kind = 'group' then
    select exists (select 1 from groups where id = v_ctx and created_by = v_uid)
      into v_ok;
  elsif v_kind = 'project' then
    select exists (
      select 1 from project_members
       where project_id = v_ctx and user_id = v_uid and role = 'owner'
    ) into v_ok;
  end if;

  if not v_ok then return false; end if;

  update posts set pinned_at = null where id = p_post_id;
  return true;
end;
$$;

grant execute on function pin_post(uuid)   to authenticated;
grant execute on function unpin_post(uuid) to authenticated;
