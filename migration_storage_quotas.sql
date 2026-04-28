-- Per-user storage quota
--
-- Adds:
--   * admin_config.storage_quota_mb seed row (default 50 MB)
--   * get_storage_quota_mb() RPC any authenticated user can read
--     (set_admin_config already exists for admins to edit it)
--
-- Idempotent.

-- ─── seed default quota ─────────────────────────────────────────────────────
insert into admin_config (key, value)
values ('storage_quota_mb', to_jsonb(50))
on conflict (key) do nothing;

-- ─── public read RPC ────────────────────────────────────────────────────────
create or replace function get_storage_quota_mb()
returns int
language sql security definer
set search_path = public as $$
  select coalesce(
    (select (value)::int from admin_config where key = 'storage_quota_mb'),
    50
  );
$$;

grant execute on function get_storage_quota_mb() to authenticated;
