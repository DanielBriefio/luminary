-- Admin: hard-delete a single user account immediately.
--
-- Use cases: removing test accounts while iterating on the signup flow,
-- and removing spam accounts now that signup is open (no invite gate).
-- Unlike delete_own_account() there is no 30-day grace period.
--
-- Returns the user's tracked storage blobs as (bucket, path) rows so the
-- admin client can sweep them with supabase.storage.remove() — same
-- pattern as admin_wipe_platform.
--
-- Footguns handled (same ones admin_wipe_platform was patched for):
--   * reposts.user_id FK is ON DELETE NO ACTION → delete first
--   * admin_config.updated_by FK has no cascade → null it first
--   * signup_pending is keyed by email → drop it so the same address can
--     sign up again cleanly
--   * invite codes the user created / claimed / used
--
-- Guards: caller must be admin; cannot delete yourself, another admin,
-- or the Luminary bot account.

create or replace function admin_delete_user(p_user_id uuid)
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bot_id uuid := 'af56ef6f-635a-438b-8c8a-41cc84751bca';
  v_email  text;
  v_buckets text[];
  v_paths   text[];
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user id required' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'you cannot delete your own account here' using errcode = '42501';
  end if;
  if p_user_id = v_bot_id then
    raise exception 'the Luminary bot account cannot be deleted' using errcode = '42501';
  end if;
  if coalesce((select is_admin from profiles where id = p_user_id), false) then
    raise exception 'cannot delete another admin — revoke is_admin first' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  -- Capture storage paths before the cascade removes the tracking rows.
  select coalesce(array_agg(usf.bucket), '{}'), coalesce(array_agg(usf.path), '{}')
    into v_buckets, v_paths
    from user_storage_files usf where usf.user_id = p_user_id;

  -- Non-cascading FKs.
  delete from reposts where user_id = p_user_id;
  update admin_config set updated_by = null where updated_by = p_user_id;

  -- Invite codes: drop the user's own codes (personal + QR) and their
  -- usage rows; release any code they claimed so stats stay consistent.
  delete from invite_code_uses
   where user_id = p_user_id
      or code_id in (select id from invite_codes where created_by = p_user_id);
  delete from invite_codes where created_by = p_user_id;
  update invite_codes set claimed_by = null, claimed_at = null where claimed_by = p_user_id;

  delete from signup_pending where email = lower(v_email);

  -- Cascades to profiles and everything hanging off it.
  delete from auth.users where id = p_user_id;

  return query select u.b, u.p from unnest(v_buckets, v_paths) as u(b, p);
end;
$$;

revoke all on function admin_delete_user(uuid) from public, anon;
grant execute on function admin_delete_user(uuid) to authenticated;
