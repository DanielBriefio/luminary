-- Phase 14: Lock down profiles.is_admin
--
-- The existing profiles UPDATE policy (`auth.uid() = id`) lets users
-- update any column on their own row, including `is_admin`. Without
-- this trigger, any authenticated user can promote themselves to
-- admin from the browser console:
--
--     await supabase.from('profiles').update({ is_admin: true })
--                   .eq('id', mineId)
--
-- This trigger blocks non-admin callers from flipping is_admin.
-- Service role (auth.uid() IS NULL — used by the SQL editor and
-- edge functions) bypasses naturally, so admin promotion still works
-- via dashboard SQL.

create or replace function block_self_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / dashboard SQL editor: auth.uid() is null → allow
  if auth.uid() is null then
    return new;
  end if;

  -- is_admin isn't changing → allow
  if new.is_admin is not distinct from old.is_admin then
    return new;
  end if;

  -- is_admin IS changing — caller must already be admin
  if not coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  ) then
    raise exception 'cannot modify is_admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_self_admin on profiles;
create trigger trg_block_self_admin
  before update on profiles
  for each row
  execute function block_self_admin();
