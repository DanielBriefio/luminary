-- Phase 15.1 follow-up: posts_validate_context shouldn't fire on
-- non-context updates.
--
-- The Phase 15 trigger validates that posts.context_id points at a real
-- group/project. It runs on every BEFORE UPDATE — including the implicit
-- UPDATE that fires when a project is deleted (cascade DELETE on
-- project_folders triggers ON DELETE SET NULL on posts.folder_id, which
-- means an UPDATE on posts). At that moment the project is already
-- mid-delete, so the trigger sees a stale context_id and raises
-- 'context_id ... is not a project', rolling back the cascade.
--
-- Fix: skip the validation when neither context_kind nor context_id is
-- actually changing. INSERTs still validate (TG_OP = 'INSERT'), and
-- UPDATEs that touch context still validate.

create or replace function posts_validate_context()
returns trigger
language plpgsql
as $$
begin
  -- UPDATE that doesn't touch context columns: skip validation entirely.
  if TG_OP = 'UPDATE'
     and old.context_kind = new.context_kind
     and old.context_id is not distinct from new.context_id then
    return new;
  end if;

  if new.context_kind = 'group' then
    if not exists (select 1 from groups where id = new.context_id) then
      raise exception 'context_id % is not a group', new.context_id;
    end if;
  elsif new.context_kind = 'project' then
    if not exists (select 1 from projects where id = new.context_id) then
      raise exception 'context_id % is not a project', new.context_id;
    end if;
  end if;
  return new;
end;
$$;
