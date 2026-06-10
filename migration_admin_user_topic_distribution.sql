-- Surface per-user behavioural tier1 distribution in admin/Users.
--
-- Adds a `topic_distribution` JSONB column to get_admin_user_list,
-- returning each user's full list of tier1 tags sorted desc by count:
--   [{"tier1": "cardiology", "count": 12},
--    {"tier1": "oncology",   "count": 10},
--    {"tier1": "immunology", "count":  3}]
--
-- Behavioural (what they post) — not declared (identity_tier1 from
-- onboarding). tier1 is set by the auto-tag pipeline (paper posts +
-- text posts ≥100 chars), so non-tagged posts are excluded; counts
-- undercount real activity but the signal is clean.
--
-- Rest of the row shape is identical to migration_admin_lumens.sql.

create or replace function get_admin_user_list()
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    from (
      select
        p.id,
        p.name,
        p.title,
        p.institution,
        p.work_mode,
        p.avatar_color,
        p.avatar_url,
        p.profile_slug,
        p.onboarding_completed,
        p.admin_notes,
        p.created_at,

        coalesce(p.lumens_current_period, 0) as lumens_current_period,
        coalesce(p.lumens_lifetime, 0)       as lumens_lifetime,
        coalesce(p.is_founding_member, false) as is_founding_member,

        greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) as last_active,

        (select count(*) from posts        where user_id = p.id)::int as posts_count,
        (select count(*) from group_members where user_id = p.id)::int as groups_count,

        (
          select count(*)::int
          from invite_codes ic
          where ic.created_by = p.id
            and ic.is_multi_use = false
            and ic.claimed_by is null
            and ic.locked_at is null
            and (ic.expires_at is null or ic.expires_at > now())
        ) as invite_codes_remaining,

        coalesce(
          (select ic.code from invite_codes ic where ic.claimed_by = p.id limit 1),
          (select ic.code from invite_code_uses icu
             join invite_codes ic on ic.id = icu.code_id
             where icu.user_id = p.id limit 1)
        ) as invite_code_used,

        case
          when exists(select 1 from posts where user_id = p.id)
            and p.profile_slug is not null
            then 'visible'
          when exists(select 1 from posts where user_id = p.id)
            then 'active'
          when exists(select 1 from follows where follower_id = p.id)
            or exists(select 1 from group_members where user_id = p.id)
            then 'connected'
          when coalesce(p.onboarding_completed, false) = true
            or exists(select 1 from publications where user_id = p.id)
            then 'credible'
          else 'identified'
        end as activation_stage,

        case
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) = 0 then 'stuck'
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) <= 2
          and greatest(
            (select max(created_at) from posts    where user_id = p.id),
            (select max(created_at) from comments where user_id = p.id),
            (select max(created_at) from likes    where user_id = p.id)
          ) < now() - interval '5 days'
          then 'almost'
          else null
        end as ghost_segment,

        -- NEW: behavioural tier1 distribution, sorted desc by count.
        -- Excludes null/empty tier1 (auto-tag didn't run / too short).
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('tier1', tier1, 'count', n)
              order by n desc, tier1 asc
            )
            from (
              select tier1, count(*)::int as n
              from posts
              where user_id = p.id
                and tier1 is not null
                and tier1 <> ''
              group by tier1
            ) td
          ),
          '[]'::jsonb
        ) as topic_distribution

      from profiles p
      where p.id != (
        select id from profiles where name = 'Luminary Team' limit 1
      )
    ) t
  );
end;
$$;
