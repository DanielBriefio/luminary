-- Phase 10: 30-day soft-delete with recovery
--
-- Adds:
--   * profiles.deletion_scheduled_at column
--   * delete_own_account RPC rewritten — sets timestamp, inserts a
--     notification (which fires the deletion-scheduled email), does
--     NOT touch auth.users
--   * cancel_account_deletion RPC — clears the timestamp
--   * purge_deleted_accounts function — for pg_cron daily job; hard
--     deletes accounts past 30-day grace, including their storage blobs
--   * posts_with_meta DROP+CREATE filtering deletion-pending authors
--
-- Migration is idempotent: column add IF NOT EXISTS, RPCs CREATE OR REPLACE,
-- view DROP+CREATE.

-- ─── Profile column ─────────────────────────────────────────────────────────

alter table profiles
  add column if not exists deletion_scheduled_at timestamptz;

create index if not exists idx_profiles_deletion_pending
  on profiles(deletion_scheduled_at) where deletion_scheduled_at is not null;

-- ─── delete_own_account (replaces the legacy hard-delete) ───────────────────
-- The legacy version returned void; the new one returns timestamptz so the
-- caller can show the scheduled date. PostgreSQL doesn't allow changing
-- the return type via CREATE OR REPLACE — drop the existing function first.
drop function if exists delete_own_account();

create or replace function delete_own_account()
returns timestamptz
language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_for timestamptz;
begin
  if v_user_id is null then
    raise exception 'auth required';
  end if;

  -- If already scheduled, just return the existing date — idempotent.
  select deletion_scheduled_at into v_scheduled_for
    from profiles where id = v_user_id;

  if v_scheduled_for is null then
    v_scheduled_for := now();
    update profiles
       set deletion_scheduled_at = v_scheduled_for
     where id = v_user_id;

    -- Insert a notification so the existing email webhook
    -- (send-email-notification) picks it up and sends the
    -- "your account is scheduled for deletion" email with the
    -- recovery link in meta.
    insert into notifications (user_id, actor_id, notif_type, target_id, meta)
    values (
      v_user_id, v_user_id,
      'account_deletion_scheduled',
      v_user_id,
      jsonb_build_object(
        'scheduled_for', v_scheduled_for,
        'purge_at',      v_scheduled_for + interval '30 days'
      )
    );
  end if;

  return v_scheduled_for;
end;
$$;

grant execute on function delete_own_account() to authenticated;

-- ─── cancel_account_deletion ────────────────────────────────────────────────

create or replace function cancel_account_deletion()
returns void
language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  update profiles
     set deletion_scheduled_at = null
   where id = auth.uid();
end;
$$;

grant execute on function cancel_account_deletion() to authenticated;

-- ─── purge_deleted_accounts (pg_cron daily) ─────────────────────────────────
-- Deletes accounts whose deletion_scheduled_at is older than 30 days.
-- Removes their storage blobs first, then auth.users (cascade does the rest).

create or replace function purge_deleted_accounts()
returns integer
language plpgsql security definer as $$
declare
  v_user record;
  v_count integer := 0;
  v_blob record;
begin
  for v_user in
    select id from profiles
     where deletion_scheduled_at is not null
       and deletion_scheduled_at < now() - interval '30 days'
  loop
    -- Remove storage blobs we know about.
    for v_blob in
      select bucket, path from user_storage_files where user_id = v_user.id
    loop
      begin
        delete from storage.objects
         where bucket_id = v_blob.bucket and name = v_blob.path;
      exception when others then
        -- swallow; the auth.users delete below + per-bucket policies
        -- will reconcile most stragglers
        null;
      end;
    end loop;

    -- Removing auth.users cascades to profiles and everything that
    -- references profiles via on-delete-cascade FKs.
    delete from auth.users where id = v_user.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Caller must be a superuser/cron — do NOT grant to authenticated.
revoke all on function purge_deleted_accounts() from public;

-- ─── pg_cron schedule (run once after migration; needs pg_cron enabled) ─────
--
-- In the Supabase SQL editor, run:
--
--   create extension if not exists pg_cron;
--   select cron.schedule(
--     'purge_deleted_accounts_daily',
--     '17 3 * * *',                          -- every night at 03:17 UTC
--     $$select purge_deleted_accounts();$$
--   );
--
-- (Pinned this in the migration as a comment instead of executing it
-- so re-running the migration doesn't crash on already-scheduled jobs.)

-- ─── Recreate posts_with_meta to filter deletion-pending authors ────────────
-- Posts from users whose account is scheduled for deletion are hidden
-- from the feed during the 30-day grace window. The post rows still
-- exist (so a recovery restores them); they're just filtered at view
-- level.

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
