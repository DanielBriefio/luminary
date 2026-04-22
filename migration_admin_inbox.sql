-- RPC: send_bot_message
-- Sends a reply from the Luminary Team bot in an existing conversation.
-- SECURITY DEFINER allows inserting with sender_id = bot UUID,
-- bypassing the normal RLS requirement that sender_id = auth.uid().
create or replace function send_bot_message(
  p_conversation_id  uuid,
  p_message          text,
  p_bot_user_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_user_id uuid;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_message is null or trim(p_message) = '' then
    raise exception 'message cannot be empty';
  end if;

  -- Resolve the other participant in this conversation
  select case
    when user_id_a = p_bot_user_id then user_id_b
    else user_id_a
  end into v_other_user_id
  from conversations
  where id = p_conversation_id;

  if v_other_user_id is null then
    raise exception 'conversation not found';
  end if;

  -- Insert message from bot
  insert into messages (conversation_id, sender_id, content)
  values (p_conversation_id, p_bot_user_id, p_message);

  -- Update conversation preview
  update conversations
  set last_message = p_message, last_message_at = now()
  where id = p_conversation_id;

  -- Notify the other user
  insert into notifications (user_id, actor_id, notif_type, target_type, target_id, read)
  values (v_other_user_id, p_bot_user_id, 'new_message', 'conversation', p_conversation_id::text, false);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function send_bot_message(uuid, text, uuid) to authenticated;
