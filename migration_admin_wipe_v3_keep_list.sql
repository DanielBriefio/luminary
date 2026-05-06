-- Platform wipe with optional keep-list.
--
-- Extends admin_wipe_platform to take p_keep_user_ids — UUIDs whose
-- account, profile, posts, groups, projects, library, follows, and
-- storage all survive the wipe. The Luminary Team bot is always in
-- the keep set; the new param adds to it.
--
-- Use case: ahead of a content beta, wipe the technical-tester
-- accounts but preserve your own user (and the deep-dive articles
-- you've already written into a public group's project).
--
--   select * from admin_wipe_platform(array['<your-uuid>'::uuid]);
--
-- Calling with no argument behaves identically to the previous
-- version (only the bot survives) — the param defaults to '{}'.
--
-- Two non-trivial differences from v2:
--   1. groups / projects / community_templates are no longer
--      blanket-deleted. We delete only those whose creator is NOT
--      in the keep set; the rest survive (kept users keep their
--      groups + projects, including any inner content).
--   2. admin_config.updated_by is nulled only for rows pointing at
--      a deleted user — kept users' updated_by survives.

-- Drop the v2 no-arg signature first. `create or replace` only matches
-- on identical signature, so without this drop we'd end up with two
-- overloads of admin_wipe_platform — the no-arg one and the new
-- (uuid[]) one — and PostgREST would refuse the call as ambiguous.
drop function if exists admin_wipe_platform();

create or replace function admin_wipe_platform(p_keep_user_ids uuid[] default array[]::uuid[])
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  bot_id   uuid := 'af56ef6f-635a-438b-8c8a-41cc84751bca';
  keep_set uuid[];
begin
  -- Admin gate
  if not coalesce(
    (select is_admin from profiles where profiles.id = auth.uid()),
    false
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- Build the full keep set (bot + caller-supplied IDs, deduped, no nulls).
  keep_set := array(
    select distinct x
      from unnest(coalesce(p_keep_user_ids, array[]::uuid[]) || array[bot_id]) as x
     where x is not null
  );

  -- 1. Capture storage paths the client needs to sweep.
  --    Wipe: any non-kept user's uploads + the bot's non-singleton
  --    uploads (post / library blobs the bot may have left behind).
  --    Bot's avatar + profile_cover stay so it keeps a usable face;
  --    other kept users keep ALL their uploads.
  create temporary table _wipe_paths on commit drop as
    select usf.bucket, usf.path
      from user_storage_files usf
     where usf.user_id <> all(keep_set)
        or (usf.user_id = bot_id and usf.source_kind not in ('avatar', 'profile_cover'));

  -- 2a. Pre-clean tables whose user_id FK to profiles is NOT ON DELETE CASCADE
  --     (e.g. `reposts` from the original schema). Without these explicit
  --     deletes, the auth.users → profiles cascade in step 2b throws
  --     "violates foreign key constraint" and the whole wipe rolls back.
  --     Scoped to non-kept users so kept users' likes / reposts /
  --     publications survive.
  delete from reposts      where user_id <> all(keep_set);
  delete from likes        where user_id <> all(keep_set);
  delete from publications where user_id <> all(keep_set);

  -- 2a'. Null out admin_config.updated_by for rows pointing at users
  --      we're about to delete. Kept users' references stay intact.
  update admin_config
     set updated_by = null
   where updated_by is not null
     and updated_by <> all(keep_set);

  -- 2b. Delete every non-kept user. Cascade clears profiles + most content.
  delete from auth.users where id <> all(keep_set);

  -- 3. Sweep tombstoned rows from FKs that are SET NULL on delete.
  --    Without these we'd be left with "Deleted user" comments / empty
  --    DM threads. Kept users' rows remain untouched (their user_id is
  --    not null and they survived step 2b).
  delete from messages       where sender_id is null;
  delete from conversations  where user_id_a is null and user_id_b is null;
  delete from comments       where user_id is null;

  -- 4. Wipe bot-authored content. Bot account + profile + avatar stay;
  --    everything else the bot has touched goes. Other kept users'
  --    content is NOT touched here.
  delete from posts                 where user_id = bot_id;
  delete from likes                 where user_id = bot_id;
  delete from reposts               where user_id = bot_id;
  delete from saved_posts           where user_id = bot_id;
  delete from follows               where follower_id = bot_id or target_id = bot_id::text;
  delete from group_members         where user_id = bot_id;
  delete from project_members       where user_id = bot_id;
  delete from group_join_requests   where user_id = bot_id;
  delete from group_follows         where user_id = bot_id;
  delete from library_items         where added_by = bot_id;
  delete from library_folders       where user_id = bot_id;
  delete from bookmark_folders      where user_id = bot_id;
  delete from notifications         where user_id = bot_id or actor_id = bot_id;
  delete from post_reports          where reporter_id = bot_id;
  delete from lumen_transactions    where user_id = bot_id;
  delete from user_storage_files
     where user_id = bot_id
       and source_kind not in ('avatar', 'profile_cover');

  -- 5. Anything still standing in groups / projects / templates that
  --    is NOT owned by a kept user. Kept users' groups, projects, and
  --    templates survive intact (with their inner content carried
  --    along by the cascade structure).
  delete from groups              where created_by <> all(keep_set);
  delete from projects            where created_by <> all(keep_set);
  delete from community_templates where created_by <> all(keep_set);

  -- 6. Reset the bot's gamification counters in case it accumulated any.
  --    Other kept users' lumens are left as-is (their work earned them).
  update profiles
     set lumens_current_period   = 0,
         lumens_lifetime         = 0,
         current_period_started  = now(),
         previous_period_lumens  = 0
   where id = bot_id;

  -- 7. Clear admin / auth scaffolding so signups start fresh.
  --    Waitlist intentionally PRESERVED.
  delete from invite_code_uses    where true;
  delete from invite_codes        where claimed_by is null or claimed_by <> all(keep_set);
  delete from invite_rate_limits  where true;
  delete from orcid_pending       where true;

  -- 8. Return the captured storage paths for the client to sweep.
  return query select p.bucket, p.path from _wipe_paths p;
end;
$$;

revoke all on function admin_wipe_platform(uuid[]) from public, anon, authenticated;
grant execute on function admin_wipe_platform(uuid[]) to authenticated;
