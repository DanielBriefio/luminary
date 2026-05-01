-- Phase 15.1 follow-up: refresh posts_with_meta so folder_id is exposed.
--
-- The view was created in migration_phase15_unified_posts.sql with
-- `select p.*`, which freezes the column list at view-creation time.
-- migration_phase15_folder_id.sql added folder_id to posts, but the
-- existing view doesn't see it — DB writes are correct, but the UI
-- (which reads from posts_with_meta) can't filter by folder_id and
-- doesn't surface it. Result: every project post appears in 'All
-- posts' and individual folders show empty, even though the rows
-- have the right folder_id in the underlying table.
--
-- DROP + CREATE picks up the new column. View body is identical to
-- migration_phase15_unified_posts.sql section 9.

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
