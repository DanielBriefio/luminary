-- Phase 12: explicit title + cover image for deep-dive posts
--
-- Adds two posts columns and recreates posts_with_meta so the new
-- columns flow through the view (posts_with_meta uses `select p.*`,
-- which captures the column list at view-creation time — adding new
-- columns to the base table does NOT update the existing view).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP VIEW + CREATE VIEW.

alter table posts
  add column if not exists deep_dive_title     text default '',
  add column if not exists deep_dive_cover_url text default '';

-- Recreate posts_with_meta. Preserve the deletion_scheduled_at filter
-- added in migration_account_soft_delete.sql.
drop view if exists posts_with_meta cascade;
create view posts_with_meta as
select
  p.*,
  pr.name              as author_name,
  pr.title             as author_title,
  pr.institution       as author_institution,
  pr.avatar_color      as author_avatar,
  pr.avatar_url        as author_avatar_url,
  pr.identity_tier1    as author_identity_tier1,
  pr.identity_tier2    as author_identity_tier2,
  pr.work_mode         as author_work_mode,
  pr.profile_slug      as author_slug,
  (select count(*)::int from likes    l   where l.post_id  = p.id)                                  as like_count,
  (select count(*)::int from comments c   where c.post_id  = p.id)                                  as comment_count,
  (select count(*)::int from reposts  r   where r.post_id  = p.id)                                  as repost_count,
  (select exists(select 1 from likes   l  where l.post_id  = p.id and l.user_id = auth.uid()))      as user_liked,
  (select exists(select 1 from reposts r  where r.post_id  = p.id and r.user_id = auth.uid()))      as user_reposted,
  (select count(*)::int from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending')  as report_count
from posts p
join profiles pr on pr.id = p.user_id
where pr.deletion_scheduled_at is null;

grant select on posts_with_meta to anon, authenticated;
