-- Allow non-admin users to read paper_of_week config
-- (already readable: luminary_board, milestone_post_template)

-- 1. Widen the RLS select policy
drop policy if exists "ac_select" on admin_config;
create policy "ac_select" on admin_config for select
  using (
    key in ('milestone_post_template', 'luminary_board', 'paper_of_week')
    or (select is_admin from profiles where id = auth.uid())
  );

-- 2. Fix get_admin_config to allow non-admins to read public keys
create or replace function get_admin_config(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_public_keys text[] := array['luminary_board', 'milestone_post_template', 'paper_of_week'];
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not v_is_admin and not (p_key = any(v_public_keys)) then
    raise exception 'not authorized';
  end if;
  return (select value from admin_config where key = p_key);
end;
$$;
