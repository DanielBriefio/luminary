alter table posts
  add column if not exists is_deep_dive boolean default false;

-- Track which activation milestones a user has completed
alter table profiles
  add column if not exists activation_milestones jsonb default '{}';
