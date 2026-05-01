# Task: Phase 15 — Unified posts schema

## Context

Read `CLAUDE.md`, `PRODUCT_STATE.md`, `SCHEMA.md` before starting.
Three parallel post implementations exist today:

- `posts` (main feed) + `posts_with_meta` + `likes` + `comments` + `reposts` + `saved_posts`
- `group_posts` + `group_posts_with_meta` + `group_post_likes` + `group_post_comments`
- `project_posts` + `project_posts_with_meta` + `project_post_likes` + `project_post_comments`

Frontend mirrors the split: three card components, two composers, three feed screens
each with their own queries, three RLS surfaces, three sets of RPCs. Every cross-cutting
feature (deep dives, paper citations, file_deleted_at placeholders, reposts, Lumens
awards, the truncate-and-fade pattern, sanitiser pipeline) ships in triplicate.

Phase 15 collapses this to one table per concept and unlocks a few features that have
been feed-only by accident of where they were first built: deep dives, reposts, paper
citations, paper-of-week broadcasting, public URLs.

This is being done **before the first technical test**, so the wipe button shipped in
Phase 14.1 will be used to clear data and the migration is straight-up DROP + CREATE.
No migration of existing rows.

---

## Goal

One `posts` table covering feed + group + project contexts. One `likes`. One `comments`.
One `posts_with_meta` view. One `PostCard`. One `PostComposer`. Public URLs (`/s/:id`)
for every post whose visibility allows it. Add a "who liked this" list. Keep `reposts`
and `saved_posts` as-is (already point at `posts.id`; they just gain a wider surface).

---

## Confirmed decisions

- **Unify all three.** Single `posts` with `context_kind` + `context_id`.
- **Every feature available in every context.** Deep dives, reposts, paper citations,
  paper-of-week, Lumens — all three contexts. Projects intentionally included so
  group-owned projects can hold deep-dive-formatted user-guide articles.
- **Deep-dive toggle is NOT context-gated.** `PostComposer` must offer the
  deep-dive mode in feed, group, and project contexts identically. Do not add a
  conditional that hides it for projects. The user-guide-articles-in-projects
  pattern depends on this.
- **Public URLs for every post**, gated by visibility — see RLS section below.
- **New: likes-list.** Click the like count on any post → modal with the users who
  liked it. Avatar + name + work-mode chip + Follow button. Visible to anyone who
  can see the post.
- **Group-owned project posts inherit group visibility** for RLS (group members
  can see them). When a personal project is later assigned a parent group, its
  existing posts retroactively become visible to that group — RLS reads
  `projects.group_id` at query time. The composer surfaces a heads-up
  ("This project is owned by Group X — posts here are visible to all Group X
  members") whenever `project.group_id` is set.
- **Likes-list pagination:** 50 per page, "Load more" pulls another 50. Tunable later.
- **Repost visibility: container wins.** A repost in a closed group is a
  closed-group post even if the underlying content was originally public. The
  underlying post stays unchanged.
- **Drop `is_featured` / `featured_until` / `featured_at` columns** in this
  migration — they exist in the current `posts` schema but are unused per
  `CLAUDE.md`. Easy to re-add later if the feature comes back.

---

## Schema

### `posts` — unified

```
id                     uuid pk
user_id                uuid fk profiles ON DELETE CASCADE
content                text
post_type              text   ('text'|'paper'|'image'|'video'|'audio'|'pdf'|'data'|'file')
                              — only 'text' and 'paper' are user-selectable; file
                                uploads attach to text posts and set post_type to
                                the upload category (existing convention)

-- Paper attachment
paper_doi              text
paper_title            text
paper_journal          text
paper_year             int
paper_authors          text[]
paper_abstract         text
paper_citation         text   -- pre-built at post-creation time

-- File attachment
image_url              text
file_name              text
file_type              text
file_deleted_at        timestamptz   -- "📎 File removed by author" placeholder

-- Deep dive
is_deep_dive             boolean default false
deep_dive_title          text
deep_dive_cover_url      text
deep_dive_cover_position text default '50% 50%'

-- Admin / targeting
is_admin_post          boolean default false
target_user_id         uuid fk profiles ON DELETE CASCADE
hidden                 boolean default false   -- moderation

-- New: context
context_kind           text not null check (context_kind in ('feed','group','project'))
context_id             uuid                                   -- null for feed
visibility             text not null
                       check (visibility in ('public','members','private'))

created_at             timestamptz default now()

CHECK ((context_kind = 'feed') = (context_id is null))
```

Indexes (deliberate — feed table is the hottest):

```
posts_user_idx                   (user_id, created_at desc)
posts_feed_idx                   (created_at desc) where context_kind='feed' and not hidden
posts_group_idx                  (context_id, created_at desc) where context_kind='group'
posts_project_idx                (context_id, created_at desc) where context_kind='project'
posts_paper_doi_idx              (paper_doi) where paper_doi is not null
posts_target_idx                 (target_user_id) where target_user_id is not null
```

### `likes`

```
post_id     uuid fk posts ON DELETE CASCADE
user_id     uuid fk profiles ON DELETE CASCADE
created_at  timestamptz default now()
primary key (post_id, user_id)
```

Index `likes_user_idx (user_id, created_at desc)` for "things this person liked."

### `comments`

```
id          uuid pk
post_id     uuid fk posts ON DELETE CASCADE
user_id     uuid fk profiles ON DELETE SET NULL   -- tombstone behaviour from Phase 12.4
content     text
created_at  timestamptz default now()
hidden      boolean default false
```

Flat (no parent_id). Today's three comment tables are all flat; not adding
threading in this refactor — that's a separate feature if/when needed.

### `posts_with_meta` (view)

LEFT JOIN profiles (author), LEFT JOIN groups (when context_kind='group'),
LEFT JOIN projects (when context_kind='project'). Adds the same denormalised columns
the existing view exposes (author_name, author_avatar_url, author_slug, etc.) plus
`group_name`, `group_slug`, `group_is_public`, `project_name`, `project_id`,
`project_group_id` (the parent group of a group-owned project, key for the
"group members can see project content" RLS branch).

Filters out deletion-pending authors (`profiles.deletion_scheduled_at is null`),
preserving Phase 10 behaviour.

### `reposts` and `saved_posts`

No schema change. Both already FK to `posts.id`. They naturally cover all three
contexts once `posts` is unified. `saved_posts.folder_id` (FK bookmark_folders) stays.

---

## RLS

Four separate policies on `posts`, OR'd by Postgres. Simpler to read and faster to
debug than one fat policy.

```
-- 1. Author always sees own posts
USING (user_id = auth.uid())

-- 2. Feed posts: public unless targeted at someone else
USING (
  context_kind = 'feed'
  and not hidden
  and (target_user_id is null or target_user_id = auth.uid())
)

-- 3. Group posts: members always; public groups also visible to all authed users
USING (
  context_kind = 'group'
  and not hidden
  and (
    auth.uid() in (select user_id from group_members where group_id = posts.context_id)
    or context_id in (select id from groups where is_public = true)
  )
)

-- 4. Project posts: project members always; PLUS group members of the project's
--    parent group (if the project belongs to a group). This is what makes the
--    "user-guide group containing user-guide projects" pattern work.
USING (
  context_kind = 'project'
  and not hidden
  and (
    auth.uid() in (select user_id from project_members where project_id = posts.context_id)
    or auth.uid() in (
      select gm.user_id
        from project_members  -- ← actually: from group_members
       where ...
    )
    -- final form:
    or context_id in (
      select p.id
        from projects p
        join group_members gm on gm.group_id = p.group_id
       where gm.user_id = auth.uid()
    )
  )
)
```

Implement the actual policies as `SECURITY DEFINER` helper functions where they
recurse into other RLS-protected tables (the existing pattern: `get_my_group_ids`,
`get_my_admin_group_ids`). Reuse those — don't reinvent.

INSERT / UPDATE / DELETE policies: author-only for own posts, plus admin override
(matches existing posts behaviour).

`likes` and `comments` RLS: caller can SELECT a like/comment iff they can SELECT
the parent post. Implement via a SECURITY DEFINER helper `can_see_post(p_post_id)`
that re-runs the four-branch check, so we don't duplicate the policy logic.

---

## Visibility column semantics

```
public   = world-readable. /s/:id renders for unauthenticated visitors.
members  = context membership required. /s/:id requires auth + RLS pass.
private  = author + admin only. No /s/:id route.
```

**Defaults set by composer based on context:**

```
context_kind = 'feed'                          → public
context_kind = 'group' and group.is_public      → public
context_kind = 'group' and not group.is_public  → members
context_kind = 'project'                        → members
```

Composer has a visibility selector (only when meaningful — feed posts can choose
public vs members; group/project posts can downgrade members → private but not
upgrade past their context's default).

---

## RPC changes

### Rewrite (mechanical — change FROM table, add `where context_kind = ...` filter)

- `get_admin_posts(p_limit, p_offset, p_search, p_type, p_featured, p_hidden)` —
  reads `posts_with_meta`, no filter (covers all three contexts now)
- `get_paper_stats_public()` — same, with `where paper_doi is not null and not hidden`
- `get_hot_papers(p_limit)` — same, no context filter
- `get_content_performance(p_days)` — same, no context filter (now reflects all post types across all contexts)
- `get_power_posters(p_days, p_limit)` — same, counts across all contexts
- `get_power_commenters(p_days, p_limit)` — same
- `get_moderation_queue(p_status)` — switches from `post_id`/`group_post_id` exclusive
  to single `post_id`; also gains project post coverage for free
- `get_content_health()` — group + project health; reads from posts with context filter
- `send_admin_post(p_mode, ...)` — `'broadcast'` and `'targeted'` modes write
  feed posts; `'group'` mode writes a group post (context_kind='group',
  context_id=group_id). RPC body simplifies.
- `get_at_risk_users`, `get_quiet_champions`, `get_signup_method_breakdown`,
  `get_work_mode_stats` — these count `post_count`. Change to count from unified
  `posts` table (no context filter — all posts count toward "this user is
  active").

### `post_reports` simplification

Drop the existing `CHECK exactly one of post_id/group_post_id must be set` constraint.
Drop the `group_post_id` column. Single `post_id` covers all contexts. UNIQUE
(post_id, reporter_id) stays.

### New RPC

```sql
get_post_likers(p_post_id uuid, p_limit int default 50, p_offset int default 0)
returns table (
  user_id           uuid,
  name              text,
  slug              text,
  avatar_color      text,
  avatar_url        text,
  work_mode         text,
  is_following      boolean,    -- does the caller follow this person?
  liked_at          timestamptz
)
```

SECURITY DEFINER. First step is `if not can_see_post(p_post_id) raise 'not found'`.
Order by `liked_at desc`. The `is_following` lookup powers the inline Follow button
in the modal.

### `award_lumens` and earning sites

No schema change to `lumen_transactions` (already keyed on `user_id`, `kind`,
`meta.post_id`). The existing earning-site code in `PostCard` and similar will
just keep working when those components are unified.

---

## Frontend changes

### New files

- `src/posts/PostCard.jsx` — unified card. Takes `{ post, currentUser, onUpdate }`.
  Internally branches on `post.context_kind` for header treatment (group chip,
  project chip, "FROM LUMINARY TEAM" admin chip), share button visibility,
  repost availability. Comment thread, like button, Lumens awarding, paper
  preview, deep-dive article-card preview, file attachment, file_deleted_at
  placeholder, truncation-with-fade — all the existing logic, deduplicated.

- `src/posts/PostComposer.jsx` — unified composer. Props: `{ context, onPublish }`
  where `context` is `{ kind: 'feed' }` or `{ kind: 'group', groupId }` or
  `{ kind: 'project', projectId }`. Renders the same RichTextEditor / paper picker /
  file uploader / deep-dive title+cover UI today's three composers all share. Visibility
  selector appears when there's a meaningful choice (feed posts: public/private;
  open-group posts: public/members; closed-group + project posts: members/private).

- `src/posts/LikersModal.jsx` — list of users who liked a post. Avatar + name +
  work-mode chip + Follow button. Paginated (50 per page, "Load more" button).
  Click name → `/p/:slug` in new tab.

### Files to delete

- `src/feed/PostCard.jsx`           → replaced by `src/posts/PostCard.jsx`
- `src/groups/GroupPostCard.jsx`    → deleted
- `src/projects/ProjectPostCard.jsx` → deleted
- `src/screens/NewPostScreen.jsx`   → replaced by `src/posts/PostComposer.jsx`
                                      mounted in a screen wrapper (or kept as a
                                      thin wrapper that mounts PostComposer)
- `src/groups/GroupNewPost.jsx`     → deleted (or wrapper around PostComposer)

### Files to update

- `src/feed/FeedScreen.jsx` — query unified `posts_with_meta` with
  `context_kind = 'feed'`
- `src/groups/GroupFeed.jsx` — `context_kind = 'group' and context_id = $groupId`
- `src/projects/ProjectFeed.jsx` — `context_kind = 'project' and context_id = $projectId`
- `src/post/PublicPostPage.jsx` — gain context-aware visibility branch:
  - `visibility='public'` → render as today
  - `visibility='members'` → if unauthenticated or not a member, render an
    "internal post — sign in / join group / join project" CTA
  - `visibility='private'` → 404
  - Comments section handled identically across contexts
- `src/post/PaperDetailPage.jsx` — query unified posts for "discussions of this paper"
- `src/admin/ContentSection.jsx` — single posts table view, with a context filter
- `src/admin/InterventionsSection.jsx` (ComposeTab) — `send_admin_post` to feed,
  group, or (new) project; UI gains project picker
- All notification insertion sites currently in `PostCard` / `MessagesScreen` /
  `GroupMembers` etc. — paths and meta keys stay the same; just stop branching
  on which post table the post is in
- `src/lib/analytics.js` — no changes; events already pass `post_id` opaquely

---

## Public URL behaviour

- `/s/:postId` resolves any `posts.id`. The page itself decides what to show based
  on `visibility` and the caller's session (if any).
- Open-group posts and feed-public posts are crawlable by Google. Add `<meta>`
  description (already there for feed posts) for those. Members-only posts get a
  `<meta name="robots" content="noindex">`.
- Share buttons appear in PostCard for any post the current user can see whose
  `visibility` is `public`. For `members` posts, the share button shows "Copy link
  (group members only)" — useful for sharing a permalink with co-members without
  exposing it externally.

---

## Phasing

Single git branch — schema and frontend flip together; no half-state.

### Phase 15.A — Schema + RPCs (half a day)

1. Write `migration_phase15_unified_posts.sql`:
   - DROP existing `posts`, `group_posts`, `project_posts`, their `_with_meta`
     views, their per-table likes / comments tables (we're wiped, so this is
     safe). Drop `post_reports.group_post_id` + the exclusive CHECK.
   - CREATE unified `posts`, `likes`, `comments`, `posts_with_meta`.
   - RLS policies (use SECURITY DEFINER helpers; reuse `get_my_group_ids` etc.).
   - Indexes per the plan above.
   - Rewrite the listed RPCs.
   - Add `get_post_likers`.
2. Run the migration in Supabase SQL editor.
3. Manual SQL sanity checks: `select count(*) from posts_with_meta;` (0), insert
   a feed post / group post / project post via raw SQL, hit each from a
   non-admin session via PostgREST, confirm RLS gates work as expected.

### Phase 15.B — Frontend rewrite (2–2.5 days)

1. Build `src/posts/PostCard.jsx` as the merge of the three card files. Keep all
   existing behaviour (truncation, deep-dive preview, paper preview, file
   placeholder, Lumens awards, comment threads, reposts, share modal, report
   modal). Add the like-count click handler that opens `LikersModal`.
2. Build `src/posts/PostComposer.jsx` as the merge of `NewPostScreen` and
   `GroupNewPost`. Add visibility selector. Make context-aware buttons
   (deep-dive button shown everywhere now).
3. Build `src/posts/LikersModal.jsx` + the `get_post_likers` integration.
4. Update the three feed screens to query the unified view.
5. Update `PublicPostPage` for the visibility branch.
6. Update `ContentSection` and `InterventionsSection.ComposeTab` for the
   simplified posts surface.

### Phase 15.C — Cleanup (a few hours)

1. Delete the three old card files and the two old composer files.
2. Search for orphaned references (`group_post_likes`, `project_post_comments`,
   `posts_with_meta` view name in any old SQL we forgot, etc.).
3. `npm run build` — must compile clean.
4. Update `CLAUDE.md`:
   - Database tables section
   - RPCs section
   - Conventions section (the "Embedding profiles" note about FK disambiguation
     — the unified posts table only has one `user_id` FK, simpler)
   - File structure section (`src/posts/` is new, `src/feed/PostCard.jsx` and
     friends are gone)
5. Update `PRODUCT_STATE.md` (move `migration_phase15_unified_posts.sql` from
   pending to recently shipped after migration is run).
6. Run a manual smoke test in dev:
   - Create a feed post (public), comment, like, repost, save
   - Open `/s/:id` in incognito → renders
   - Create a group post in a closed group → `/s/:id` shows the
     "members only" CTA in incognito
   - Create a project post in a group-owned project → group member who isn't a
     project member can see it via the group's project list
   - Wipe via `/admin → Storage → Danger zone` → DB is clean again

---

## What NOT to change

- `messages` / `conversations` / DM flows — orthogonal
- `library_items`, `bookmark_folders`, `saved_posts.folder_id` — orthogonal
- `lumen_transactions` schema — already context-agnostic
- `notifications` — already passes `post_id` opaquely
- `groups` and `projects` tables themselves — only their post tables change
- The `Av` tier prop, the `RichTextEditor`, the storage tracking pattern, the
  storage quota helper — all reused as-is
- The Luminary Team bot's behaviours (welcome message, admin nudges, broadcasts)
- `GroupsScreen.jsx` legacy file (don't edit)

---

## Resolved questions

All four pre-kickoff questions confirmed (2026-04-30):

1. Group-owned project posts visible to group members; retroactive when a
   personal project is later assigned a group. Composer surfaces a heads-up.
2. Likes-list pagination: 50 per page with Load more.
3. Repost visibility: container wins.
4. Drop unused `is_featured` / `featured_until` / `featured_at` columns in this
   migration.

Plus one explicit clarification (2026-05-01): deep-dive mode is available in
PostComposer in **all** contexts including projects — no context gate.
