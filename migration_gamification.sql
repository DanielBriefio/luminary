-- Phase 8 (minimum-viable subset): Lumens points + tiers
--
-- Adds:
--   * lumens_current_period / lumens_lifetime / current_period_started /
--     previous_period_lumens / is_founding_member columns on profiles
--   * lumen_transactions audit table + RLS (own + admin select; insert via
--     SECURITY DEFINER RPC only)
--   * award_lumens RPC (the only writer; bot account excluded)
--   * compute_tier helper
--   * get_lumen_history RPC for the transparency page
--   * Founding-member cutoff seed in admin_config + apply_founding_member_status
--     trigger that flips is_founding_member when onboarding_completed crosses
--     to true before the cutoff date.
--
-- The legacy `xp` and `level` columns on profiles are intentionally left in
-- place but unused — Lumens is the new system.

-- ─── Profile columns ─────────────────────────────────────────────────────────

alter table profiles
  add column if not exists lumens_current_period   integer default 0,
  add column if not exists lumens_lifetime         integer default 0,
  add column if not exists current_period_started  timestamptz default now(),
  add column if not exists previous_period_lumens  integer default 0,
  add column if not exists is_founding_member      boolean default false;

-- ─── lumen_transactions ──────────────────────────────────────────────────────

create table if not exists lumen_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  amount       integer not null,
  reason       text not null,
  category     text not null check (category in ('creation', 'engagement', 'recognition')),
  meta         jsonb default '{}',
  created_at   timestamptz default now()
);

alter table lumen_transactions enable row level security;

drop policy if exists "lt_select_own"   on lumen_transactions;
drop policy if exists "lt_select_admin" on lumen_transactions;

create policy "lt_select_own" on lumen_transactions for select
  using (auth.uid() = user_id);

create policy "lt_select_admin" on lumen_transactions for select
  using ((select is_admin from profiles where id = auth.uid()));

-- No INSERT policy — only the SECURITY DEFINER award_lumens RPC writes here.

create index if not exists idx_lt_user_created
  on lumen_transactions(user_id, created_at desc);

create index if not exists idx_lt_reason
  on lumen_transactions(reason);

-- ─── Founding-member cutoff seed ─────────────────────────────────────────────

insert into admin_config (key, value) values (
  'founding_member_cutoff',
  jsonb_build_object('cutoff_date', (now() + interval '90 days')::text)
) on conflict (key) do nothing;

-- ─── award_lumens RPC ────────────────────────────────────────────────────────

create or replace function award_lumens(
  p_user_id  uuid,
  p_amount   integer,
  p_reason   text,
  p_category text,
  p_meta     jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip the Luminary Team bot
  if p_user_id = (select id from profiles where name = 'Luminary Team' limit 1) then
    return;
  end if;

  insert into lumen_transactions (user_id, amount, reason, category, meta)
  values (p_user_id, p_amount, p_reason, p_category, p_meta);

  update profiles
  set
    lumens_current_period = lumens_current_period + p_amount,
    lumens_lifetime       = lumens_lifetime       + p_amount
  where id = p_user_id;
end;
$$;

grant execute on function award_lumens(uuid, integer, text, text, jsonb) to authenticated;

-- ─── compute_tier ────────────────────────────────────────────────────────────

create or replace function compute_tier(p_lumens integer)
returns text
language sql
immutable
as $$
  select case
    when p_lumens >= 5000 then 'luminary'
    when p_lumens >= 2000 then 'beacon'
    when p_lumens >= 500  then 'pioneer'
    else 'catalyst'
  end;
$$;

-- ─── get_lumen_history RPC ───────────────────────────────────────────────────

create or replace function get_lumen_history(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return jsonb_build_object(
    'current_period_lumens',  (select lumens_current_period  from profiles where id = auth.uid()),
    'lifetime_lumens',        (select lumens_lifetime        from profiles where id = auth.uid()),
    'current_period_started', (select current_period_started from profiles where id = auth.uid()),
    'previous_period_lumens', (select previous_period_lumens from profiles where id = auth.uid()),
    'tier',                   (select compute_tier(lumens_current_period) from profiles where id = auth.uid()),
    'is_founding_member',     (select is_founding_member     from profiles where id = auth.uid()),
    'transactions', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id',         id,
          'amount',     amount,
          'reason',     reason,
          'category',   category,
          'meta',       meta,
          'created_at', created_at
        ) order by created_at desc)
        from (
          select * from lumen_transactions
          where user_id = auth.uid()
          order by created_at desc
          limit p_limit
        ) t
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function get_lumen_history(integer) to authenticated;

-- ─── apply_founding_member_status trigger ───────────────────────────────────

create or replace function apply_founding_member_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  -- Only flip on the transition to onboarding_completed = true
  if new.onboarding_completed = true and
     (old.onboarding_completed is null or old.onboarding_completed = false) then

    select (value->>'cutoff_date')::timestamptz
    into v_cutoff
    from admin_config
    where key = 'founding_member_cutoff';

    if v_cutoff is not null and now() <= v_cutoff then
      new.is_founding_member := true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_founding_member on profiles;
create trigger trg_apply_founding_member
  before update on profiles
  for each row
  execute function apply_founding_member_status();

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Any user already onboarded before the cutoff is marked retroactively.

update profiles
set is_founding_member = true
where onboarding_completed = true
  and is_founding_member  = false
  and created_at <= (
    select (value->>'cutoff_date')::timestamptz
    from admin_config
    where key = 'founding_member_cutoff'
  );
