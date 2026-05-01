-- Phase 15.1: restore folder_id on unified posts
--
-- The Phase 15 unification dropped per-folder scoping for project posts,
-- so every post now appears in every folder of a project's sidebar.
-- That broke the conference / journal-club / paper-draft templates,
-- which all rely on the folder dimension to organise content.
--
-- Add folder_id back as a nullable FK to project_folders. ON DELETE
-- SET NULL — deleting a folder unscopes the posts (they fall back to
-- "All posts" view), it doesn't lose them.
--
-- posts_with_meta uses `select p.*` so the new column flows through
-- the view automatically; no DROP+CREATE needed.

alter table posts
  add column if not exists folder_id uuid references project_folders(id) on delete set null;

create index if not exists posts_folder_idx on posts (folder_id) where folder_id is not null;
