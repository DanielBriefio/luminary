-- Seed the former hardcoded FEED_TIPS as hidden Luminary Board pages.
-- They will appear in the admin Board tab ready to unhide individually.
-- Run once. Safe to re-run — it only appends pages not already present
-- by checking for duplicate titles.

do $$
declare
  v_current  jsonb;
  v_pages    jsonb;
  v_tips     jsonb;
  v_tip      jsonb;
begin
  select value into v_current
  from admin_config where key = 'luminary_board';

  -- Normalise: if old flat format migrate to pages array first
  if v_current->'pages' is null then
    v_pages := jsonb_build_array(jsonb_build_object(
      'title',     coalesce(v_current->>'title',     ''),
      'message',   coalesce(v_current->>'message',   ''),
      'cta_label', coalesce(v_current->>'cta_label', ''),
      'cta_url',   coalesce(v_current->>'cta_url',   ''),
      'bg',        'violet',
      'hidden',    false
    ));
  else
    v_pages := v_current->'pages';
  end if;

  -- Tips to seed (hidden by default)
  v_tips := '[
    {"title":"QR code for conferences",   "message":"Your profile has a QR code under Profile → Share. Print it on a poster or slide so colleagues can find your work instantly.", "cta_label":"View my QR code",  "cta_url":"luminary://card",    "bg":"violet", "hidden":true},
    {"title":"Virtual business card",     "message":"Share your digital business card at conferences. It shows your contact details and links — no paper needed.",                  "cta_label":"Open my card",      "cta_url":"luminary://card",    "bg":"blue",   "hidden":true},
    {"title":"Import your publications",  "message":"Import from ORCID, upload a CV, or search Europe PMC — all from your Publications tab. Your full record in minutes.",         "cta_label":"Go to my profile",  "cta_url":"luminary://profile", "bg":"teal",   "hidden":true},
    {"title":"Create a research group",   "message":"Groups give your team a shared feed, library, and project space. Great for labs, clinical teams, and journal clubs.",          "cta_label":"Explore groups",    "cta_url":"luminary://groups",  "bg":"green",  "hidden":true},
    {"title":"Save papers to your library","message":"Add papers from Europe PMC or ClinicalTrials.gov to your personal library. Organise them in folders by project.",            "cta_label":"Open my library",   "cta_url":"luminary://library", "bg":"teal",   "hidden":true},
    {"title":"Follow a paper",            "message":"Click + Follow on any paper post to see new discussions about it in your Following feed.",                                     "cta_label":"",                  "cta_url":"",                   "bg":"violet", "hidden":true},
    {"title":"Personalise your feed",     "message":"Add research interests to your profile, then use the ⭐ My Field filter for a feed tuned to your work.",                      "cta_label":"Go to my profile",  "cta_url":"luminary://profile", "bg":"amber",  "hidden":true},
    {"title":"Export your CV",            "message":"Export your full profile as a formatted PDF CV from Publications → Export. Ready for grant applications or job materials.",    "cta_label":"Go to my profile",  "cta_url":"luminary://profile", "bg":"white",  "hidden":true}
  ]'::jsonb;

  -- Append tips whose title doesn't already exist in pages
  for v_tip in select * from jsonb_array_elements(v_tips) loop
    if not exists (
      select 1 from jsonb_array_elements(v_pages) p
      where p->>'title' = v_tip->>'title'
    ) then
      v_pages := v_pages || jsonb_build_array(v_tip);
    end if;
  end loop;

  update admin_config
  set value = jsonb_set(
    jsonb_set(v_current, '{pages}', v_pages),
    '{enabled}',
    coalesce(v_current->'enabled', 'true'::jsonb)
  )
  where key = 'luminary_board';
end;
$$;
