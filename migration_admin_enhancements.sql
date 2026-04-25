-- Phase 7B admin enhancements:
--   1) get_admin_user_list  → adds invite_codes_remaining
--   2) get_admin_posts      → adds participant_count, like_count, comment_count, is_deep_dive

-- ─── 1. get_admin_user_list ───────────────────────────────────────────────────
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

        greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) as last_active,

        (select count(*) from posts        where user_id = p.id)::int as posts_count,
        (select count(*) from group_members where user_id = p.id)::int as groups_count,

        -- Active unclaimed personal invite codes the user can still hand out
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
        end as ghost_segment

      from profiles p
      where p.id != (
        select id from profiles where name = 'Luminary Team' limit 1
      )
    ) t
  );
end;
$$;

-- ─── 2. get_admin_posts ───────────────────────────────────────────────────────
-- Adds participant_count (distinct commenters), like_count, comment_count,
-- is_deep_dive so the admin Posts tab can sort and badge them.
create or replace function get_admin_posts(
  p_limit    int  default 50,
  p_offset   int  default 0,
  p_search   text default null,
  p_type     text default null,
  p_featured boolean default null,
  p_hidden   boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_posts jsonb;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  with filtered as (
    select p.*
    from posts p
    where (p_search   is null or p.content ilike '%'||p_search||'%' or p.paper_title ilike '%'||p_search||'%')
      and (p_type     is null or p.post_type = p_type)
      and (p_featured is null or p.is_featured = p_featured)
      and (p_hidden   is null or p.is_hidden  = p_hidden)
  )
  select count(*) into v_total from filtered;

  with filtered as (
    select p.*
    from posts p
    where (p_search   is null or p.content ilike '%'||p_search||'%' or p.paper_title ilike '%'||p_search||'%')
      and (p_type     is null or p.post_type = p_type)
      and (p_featured is null or p.is_featured = p_featured)
      and (p_hidden   is null or p.is_hidden  = p_hidden)
    order by p.created_at desc
    limit p_limit offset p_offset
  )
  select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    into v_posts
  from (
    select
      f.id,
      f.content,
      f.post_type,
      f.paper_title,
      f.link_title,
      f.is_featured,
      f.is_hidden,
      f.is_deep_dive,
      f.created_at,
      pr.name         as author_name,
      pr.avatar_color as author_avatar_color,
      pr.avatar_url   as author_avatar_url,
      (select count(*)::int          from likes    l where l.post_id = f.id) as like_count,
      (select count(*)::int          from comments c where c.post_id = f.id) as comment_count,
      (select count(distinct user_id)::int from comments c where c.post_id = f.id) as participant_count,
      (
        select count(*)::int from post_reports rp
        where rp.post_id = f.id and rp.status = 'pending'
      ) as report_count
    from filtered f
    left join profiles pr on pr.id = f.user_id
  ) r;

  return jsonb_build_object('total', v_total, 'posts', v_posts);
end;
$$;
