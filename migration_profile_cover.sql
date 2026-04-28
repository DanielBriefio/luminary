-- Profile cover image — same shape as group covers.
--
-- Adds:
--   * profiles.cover_url       (text, default '')
--   * profiles.cover_position  (text, default '50% 50%')
--   * 'profile_cover' to the allowed source_kind values on
--     user_storage_files
--   * delete_user_file: profile covers must be replaced, not deleted
--     (same rule we already enforce for 'avatar', 'group_avatar',
--     'group_cover')
--   * get_my_storage_usage: enrich profile_cover rows with a
--     "Profile cover" context_label
--
-- Idempotent.

-- ─── columns ────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists cover_url      text default '',
  add column if not exists cover_position text default '50% 50%';

-- ─── extend source_kind check ───────────────────────────────────────────────
alter table user_storage_files
  drop constraint if exists user_storage_files_source_kind_check;

alter table user_storage_files
  add constraint user_storage_files_source_kind_check
  check (source_kind in (
    'post','group_post','library','avatar',
    'group_avatar','group_cover','profile_cover','unknown'
  ));

-- ─── delete_user_file: protect profile_cover ────────────────────────────────
create or replace function delete_user_file(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_row user_storage_files;
begin
  select * into v_row from user_storage_files where id = p_id;
  if not found then
    raise exception 'not found';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'not allowed';
  end if;

  if v_row.source_kind in ('avatar','group_avatar','group_cover','profile_cover') then
    raise exception 'avatar / cover images must be replaced, not deleted';
  end if;

  if v_row.source_kind = 'post' and v_row.source_id is not null then
    update posts
       set file_deleted_at = now(),
           image_url       = null,
           file_name       = null,
           file_type       = null
     where id = v_row.source_id and user_id = auth.uid();
  elsif v_row.source_kind = 'group_post' and v_row.source_id is not null then
    update group_posts
       set file_deleted_at = now(),
           image_url       = null,
           file_name       = null,
           file_type       = null
     where id = v_row.source_id and user_id = auth.uid();
  elsif v_row.source_kind = 'library' and v_row.source_id is not null then
    delete from library_items where id = v_row.source_id and added_by = auth.uid();
  end if;

  delete from user_storage_files where id = p_id;
  return jsonb_build_object('bucket', v_row.bucket, 'path', v_row.path);
end;
$$;

grant execute on function delete_user_file(uuid) to authenticated;

-- ─── get_my_storage_usage: enrich profile_cover ─────────────────────────────
-- Re-create the function (idempotent) with the new case branch.
create or replace function get_my_storage_usage()
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v_total bigint;
  v_files int;
  v_buckets jsonb;
  v_rows  jsonb;
begin
  select coalesce(sum(size_bytes),0)::bigint, count(*)::int
    into v_total, v_files
    from user_storage_files where user_id = auth.uid();

  select coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb)
    into v_rows
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
          when 'avatar'         then 'Profile photo'
          when 'profile_cover'  then 'Profile cover'
          when 'group_avatar'   then (select 'Group: ' || g.name from groups g where g.id = usf.source_id)
          when 'group_cover'    then (select 'Cover: ' || g.name from groups g where g.id = usf.source_id)
          else null
        end as context_label,
        case usf.source_kind
          when 'group_post'   then (
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
    'total_files', v_files,
    'buckets',     v_buckets,
    'files',       v_rows
  );
end;
$$;

grant execute on function get_my_storage_usage() to authenticated;
