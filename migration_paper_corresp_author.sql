-- Surface the corresponding author's email + name on paper posts and
-- library items. Source: EuropePMC core search results — emails live in
-- `authorList.author[].affiliation` strings, usually tagged
-- "Electronic address: foo@bar.edu" for the corresponding author.
-- See extractCorrespondingAuthorFromEpmc() in src/lib/utils.js.
--
-- No backfill: existing rows simply have NULL email/name and PaperPreview
-- skips the line. New posts going forward pick it up at compose time.

begin;

-- 1. posts: paper_corresp_email + paper_corresp_name
alter table posts
  add column if not exists paper_corresp_email text,
  add column if not exists paper_corresp_name  text;

-- 2. library_items: corresp_email + corresp_name (bare names — that table
--    doesn't use the paper_ prefix; everything in it is paper metadata).
alter table library_items
  add column if not exists corresp_email text,
  add column if not exists corresp_name  text;

-- 3. Recreate posts_with_meta so the new posts.* columns propagate.
--    Postgres freezes a view's column list at create time — adding a column
--    to `posts` does NOT show up via `select p.*` unless we drop + recreate.
--    Body kept identical to migration_post_aggregates_denorm.sql.
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

  -- Per-viewer flags (still subqueries — depend on auth.uid()).
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
