-- Admin: registered login emails for the /admin → Users view.
--
-- Emails live in auth.users, which the client can't read. Kept separate
-- from get_admin_user_list() so that (larger, analytics-heavy) function
-- doesn't need to be recreated; the client merges the two by id.
--
-- email_confirmed_at is included so the admin view can flag accounts that
-- signed up but never clicked the confirmation link (signup is open now).

create or replace function get_admin_user_emails()
returns table (id uuid, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, u.email_confirmed_at, u.last_sign_in_at
      from auth.users u;
end;
$$;

revoke all on function get_admin_user_emails() from public, anon;
grant execute on function get_admin_user_emails() to authenticated;
