-- Phase 12.3: schedule-time admin handoff for accounts about to delete
--
-- Returns the list of groups where the caller is the ONLY admin (so
-- without action, deletion would either orphan the group via
-- groups.created_by SET NULL or leave it adminless after group_members
-- cascade). The frontend uses this in the confirm-delete dialog to
-- prompt for a successor — promote a member to admin, or dissolve.
--
-- Groups where the caller is one of multiple admins are NOT returned —
-- the remaining admin(s) keep running the group, no action needed.
-- Group projects don't need handoff: created_by SET NULL and the
-- project belongs to the group, not the deleting user.
--
-- Idempotent: CREATE OR REPLACE.

create or replace function get_my_admin_groups_for_handoff()
returns table (
  group_id      uuid,
  group_name    text,
  total_admins  int,
  other_members jsonb
)
language sql security definer
set search_path = public as $$
  with my_admin as (
    select g.id, g.name
    from groups g
    join group_members gm on gm.group_id = g.id
    where gm.user_id = auth.uid()
      and gm.role = 'admin'
  )
  select
    ma.id   as group_id,
    ma.name as group_name,
    (select count(*)::int from group_members gm
       where gm.group_id = ma.id and gm.role = 'admin') as total_admins,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',        gm.user_id,
        'name',      pr.name,
        'role',      gm.role,
        'joined_at', gm.created_at
      ) order by gm.created_at)
      from group_members gm
      join profiles pr on pr.id = gm.user_id
      where gm.group_id = ma.id
        and gm.user_id != auth.uid()
        and gm.role in ('admin', 'member')
    ), '[]'::jsonb) as other_members
  from my_admin ma
  where (select count(*)::int from group_members gm
          where gm.group_id = ma.id and gm.role = 'admin') = 1;
$$;

grant execute on function get_my_admin_groups_for_handoff() to authenticated;
