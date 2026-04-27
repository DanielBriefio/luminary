-- Phase 11: Nested bookmark folders + library item rename
--
-- - Adds bookmark_folders table with self-FK parent_id (capped at 2 levels by frontend)
-- - Adds saved_posts.folder_id (nullable, FK bookmark_folders ON DELETE SET NULL):
--     deleting a folder unsets its bookmarks (they become "Unsorted") rather than
--     dropping the bookmark entirely.
-- - Library item rename uses the existing library_items.title column — no schema change.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE POLICY guarded by DROP IF EXISTS.

create table if not exists bookmark_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  parent_id   uuid references bookmark_folders(id) on delete cascade,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_bookmark_folders_user
  on bookmark_folders(user_id);

create index if not exists idx_bookmark_folders_parent
  on bookmark_folders(parent_id) where parent_id is not null;

alter table bookmark_folders enable row level security;

drop policy if exists "bookmark folders own select" on bookmark_folders;
create policy "bookmark folders own select" on bookmark_folders
  for select using (user_id = auth.uid());

drop policy if exists "bookmark folders own insert" on bookmark_folders;
create policy "bookmark folders own insert" on bookmark_folders
  for insert with check (user_id = auth.uid());

drop policy if exists "bookmark folders own update" on bookmark_folders;
create policy "bookmark folders own update" on bookmark_folders
  for update using (user_id = auth.uid());

drop policy if exists "bookmark folders own delete" on bookmark_folders;
create policy "bookmark folders own delete" on bookmark_folders
  for delete using (user_id = auth.uid());

-- ─── saved_posts.folder_id ──────────────────────────────────────────────────
alter table saved_posts
  add column if not exists folder_id uuid
  references bookmark_folders(id) on delete set null;

create index if not exists idx_saved_posts_folder
  on saved_posts(folder_id) where folder_id is not null;
