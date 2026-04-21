-- Work mode on profiles
alter table profiles
  add column if not exists work_mode text default 'researcher',
  -- 'researcher' | 'clinician' | 'both' | 'industry'

  -- Clinical-specific profile fields (all optional)
  add column if not exists subspeciality      text    default '',
  add column if not exists years_in_practice  integer default null,
  add column if not exists primary_hospital   text    default '',
  add column if not exists patient_population text    default '',
  -- e.g. "Adult cardiology, heart failure"

  add column if not exists additional_quals   text[]  default '{}',
  -- Zusatzqualifikationen — free text chips
  -- e.g. ["Traditional Chinese Medicine", "Endoscopy", "Palliative Care"]

  add column if not exists clinical_highlight_label text default '',
  -- e.g. "TAVI procedures", "Fellows trained", "Years in practice"
  add column if not exists clinical_highlight_value text default '',
  -- e.g. "500+", "12", "18"

  -- Work contact details (all users, shown on business card if toggled)
  add column if not exists work_phone   text    default '',
  add column if not exists work_address text    default '',
  -- e.g. "1-1 Marunouchi, Tokyo 100-0005, Japan"

  -- Business card visibility for work contact fields
  add column if not exists card_show_work_phone   boolean default false,
  add column if not exists card_show_work_address boolean default false;

-- Group type fields
alter table groups
  add column if not exists group_type         text default 'research',
  add column if not exists department_name    text default '',
  add column if not exists patient_population text default '';

-- Recreate posts_with_meta to include author_work_mode
-- (DROP + CREATE because CREATE OR REPLACE cannot insert a column mid-definition)
drop view if exists posts_with_meta;
create view posts_with_meta as
select
  p.*,
  pr.name            as author_name,
  pr.title           as author_title,
  pr.institution     as author_institution,
  pr.avatar_color    as author_avatar,
  pr.avatar_url      as author_avatar_url,
  pr.identity_tier1  as author_identity_tier1,
  pr.identity_tier2  as author_identity_tier2,
  pr.work_mode       as author_work_mode,
  pr.profile_slug    as author_slug,
  (select count(*) from likes    l where l.post_id = p.id)  as like_count,
  (select count(*) from comments c where c.post_id = p.id)  as comment_count,
  (select count(*) from reposts  r where r.post_id = p.id)  as repost_count,
  exists(select 1 from likes    l where l.post_id = p.id and l.user_id = auth.uid()) as user_liked,
  exists(select 1 from reposts  r where r.post_id = p.id and r.user_id = auth.uid()) as user_reposted
from posts p
left join profiles pr on pr.id = p.user_id;
