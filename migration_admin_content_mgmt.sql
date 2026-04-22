-- Post reports table
create table if not exists post_reports (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid references posts(id)       on delete cascade,
  group_post_id   uuid references group_posts(id) on delete cascade,
  reporter_id     uuid references profiles(id)    on delete cascade not null,
  reason          text not null,
  -- 'spam' | 'misinformation' | 'inappropriate' | 'off_topic' | 'other'
  note            text,
  status          text default 'pending',
  -- 'pending' | 'dismissed' | 'actioned'
  created_at      timestamptz default now(),
  -- Prevent duplicate reports from same user on same post
  unique(post_id, reporter_id),
  unique(group_post_id, reporter_id),
  -- Must reference either a post or a group_post, not both
  check (
    (post_id is not null and group_post_id is null) or
    (post_id is null and group_post_id is not null)
  )
);

alter table post_reports enable row level security;

create policy "pr_insert" on post_reports for insert
  with check (auth.uid() = reporter_id);

create policy "pr_select_own" on post_reports for select
  using (
    auth.uid() = reporter_id or
    (select is_admin from profiles where id = auth.uid())
  );

create policy "pr_update_admin" on post_reports for update
  using ((select is_admin from profiles where id = auth.uid()));

create index if not exists idx_pr_post_id
  on post_reports(post_id) where post_id is not null;
create index if not exists idx_pr_group_post_id
  on post_reports(group_post_id) where group_post_id is not null;
create index if not exists idx_pr_status
  on post_reports(status);

-- Featured and hidden flags on posts
alter table posts
  add column if not exists is_featured    boolean default false,
  add column if not exists featured_until timestamptz,
  add column if not exists is_hidden      boolean default false;

create index if not exists idx_posts_featured
  on posts(is_featured, featured_until)
  where is_featured = true;

-- RPC: get_admin_posts (paginated)
create or replace function get_admin_posts(
  p_limit   int  default 50,
  p_offset  int  default 0,
  p_search  text default null,
  p_type    text default null,
  p_featured boolean default null,
  p_hidden   boolean default null
)
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
    select jsonb_build_object(
      'total', count(*) over(),
      'posts', coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    )
    from (
      select
        p.id,
        p.content,
        p.post_type,
        p.visibility,
        p.created_at,
        p.is_featured,
        p.featured_until,
        p.is_hidden,
        p.paper_title,
        p.link_url,
        p.link_title,
        p.tags,
        -- Author info
        pr.name        as author_name,
        pr.avatar_color as author_avatar_color,
        pr.avatar_url   as author_avatar_url,
        pr.work_mode    as author_work_mode,
        -- Report count
        (
          select count(*)::int
          from post_reports
          where post_id = p.id and status = 'pending'
        ) as report_count
      from posts p
      join profiles pr on pr.id = p.user_id
      where p.post_type not in ('milestone', 'admin_nudge')
        and (p_search is null or
          p.content ilike '%' || p_search || '%' or
          p.paper_title ilike '%' || p_search || '%' or
          pr.name ilike '%' || p_search || '%'
        )
        and (p_type    is null or p.post_type   = p_type)
        and (p_featured is null or p.is_featured = p_featured)
        and (p_hidden   is null or p.is_hidden   = p_hidden)
      order by
        -- Reported posts first
        (select count(*) from post_reports
         where post_id = p.id and status = 'pending') desc,
        p.created_at desc
      limit  p_limit
      offset p_offset
    ) t
  );
end;
$$;

-- RPC: get_content_health
-- Returns group and project health in one call
create or replace function get_content_health()
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
    'groups', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.last_post_at desc nulls last), '[]'::jsonb)
      from (
        select
          g.id,
          g.name,
          g.is_public,
          (
            select count(*)::int from group_members
            where group_id = g.id and role in ('admin', 'member')
          ) as member_count,
          (
            select count(*)::int from group_posts
            where group_id = g.id
              and created_at >= now() - interval '7 days'
          ) as posts_this_week,
          (
            select max(created_at) from group_posts
            where group_id = g.id
          ) as last_post_at,
          case
            when (
              select max(created_at) from group_posts
              where group_id = g.id
            ) >= now() - interval '7 days' then 'active'
            when (
              select max(created_at) from group_posts
              where group_id = g.id
            ) >= now() - interval '14 days' then 'quiet'
            else 'dead'
          end as health
        from groups g
      ) t
    ),
    'projects', (
      select coalesce(jsonb_agg(row_to_json(t) order by t.last_post_at desc nulls last), '[]'::jsonb)
      from (
        select
          pj.id,
          pj.name,
          pj.status,
          pj.icon,
          pj.cover_color,
          (
            select count(*)::int from project_members
            where project_id = pj.id
          ) as member_count,
          (
            select count(*)::int from project_posts
            where project_id = pj.id
              and created_at >= now() - interval '7 days'
          ) as posts_this_week,
          (
            select max(created_at) from project_posts
            where project_id = pj.id
          ) as last_post_at,
          case
            when (
              select max(created_at) from project_posts
              where project_id = pj.id
            ) >= now() - interval '7 days' then 'active'
            when (
              select max(created_at) from project_posts
              where project_id = pj.id
            ) >= now() - interval '14 days' then 'quiet'
            else 'dead'
          end as health
        from projects pj
        where pj.status = 'active'
      ) t
    )
  );
end;
$$;

-- RPC: get_moderation_queue
create or replace function get_moderation_queue(
  p_status text default 'pending'
)
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
    select coalesce(jsonb_agg(row_to_json(t) order by t.report_count desc, t.latest_report desc), '[]'::jsonb)
    from (
      -- Public posts
      select
        'post'          as source,
        p.id            as post_id,
        null::uuid      as group_post_id,
        p.content,
        p.post_type,
        p.created_at    as post_created_at,
        p.is_hidden,
        pa.name         as author_name,
        pa.avatar_color as author_avatar_color,
        count(pr.id)::int     as report_count,
        max(pr.created_at)    as latest_report,
        jsonb_agg(jsonb_build_object(
          'reporter',   rep.name,
          'reason',     pr.reason,
          'note',       pr.note,
          'created_at', pr.created_at
        ) order by pr.created_at desc) as reports
      from post_reports pr
      join posts p         on p.id  = pr.post_id
      join profiles pa     on pa.id = p.user_id
      join profiles rep    on rep.id = pr.reporter_id
      where pr.post_id is not null
        and pr.status = p_status
      group by p.id, p.content, p.post_type, p.created_at,
               p.is_hidden, pa.name, pa.avatar_color

      union all

      -- Group posts
      select
        'group_post'     as source,
        null::uuid       as post_id,
        gp.id            as group_post_id,
        gp.content,
        gp.post_type,
        gp.created_at    as post_created_at,
        false            as is_hidden,
        pa.name          as author_name,
        pa.avatar_color  as author_avatar_color,
        count(pr.id)::int      as report_count,
        max(pr.created_at)     as latest_report,
        jsonb_agg(jsonb_build_object(
          'reporter',   rep.name,
          'reason',     pr.reason,
          'note',       pr.note,
          'created_at', pr.created_at
        ) order by pr.created_at desc) as reports
      from post_reports pr
      join group_posts gp  on gp.id = pr.group_post_id
      join profiles pa     on pa.id = gp.user_id
      join profiles rep    on rep.id = pr.reporter_id
      where pr.group_post_id is not null
        and pr.status = p_status
      group by gp.id, gp.content, gp.post_type, gp.created_at,
               pa.name, pa.avatar_color
    ) t
  );
end;
$$;

grant execute on function get_admin_posts(int, int, text, text, boolean, boolean) to authenticated;
grant execute on function get_content_health()                                     to authenticated;
grant execute on function get_moderation_queue(text)                               to authenticated;

-- ─── Recreate posts_with_meta view ───────────────────────────────────────────
-- Run this AFTER the above migration so post_reports table exists for report_count.
-- This adds is_featured, featured_until, is_hidden (via p.*) and report_count.
drop view if exists posts_with_meta;
create view posts_with_meta as
select
  p.*,
  pr.name              as author_name,
  pr.title             as author_title,
  pr.institution       as author_institution,
  pr.avatar_color      as author_avatar,
  pr.avatar_url        as author_avatar_url,
  pr.identity_tier1    as author_identity_tier1,
  pr.identity_tier2    as author_identity_tier2,
  pr.work_mode         as author_work_mode,
  pr.profile_slug      as author_slug,
  (select count(*)::int from likes    l  where l.post_id  = p.id)                                            as like_count,
  (select count(*)::int from comments c  where c.post_id  = p.id)                                            as comment_count,
  (select count(*)::int from reposts  r  where r.post_id  = p.id)                                            as repost_count,
  (select exists(select 1 from likes   l  where l.post_id = p.id and l.user_id  = auth.uid()))               as user_liked,
  (select exists(select 1 from reposts r  where r.post_id = p.id and r.user_id  = auth.uid()))               as user_reposted,
  (select count(*)::int from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending')           as report_count
from posts p
join profiles pr on pr.id = p.user_id;
