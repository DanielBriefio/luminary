-- Phase 9.1: enrich get_my_storage_usage with per-file context
--
-- Replaces get_my_storage_usage so each file in `files[]` carries enough
-- context for the dedicated StorageScreen to render a meaningful row:
--   * context_label       — paper title or 80-char content excerpt
--                           (post / group_post) or library item title
--   * context_group_slug  — for group posts, so the client can build a
--                           /g/:slug deep link
--   * already_deleted     — true when posts.file_deleted_at is set, so
--                           the UI can mark the post as already cleaned
--
-- Idempotent CREATE OR REPLACE; no column or table changes.

create or replace function get_my_storage_usage()
returns jsonb
language plpgsql security definer as $$
declare
  v_total bigint;
  v_count integer;
  v_files jsonb;
  v_buckets jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  select coalesce(sum(size_bytes), 0), count(*)
    into v_total, v_count
    from user_storage_files
   where user_id = auth.uid();

  select coalesce(jsonb_agg(row_to_json(f) order by f.created_at desc), '[]'::jsonb)
    into v_files
    from (
      select
        usf.id,
        usf.bucket,
        usf.path,
        usf.size_bytes,
        usf.mime_type,
        usf.file_name,
        usf.source_kind,
        usf.source_id,
        usf.created_at,
        case usf.source_kind
          when 'post' then (
            select coalesce(
              nullif(p.paper_title, ''),
              nullif(substring(regexp_replace(p.content, '<[^>]+>', '', 'g') from 1 for 80), ''),
              '(post)'
            ) from posts p where p.id = usf.source_id
          )
          when 'group_post' then (
            select coalesce(
              nullif(gp.paper_title, ''),
              nullif(substring(regexp_replace(gp.content, '<[^>]+>', '', 'g') from 1 for 80), ''),
              '(group post)'
            ) from group_posts gp where gp.id = usf.source_id
          )
          when 'library' then (
            select coalesce(nullif(li.title, ''), li.pdf_name, '(library file)')
              from library_items li where li.id = usf.source_id
          )
          when 'avatar'        then 'Profile photo'
          when 'group_avatar'  then (select 'Group: ' || g.name from groups g where g.id = usf.source_id)
          when 'group_cover'   then (select 'Cover: ' || g.name from groups g where g.id = usf.source_id)
          else null
        end as context_label,
        case usf.source_kind
          when 'group_post' then (
            select g.slug
              from group_posts gp
              join groups g on g.id = gp.group_id
             where gp.id = usf.source_id
          )
          when 'group_avatar' then (select g.slug from groups g where g.id = usf.source_id)
          when 'group_cover'  then (select g.slug from groups g where g.id = usf.source_id)
          else null
        end as context_group_slug,
        case usf.source_kind
          when 'post'       then (select p.file_deleted_at is not null from posts        p  where p.id = usf.source_id)
          when 'group_post' then (select gp.file_deleted_at is not null from group_posts  gp where gp.id = usf.source_id)
          else false
        end as already_deleted
      from user_storage_files usf
      where usf.user_id = auth.uid()
      order by usf.created_at desc
    ) f;

  select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb)
    into v_buckets
    from (
      select bucket, sum(size_bytes)::bigint as bytes, count(*)::int as files
        from user_storage_files
       where user_id = auth.uid()
       group by bucket
    ) b;

  return jsonb_build_object(
    'total_bytes', v_total,
    'total_files', v_count,
    'buckets',     v_buckets,
    'files',       v_files
  );
end;
$$;

grant execute on function get_my_storage_usage() to authenticated;
