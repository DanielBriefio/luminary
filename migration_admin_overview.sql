-- Real implementation of get_platform_stats (replaces Phase 6A stub)
create or replace function get_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  return jsonb_build_object(
    'users',           (
      select count(*)::int from profiles
      where is_admin = false or is_admin is null
    ),
    'posts',           (
      select count(*)::int from posts
      where post_type not in ('milestone', 'admin_nudge')
    ),
    'groups',          (select count(*)::int from groups),
    'projects',        (select count(*)::int from projects),
    'users_today',     (
      select count(*)::int from profiles
      where created_at >= current_date
        and (is_admin = false or is_admin is null)
    ),
    'posts_today',     (
      select count(*)::int from posts
      where created_at >= current_date
        and post_type not in ('milestone', 'admin_nudge')
    ),
    'groups_today',    (
      select count(*)::int from groups
      where created_at >= current_date
    ),
    'projects_today',  (
      select count(*)::int from projects
      where created_at >= current_date
    ),
    'admins_count',    (
      select count(*)::int from profiles where is_admin = true
    )
  );
end;
$$;

-- New RPC: get_activity_sparklines
-- Returns 30 days of daily activity counts for charting
create or replace function get_activity_sparklines()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.date), '[]'::jsonb)
    from (
      with date_series as (
        select generate_series(
          current_date - 29,
          current_date,
          '1 day'::interval
        )::date as day
      )
      select
        ds.day::text as date,
        coalesce(p.cnt, 0)  as posts,
        coalesce(u.cnt, 0)  as new_users,
        coalesce(c.cnt, 0)  as comments,
        coalesce(l.cnt, 0)  as library_items
      from date_series ds
      left join (
        select created_at::date as day, count(*)::int as cnt
        from posts
        where post_type not in ('milestone', 'admin_nudge')
          and created_at >= current_date - 29
        group by 1
      ) p on p.day = ds.day
      left join (
        select created_at::date as day, count(*)::int as cnt
        from profiles
        where (is_admin = false or is_admin is null)
          and created_at >= current_date - 29
        group by 1
      ) u on u.day = ds.day
      left join (
        select created_at::date as day, count(*)::int as cnt
        from comments
        where created_at >= current_date - 29
        group by 1
      ) c on c.day = ds.day
      left join (
        select added_at::date as day, count(*)::int as cnt
        from library_items
        where added_at >= current_date - 29
        group by 1
      ) l on l.day = ds.day
    ) t
  );
end;
$$;

-- New RPC: get_at_risk_alerts
-- Returns counts for the three at-risk categories
create or replace function get_at_risk_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ghost_users       int;
  v_quiet_groups      int;
  v_pending_templates int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- Ghost users: signed up 2–5 days ago, zero actions
  select count(*)::int into v_ghost_users
  from profiles p
  where p.created_at >= now() - interval '5 days'
    and p.created_at <  now() - interval '2 days'
    and (p.is_admin = false or p.is_admin is null)
    and not exists (select 1 from posts         where user_id    = p.id)
    and not exists (select 1 from comments      where user_id    = p.id)
    and not exists (select 1 from likes         where user_id    = p.id)
    and not exists (select 1 from follows       where follower_id = p.id)
    and not exists (select 1 from group_members where user_id    = p.id);

  -- Quiet groups: ≥2 members, no posts in last 7 days
  select count(*)::int into v_quiet_groups
  from groups g
  where (
    select count(*) from group_members
    where group_id = g.id
      and role in ('admin', 'member')
  ) >= 2
  and not exists (
    select 1 from group_posts
    where group_id = g.id
      and created_at >= now() - interval '7 days'
  );

  -- Pending community template submissions
  select count(*)::int into v_pending_templates
  from community_templates
  where status = 'pending';

  return jsonb_build_object(
    'ghost_users',       v_ghost_users,
    'quiet_groups',      v_quiet_groups,
    'pending_templates', v_pending_templates
  );
end;
$$;

grant execute on function get_platform_stats()      to authenticated;
grant execute on function get_activity_sparklines() to authenticated;
grant execute on function get_at_risk_alerts()      to authenticated;
