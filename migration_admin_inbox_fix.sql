-- RPC: get_bot_conversations
-- Returns all conversations where the bot is a participant.
-- Needed because RLS on conversations restricts reads to auth.uid() participants.
create or replace function get_bot_conversations(p_bot_user_id uuid)
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
    select coalesce(
      jsonb_agg(row_to_json(c) order by c.last_message_at desc nulls last),
      '[]'::jsonb
    )
    from conversations c
    where c.user_id_a = p_bot_user_id or c.user_id_b = p_bot_user_id
  );
end;
$$;

-- RPC: get_bot_conversation_messages
-- Returns messages for a bot conversation.
-- Needed because RLS on messages restricts reads to conversation participants.
create or replace function get_bot_conversation_messages(
  p_conversation_id uuid,
  p_bot_user_id     uuid
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

  if not exists (
    select 1 from conversations
    where id = p_conversation_id
      and (user_id_a = p_bot_user_id or user_id_b = p_bot_user_id)
  ) then
    raise exception 'conversation not found';
  end if;

  return (
    select coalesce(
      jsonb_agg(row_to_json(m) order by m.created_at asc),
      '[]'::jsonb
    )
    from messages m
    where m.conversation_id = p_conversation_id
  );
end;
$$;

grant execute on function get_bot_conversations(uuid)                     to authenticated;
grant execute on function get_bot_conversation_messages(uuid, uuid)       to authenticated;
