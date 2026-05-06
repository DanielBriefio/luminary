-- Convenience wrapper around admin_wipe_platform that resolves emails
-- to user IDs server-side. The admin UI's selective-wipe panel takes
-- a multi-line list of emails, sends them straight to this function,
-- and we look the IDs up in auth.users so the client doesn't need
-- direct read access to the auth schema (it doesn't have it).
--
-- Unknown / typo'd emails are silently dropped (the wipe is the same
-- whether they were missing or not — those people already aren't on
-- the platform). The bot is always added by the inner function via
-- its own keep_set logic, so callers don't need to include it.
--
-- Returns the same { bucket, path } rows as admin_wipe_platform so
-- the client sweeps storage identically.

create or replace function admin_wipe_platform_by_email(p_keep_emails text[] default array[]::text[])
returns table (bucket text, path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uuids uuid[];
begin
  -- Admin gate (mirrors admin_wipe_platform — belt-and-braces in case
  -- this wrapper is ever called outside the dashboard).
  if not coalesce(
    (select is_admin from profiles where profiles.id = auth.uid()),
    false
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- Resolve emails to user IDs, case-insensitively. Empty / null
  -- entries are skipped. Unknown emails silently drop out of the set.
  select array_agg(distinct au.id)
    into v_uuids
    from auth.users au
   where lower(au.email) in (
           select lower(trim(e))
             from unnest(coalesce(p_keep_emails, array[]::text[])) as e
            where e is not null and trim(e) <> ''
         );

  return query
    select w.bucket, w.path
      from admin_wipe_platform(coalesce(v_uuids, array[]::uuid[])) w;
end;
$$;

revoke all on function admin_wipe_platform_by_email(text[]) from public, anon, authenticated;
grant execute on function admin_wipe_platform_by_email(text[]) to authenticated;
