-- Extend invite_codes with new fields
alter table invite_codes
  add column if not exists label       text,
  add column if not exists max_uses    integer default 1,
  add column if not exists notes       text,
  add column if not exists expires_at  timestamptz,
  add column if not exists is_multi_use boolean default false,
  add column if not exists uses_count  integer default 0;

-- Backfill: personal codes already claimed count as 1 use
update invite_codes
set uses_count = 1
where claimed_by is not null and is_multi_use = false;

-- New table: tracks every individual use of a multi-use event code
create table if not exists invite_code_uses (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid references invite_codes(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  claimed_at  timestamptz default now(),
  unique(code_id, user_id)
);

alter table invite_code_uses enable row level security;

-- User can record their own use; admin can read all
create policy "icu_insert" on invite_code_uses for insert
  with check (auth.uid() = user_id);

create policy "icu_select" on invite_code_uses for select
  using (
    auth.uid() = user_id or
    (select is_admin from profiles where id = auth.uid())
  );

create index if not exists idx_icu_code_id
  on invite_code_uses(code_id);
create index if not exists idx_icu_user_id
  on invite_code_uses(user_id);

-- RPC: get_invite_codes_with_stats
-- Returns all invite codes with computed status and creator name
create or replace function get_invite_codes_with_stats()
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
        ic.id,
        ic.code,
        ic.label,
        ic.batch_label,
        ic.is_multi_use,
        ic.max_uses,
        ic.uses_count,
        ic.expires_at,
        ic.locked_at,
        ic.created_at,
        ic.notes,
        ic.claimed_by,
        ic.claimed_at,
        case
          when ic.locked_at is not null then 'locked'
          when ic.expires_at is not null and ic.expires_at < now() then 'expired'
          when ic.is_multi_use
            and ic.max_uses is not null
            and ic.uses_count >= ic.max_uses then 'exhausted'
          when not ic.is_multi_use
            and ic.claimed_by is not null then 'exhausted'
          else 'active'
        end as status,
        p.name as created_by_name
      from invite_codes ic
      left join profiles p on p.id = ic.created_by
    ) t
  );
end;
$$;

-- RPC: get_invite_tree (replaces Phase 6A stub with real implementation)
-- Takes a code string, returns signups + conversion metrics + level-2 invitees
create or replace function get_invite_tree(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row  invite_codes;
  v_signups   jsonb;
  v_summary   jsonb;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select * into v_code_row from invite_codes where code = p_code;
  if not found then
    return null;
  end if;

  -- Build signup list depending on code type
  if v_code_row.is_multi_use then
    -- Event code: get users from invite_code_uses
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',          p.id,
        'name',             p.name,
        'avatar_color',     p.avatar_color,
        'joined_at',        icu.claimed_at,
        'completed_profile', coalesce(p.onboarding_completed, false),
        'made_first_post',  exists(
          select 1 from posts where user_id = p.id limit 1
        ),
        'active_7d',        exists(
          select 1 from posts
          where user_id = p.id
            and created_at >= icu.claimed_at
            and created_at <  icu.claimed_at + interval '7 days'
          limit 1
        ),
        'invitees', (
          -- Level 2: codes this user created + who claimed them
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'user_id',           p2.id,
              'name',              p2.name,
              'avatar_color',      p2.avatar_color,
              'joined_at',         coalesce(ic2.claimed_at, icu2.claimed_at),
              'completed_profile', coalesce(p2.onboarding_completed, false),
              'made_first_post',   exists(
                select 1 from posts where user_id = p2.id limit 1
              ),
              'active_7d',         exists(
                select 1 from posts
                where user_id = p2.id
                  and created_at >= coalesce(ic2.claimed_at, icu2.claimed_at)
                  and created_at <  coalesce(ic2.claimed_at, icu2.claimed_at) + interval '7 days'
                limit 1
              )
            )
          ), '[]'::jsonb)
          from invite_codes ic2
          left join profiles p2         on p2.id  = ic2.claimed_by
          left join invite_code_uses icu2 on icu2.code_id = ic2.id
          where ic2.created_by = p.id
            and (ic2.claimed_by is not null or icu2.user_id is not null)
        )
      )
    ), '[]'::jsonb) into v_signups
    from invite_code_uses icu
    join profiles p on p.id = icu.user_id
    where icu.code_id = v_code_row.id;

  else
    -- Personal code: get from claimed_by
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',          p.id,
        'name',             p.name,
        'avatar_color',     p.avatar_color,
        'joined_at',        ic.claimed_at,
        'completed_profile', coalesce(p.onboarding_completed, false),
        'made_first_post',  exists(
          select 1 from posts where user_id = p.id limit 1
        ),
        'active_7d',        exists(
          select 1 from posts
          where user_id = p.id
            and created_at >= ic.claimed_at
            and created_at <  ic.claimed_at + interval '7 days'
          limit 1
        ),
        'invitees', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'user_id',           p2.id,
              'name',              p2.name,
              'avatar_color',      p2.avatar_color,
              'joined_at',         coalesce(ic2.claimed_at, icu2.claimed_at),
              'completed_profile', coalesce(p2.onboarding_completed, false),
              'made_first_post',   exists(
                select 1 from posts where user_id = p2.id limit 1
              ),
              'active_7d',         exists(
                select 1 from posts
                where user_id = p2.id
                  and created_at >= coalesce(ic2.claimed_at, icu2.claimed_at)
                  and created_at <  coalesce(ic2.claimed_at, icu2.claimed_at) + interval '7 days'
                limit 1
              )
            )
          ), '[]'::jsonb)
          from invite_codes ic2
          left join profiles p2           on p2.id  = ic2.claimed_by
          left join invite_code_uses icu2 on icu2.code_id = ic2.id
          where ic2.created_by = p.id
            and (ic2.claimed_by is not null or icu2.user_id is not null)
        )
      )
    ), '[]'::jsonb) into v_signups
    from invite_codes ic
    join profiles p on p.id = ic.claimed_by
    where ic.code = p_code;
  end if;

  -- Compute summary metrics across all signups
  select jsonb_build_object(
    'total',             jsonb_array_length(coalesce(v_signups, '[]'::jsonb)),
    'pct_profile',       case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'completed_profile')::boolean) /
                           jsonb_array_length(v_signups)) end,
    'pct_first_post',    case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'made_first_post')::boolean) /
                           jsonb_array_length(v_signups)) end,
    'pct_active_7d',     case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'active_7d')::boolean) /
                           jsonb_array_length(v_signups)) end
  ) into v_summary;

  return jsonb_build_object(
    'code',         v_code_row.code,
    'label',        v_code_row.label,
    'is_multi_use', v_code_row.is_multi_use,
    'uses_count',   v_code_row.uses_count,
    'max_uses',     v_code_row.max_uses,
    'summary',      v_summary,
    'signups',      coalesce(v_signups, '[]'::jsonb)
  );
end;
$$;

grant execute on function get_invite_codes_with_stats() to authenticated;
grant execute on function get_invite_tree(text)         to authenticated;
