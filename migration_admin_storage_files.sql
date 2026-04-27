-- Phase 9.2: per-user file drill-down for the admin Storage section
--
-- Adds:
--   * get_admin_user_storage_files(p_user_id) — returns the enriched file
--     list for a specific user. Same shape as get_my_storage_usage().files
--     so the admin StorageSection can lazy-fetch on row expand and reuse
--     the same row renderer.
--
-- Read-only for v1: admins can see, but not delete user files. Use the
-- existing moderation tools (hide post, etc.) to take action.

create or replace function get_admin_user_storage_files(p_user_id uuid)
returns jsonb
language plpgsql security definer as $$
declare
  v_files jsonb;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'admin only';
  end if;

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
      where usf.user_id = p_user_id
      order by usf.created_at desc
    ) f;

  return v_files;
end;
$$;

grant execute on function get_admin_user_storage_files(uuid) to authenticated;
