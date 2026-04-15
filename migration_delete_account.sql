-- Self-deletion function: deletes all data for the calling user then removes
-- their auth account. SECURITY DEFINER is required to delete from auth.users.
--
-- Run this in Supabase SQL Editor.

create or replace function delete_own_account()
returns void language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Messages & conversations (cascade would handle messages, but be explicit)
  delete from messages      where sender_id       = uid;
  delete from conversations where user_id_a        = uid or user_id_b = uid;

  -- Social
  delete from notifications where user_id          = uid;
  delete from follows       where follower_id       = uid;
  delete from likes         where user_id           = uid;
  delete from comments      where user_id           = uid;

  -- Content
  delete from group_members where user_id           = uid;
  delete from group_posts   where user_id           = uid;
  delete from groups        where owner_id          = uid;
  delete from posts         where user_id           = uid;
  delete from publications  where user_id           = uid;

  -- Invite codes: nullify rather than delete so claimed codes stay for audit
  update invite_codes set created_by = null where created_by = uid;
  update invite_codes set claimed_by = null, claimed_at = null where claimed_by = uid;

  -- Profile (cascades conversations/messages via profiles FK if not already gone)
  delete from profiles where id = uid;

  -- Auth user — triggers any remaining DB-level cascades
  delete from auth.users where id = uid;
end;
$$;

-- Grant execute to authenticated users only
revoke all on function delete_own_account() from public;
grant execute on function delete_own_account() to authenticated;
