-- ── Clean up all existing send_admin_post overloads ─────────────────────────
-- (the old 16-param version with link columns and the 13-param version both
--  need to be dropped before creating the new canonical 15-param version)

drop function if exists public.send_admin_post(text,text,uuid,uuid[],uuid,text,text,text,text,text,text,integer,text);
drop function if exists public.send_admin_post(text,text,uuid,uuid[],uuid,text,text,text,text,text,text,integer,text,text,text,text);

-- ── bg_color column on posts ─────────────────────────────────────────────────

alter table posts
  add column if not exists bg_color text;

-- ── Canonical send_admin_post (15 params) ────────────────────────────────────

create function send_admin_post(
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
  p_paper_citation   text    default null,
  p_is_deep_dive     boolean default false,
  p_bg_color         text    default null
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
      is_admin_post, is_deep_dive, bg_color,
      paper_doi, paper_title, paper_journal, paper_authors,
      paper_abstract, paper_year, paper_citation
    ) values (
      p_bot_user_id, p_post_type, p_content, 'everyone',
      true, coalesce(p_is_deep_dive, false), p_bg_color,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
      p_paper_abstract, p_paper_year, p_paper_citation
    )
    returning id into v_post_id;
    v_sent := 1;

  elsif p_mode = 'targeted' then
    foreach v_target_id in array p_target_user_ids loop
      insert into posts (
        user_id, target_user_id, post_type, content, visibility,
        is_admin_post, is_deep_dive, bg_color,
        paper_doi, paper_title, paper_journal, paper_authors,
        paper_abstract, paper_year, paper_citation
      ) values (
        p_bot_user_id, v_target_id, p_post_type, p_content, 'everyone',
        true, coalesce(p_is_deep_dive, false), p_bg_color,
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
