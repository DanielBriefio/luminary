-- Restore the "any signed-in user can SELECT any group" policy.
--
-- The original migration_groups_phase1.sql defined this, but production
-- shows closed groups never appearing in Discover even when the viewer
-- is not a member — meaning a more restrictive policy (probably one that
-- filters on is_public OR membership) was layered on at some point.
--
-- This is intentional: Discover surfaces closed groups so non-members
-- can request to join. Group *contents* (posts, members) stay protected
-- by the per-table RLS on group_posts / group_members / etc.; only the
-- groups row itself (name, topic, is_public, member counts) is public
-- to authenticated users.
--
-- Idempotent: drop any existing SELECT policy on groups, then recreate
-- the open one. Other policies (insert / update) are untouched.

do $$
declare
  pol record;
begin
  for pol in
    select polname from pg_policy
    where polrelid = 'public.groups'::regclass and polcmd = 'r'
  loop
    execute format('drop policy %I on public.groups', pol.polname);
  end loop;
end $$;

create policy "groups_select" on public.groups
  for select using (auth.uid() is not null);
