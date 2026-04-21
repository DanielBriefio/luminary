-- Pin support on projects
alter table projects
  add column if not exists is_pinned boolean default false;

-- last_read_at per member per project (for unread badge)
alter table project_members
  add column if not exists last_read_at timestamptz default now();

-- is_starter flag on project posts (set when created from template)
alter table project_posts
  add column if not exists is_starter boolean default false;

-- Community templates submitted by users
create table if not exists community_templates (
  id              uuid primary key default gen_random_uuid(),
  submitted_by    uuid references profiles(id) on delete cascade not null,
  status          text default 'pending',
  -- 'pending' | 'approved' | 'rejected'
  -- Approve via SQL: update community_templates set status='approved' where id='...';

  -- Template metadata
  name            text not null,
  description     text default '',
  used_by         text default '',
  filter_category text default 'collaboration',
  -- 'research' | 'clinical' | 'industry' | 'collaboration'
  icon            text default '✏️',
  color           text default '#6c63ff',

  -- Folder structure (JSON array of {name, sort_order})
  folders         jsonb default '[]',

  -- Starter posts (JSON array of {folder, is_sticky, content})
  starter_posts   jsonb default '[]',

  -- Preview posts (JSON array of {author, folder, content, likes, comments})
  preview_posts   jsonb default '[]',

  rating_count    integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table community_templates enable row level security;

-- Anyone can see approved templates; submitter sees their own pending ones
create policy "ct_select" on community_templates for select using (
  status = 'approved' or
  auth.uid() = submitted_by
);
create policy "ct_insert" on community_templates for insert
  with check (auth.uid() = submitted_by);
create policy "ct_update" on community_templates for update
  using (auth.uid() = submitted_by and status = 'pending');

-- Template ratings
create table if not exists community_template_ratings (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid references community_templates(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(template_id, user_id)
);

alter table community_template_ratings enable row level security;
create policy "ctr_select" on community_template_ratings for select using (true);
create policy "ctr_insert" on community_template_ratings for insert
  with check (auth.uid() = user_id);
create policy "ctr_delete" on community_template_ratings for delete
  using (auth.uid() = user_id);

create index if not exists idx_ct_status
  on community_templates(status, rating_count desc);
create index if not exists idx_ctr_template
  on community_template_ratings(template_id);
