-- Unnests all post tags and counts frequency
create or replace function get_top_tags(tag_limit integer default 30)
returns table(tag text, count bigint)
language sql
stable
as $$
  select
    unnest(tags) as tag,
    count(*)     as count
  from posts
  where tags is not null and array_length(tags, 1) > 0
  group by tag
  order by count desc
  limit tag_limit;
$$;
