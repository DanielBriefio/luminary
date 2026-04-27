-- Fix for migration_account_soft_delete.sql:
-- the notifications table column is `notif_type`, not `type`. Re-create
-- delete_own_account() with the correct column name. Idempotent.

create or replace function delete_own_account()
returns timestamptz
language plpgsql security definer as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_for timestamptz;
begin
  if v_user_id is null then
    raise exception 'auth required';
  end if;

  select deletion_scheduled_at into v_scheduled_for
    from profiles where id = v_user_id;

  if v_scheduled_for is null then
    v_scheduled_for := now();
    update profiles
       set deletion_scheduled_at = v_scheduled_for
     where id = v_user_id;

    insert into notifications (user_id, actor_id, notif_type, target_id, meta)
    values (
      v_user_id, v_user_id,
      'account_deletion_scheduled',
      v_user_id,
      jsonb_build_object(
        'scheduled_for', v_scheduled_for,
        'purge_at',      v_scheduled_for + interval '30 days'
      )
    );
  end if;

  return v_scheduled_for;
end;
$$;

grant execute on function delete_own_account() to authenticated;
