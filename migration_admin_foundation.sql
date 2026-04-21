-- Add admin flag
alter table profiles
  add column if not exists is_admin boolean default false;

-- RPC: get_platform_stats (stub — real logic in Overview section)
create or replace function get_platform_stats()
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
    'users',          0,
    'posts',          0,
    'groups',         0,
    'projects',       0,
    'users_today',    0,
    'posts_today',    0,
    'groups_today',   0,
    'projects_today', 0,
    'admins_count',   0
  );
end;
$$;

-- RPC: get_user_activation_stages (stub — real logic in Users section)
create or replace function get_user_activation_stages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return '[]'::jsonb;
end;
$$;

-- RPC: get_ghost_users (stub — real logic in Users section)
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
  return '[]'::jsonb;
end;
$$;

-- RPC: get_invite_tree (stub — real logic in Invites section)
create or replace function get_invite_tree(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return '[]'::jsonb;
end;
$$;

-- Grant execute (functions guard internally via is_admin check)
grant execute on function get_platform_stats()         to authenticated;
grant execute on function get_user_activation_stages() to authenticated;
grant execute on function get_ghost_users()            to authenticated;
grant execute on function get_invite_tree(text)        to authenticated;
