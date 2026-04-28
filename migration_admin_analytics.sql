-- Phase 13: Admin Analytics Dashboard
--
-- Adds 17 admin-gated RPCs powering the four-tab analytics section
-- (Health / Growth / Product / Behaviour). All RPCs:
--   * SECURITY DEFINER, set search_path = public
--   * Require is_admin = true on the caller's profile
--   * Exclude the Luminary Team bot account
--   * Skip legacy post types ('milestone', 'admin_nudge') where applicable
--
-- Time-window RPCs accept p_days int (NULL = all time, default 30).
-- Use coalesce(p_days, 36500) when computing now() - interval cutoffs to
-- treat NULL as ~100 years.

-- ─── 1. get_retention_cohorts ───────────────────────────────────────────────
-- D7: of users who signed up 7-14 days ago, how many were active in the
-- last 7 days? D30: 30-60 day cohort vs last 30 days. Active = ≥1 post,
-- comment, or like in the window.
create or replace function get_retention_cohorts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d7_cohort      int;
  v_d7_retained    int;
  v_d30_cohort     int;
  v_d30_retained   int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- D7 cohort
  select count(*) into v_d7_cohort
  from profiles p
  where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
    and p.created_at >= now() - interval '14 days'
    and p.created_at <  now() - interval '7 days';

  select count(*) into v_d7_retained
  from profiles p
  where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
    and p.created_at >= now() - interval '14 days'
    and p.created_at <  now() - interval '7 days'
    and (
      exists (select 1 from posts    where user_id = p.id and created_at >= now() - interval '7 days')
      or exists (select 1 from comments where user_id = p.id and created_at >= now() - interval '7 days')
      or exists (select 1 from likes    where user_id = p.id and created_at >= now() - interval '7 days')
    );

  -- D30 cohort
  select count(*) into v_d30_cohort
  from profiles p
  where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
    and p.created_at >= now() - interval '60 days'
    and p.created_at <  now() - interval '30 days';

  select count(*) into v_d30_retained
  from profiles p
  where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
    and p.created_at >= now() - interval '60 days'
    and p.created_at <  now() - interval '30 days'
    and (
      exists (select 1 from posts    where user_id = p.id and created_at >= now() - interval '30 days')
      or exists (select 1 from comments where user_id = p.id and created_at >= now() - interval '30 days')
      or exists (select 1 from likes    where user_id = p.id and created_at >= now() - interval '30 days')
    );

  return jsonb_build_object(
    'd7', jsonb_build_object(
      'cohort_size', v_d7_cohort,
      'retained',    v_d7_retained,
      'pct',         case when v_d7_cohort > 0
                          then round((v_d7_retained::numeric / v_d7_cohort) * 100, 1)
                          else null end
    ),
    'd30', jsonb_build_object(
      'cohort_size', v_d30_cohort,
      'retained',    v_d30_retained,
      'pct',         case when v_d30_cohort > 0
                          then round((v_d30_retained::numeric / v_d30_cohort) * 100, 1)
                          else null end
    )
  );
end;
$$;

-- ─── 2. get_weekly_signups ──────────────────────────────────────────────────
-- Last 12 weeks (ISO weeks). Returns week_start, count, cumulative.
create or replace function get_weekly_signups()
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.week_start), '[]'::jsonb)
    from (
      with weeks as (
        select generate_series(
          date_trunc('week', now() - interval '11 weeks'),
          date_trunc('week', now()),
          '1 week'::interval
        )::date as week_start
      ),
      base as (
        select
          w.week_start,
          (
            select count(*)::int from profiles
            where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
              and created_at >= w.week_start
              and created_at <  w.week_start + interval '7 days'
          ) as count
        from weeks w
      )
      select
        week_start::text as week_start,
        count,
        sum(count) over (order by week_start)::int as cumulative
      from base
    ) t
  );
end;
$$;

-- ─── 3. get_daily_active_users ─────────────────────────────────────────────
-- Last 30 days. Active = posted, commented, or liked that day.
create or replace function get_daily_active_users()
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.day), '[]'::jsonb)
    from (
      with days as (
        select generate_series(
          (current_date - 29)::date,
          current_date,
          '1 day'::interval
        )::date as day
      )
      select
        d.day::text as day,
        (
          select count(distinct user_id)::int
          from (
            select user_id from posts
              where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
                and created_at::date = d.day
            union
            select user_id from comments
              where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
                and created_at::date = d.day
            union
            select user_id from likes
              where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
                and created_at::date = d.day
          ) u
        ) as count
      from days d
    ) t
  );
end;
$$;

-- ─── 4. get_signup_method_breakdown ─────────────────────────────────────────
-- ORCID vs invite-code path. Compares avg posts / comments / lumens / pct
-- activated (has at least one post) per cohort.
create or replace function get_signup_method_breakdown(p_days int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  v_cutoff := case when p_days is null then '1970-01-01'::timestamptz
                   else now() - (p_days || ' days')::interval end;

  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        coalesce(
          case
            when p.signup_method = 'orcid' then 'orcid'
            when p.orcid_verified = true   then 'orcid'
            else 'invite'
          end,
          'invite'
        ) as method,
        count(*)::int                                                       as users,
        avg((select count(*) from posts    where user_id = p.id))::numeric(10,2)  as avg_posts,
        avg((select count(*) from comments where user_id = p.id))::numeric(10,2)  as avg_comments,
        avg(coalesce(p.lumens_lifetime, 0))::numeric(10,1)                  as avg_lumens,
        round(
          100.0 * count(*) filter (where exists (select 1 from posts where user_id = p.id))
          / nullif(count(*), 0), 1
        ) as pct_activated
      from profiles p
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and p.created_at >= v_cutoff
      group by 1
    ) t
  );
end;
$$;

-- ─── 5. get_work_mode_stats ─────────────────────────────────────────────────
-- Per-segment count + avg posts + avg lumens.
create or replace function get_work_mode_stats(p_days int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  v_cutoff := case when p_days is null then '1970-01-01'::timestamptz
                   else now() - (p_days || ' days')::interval end;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.users desc), '[]'::jsonb)
    from (
      select
        coalesce(p.work_mode, 'researcher')                                  as work_mode,
        count(*)::int                                                        as users,
        avg((select count(*) from posts    where user_id = p.id))::numeric(10,2)   as avg_posts,
        avg((select count(*) from comments where user_id = p.id))::numeric(10,2)   as avg_comments,
        avg(coalesce(p.lumens_lifetime, 0))::numeric(10,1)                   as avg_lumens,
        avg((select count(*) from group_members where user_id = p.id))::numeric(10,2)   as avg_groups,
        round(
          100.0 * count(*) filter (where exists (select 1 from publications where user_id = p.id))
          / nullif(count(*), 0), 1
        ) as pct_with_publication
      from profiles p
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and p.created_at >= v_cutoff
      group by 1
    ) t
  );
end;
$$;

-- ─── 6. get_tier_distribution ───────────────────────────────────────────────
-- Counts at each Lumen tier using compute_tier(lumens_current_period).
create or replace function get_tier_distribution()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total
  from profiles
  where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        compute_tier(coalesce(lumens_current_period, 0)) as tier,
        count(*)::int                                    as count,
        case when v_total > 0
             then round(100.0 * count(*) / v_total, 1)
             else 0 end                                  as pct
      from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
      group by 1
      order by case
        when compute_tier(coalesce(lumens_current_period, 0)) = 'catalyst' then 1
        when compute_tier(coalesce(lumens_current_period, 0)) = 'pioneer'  then 2
        when compute_tier(coalesce(lumens_current_period, 0)) = 'beacon'   then 3
        when compute_tier(coalesce(lumens_current_period, 0)) = 'luminary' then 4
      end
    ) t
  );
end;
$$;

-- ─── 7. get_top_inviters ────────────────────────────────────────────────────
-- Top inviters by active invitees brought in. "Active" = has ≥1 post.
create or replace function get_top_inviters(p_limit int default 20)
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.active_invitees desc, t.codes_claimed desc), '[]'::jsonb)
    from (
      with inviter_codes as (
        select
          ic.created_by                                                            as inviter_id,
          count(*)::int                                                            as codes_created,
          (
            count(*) filter (where ic.is_multi_use = false and ic.claimed_by is not null)
            + (select coalesce(sum(uses_count), 0) from invite_codes ic2
               where ic2.created_by = ic.created_by and ic2.is_multi_use = true)
          )::int                                                                   as codes_claimed
        from invite_codes ic
        where ic.created_by is not null
        group by ic.created_by
      ),
      inviter_actives as (
        select
          ic.created_by as inviter_id,
          count(distinct invitee.id)::int as active_invitees
        from invite_codes ic
        left join profiles invitee on (
          (ic.is_multi_use = false and invitee.id = ic.claimed_by)
          or (ic.is_multi_use = true and invitee.id in (
            select user_id from invite_code_uses where code_id = ic.id
          ))
        )
        where ic.created_by is not null
          and invitee.id is not null
          and exists (select 1 from posts where user_id = invitee.id)
        group by ic.created_by
      )
      select
        p.id                                  as user_id,
        p.name,
        p.avatar_color,
        p.avatar_url,
        coalesce(c.codes_created, 0)          as codes_created,
        coalesce(c.codes_claimed, 0)          as codes_claimed,
        coalesce(a.active_invitees, 0)        as active_invitees,
        case when coalesce(c.codes_claimed, 0) > 0
             then round(100.0 * coalesce(a.active_invitees, 0) / c.codes_claimed, 1)
             else 0 end                       as conversion_pct
      from profiles p
      join inviter_codes c on c.inviter_id = p.id
      left join inviter_actives a on a.inviter_id = p.id
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
      order by active_invitees desc, codes_claimed desc
      limit p_limit
    ) t
  );
end;
$$;

-- ─── 8. get_feature_adoption ────────────────────────────────────────────────
-- For each feature, % of total users who have ever used it.
create or replace function get_feature_adoption()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total
  from profiles
  where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  return jsonb_build_array(
    jsonb_build_object('feature', 'posted',          'count',
      (select count(distinct user_id)::int from posts
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct user_id)::int from posts
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'commented',       'count',
      (select count(distinct user_id)::int from comments
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct user_id)::int from comments
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'joined_group',    'count',
      (select count(distinct user_id)::int from group_members
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct user_id)::int from group_members
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'added_library',   'count',
      (select count(distinct added_by)::int from library_items
       where added_by is not null and added_by != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct added_by)::int from library_items
       where added_by is not null and added_by != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'created_project', 'count',
      (select count(distinct created_by)::int from projects
       where created_by is not null and created_by != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct created_by)::int from projects
       where created_by is not null and created_by != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'added_publication','count',
      (select count(distinct user_id)::int from publications
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct user_id)::int from publications
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'sent_dm',         'count',
      (select count(distinct sender_id)::int from messages
       where sender_id is not null and sender_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct sender_id)::int from messages
       where sender_id is not null and sender_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('feature', 'followed',        'count',
      (select count(distinct follower_id)::int from follows
       where follower_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct follower_id)::int from follows
       where follower_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1))
  );
end;
$$;

-- ─── 9. get_content_performance ─────────────────────────────────────────────
-- Per post-type aggregates: paper / text / deep_dive (is_deep_dive=true posts
-- are reported under their own bucket and excluded from the 'text' bucket).
create or replace function get_content_performance(p_days int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  v_cutoff := case when p_days is null then '1970-01-01'::timestamptz
                   else now() - (p_days || ' days')::interval end;

  return (
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      with classified as (
        select
          p.id,
          case
            when p.post_type = 'paper'   then 'paper'
            when p.is_deep_dive = true   then 'deep_dive'
            else 'text'
          end as kind,
          (select count(*)::int from likes    where post_id = p.id)        as likes,
          (select count(*)::int from comments where post_id = p.id)        as comments,
          (select count(distinct user_id)::int from comments where post_id = p.id) as commenters
        from posts p
        where p.user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
          and p.is_hidden = false
          and p.is_admin_post = false
          and p.post_type not in ('milestone', 'admin_nudge')
          and p.created_at >= v_cutoff
      )
      select
        kind                                                  as post_type,
        count(*)::int                                         as posts,
        round(avg(likes)::numeric, 2)                         as avg_likes,
        round(avg(comments)::numeric, 2)                      as avg_comments,
        round(
          100.0 * count(*) filter (where commenters >= 3) / nullif(count(*), 0), 1
        )                                                     as pct_with_3plus_commenters
      from classified
      group by kind
      order by posts desc
    ) t
  );
end;
$$;

-- ─── 10. get_lumens_histogram ───────────────────────────────────────────────
-- Distribution of lumens_lifetime across users in 9 buckets.
create or replace function get_lumens_histogram()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  return jsonb_build_array(
    jsonb_build_object('bucket', '0',        'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) = 0)),
    jsonb_build_object('bucket', '1-25',     'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 1 and 25)),
    jsonb_build_object('bucket', '26-100',   'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 26 and 100)),
    jsonb_build_object('bucket', '101-250',  'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 101 and 250)),
    jsonb_build_object('bucket', '251-500',  'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 251 and 500)),
    jsonb_build_object('bucket', '501-1000', 'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 501 and 1000)),
    jsonb_build_object('bucket', '1001-2000','count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 1001 and 2000)),
    jsonb_build_object('bucket', '2001-5000','count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) between 2001 and 5000)),
    jsonb_build_object('bucket', '5000+',    'count', (
      select count(*)::int from profiles
      where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(lumens_lifetime, 0) > 5000))
  );
end;
$$;

-- ─── 11. get_profile_completeness ───────────────────────────────────────────
-- % of users with each common profile field filled in.
create or replace function get_profile_completeness()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total
  from profiles
  where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  return jsonb_build_array(
    jsonb_build_object('field', 'bio',           'count',
      (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(bio, '') <> ''),
      'pct', round(100.0 * (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(bio, '') <> '') / nullif(v_total, 0), 1)),
    jsonb_build_object('field', 'avatar',        'count',
      (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(avatar_url, '') <> ''),
      'pct', round(100.0 * (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(avatar_url, '') <> '') / nullif(v_total, 0), 1)),
    jsonb_build_object('field', 'publication',   'count',
      (select count(distinct user_id)::int from publications
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'),
      'pct', round(100.0 * (select count(distinct user_id)::int from publications
       where user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca') / nullif(v_total, 0), 1)),
    jsonb_build_object('field', 'orcid',         'count',
      (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(orcid, '') <> ''),
      'pct', round(100.0 * (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(orcid, '') <> '') / nullif(v_total, 0), 1)),
    jsonb_build_object('field', 'field_tags',    'count',
      (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(array_length(field_tags, 1), 0) > 0),
      'pct', round(100.0 * (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(array_length(field_tags, 1), 0) > 0) / nullif(v_total, 0), 1)),
    jsonb_build_object('field', 'work_history',  'count',
      (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and jsonb_array_length(coalesce(work_history, '[]'::jsonb)) > 0),
      'pct', round(100.0 * (select count(*)::int from profiles
       where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and jsonb_array_length(coalesce(work_history, '[]'::jsonb)) > 0) / nullif(v_total, 0), 1))
  );
end;
$$;

-- ─── 12. get_consent_rates ──────────────────────────────────────────────────
-- % of users with each consent / preference enabled.
create or replace function get_consent_rates()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total
  from profiles
  where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  return jsonb_build_object(
    'total', v_total,
    'email_notifications', jsonb_build_object(
      'count', (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(email_notifications, true) = true),
      'pct', round(100.0 * (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(email_notifications, true) = true) / nullif(v_total, 0), 1)
    ),
    'email_marketing', jsonb_build_object(
      'count', (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(email_marketing, false) = true),
      'pct', round(100.0 * (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and coalesce(email_marketing, false) = true) / nullif(v_total, 0), 1)
    ),
    'analytics_consent', jsonb_build_object(
      'count', (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and analytics_consent_at is not null),
      'pct', round(100.0 * (select count(*)::int from profiles
        where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca' and analytics_consent_at is not null) / nullif(v_total, 0), 1)
    )
  );
end;
$$;

-- ─── 13. get_hot_papers ─────────────────────────────────────────────────────
-- Papers discussed by ≥2 distinct users (admin view, no min-engagement gate).
create or replace function get_hot_papers(p_limit int default 20)
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.participants desc, t.posts desc), '[]'::jsonb)
    from (
      select
        p.paper_doi                                  as doi,
        max(p.paper_title)                           as title,
        max(p.paper_journal)                         as journal,
        count(distinct p.id)::int                    as posts,
        count(distinct p.user_id)::int               as participants,
        count(c.id)::int                             as total_comments
      from posts p
      left join comments c on c.post_id = p.id
      where p.post_type = 'paper'
        and p.is_hidden = false
        and p.is_admin_post = false
        and coalesce(p.paper_doi, '') <> ''
        and coalesce(p.paper_title, '') <> ''
        and p.user_id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
      group by p.paper_doi
      having count(distinct p.user_id) >= 2
      order by count(distinct p.user_id) desc, count(distinct p.id) desc
      limit p_limit
    ) t
  );
end;
$$;

-- ─── 14. get_power_posters ──────────────────────────────────────────────────
-- Top posters in the selected window.
create or replace function get_power_posters(p_days int default 30, p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  v_cutoff := case when p_days is null then '1970-01-01'::timestamptz
                   else now() - (p_days || ' days')::interval end;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.post_count desc), '[]'::jsonb)
    from (
      select
        p.id                          as user_id,
        p.name,
        p.avatar_color,
        p.avatar_url,
        p.work_mode,
        coalesce(p.lumens_current_period, 0) as lumens,
        compute_tier(coalesce(p.lumens_current_period, 0)) as tier,
        count(po.id)::int             as post_count
      from profiles p
      join posts po on po.user_id = p.id
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and po.is_hidden = false
        and po.is_admin_post = false
        and po.post_type not in ('milestone', 'admin_nudge')
        and po.created_at >= v_cutoff
      group by p.id
      order by post_count desc
      limit p_limit
    ) t
  );
end;
$$;

-- ─── 15. get_power_commenters ───────────────────────────────────────────────
-- Top substantive (>50 char) commenters in the selected window.
create or replace function get_power_commenters(p_days int default 30, p_limit int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  v_cutoff := case when p_days is null then '1970-01-01'::timestamptz
                   else now() - (p_days || ' days')::interval end;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.comment_count desc), '[]'::jsonb)
    from (
      select
        p.id                          as user_id,
        p.name,
        p.avatar_color,
        p.avatar_url,
        p.work_mode,
        coalesce(p.lumens_current_period, 0) as lumens,
        compute_tier(coalesce(p.lumens_current_period, 0)) as tier,
        count(c.id)::int              as comment_count
      from profiles p
      join comments c on c.user_id = p.id
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and length(c.content) > 50
        and c.created_at >= v_cutoff
      group by p.id
      order by comment_count desc
      limit p_limit
    ) t
  );
end;
$$;

-- ─── 16. get_at_risk_users ──────────────────────────────────────────────────
-- ≥3 actions total, silent 7+ days, signed up 14+ days ago.
create or replace function get_at_risk_users(p_limit int default 30)
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.days_silent desc), '[]'::jsonb)
    from (
      select
        p.id                          as user_id,
        p.name,
        p.avatar_color,
        p.avatar_url,
        p.work_mode,
        coalesce(p.lumens_current_period, 0) as lumens,
        compute_tier(coalesce(p.lumens_current_period, 0)) as tier,
        (select count(*) from posts where user_id = p.id)::int as total_posts,
        extract(day from now() - greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ))::int as days_silent
      from profiles p
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and p.created_at < now() - interval '14 days'
        and (
          (select count(*) from posts         where user_id = p.id) +
          (select count(*) from comments      where user_id = p.id) +
          (select count(*) from likes         where user_id = p.id)
        ) >= 3
        and greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) < now() - interval '7 days'
      order by days_silent desc nulls last
      limit p_limit
    ) t
  );
end;
$$;

-- ─── 17. get_quiet_champions ────────────────────────────────────────────────
-- 3+ followers but <3 posts. Credible users worth a personal nudge.
create or replace function get_quiet_champions(p_limit int default 30)
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.follower_count desc), '[]'::jsonb)
    from (
      select
        p.id                          as user_id,
        p.name,
        p.avatar_color,
        p.avatar_url,
        p.work_mode,
        (select count(*)::int from follows
          where target_type = 'user' and target_id = p.id::text) as follower_count,
        (select count(*)::int from posts where user_id = p.id) as post_count
      from profiles p
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and (select count(*) from follows
             where target_type = 'user' and target_id = p.id::text) >= 3
        and (select count(*) from posts where user_id = p.id) < 3
      order by follower_count desc
      limit p_limit
    ) t
  );
end;
$$;

-- ─── Grants ─────────────────────────────────────────────────────────────────

grant execute on function get_retention_cohorts()                        to authenticated;
grant execute on function get_weekly_signups()                           to authenticated;
grant execute on function get_daily_active_users()                       to authenticated;
grant execute on function get_signup_method_breakdown(int)               to authenticated;
grant execute on function get_work_mode_stats(int)                       to authenticated;
grant execute on function get_tier_distribution()                        to authenticated;
grant execute on function get_top_inviters(int)                          to authenticated;
grant execute on function get_feature_adoption()                         to authenticated;
grant execute on function get_content_performance(int)                   to authenticated;
grant execute on function get_lumens_histogram()                         to authenticated;
grant execute on function get_profile_completeness()                     to authenticated;
grant execute on function get_consent_rates()                            to authenticated;
grant execute on function get_hot_papers(int)                            to authenticated;
grant execute on function get_power_posters(int, int)                    to authenticated;
grant execute on function get_power_commenters(int, int)                 to authenticated;
grant execute on function get_at_risk_users(int)                         to authenticated;
grant execute on function get_quiet_champions(int)                       to authenticated;
