-- Storage replace + delete cleanup
--
-- Two fixes wrapped in one migration:
--
-- 1. cleanup_replaced_storage_files(p_source_kind, p_source_id, p_keep_path)
--    — when an avatar / profile cover / group avatar / group cover is
--    replaced with a different-extension upload (.jpg → .png), the new
--    storage path is different, so the old blob + tracking row remain.
--    This RPC deletes the orphan tracking rows and returns their
--    (bucket, path) so the client can sweep the storage blobs too.
--
-- 2. delete_user_file: also handle deep-dive cover URLs. Today the RPC
--    only nulls posts.image_url, but a deep-dive cover lives in
--    posts.deep_dive_cover_url, so deleting the file via the Files view
--    left the cover image still rendering on /s/:postId. Extends the
--    function to detect which column the path belongs to and clear the
--    matching one.
--
-- Idempotent. Reuses the same return shape for delete_user_file
-- (table bucket text, path text) so existing callers stay working.

-- ─── cleanup_replaced_storage_files ─────────────────────────────────────────
create or replace function cleanup_replaced_storage_files(
  p_source_kind text,
  p_source_id   uuid,
  p_keep_path   text
)
returns table (bucket text, path text)
language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- Only the singleton replaceable kinds — never run this for
  -- post / group_post / library which can have many files per source.
  if p_source_kind not in ('avatar','profile_cover','group_avatar','group_cover') then
    return;
  end if;

  return query
    delete from user_storage_files usf
    where usf.user_id     = auth.uid()
      and usf.source_kind = p_source_kind
      and usf.source_id   = p_source_id
      and usf.path        <> p_keep_path
    returning usf.bucket, usf.path;
end;
$$;

grant execute on function cleanup_replaced_storage_files(text, uuid, text) to authenticated;

-- ─── delete_user_file (extended for deep-dive covers) ───────────────────────
create or replace function delete_user_file(p_id uuid)
returns table (bucket text, path text)
language plpgsql security definer
set search_path = public as $$
declare
  v_row              user_storage_files%rowtype;
  v_url_pattern      text;
  v_post_image_url   text;
  v_post_cover_url   text;
begin
  select * into v_row from user_storage_files where id = p_id;
  if not found then
    raise exception 'file not found';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'not allowed';
  end if;

  if v_row.source_kind in ('avatar','group_avatar','group_cover','profile_cover') then
    raise exception 'avatar / cover images must be replaced, not deleted';
  end if;

  if v_row.source_kind = 'post' and v_row.source_id is not null then
    v_url_pattern := '%' || v_row.path || '%';
    select image_url, deep_dive_cover_url
      into v_post_image_url, v_post_cover_url
      from posts where id = v_row.source_id and user_id = auth.uid();

    if v_post_image_url is not null and v_post_image_url like v_url_pattern then
      -- Regular post attachment — placeholder behaviour.
      update posts
         set file_deleted_at = now(),
             image_url       = null,
             file_name       = null,
             file_type       = null
       where id = v_row.source_id and user_id = auth.uid();
    elsif v_post_cover_url is not null and v_post_cover_url like v_url_pattern then
      -- Deep-dive cover — just clear the cover, leave the rest of the post intact.
      update posts
         set deep_dive_cover_url      = '',
             deep_dive_cover_position = '50% 50%'
       where id = v_row.source_id and user_id = auth.uid();
    end if;
    -- Inline images embedded inside `posts.content` are not stripped
    -- here — the storage blob delete will leave a broken-image icon on
    -- the page. Editing the post via the deep-dive composer is the
    -- supported way to remove inline images.

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
  bucket := v_row.bucket;
  path   := v_row.path;
  return next;
end;
$$;

grant execute on function delete_user_file(uuid) to authenticated;
