-- Updated platform wipe.
--
-- Two changes from migration_admin_wipe_and_waitlist.sql:
--
--   1. Schema is brought up to date with the post-phase15 unified `posts`
--      table. The original referenced `group_posts`, `project_posts`,
--      `group_post_comments`, `project_post_comments`, `group_post_likes`,
--      and `project_post_likes` — all dropped in phase15 — which caused
--      "relation X does not exist" errors on every wipe attempt.
--
--   2. `waitlist` is NO LONGER deleted. The signup signal is too
--      valuable to nuke during a fresh-data reset. Other admin / auth
--      scaffolding (invite_codes, invite_rate_limits, orcid_pending)
--      still gets cleared.
--
-- Everything else preserved verbatim: the bot account survives, its
-- avatar + profile_cover blobs are kept, admin_config rows are kept
-- (only updated_by is nulled if it pointed at a deleted admin), and
-- the function still returns the (bucket, path) pairs the client must
-- sweep via supabase.storage.remove() — DB cascade does not touch blobs.

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
  --    (post / library blobs the bot may have left behind).
  --    Bot's avatar + profile_cover stay so the bot keeps a usable face.
  create temporary table _wipe_paths on commit drop as
    select usf.bucket, usf.path
      from user_storage_files usf
     where usf.user_id <> bot_id
        or usf.source_kind not in ('avatar', 'profile_cover');

  -- 2a. Pre-clean tables whose user_id FK to profiles is NOT ON DELETE CASCADE
  --     (e.g. `reposts` from the original schema). Without these explicit
  --     deletes, the auth.users → profiles cascade in step 2b throws
  --     "violates foreign key constraint" and the whole wipe rolls back.
  --     `where true` clauses satisfy Supabase's pg_safeupdate guard.
  delete from reposts        where true;
  delete from likes          where true;
  delete from publications   where true;

  -- 2a'. Null out FKs in tables we PRESERVE that point to profiles being
  --      deleted. admin_config is the canonical case — we keep its rows
  --      (storage quota, paper-of-week, milestone template, founding
  --      cutoff) but the updated_by column points to whichever admin
  --      last touched them, who's about to be deleted.
  update admin_config
     set updated_by = null
   where updated_by is not null
     and updated_by <> bot_id;

  -- 2b. Delete every non-bot user. Cascade clears profiles + most content.
  delete from auth.users where id <> bot_id;

  -- 3. Sweep tombstoned rows (FKs that are SET NULL on delete, not CASCADE).
  --    Without these we'd be left with "Deleted user" comments / empty DM
  --    threads. Comments, conversations, messages all live in the unified
  --    schema now — no separate group_post_comments / project_post_comments.
  delete from messages       where true;
  delete from conversations  where true;
  delete from comments       where true;

  -- 4. Wipe any remaining bot-authored content. Bot account + profile + avatar
  --    stay; everything else the bot has touched goes. Posts of every
  --    context (feed/group/project) live in the unified `posts` table now.
  delete from posts                 where user_id = bot_id;
  delete from likes                 where user_id = bot_id;
  delete from reposts               where user_id = bot_id;
  delete from saved_posts           where user_id = bot_id;
  -- follows.target_id is TEXT (polymorphic: stores profile or group id),
  -- so cast bot_id to text on the comparison side.
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

  -- 5. Anything still standing in groups / projects belongs to the bot or is
  --    orphaned — nuke it so we start with zero.
  delete from groups              where true;
  delete from projects            where true;
  delete from community_templates where true;

  -- 6. Reset the bot's gamification counters in case it accumulated any.
  update profiles
     set lumens_current_period   = 0,
         lumens_lifetime         = 0,
         current_period_started  = now(),
         previous_period_lumens  = 0
   where id = bot_id;

  -- 7. Clear admin / auth scaffolding so signups start fresh.
  --    Waitlist intentionally PRESERVED — it's organic signup signal,
  --    not test data, and survives platform resets.
  delete from invite_code_uses    where true;
  delete from invite_codes        where true;
  delete from invite_rate_limits  where true;
  delete from orcid_pending       where true;

  -- 8. Return the captured storage paths for the client to sweep.
  return query select p.bucket, p.path from _wipe_paths p;
end;
$$;

revoke all on function admin_wipe_platform() from public, anon, authenticated;
grant execute on function admin_wipe_platform() to authenticated;
