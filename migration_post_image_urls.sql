-- Multi-image posts: store an ordered array of image URLs alongside the
-- legacy single `image_url`. Existing single-image posts keep working
-- because PostCard / PublicPostPage prefer `image_urls` only when it's
-- non-empty.
--
-- View MUST be recreated — `select p.*` freezes the column list at
-- creation time, so adding `image_urls` to posts does not propagate
-- otherwise. Same gotcha as migration_post_pinning.sql.

alter table posts
  add column if not exists image_urls text[] not null default '{}'::text[];

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
