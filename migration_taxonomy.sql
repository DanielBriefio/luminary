-- Add taxonomy fields to posts
alter table posts
  add column if not exists tier1 text    default '',
  add column if not exists tier2 text[]  default '{}';

-- Add professional identity to profiles
alter table profiles
  add column if not exists identity_tier1 text default '',
  add column if not exists identity_tier2 text default '';

-- Refresh posts_with_meta view to include new fields
drop view if exists posts_with_meta;
create view posts_with_meta as
select
  p.*,
  pr.name               as author_name,
  pr.title              as author_title,
  pr.institution        as author_institution,
  pr.avatar_color       as author_avatar,
  pr.avatar_url         as author_avatar_url,
  pr.identity_tier1     as author_identity_tier1,
  pr.identity_tier2     as author_identity_tier2,
  (select count(*) from likes    l where l.post_id = p.id) as like_count,
  (select count(*) from comments c where c.post_id = p.id) as comment_count,
  (select count(*) from reposts  r where r.post_id = p.id) as repost_count
from posts p
join profiles pr on pr.id = p.user_id;

grant select on posts_with_meta to anon, authenticated;

-- Indexes for taxonomy filtering
create index if not exists idx_posts_tier1 on posts(tier1);
create index if not exists idx_posts_tier2 on posts using gin(tier2);
