-- Phase 12.4: tombstone comments instead of cascading on author delete
--
-- comments / group_post_comments / project_post_comments all had
-- user_id ON DELETE CASCADE, so when a user was purged at the end of the
-- soft-delete grace, every comment they made on someone else's post was
-- deleted too — leaving "reply to a deleted comment" gaps in threads.
--
-- Switch all three to SET NULL. The comment row + content survive; the
-- frontend renders "Deleted user" + a greyed avatar in place of the
-- author. Right-to-be-forgotten on the words themselves can be handled
-- separately by a content-rewrite step in purge_deleted_accounts() if
-- needed later — keeping the words is consistent with the messages
-- behaviour we shipped in 12.2.
--
-- Idempotent: drop NOT NULL is a no-op when already nullable; DROP
-- CONSTRAINT IF EXISTS + recreate handles re-runs.

-- ─── comments ──────────────────────────────────────────────────────────────
alter table comments alter column user_id drop not null;
alter table comments drop constraint if exists comments_user_id_fkey;
alter table comments
  add constraint comments_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;

-- ─── group_post_comments ───────────────────────────────────────────────────
alter table group_post_comments alter column user_id drop not null;
alter table group_post_comments drop constraint if exists group_post_comments_user_id_fkey;
alter table group_post_comments
  add constraint group_post_comments_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;

-- ─── project_post_comments ─────────────────────────────────────────────────
alter table project_post_comments alter column user_id drop not null;
alter table project_post_comments drop constraint if exists project_post_comments_user_id_fkey;
alter table project_post_comments
  add constraint project_post_comments_user_id_fkey
    foreign key (user_id) references profiles(id) on delete set null;
