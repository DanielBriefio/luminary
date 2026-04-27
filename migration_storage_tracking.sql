-- Phase 9: Storage tracking + per-user usage + soft-deletable attachments
--
-- Adds:
--   * user_storage_files audit table (one row per uploaded blob)
--   * file_deleted_at columns on posts / group_posts / project_posts
--     (so deleting a file leaves the post intact with a placeholder)
--   * record_storage_file RPC — called after every successful upload
--   * delete_user_file RPC — own-only; deletes tracking row, soft-deletes
--     the linked post (or library item), returns { bucket, path } for the
--     client to remove from storage
--   * get_my_storage_usage RPC — own files + total bytes + bucket breakdown
--   * get_admin_storage_usage RPC — per-user roll-up + global total
--   * Backfill from storage.objects (best-effort: maps owner → user_id,
--     uses path heuristics to assign source_kind; falls back to 'unknown')
--   * DROP+CREATE the three *_with_meta views to expose file_deleted_at
--
-- Quotas are intentionally NOT enforced here — that's a future flag that
-- will use get_my_storage_usage().total_bytes against a per-user limit.

-- ─── user_storage_files ──────────────────────────────────────────────────────

create table if not exists user_storage_files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  bucket       text not null,
  path         text not null,
  size_bytes   bigint not null default 0,
  mime_type    text default '',
  file_name    text default '',
  source_kind  text not null default 'unknown'
                 check (source_kind in (
                   'post','group_post','library','avatar',
                   'group_avatar','group_cover','unknown'
                 )),
  source_id    uuid,
  created_at   timestamptz default now(),
  unique (bucket, path)
);

alter table user_storage_files enable row level security;

drop policy if exists "usf_select_own"   on user_storage_files;
drop policy if exists "usf_select_admin" on user_storage_files;

create policy "usf_select_own" on user_storage_files for select
  using (auth.uid() = user_id);

create policy "usf_select_admin" on user_storage_files for select
  using ((select is_admin from profiles where id = auth.uid()));

-- No INSERT/UPDATE/DELETE policies — only SECURITY DEFINER RPCs write.

create index if not exists idx_usf_user   on user_storage_files(user_id);
create index if not exists idx_usf_bucket on user_storage_files(bucket);
create index if not exists idx_usf_kind   on user_storage_files(source_kind);

-- ─── file_deleted_at columns ────────────────────────────────────────────────

alter table posts         add column if not exists file_deleted_at timestamptz;
alter table group_posts   add column if not exists file_deleted_at timestamptz;
alter table project_posts add column if not exists file_deleted_at timestamptz;

-- ─── record_storage_file ────────────────────────────────────────────────────
-- Called by every upload site after supabase.storage.upload succeeds.
-- Upsert keyed on (bucket, path) so avatar replacements (upsert:true) overwrite
-- the existing tracking row instead of creating duplicates.

create or replace function record_storage_file(
  p_bucket       text,
  p_path         text,
  p_size_bytes   bigint,
  p_mime_type    text default '',
  p_file_name    text default '',
  p_source_kind  text default 'unknown',
  p_source_id    uuid default null
) returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'record_storage_file requires authentication';
  end if;

  insert into user_storage_files (
    user_id, bucket, path, size_bytes, mime_type, file_name, source_kind, source_id
  ) values (
    auth.uid(), p_bucket, p_path, coalesce(p_size_bytes, 0),
    coalesce(p_mime_type, ''), coalesce(p_file_name, ''),
    coalesce(p_source_kind, 'unknown'), p_source_id
  )
  on conflict (bucket, path) do update set
    size_bytes  = excluded.size_bytes,
    mime_type   = excluded.mime_type,
    file_name   = excluded.file_name,
    source_kind = excluded.source_kind,
    source_id   = excluded.source_id,
    user_id     = excluded.user_id
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function record_storage_file(text, text, bigint, text, text, text, uuid)
  to authenticated;

-- ─── delete_user_file ───────────────────────────────────────────────────────
-- Own-only. Returns the bucket+path so the client can call
-- supabase.storage.remove([path]) afterwards. Cleans up the linked record:
--   * post / group_post: set file_deleted_at, null out image_url/file_name/file_type
--   * library: delete the library_items row
--   * avatar / group_avatar / group_cover: not deletable — caller gets an error
--     (users replace those via the regular upload flow)

create or replace function delete_user_file(p_id uuid)
returns table (bucket text, path text)
language plpgsql security definer as $$
declare
  v_row user_storage_files%rowtype;
begin
  select * into v_row from user_storage_files where id = p_id;
  if not found then
    raise exception 'file not found';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'not allowed';
  end if;

  if v_row.source_kind in ('avatar','group_avatar','group_cover') then
    raise exception 'avatar and group images must be replaced, not deleted';
  end if;

  if v_row.source_kind = 'post' and v_row.source_id is not null then
    update posts
       set file_deleted_at = now(),
           image_url = '',
           file_name = '',
           file_type = ''
     where id = v_row.source_id and user_id = auth.uid();
  elsif v_row.source_kind = 'group_post' and v_row.source_id is not null then
    update group_posts
       set file_deleted_at = now(),
           image_url = '',
           file_name = '',
           file_type = ''
     where id = v_row.source_id and user_id = auth.uid();
  elsif v_row.source_kind = 'library' and v_row.source_id is not null then
    delete from library_items where id = v_row.source_id and added_by = auth.uid();
  end if;
  -- 'unknown' falls through: just delete the tracking row + storage blob.

  delete from user_storage_files where id = p_id;

  bucket := v_row.bucket;
  path   := v_row.path;
  return next;
end;
$$;

grant execute on function delete_user_file(uuid) to authenticated;

-- ─── get_my_storage_usage ───────────────────────────────────────────────────

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
      select id, bucket, path, size_bytes, mime_type, file_name,
             source_kind, source_id, created_at
        from user_storage_files
       where user_id = auth.uid()
       order by created_at desc
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

-- ─── get_admin_storage_usage ────────────────────────────────────────────────

create or replace function get_admin_storage_usage()
returns jsonb
language plpgsql security definer as $$
declare
  v_total bigint;
  v_count integer;
  v_per_user jsonb;
  v_per_bucket jsonb;
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception 'admin only';
  end if;

  select coalesce(sum(size_bytes), 0), count(*)
    into v_total, v_count
    from user_storage_files;

  select coalesce(jsonb_agg(row_to_json(u) order by (u.bytes)::bigint desc), '[]'::jsonb)
    into v_per_user
    from (
      select usf.user_id,
             p.name        as user_name,
             p.profile_slug as user_slug,
             p.avatar_color as avatar_color,
             p.avatar_url   as avatar_url,
             sum(usf.size_bytes)::bigint as bytes,
             count(*)::int  as files
        from user_storage_files usf
        left join profiles p on p.id = usf.user_id
       group by usf.user_id, p.name, p.profile_slug, p.avatar_color, p.avatar_url
    ) u;

  select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb)
    into v_per_bucket
    from (
      select bucket, sum(size_bytes)::bigint as bytes, count(*)::int as files
        from user_storage_files
       group by bucket
    ) b;

  return jsonb_build_object(
    'total_bytes', v_total,
    'total_files', v_count,
    'per_user',    v_per_user,
    'per_bucket',  v_per_bucket
  );
end;
$$;

grant execute on function get_admin_storage_usage() to authenticated;

-- ─── Backfill from storage.objects ──────────────────────────────────────────
-- Best-effort: every existing storage object whose owner maps to a profile
-- becomes a user_storage_files row. source_kind heuristics on path; fallback
-- 'unknown'. Idempotent via the (bucket, path) unique key.

insert into user_storage_files (user_id, bucket, path, size_bytes, mime_type, file_name, source_kind)
select
  o.owner::uuid,
  o.bucket_id,
  o.name,
  coalesce((o.metadata->>'size')::bigint, 0),
  coalesce(o.metadata->>'mimetype', ''),
  regexp_replace(o.name, '^.*/', ''),
  case
    when o.bucket_id = 'library-files'                       then 'library'
    when o.bucket_id = 'post-files' and o.name like 'group-avatars/%' then 'group_avatar'
    when o.bucket_id = 'post-files' and o.name like 'group-covers/%'  then 'group_cover'
    when o.bucket_id = 'post-files' and o.name ~ '^[0-9a-f-]+/avatar\.[a-z0-9]+$' then 'avatar'
    when o.bucket_id = 'post-files'                          then 'post'
    else 'unknown'
  end as source_kind
from storage.objects o
where o.owner is not null
  and exists (select 1 from profiles p where p.id = o.owner::uuid)
on conflict (bucket, path) do nothing;

-- ─── Recreate views to expose file_deleted_at ───────────────────────────────
-- p.* / gp.* / pp.* doesn't refresh on ALTER TABLE; we have to drop and
-- recreate so the view's column list re-binds.

drop view if exists posts_with_meta cascade;
create view posts_with_meta as
select
  p.*,
  pr.name              as author_name,
  pr.title             as author_title,
  pr.institution       as author_institution,
  pr.avatar_color      as author_avatar,
  pr.avatar_url        as author_avatar_url,
  pr.identity_tier1    as author_identity_tier1,
  pr.identity_tier2    as author_identity_tier2,
  pr.work_mode         as author_work_mode,
  pr.profile_slug      as author_slug,
  (select count(*)::int from likes    l   where l.post_id  = p.id)                                  as like_count,
  (select count(*)::int from comments c   where c.post_id  = p.id)                                  as comment_count,
  (select count(*)::int from reposts  r   where r.post_id  = p.id)                                  as repost_count,
  (select exists(select 1 from likes   l  where l.post_id  = p.id and l.user_id = auth.uid()))      as user_liked,
  (select exists(select 1 from reposts r  where r.post_id  = p.id and r.user_id = auth.uid()))      as user_reposted,
  (select count(*)::int from post_reports rpt where rpt.post_id = p.id and rpt.status = 'pending')  as report_count
from posts p
join profiles pr on pr.id = p.user_id;

grant select on posts_with_meta to anon, authenticated;

drop view if exists group_posts_with_meta cascade;
create view group_posts_with_meta as
select
  gp.*,
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier1 as author_identity_tier1,
  pr.identity_tier2 as author_identity_tier2,
  gm.role           as author_group_role,
  gm.display_role   as author_display_role,
  (select count(*) from group_post_likes    l where l.post_id = gp.id) as like_count,
  (select count(*) from group_post_comments c where c.post_id = gp.id) as comment_count
from group_posts gp
join profiles pr on pr.id = gp.user_id
left join group_members gm on gm.group_id = gp.group_id and gm.user_id = gp.user_id;

grant select on group_posts_with_meta to anon, authenticated;

drop view if exists project_posts_with_meta cascade;
create view project_posts_with_meta as
select
  pp.*,
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier2 as author_identity_tier2,
  pf.name           as folder_name,
  p.name            as project_name,
  p.icon            as project_icon,
  p.cover_color     as project_color,
  p.group_id        as project_group_id,
  (select count(*) from project_post_likes    l where l.post_id = pp.id) as like_count,
  (select count(*) from project_post_comments c where c.post_id = pp.id) as comment_count
from project_posts pp
join profiles pr on pr.id = pp.user_id
join projects p  on p.id  = pp.project_id
left join project_folders pf on pf.id = pp.folder_id;

grant select on project_posts_with_meta to anon, authenticated;
