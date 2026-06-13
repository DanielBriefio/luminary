-- Allow comment authors to edit their own comments.
--
-- Adds:
--   1. comments.edited_at — timestamptz, set on UPDATE so the UI can
--      render "(edited)" next to the timestamp. Trigger fires only
--      when content actually changes.
--   2. Defensive own-row UPDATE policy. The publications saga (see
--      migration_publications_rls_own_row.sql) taught us that
--      dashboard-defined policies are easy to miss; this captures the
--      policy in code and is idempotent so it's safe to re-run.

begin;

-- 1. edited_at column + trigger
alter table comments
  add column if not exists edited_at timestamptz;

create or replace function comments_stamp_edited_at()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp when content actually changed — admin moderation
  -- (setting hidden=true) shouldn't make a comment look "edited".
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_stamp_edited_at on comments;
create trigger comments_stamp_edited_at
  before update on comments
  for each row
  execute function comments_stamp_edited_at();

-- 2. Own-row UPDATE policy (idempotent)
alter table comments enable row level security;

drop policy if exists comments_update_own on comments;
create policy comments_update_own
  on comments for update
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

commit;
