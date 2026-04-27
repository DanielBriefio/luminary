-- Phase 12.2: account deletion safety
--
-- Two fixes the FK audit surfaced:
--
-- 1) groups.owner_id had ON DELETE CASCADE pointing at profiles. owner_id
--    is a legacy column ("never use" per CLAUDE.md) — created_by is the
--    authoritative owner. The dangling CASCADE meant deleting any user
--    whose id happened to be in owner_id would wipe the entire group out
--    from under its members. Drop the legacy column entirely.
--
-- 2) conversations.user_id_a / user_id_b and messages.sender_id all had
--    CASCADE. When we hard-delete a user at the end of the soft-delete
--    grace, every DM conversation they were in (and every message in
--    those conversations, including the surviving party's own messages)
--    would be deleted. Switch all three to SET NULL so the conversation
--    plus the full message log survives, and MessagesScreen shows a
--    "Deleted user" placeholder.
--
-- Idempotent: DROP COLUMN IF EXISTS, ALTER COLUMN DROP NOT NULL is safe
-- when already nullable, DROP CONSTRAINT IF EXISTS + recreate.

-- ─── (1) legacy groups.owner_id ─────────────────────────────────────────────
alter table groups drop column if exists owner_id;

-- ─── (2) conversations: switch FKs CASCADE → SET NULL ──────────────────────
alter table conversations alter column user_id_a drop not null;
alter table conversations alter column user_id_b drop not null;

alter table conversations drop constraint if exists conversations_user_id_a_fkey;
alter table conversations
  add constraint conversations_user_id_a_fkey
    foreign key (user_id_a) references profiles(id) on delete set null;

alter table conversations drop constraint if exists conversations_user_id_b_fkey;
alter table conversations
  add constraint conversations_user_id_b_fkey
    foreign key (user_id_b) references profiles(id) on delete set null;

-- ─── (3) messages.sender_id: CASCADE → SET NULL ────────────────────────────
alter table messages alter column sender_id drop not null;

alter table messages drop constraint if exists messages_sender_id_fkey;
alter table messages
  add constraint messages_sender_id_fkey
    foreign key (sender_id) references profiles(id) on delete set null;
