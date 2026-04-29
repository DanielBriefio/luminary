-- Phase 14.1: Admin platform wipe + waitlist viewer
--
-- Two unrelated admin tools bundled into one migration.
--
-- 1. admin_wipe_platform()  — destructive reset for fresh testing.
--    Deletes every user except the Luminary Team bot, sweeps tombstoned
--    rows, clears bot-authored content (keeping the bot account + its
--    avatar so it can resume sending welcome / nudge messages), and
--    clears invite codes / waitlist / orcid_pending. Preserves
--    admin_config.
--    Returns { bucket, path } pairs the client must sweep via
--    supabase.storage.remove() — DB cascade does not touch blobs.
--
-- 2. get_waitlist() / get_waitlist_count() — admin viewers used by the
--    new Waitlist section + dashboard count card.

create or replace function admin_wipe_platform()
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  bot_id uuid := 'af56ef6f-635a-438b-8c8a-41cc84751bca';
begin
  -- Admin gate
  if not coalesce(
    (select is_admin from profiles where profiles.id = auth.uid()),
    false
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- 1. Capture storage paths the client needs to sweep.
  --    Everything from non-bot users + bot's non-singleton uploads
  --    (post / group_post / library blobs the bot may have left behind).
  --    Bot's avatar + profile_cover stay so the bot keeps a usable face.
  create temporary table _wipe_paths on commit drop as
    select usf.bucket, usf.path
      from user_storage_files usf
     where usf.user_id <> bot_id
        or usf.source_kind not in ('avatar', 'profile_cover');

  -- 2. Delete every non-bot user. Cascade clears profiles + most content.
  delete from auth.users where id <> bot_id;

  -- 3. Sweep tombstoned rows (FKs that are SET NULL on delete, not CASCADE).
  --    These would otherwise leave "Deleted user" comments / empty DM
  --    threads behind.
  delete from messages;
  delete from conversations;
  delete from comments;
  delete from group_post_comments;
  delete from project_post_comments;

  -- 4. Wipe any remaining bot-authored content. Bot account + profile + avatar
  --    stay; everything else the bot has touched goes.
  delete from posts                 where user_id = bot_id;
  delete from group_posts           where user_id = bot_id;
  delete from project_posts         where user_id = bot_id;
  delete from likes                 where user_id = bot_id;
  delete from group_post_likes      where user_id = bot_id;
  delete from project_post_likes    where user_id = bot_id;
  delete from reposts               where user_id = bot_id;
  delete from saved_posts           where user_id = bot_id;
  delete from follows               where follower_id  = bot_id or target_id    = bot_id;
  delete from group_members         where user_id = bot_id;
  delete from project_members       where user_id = bot_id;
  delete from group_join_requests   where user_id = bot_id;
  delete from group_follows         where user_id = bot_id;
  delete from library_items         where user_id = bot_id;
  delete from library_folders       where user_id = bot_id;
  delete from bookmark_folders      where user_id = bot_id;
  delete from notifications         where user_id = bot_id or actor_id = bot_id;
  delete from post_reports          where reporter_id = bot_id;
  delete from lumen_transactions    where user_id = bot_id;
  delete from user_storage_files
     where user_id = bot_id
       and source_kind not in ('avatar', 'profile_cover');

  -- 5. Anything still standing in groups / projects belongs to the bot or is
  --    orphaned — nuke it so we start with zero.
  delete from groups;
  delete from projects;
  delete from community_templates;

  -- 6. Reset the bot's gamification counters in case it accumulated any.
  update profiles
     set lumens_current_period   = 0,
         lumens_lifetime         = 0,
         current_period_started  = now(),
         previous_period_lumens  = 0
   where id = bot_id;

  -- 7. Clear admin / auth scaffolding so signups and the waitlist start fresh.
  delete from invite_code_uses;
  delete from invite_codes;
  delete from invite_rate_limits;
  delete from waitlist;
  delete from orcid_pending;

  -- 8. Return the captured storage paths for the client to sweep.
  return query select p.bucket, p.path from _wipe_paths p;
end;
$$;

revoke all on function admin_wipe_platform() from public, anon, authenticated;
grant execute on function admin_wipe_platform() to authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Waitlist viewer

create or replace function get_waitlist()
returns table (
  id              uuid,
  full_name       text,
  email           text,
  institution     text,
  role_title      text,
  referral_source text,
  is_priority     boolean,
  created_at      timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select is_admin from profiles where profiles.id = auth.uid()),
    false
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
    select w.id, w.full_name, w.email, w.institution, w.role_title,
           w.referral_source, w.is_priority, w.created_at
      from waitlist w
     order by w.created_at desc;
end;
$$;

revoke all on function get_waitlist() from public, anon, authenticated;
grant execute on function get_waitlist() to authenticated;

create or replace function get_waitlist_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(
    (select is_admin from profiles where profiles.id = auth.uid()),
    false
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return (select count(*)::int from waitlist);
end;
$$;

revoke all on function get_waitlist_count() from public, anon, authenticated;
grant execute on function get_waitlist_count() to authenticated;
