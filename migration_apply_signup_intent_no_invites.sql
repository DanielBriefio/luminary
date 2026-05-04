-- Drop the generate_user_invites call from apply_signup_intent.
--
-- The trg_auto_generate_invites trigger on profiles already issues the
-- 5 personal codes when the profile row is created (which happens via
-- handle_new_user the moment auth.users gets a row, well before
-- apply_signup_intent runs). Calling generate_user_invites here issued
-- a second batch — every fresh user ended up with 10 codes instead of 5.
--
-- Body is identical to the version in migration_signup_confirmation.sql
-- except for the deleted "Generate this user's own invites" sub-block.

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

  -- Personal invite generation lives in trg_auto_generate_invites on
  -- profiles. Don't double up here.

  return jsonb_build_object(
    'status',        'applied',
    'signup_method', v_pending.signup_method,
    'has_orcid',     v_pending.orcid_data is not null
  );
end;
$$;

revoke all on function apply_signup_intent() from public, anon;
grant execute on function apply_signup_intent() to authenticated;
