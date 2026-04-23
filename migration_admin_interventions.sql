-- Phase 6H: Admin Interventions
-- Run in Supabase SQL Editor

-- ── admin_config table ────────────────────────────────────────────────────────
create table if not exists admin_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  uuid references profiles(id)
);

alter table admin_config enable row level security;

-- Drop existing policies if any (from Phase 6D) and recreate cleanly
drop policy if exists "ac_select"           on admin_config;
drop policy if exists "ac_select_admin"     on admin_config;
drop policy if exists "ac_select_milestone" on admin_config;
drop policy if exists "ac_insert"           on admin_config;
drop policy if exists "ac_update"           on admin_config;

-- Admin can read all keys; regular users can read luminary_board + milestone_post_template
create policy "ac_select" on admin_config for select
  using (
    key in ('milestone_post_template', 'luminary_board')
    or (select is_admin from profiles where id = auth.uid())
  );

create policy "ac_insert" on admin_config for insert
  with check ((select is_admin from profiles where id = auth.uid()));

create policy "ac_update" on admin_config for update
  using ((select is_admin from profiles where id = auth.uid()));

-- ── Seed default config values ────────────────────────────────────────────────
insert into admin_config (key, value) values (
  'luminary_board',
  jsonb_build_object(
    'enabled',   true,
    'title',     'Welcome to Luminary',
    'message',   'Share your research. Connect with peers. Build something meaningful together.',
    'cta_label', null,
    'cta_url',   null
  )
) on conflict (key) do nothing;

insert into admin_config (key, value) values (
  'paper_of_week',
  jsonb_build_object(
    'mode',           'algorithm',
    'algorithm',      'most_discussed',
    'manual_post_id', null,
    'manual_doi',     null
  )
) on conflict (key) do nothing;

insert into admin_config (key, value) values (
  'milestone_post_template',
  jsonb_build_object(
    'heading',    'Your profile is complete! 🎉',
    'message',    'You''ve taken a big step. Your Luminary profile is now live and ready to be discovered by other researchers.',
    'cta1_label', 'View my profile →',
    'cta1_type',  'profile',
    'cta2_label', '🪪 Virtual business card',
    'cta2_type',  'card'
  )
) on conflict (key) do nothing;

-- ── RPCs ──────────────────────────────────────────────────────────────────────
create or replace function get_admin_config(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return (select value from admin_config where key = p_key);
end;
$$;

create or replace function set_admin_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  insert into admin_config (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update
    set value      = excluded.value,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

-- ── send_admin_post RPC ───────────────────────────────────────────────────────
create or replace function send_admin_post(
  p_mode             text,
  p_content          text,
  p_bot_user_id      uuid,
  p_target_user_ids  uuid[]  default null,
  p_group_id         uuid    default null,
  p_post_type        text    default 'text',
  p_paper_doi        text    default null,
  p_paper_title      text    default null,
  p_paper_journal    text    default null,
  p_paper_authors    text    default null,
  p_paper_abstract   text    default null,
  p_paper_year       int     default null,
  p_paper_citation   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id  uuid;
  v_post_id    uuid;
  v_sent       int := 0;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_content is null or trim(p_content) = '' then
    raise exception 'content cannot be empty';
  end if;

  if p_mode = 'broadcast' then
    insert into posts (
      user_id, post_type, content, visibility,
      is_admin_post,
      paper_doi, paper_title, paper_journal, paper_authors,
      paper_abstract, paper_year, paper_citation
    ) values (
      p_bot_user_id, p_post_type, p_content, 'everyone',
      true,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
      p_paper_abstract, p_paper_year, p_paper_citation
    )
    returning id into v_post_id;
    v_sent := 1;

  elsif p_mode = 'targeted' then
    foreach v_target_id in array p_target_user_ids loop
      insert into posts (
        user_id, target_user_id, post_type, content, visibility,
        is_admin_post,
        paper_doi, paper_title, paper_journal, paper_authors,
        paper_abstract, paper_year, paper_citation
      ) values (
        p_bot_user_id, v_target_id, p_post_type, p_content, 'everyone',
        true,
        p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
        p_paper_abstract, p_paper_year, p_paper_citation
      )
      returning id into v_post_id;

      insert into notifications (
        user_id, actor_id, notif_type, target_type, target_id, read
      ) values (
        v_target_id, p_bot_user_id, 'new_post', 'post',
        v_post_id::text, false
      );
      v_sent := v_sent + 1;
    end loop;

  elsif p_mode = 'group' then
    insert into group_posts (
      group_id, user_id, post_type, content,
      paper_doi, paper_title, paper_journal, paper_authors,
      paper_abstract, paper_year, paper_citation
    ) values (
      p_group_id, p_bot_user_id, p_post_type, p_content,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
      p_paper_abstract, p_paper_year, p_paper_citation
    )
    returning id into v_post_id;
    v_sent := 1;
  end if;

  return jsonb_build_object('sent', v_sent, 'post_id', v_post_id);
end;
$$;

-- ── New columns on posts ───────────────────────────────────────────────────────
alter table posts
  add column if not exists is_admin_post boolean default false;

alter table posts
  add column if not exists target_user_id uuid references profiles(id)
    on delete cascade;

create index if not exists idx_posts_admin
  on posts(is_admin_post) where is_admin_post = true;

create index if not exists idx_posts_target_user
  on posts(target_user_id) where target_user_id is not null;

grant execute on function get_admin_config(text)        to authenticated;
grant execute on function set_admin_config(text, jsonb) to authenticated;
grant execute on function send_admin_post(text, text, uuid, uuid[],
  uuid, text, text, text, text, text, text, int, text,
  text, text, text)                                     to authenticated;

-- ── Recreate posts_with_meta view ─────────────────────────────────────────────
-- DROP + CREATE so p.* picks up the new is_admin_post and target_user_id columns.
-- PostgreSQL captures the column list at view creation time; ALTER TABLE alone
-- does not refresh what SELECT * returns from an existing view.
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
  (select count(*)::int from likes    l   where l.post_id  = p.id)                                  as like_count,
  (select count(*)::int from comments c   where c.post_id  = p.id)                                  as comment_count,
  (select count(*)::int from reposts  r   where r.post_id  = p.id)                                  as repost_count,
  (select exists(select 1 from likes   l  where l.post_id  = p.id and l.user_id = auth.uid()))      as user_liked,
  (select exists(select 1 from reposts r  where r.post_id  = p.id and r.user_id = auth.uid()))      as user_reposted,
  (select count(*)::int from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending')  as report_count
from posts p
join profiles pr on pr.id = p.user_id;
