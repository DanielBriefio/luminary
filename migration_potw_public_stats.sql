-- Public paper stats for Paper of the Week algorithm.
-- get_paper_health is admin-only; this function is readable by all authenticated users.
create or replace function get_paper_stats_public()
returns table (
  paper_doi      text,
  paper_title    text,
  paper_journal  text,
  paper_year     int,
  discussions    bigint,
  participants   bigint,
  total_comments bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.paper_doi,
    max(p.paper_title)         as paper_title,
    max(p.paper_journal)       as paper_journal,
    max(p.paper_year)::int     as paper_year,
    count(distinct p.id)       as discussions,
    count(distinct p.user_id)  as participants,
    count(c.id)                as total_comments
  from posts p
  left join comments c on c.post_id = p.id
  where p.post_type     = 'paper'
    and p.is_hidden     = false
    and p.is_admin_post = false
    and p.paper_doi     is not null
    and p.paper_doi    != ''
    and p.paper_title   is not null
    and p.paper_title  != ''
  group by p.paper_doi
  having count(distinct p.id) > 1 or count(c.id) > 0
  order by discussions desc, total_comments desc;
$$;

grant execute on function get_paper_stats_public() to authenticated;
