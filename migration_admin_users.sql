-- Admin notes on profiles (simple internal field, never shown to users)
alter table profiles
  add column if not exists admin_notes text;

-- RPC: get_admin_user_list
-- Returns all users with computed activity, stage, ghost segment
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

        -- Last active: max created_at across posts, comments, likes
        greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) as last_active,

        -- Counts
        (select count(*) from posts        where user_id = p.id)::int as posts_count,
        (select count(*) from group_members where user_id = p.id)::int as groups_count,

        -- Invite code used at signup
        coalesce(
          (select ic.code from invite_codes ic
           where ic.claimed_by = p.id limit 1),
          (select ic.code from invite_code_uses icu
           join invite_codes ic on ic.id = icu.code_id
           where icu.user_id = p.id limit 1)
        ) as invite_code_used,

        -- Activation stage (highest reached)
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

        -- Ghost segment
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
      -- Exclude the bot account
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
    ) t
  );
end;
$$;

-- RPC: get_user_activation_stages
-- Returns funnel counts for Overview dashboard
create or replace function get_user_activation_stages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total      int;
  v_credible   int;
  v_connected  int;
  v_active     int;
  v_visible    int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total from profiles
  where id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  select count(*) into v_credible from profiles p
  where (coalesce(p.onboarding_completed, false) = true
    or exists(select 1 from publications where user_id = p.id))
    and p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  select count(*) into v_connected from profiles p
  where (exists(select 1 from follows where follower_id = p.id)
    or exists(select 1 from group_members where user_id = p.id))
    and p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  select count(*) into v_active from profiles p
  where exists(select 1 from posts where user_id = p.id)
    and p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  select count(*) into v_visible from profiles p
  where exists(select 1 from posts where user_id = p.id)
    and p.profile_slug is not null
    and p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca';

  return jsonb_build_array(
    jsonb_build_object('stage', 'Identified',  'count', v_total),
    jsonb_build_object('stage', 'Credible',    'count', v_credible),
    jsonb_build_object('stage', 'Connected',   'count', v_connected),
    jsonb_build_object('stage', 'Active',      'count', v_active),
    jsonb_build_object('stage', 'Visible',     'count', v_visible)
  );
end;
$$;

-- RPC: get_ghost_users
create or replace function get_ghost_users()
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
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        p.id,
        p.name,
        p.avatar_color,
        p.created_at,
        case
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) = 0 then 'stuck'
          else 'almost'
        end as ghost_segment
      from profiles p
      where p.id != 'af56ef6f-635a-438b-8c8a-41cc84751bca'
        and (
          (select count(*) from posts         where user_id = p.id) +
          (select count(*) from comments      where user_id = p.id) +
          (select count(*) from likes         where user_id = p.id) +
          (select count(*) from follows       where follower_id = p.id) +
          (select count(*) from group_members where user_id = p.id)
        ) <= 2
        and greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id),
          p.created_at
        ) < now() - interval '5 days'
      order by p.created_at desc
    ) t
  );
end;
$$;

-- RPC: send_admin_nudge
-- Sends a DM + notification from the Luminary Team bot to each target user.
-- SECURITY DEFINER allows inserting messages with sender_id = bot UUID,
-- bypassing the normal RLS requirement that sender_id = auth.uid().
create or replace function send_admin_nudge(
  p_target_user_ids  uuid[],
  p_message          text,
  p_bot_user_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id  uuid;
  v_conv_id    uuid;
  v_uid_a      uuid;
  v_uid_b      uuid;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_message is null or trim(p_message) = '' then
    raise exception 'message cannot be empty';
  end if;

  foreach v_target_id in array p_target_user_ids loop
    -- Canonical conversation ID sort (matches startConversation() helper)
    if p_bot_user_id < v_target_id then
      v_uid_a := p_bot_user_id;
      v_uid_b := v_target_id;
    else
      v_uid_a := v_target_id;
      v_uid_b := p_bot_user_id;
    end if;

    -- Find or create conversation
    select id into v_conv_id
    from conversations
    where user_id_a = v_uid_a and user_id_b = v_uid_b
    limit 1;

    if v_conv_id is null then
      insert into conversations (user_id_a, user_id_b, last_message, last_message_at)
      values (v_uid_a, v_uid_b, p_message, now())
      returning id into v_conv_id;
    else
      update conversations
      set last_message = p_message, last_message_at = now()
      where id = v_conv_id;
    end if;

    -- Insert message from bot
    insert into messages (conversation_id, sender_id, content)
    values (v_conv_id, p_bot_user_id, p_message);

    -- Insert notification
    insert into notifications (user_id, actor_id, notif_type, target_type, target_id, read)
    values (v_target_id, p_bot_user_id, 'new_message', 'conversation', v_conv_id::text, false);

  end loop;

  return jsonb_build_object('sent', array_length(p_target_user_ids, 1));
end;
$$;

grant execute on function get_admin_user_list()                to authenticated;
grant execute on function get_user_activation_stages()         to authenticated;
grant execute on function get_ghost_users()                    to authenticated;
grant execute on function send_admin_nudge(uuid[], text, uuid) to authenticated;
