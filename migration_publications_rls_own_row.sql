-- Defensive: ensure `publications` has own-row RLS policies for every
-- standard verb. The original policies were set via the Supabase
-- dashboard and never committed to a migration file — at least one
-- of them (UPDATE) appears to be missing in production, which makes
-- the row-edit save a silent no-op: PostgREST returns
-- `error: null, data: null` for a 0-row update, the UI shows
-- "saved", and the row reverts on reload. See PubRow.saveEdit for
-- the matching client-side `.select()` + empty-data check.
--
-- Idempotent: drop-and-create. Safe to re-run.

begin;

-- Make sure RLS is on. (If it was already on this is a no-op.)
alter table publications enable row level security;

-- Public read: every visitor can read every row. We rely on
-- `profile_visibility.publications` (jsonb on profiles) to actually
-- gate display — RLS just doesn't need to block reads.
drop policy if exists publications_select_all on publications;
create policy publications_select_all
  on publications for select
  using (true);

-- Own-row insert.
drop policy if exists publications_insert_own on publications;
create policy publications_insert_own
  on publications for insert
  with check (user_id = auth.uid());

-- Own-row update — this is the one that was missing.
drop policy if exists publications_update_own on publications;
create policy publications_update_own
  on publications for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Own-row delete.
drop policy if exists publications_delete_own on publications;
create policy publications_delete_own
  on publications for delete
  using (user_id = auth.uid());

-- Admin override on update/delete for moderation.
drop policy if exists publications_admin_all on publications;
create policy publications_admin_all
  on publications for all
  using ((select is_admin from profiles where id = auth.uid()))
  with check ((select is_admin from profiles where id = auth.uid()));

commit;
