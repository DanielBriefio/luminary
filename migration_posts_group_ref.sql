-- Store source group on posts that were reposted from a group to the public feed
alter table posts
  add column if not exists group_id   uuid references groups(id) on delete set null,
  add column if not exists group_name text default '';
