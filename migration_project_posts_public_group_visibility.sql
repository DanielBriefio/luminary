-- Make project posts in PUBLIC groups visible to non-members.
--
-- Today's posts_select_project policy lets a project post through to:
--   1. Project members
--   2. Members of the project's parent group
--
-- That second branch is the "user guides in a group's projects" pattern.
-- It works for closed groups, but for PUBLIC groups it leaves a hole:
-- a visitor browsing /g/:slug without joining can see the group's
-- regular posts (because posts_select_group has an `is_public = true`
-- branch) but NOT the project posts inside the group's own projects —
-- exactly the content (user guides, FAQs, onboarding articles) you'd
-- most want to be discoverable.
--
-- This migration adds a third branch: project lives inside a public
-- group → readable by anyone, including unauthenticated visitors.
-- Mirrors the "is_public = true" treatment that posts_select_group
-- already has for direct group posts. visibility='private' still
-- author-only, visibility='members' / 'public' both surface here.

drop policy if exists posts_select_project on posts;

create policy posts_select_project on posts
  for select
  using (
    context_kind = 'project'
    and not hidden
    and visibility <> 'private'
    and (
      -- Caller is a project member
      context_id in (select project_id from project_members where user_id = auth.uid())
      or
      -- Caller is a member of the project's parent group
      context_id in (
        select p.id
          from projects p
         where p.group_id in (select get_my_group_ids())
      )
      or
      -- The project's parent group is public → anyone can read.
      -- No auth.uid() check on this branch, so anon visitors are
      -- covered too — same shape as posts_select_group's
      -- is_public = true branch for direct group posts.
      context_id in (
        select p.id
          from projects p
          join groups g on g.id = p.group_id
         where g.is_public = true
      )
    )
  );
