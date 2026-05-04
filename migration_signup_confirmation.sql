-- Pre-confirmation signup intent persistence.
--
-- With Supabase Auth's "Confirm email" gate enabled, signUp() returns
-- a userId but no session. The post-signup writes (profile fields,
-- consents, invite-code claim, ORCID publications, inviter
-- notification, generate_user_invites) all need a session — they're
-- either RLS-protected or call SECURITY DEFINER RPCs that gate on
-- auth.uid().
--
-- This migration wires the "stash → confirm → apply" pattern:
--
--   stash_signup_intent(p_email, p_data)  — runs as anon during the
--     signup form submit. Snapshots ORCID data (no need to keep
--     orcid_pending alive after signup), invite-code reference,
--     consents. Upserts on email so a re-attempted signup overwrites.
--
--   apply_signup_intent()                — runs once on first
--     authenticated session, after the user clicks the confirmation
--     link. SECURITY DEFINER so it can mutate profiles / publications
--     / invite_codes / notifications regardless of RLS. Idempotent
--     (no-op if applied_at is already set).
--
--   cleanup_expired_signup_intents()     — pg_cron-callable janitor.
--
-- The table is locked down — all writes go through the two RPCs above.
-- Apply, cleanup are gated to authenticated; stash is open to anon
-- because that's the only way to capture intent before the user has
-- a session.

begin;

-- 1. Table ────────────────────────────────────────────────────────────────

create table if not exists signup_pending (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  user_id             uuid,                            -- set on apply
  name                text,
  signup_method       text not null check (signup_method in ('invite','orcid')),
  card_email          text,
  email_notifications boolean default true,
  email_marketing     boolean default false,
  marketing_consent_at timestamptz,
  analytics_consent_at timestamptz,
  terms_accepted_at   timestamptz,
  privacy_accepted_at timestamptz,

  -- Invite path
  invite_code         text,                            -- raw code string (uppercased on apply)

  -- ORCID path: snapshot at stash time so orcid_pending lifecycle is
  -- unaffected. orcid_data shape: { orcid_id, bio, institution, title,
  -- work_history, education, publications } — see AuthScreen stash logic.
  orcid_data          jsonb,

  applied_at          timestamptz,
  expires_at          timestamptz not null default (now() + interval '24 hours'),
  created_at          timestamptz not null default now(),

  unique (email)
);

create index if not exists signup_pending_user_idx
  on signup_pending(user_id) where user_id is not null;

create index if not exists signup_pending_expires_idx
  on signup_pending(expires_at) where applied_at is null;

-- Strict RLS: no client-side access at all. All reads/writes go via
-- the SECURITY DEFINER RPCs below. Belt-and-braces — even if RLS were
-- forgotten, the revoke calls still keep clients out.
alter table signup_pending enable row level security;
revoke all on signup_pending from public, anon, authenticated;

-- 2. stash_signup_intent (anon-callable) ──────────────────────────────────

create or replace function stash_signup_intent(p_email text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_method text := lower(coalesce(p_data->>'signup_method', ''));
  v_email  text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if v_method not in ('invite','orcid') then
    raise exception 'invalid signup_method' using errcode = '22023';
  end if;

  insert into signup_pending (
    email, name, signup_method, card_email,
    email_notifications, email_marketing,
    marketing_consent_at, analytics_consent_at,
    terms_accepted_at,    privacy_accepted_at,
    invite_code, orcid_data,
    applied_at, expires_at, created_at
  ) values (
    v_email,
    nullif(trim(coalesce(p_data->>'name', '')), ''),
    v_method,
    nullif(trim(coalesce(p_data->>'card_email', '')), ''),
    coalesce((p_data->>'email_notifications')::boolean, true),
    coalesce((p_data->>'email_marketing')::boolean, false),
    nullif(p_data->>'marketing_consent_at', '')::timestamptz,
    nullif(p_data->>'analytics_consent_at', '')::timestamptz,
    nullif(p_data->>'terms_accepted_at',    '')::timestamptz,
    nullif(p_data->>'privacy_accepted_at',  '')::timestamptz,
    nullif(trim(coalesce(p_data->>'invite_code', '')), ''),
    case when p_data ? 'orcid_data' then p_data->'orcid_data' else null end,
    null,
    now() + interval '24 hours',
    now()
  )
  on conflict (email) do update set
    name                  = excluded.name,
    signup_method         = excluded.signup_method,
    card_email            = excluded.card_email,
    email_notifications   = excluded.email_notifications,
    email_marketing       = excluded.email_marketing,
    marketing_consent_at  = excluded.marketing_consent_at,
    analytics_consent_at  = excluded.analytics_consent_at,
    terms_accepted_at     = excluded.terms_accepted_at,
    privacy_accepted_at   = excluded.privacy_accepted_at,
    invite_code           = excluded.invite_code,
    orcid_data            = excluded.orcid_data,
    applied_at            = null,                   -- reset on retry
    expires_at            = excluded.expires_at,
    created_at            = excluded.created_at;
end;
$$;

revoke all on function stash_signup_intent(text, jsonb) from public;
grant execute on function stash_signup_intent(text, jsonb) to anon, authenticated;

-- 3. apply_signup_intent (authenticated, idempotent) ──────────────────────

create or replace function apply_signup_intent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_email     text;
  v_pending   signup_pending%rowtype;
  v_orcid     jsonb;
  v_pubs      jsonb;
  v_code_row  invite_codes%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if v_email is null then
    return jsonb_build_object('status', 'no-email');
  end if;

  -- Atomically claim the pending row so concurrent applies (e.g. tab
  -- + reload) don't double-apply. After this UPDATE returns the row,
  -- applied_at is set; a second caller will not match the WHERE.
  update signup_pending
     set applied_at = now(),
         user_id    = v_user_id
   where email      = lower(v_email)
     and applied_at is null
     and expires_at > now()
  returning * into v_pending;

  if not found then
    return jsonb_build_object('status', 'no-pending');
  end if;

  -- Profile fields shared by both paths
  update profiles set
    name                 = coalesce(nullif(v_pending.name, ''), name),
    signup_method        = v_pending.signup_method,
    card_email           = coalesce(v_pending.card_email, card_email),
    email_notifications  = v_pending.email_notifications,
    email_marketing      = v_pending.email_marketing,
    marketing_consent_at = v_pending.marketing_consent_at,
    analytics_consent_at = v_pending.analytics_consent_at,
    terms_accepted_at    = v_pending.terms_accepted_at,
    privacy_accepted_at  = v_pending.privacy_accepted_at
  where id = v_user_id;

  -- ORCID path: profile enrichment + publications import
  if v_pending.orcid_data is not null then
    v_orcid := v_pending.orcid_data;

    update profiles set
      bio            = coalesce(nullif(v_orcid->>'bio', ''),         bio),
      institution    = coalesce(nullif(v_orcid->>'institution', ''), institution),
      title          = coalesce(nullif(v_orcid->>'title', ''),       title),
      orcid          = nullif(v_orcid->>'orcid_id', ''),
      orcid_verified = true,
      work_history   = coalesce(v_orcid->'work_history', work_history),
      education      = coalesce(v_orcid->'education',    education)
    where id = v_user_id;

    v_pubs := v_orcid->'publications';
    if v_pubs is not null and jsonb_typeof(v_pubs) = 'array' and jsonb_array_length(v_pubs) > 0 then
      insert into publications (user_id, title, journal, year, doi, pmid, source)
      select v_user_id,
             nullif(e->>'title',   ''),
             nullif(e->>'journal', ''),
             nullif(e->>'year',    ''),
             coalesce(e->>'doi',  ''),
             coalesce(e->>'pmid', ''),
             'orcid'
        from jsonb_array_elements(v_pubs) as e
       where e ? 'title' and (e->>'title') <> '';
    end if;
  end if;

  -- Invite-code binding: personal vs multi-use
  if v_pending.invite_code is not null then
    select * into v_code_row
      from invite_codes
     where code = upper(v_pending.invite_code);

    if found then
      if coalesce(v_code_row.is_multi_use, false) then
        insert into invite_code_uses (code_id, user_id, claimed_at)
        values (v_code_row.id, v_user_id, now())
        on conflict do nothing;
        update invite_codes
           set uses_count = coalesce(uses_count, 0) + 1
         where id = v_code_row.id;
      else
        update invite_codes
           set claimed_by = v_user_id,
               claimed_at = now()
         where id = v_code_row.id
           and claimed_by is null;
      end if;

      if v_code_row.created_by is not null and v_code_row.created_by <> v_user_id then
        insert into notifications (user_id, actor_id, notif_type, meta, read)
        values (
          v_code_row.created_by,
          v_user_id,
          'invite_redeemed',
          jsonb_build_object('code', v_code_row.code),
          false
        );
      end if;
    end if;
  end if;

  -- Generate this user's own invites if the helper exists. The function
  -- isn't tracked in this repo's migrations but is referenced by the
  -- old AuthScreen flow, so it's expected to be deployed. Wrapped in
  -- a sub-block so a missing function doesn't take down the whole
  -- apply (the rest of the work has already committed to this row).
  begin
    perform generate_user_invites(v_user_id, 5);
  exception when undefined_function then
    null;
  end;

  return jsonb_build_object(
    'status',        'applied',
    'signup_method', v_pending.signup_method,
    'has_orcid',     v_pending.orcid_data is not null
  );
end;
$$;

revoke all on function apply_signup_intent() from public, anon;
grant execute on function apply_signup_intent() to authenticated;

-- 4. Janitor — drop expired, never-applied rows ───────────────────────────

create or replace function cleanup_expired_signup_intents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from signup_pending
   where applied_at is null
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function cleanup_expired_signup_intents() from public, anon, authenticated;
-- Schedule the janitor with pg_cron once per day. Mirror the pattern
-- used by purge_deleted_accounts. Run as superuser (cron) so RLS
-- isn't a factor; the function is SECURITY DEFINER anyway.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'cleanup-expired-signup-intents') then
      perform cron.unschedule('cleanup-expired-signup-intents');
    end if;
    perform cron.schedule(
      'cleanup-expired-signup-intents',
      '23 4 * * *',
      $cron$ select cleanup_expired_signup_intents(); $cron$
    );
  end if;
end $$;

commit;
