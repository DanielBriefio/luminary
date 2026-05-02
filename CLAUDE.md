# Luminary Prototype — CLAUDE.md

## What is Luminary?

Luminary is a research networking and knowledge-sharing platform for scientists and medical affairs professionals. Think LinkedIn meets ResearchGate, designed to be modern, fast, and tailored to the scientific community. This repo is the working prototype.

## Tech Stack

- **Frontend:** React 18, Create React App (CRA)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Deployment:** Vercel
- **Fonts:** DM Sans (body) + DM Serif Display (headings)
- **Key deps:** `@supabase/supabase-js`, `jszip`, `mammoth`, `qrcode`

## Architecture

**No React Router.** Navigation is state-based in `App.jsx` via a `screen` state variable. Public routes are detected from `window.location.pathname` in a `useState` initializer, before auth runs. `vercel.json` has a SPA rewrite rule.

**All inline styles** using design tokens from `src/lib/constants.js` (import as `T`). No CSS files, no CSS modules, no Tailwind.

**Design tokens:**
```
T.bg   #f2f3fb (app bg)        T.w    #fff      (card bg)         T.s2  #f7f8fe (input bg)   T.s3  #eef0fc (subtle)
T.bdr  #e3e5f5 (border)        T.text #1b1d36   (body)            T.mu  #7a7fa8 (muted)
T.v    #6c63ff (violet)        T.v2   #eeecff   (violet tint)     T.v3  #5a52e8 (violet dark)
T.bl   #4285f4 (blue)          T.bl2  #e8f0fe   (blue tint)
T.gr   #10b981 (green)         T.gr2  #ecfdf5   (green tint)
T.am   #f59e0b (amber)         T.am2  #fef3c7   (amber tint)
T.ro   #f43f5e (rose/error)    T.ro2  #fff1f3   (rose tint)
T.te   #0ea5e9 (teal)          T.te2  #f0f9ff   (teal tint)
```

## File Structure

```
src/
  App.jsx, supabase.js, index.js
  lib/        — constants.js (T, EDGE_FN, EDGE_HEADERS, LUMINARY_TEAM_USER_ID, LUMENS_ENABLED,
                TIER_CONFIG, getTierFromLumens, getNextTier, getProgressToNextTier),
                utils.js, referenceUtils.js, projectTemplates.js, profileMilestones.js,
                useWindowSize.js, htmlUtils.js, fileUtils.js, linkedInUtils.js, pubUtils.js,
                useSuggestedTopics.js, analytics.js, storageQuota.js
  components/ — Av, Btn, Bdg, Inp, Spinner, FollowBtn, PaperPreview, FilePreview, SafeHtml,
                RichTextEditor, ConflictResolverModal, ReportModal, ExpandableBio, Linkify,
                LinkPreview, ShareModal, AvatarCropModal, CoverRepositioner, BottomNav,
                TopicInterestsPicker, ProfileCompletionMeter, FeedTipCard, Footer,
                StoragePanel, StorageQuotaBar, OrcidBadge, OrcidIcon
  screens/    — LandingScreen, LegalPage, AuthScreen, OnboardingScreen,
                ExploreScreen, NotifsScreen, NetworkScreen, MessagesScreen,
                AccountSettingsScreen, SettingsScreen, ResetPasswordScreen, LumensScreen
  feed/       — FeedScreen
  posts/      — PostCard (unified card for feed/group/project), PostComposer
                (unified create + edit composer), LikersModal (paginated likes-list)
  profile/    — ProfileScreen, PublicationsTab, UserProfileScreen, PublicProfilePage,
                ShareProfilePanel, PubRow, SectionGroup, BusinessCardView, CardPage,
                CardQROverlay, CvExportPanel, LinkedInImporter, OrcidImporter
  post/       — PublicPostPage (/s/:postId)
  paper/      — PaperDetailPage (/paper/:doi)
  library/    — LibraryScreen, LibraryFolderSidebar, LibraryFilesView, LibraryItemCard,
                LibraryPaperSearch, LibraryRisImporter, LibraryClinicalTrialSearch
  groups/     — GroupsScreen (active), GroupScreen, GroupFeed, GroupMembers, GroupLibrary,
                GroupProfile, PublicGroupProfileScreen, CreateGroupModal, GroupProjects
  projects/   — ProjectsScreen, ProjectScreen, ProjectFeed, ProjectMembers,
                ProjectEditModal, CreateProjectModal, TemplateGallery, SaveAsTemplateModal
  admin/      — AdminShell, InvitesSection, CreateCodeModal, UsersSection, UserDetailPanel,
                BulkNudgeModal, TemplatesSection, ContentSection, InboxSection, InterventionsSection,
                StorageSection, AnalyticsSection, WaitlistSection
  admin/interventions/ — ComposeTab, BoardTab, PaperOfWeekTab, MilestoneTab
  admin/analytics/     — HealthTab, GrowthTab, ProductTab, BehaviourTab
  admin/analytics/components/ — StatCard, SectionCard, PreferenceRow, UserRow, TierBar,
                                SimpleBarChart, SimpleLineChart, PostHogLinks, EmptyState,
                                TimeRangePicker
```

> `src/screens/GroupsScreen.jsx` is legacy — do not edit; the active groups screen is `src/groups/GroupsScreen.jsx`. Likewise the legacy `feed/PostCard`, `groups/GroupPostCard`, `groups/GroupNewPost`, `projects/ProjectPostCard`, `screens/NewPostScreen` files no longer exist — they collapsed into `posts/PostCard` + `posts/PostComposer`. Don't write new code that imports from those paths.

## Database Tables

**Core:** `profiles`, `posts` (unified for feed + group + project; `posts_with_meta` view), `likes`, `comments`, `reposts`, `follows`, `publications`, `notifications`, `conversations`, `messages`, `saved_posts`, `lumen_transactions`, `user_storage_files`

**Groups:** `groups` (`groups_with_stats` view), `group_members`, `group_join_requests`, `group_invites`, `group_follows`. Group content lives in unified `posts` (`context_kind='group'`).

**Library:** `library_folders`, `library_items`, `bookmark_folders`

**Projects:** `projects`, `project_members`, `project_folders`, `community_templates`, `community_template_ratings`. Project content lives in unified `posts` (`context_kind='project'`, optional `posts.folder_id` → `project_folders.id`).

**Admin/Auth:** `invite_codes`, `invite_code_uses`, `invite_rate_limits`, `post_reports`, `orcid_pending`, `waitlist`, `admin_config`

### Unified `posts` schema

Every post — feed/group/project — lives in this one table:
- `context_kind` text NOT NULL CHECK in (`'feed'|'group'|'project'`)
- `context_id` uuid — null for feed; `groups.id` for group; `projects.id` for project. CHECK enforces `(context_kind = 'feed') = (context_id is null)`.
- `visibility` text NOT NULL CHECK in (`'public'|'members'|'private'`) — drives both RLS branches and the `/s/:postId` public-URL gate. Defaults: feed → `public`; group → inherits `groups.is_public`; project → `members`.
- `folder_id` uuid (FK `project_folders` ON DELETE SET NULL) — scopes a project post to a folder; null = "All posts". Templates pre-fill via the folder-name → folder_id map; `📁 Move to folder…` in PostCard's owner ⋯ menu lets owners change it.
- `pinned_at` timestamptz nullable — when set, the post sorts to the top of its group/project feed. Only group owners (`groups.created_by`) and project owners (`project_members.role='owner'`) can set it, via the SECURITY DEFINER `pin_post(p_post_id)` / `unpin_post(p_post_id)` RPCs. Feed posts cannot be pinned (the RPCs return false). No cap on pinned count.
- Other columns: `user_id`, `content`, `post_type`, `paper_*`, `image_url`/`file_name`/`file_type`/`file_deleted_at`, `is_deep_dive`/`deep_dive_title`/`deep_dive_cover_url`/`deep_dive_cover_position`, `tags`, `tier1`, `tier2`, `is_admin_post`, `target_user_id`, `hidden`, `created_at`, `edited_at`.
- **`posts_validate_context` BEFORE INSERT/UPDATE trigger** validates `context_id` against `groups.id` / `projects.id`. **Skips when `context_kind` and `context_id` are both unchanged on UPDATE** — otherwise cascade-deletes (e.g. `project_folders → posts.folder_id` SET NULL) re-fire the trigger against an already-deleted parent and roll back the cascade.

### `posts_with_meta` view

Joins `profiles` (author, with `deletion_scheduled_at is null` filter), LEFT JOIN `groups` (when `context_kind='group'`), LEFT JOIN `projects` (when `context_kind='project'`). Exposes denormalised `author_*`, `group_name`/`group_slug`/`group_is_public`, `project_name`/`project_icon`/`project_cover_color`/`project_group_id` (parent group of a group-owned project), plus aggregates `like_count`/`comment_count`/`repost_count`/`user_liked`/`user_reposted`/`report_count`. **GOTCHA**: PostgreSQL freezes a view's column list at creation time, so adding a column to `posts` does NOT propagate via `select p.*` — every `posts` schema change MUST `DROP VIEW ... CASCADE; CREATE VIEW ...` to refresh it.

### RLS on `posts`

Five OR'd select policies: `posts_select_own` (`user_id = auth.uid()`); `posts_select_feed` (feed posts not hidden, not private, and either not targeted or targeted at the caller); `posts_select_group` (group posts where caller is a group member or `groups.is_public`); `posts_select_project` (project posts where caller is a project member OR a member of the project's parent group — the user-guide-articles-in-projects pattern); `posts_select_admin` (admin sees everything). INSERT gates context membership — feed posts free, group/project posts require membership. Admin can do all (used for moderation). Group + project policies use SECURITY DEFINER helper `get_my_group_ids()` to avoid `group_members` RLS recursion.

### Likes & comments (unified)

Primary key `(post_id, user_id)` for likes. Comments are flat (no `parent_id`). Both have RLS gated on whether the caller can SELECT the parent post. Admin override on comments for moderation.

### Other non-obvious schema facts

- `profiles.work_mode`: `'researcher'|'clinician'|'industry'|'clinician_scientist'`.
- `profiles.admin_notes`: internal only, never shown to users.
- `profiles.is_admin` is locked down — `block_self_admin` BEFORE UPDATE trigger rejects flips unless the caller is already admin; `auth.uid() IS NULL` (dashboard SQL / service role) bypasses. Promotion is SQL-editor-only.
- `groups.created_by` is authoritative owner (legacy `owner_id` was dropped — never use). `groups.is_public` is authoritative visibility (legacy `is_private` was dropped — never use).
- `groups.cover_position` (text, default `'50% 50%'`) — `object-position` for the group cover crop, set by the drag-to-reposition UI in GroupProfile edit mode.
- `group_members.role` is plain TEXT (`'admin'|'member'|'alumni'`), not an enum. Legacy `'owner'` was migrated → `'admin'`.
- `library_items.folder_id` NULL = Unsorted inbox; query with `.is('folder_id', null)` not `.eq`. Owner FK is `library_items.added_by` (NOT `user_id`), `ON DELETE SET NULL`.
- `bookmark_folders` — user's bookmark tree. Self-FK `parent_id` (CASCADE delete). Frontend caps at 2 levels. RLS: own-only.
- `saved_posts`: `(id, user_id, post_id, folder_id, saved_at)`. Single `post_id` covers all contexts.
- `projects`: personal → `user_id = created_by, group_id = NULL`; group → `user_id = NULL, group_id = group`. Editable: `name`, `description`, `icon` (emoji), `cover_color` (#hex). No `cover_url` column — projects don't support a cover image.
- `post_reports`: single `post_id` FK to unified posts; UNIQUE(post_id, reporter_id).
- `invite_codes`: personal = single-use via `claimed_by`; event = `is_multi_use=true`, tracked in `invite_code_uses`.
- `conversations`: `user_id_a/b` sorted canonically to prevent duplicates.
- `posts.is_admin_post` (bool) — set on posts created via `send_admin_post`; rendered with ✦ FROM LUMINARY TEAM header in PostCard.
- `posts.deep_dive_title`/`deep_dive_cover_url`/`deep_dive_cover_position` — explicit title, cover URL, and `object-position` (e.g. `'50% 30%'`) for the 200px feed crop. PublicPostPage renders the cover at natural height and ignores the position. When `deep_dive_title` is empty, PostCard/PublicPostPage fall back to first-line extraction from `content` (legacy posts).
- `posts.target_user_id` (uuid, FK profiles) — gated server-side via `posts_select_feed` RLS; milestone posts use this column.
- `posts.file_deleted_at` (timestamptz, nullable) — set by `delete_user_file`; PostCard/PublicPostPage render a "📎 File removed by author" placeholder.
- **Account deletion FK behaviours**: `conversations.user_id_a/b`, `messages.sender_id`, `comments.user_id` are `ON DELETE SET NULL` so DM threads and discussion structure survive when a user is purged. Authored *posts* still cascade. Frontend renders "Deleted user" + greyed avatar wherever the joined profile resolves to null.
- `profiles.deletion_scheduled_at` (timestamptz, nullable) — soft-delete grace flag. `purge_deleted_accounts()` (pg_cron daily 03:17 UTC) hard-deletes rows older than 30 days. `cancel_account_deletion()` clears it. `posts_with_meta` filters out deletion-pending authors.
- `admin_config` — key/value store: `luminary_board`, `paper_of_week`, `milestone_post_template`, `storage_quota_mb`, `founding_member_cutoff`. Read via `get_admin_config(p_key)`, written via `set_admin_config`. Authenticated users may read `luminary_board`/`paper_of_week`/`milestone_post_template`; quota MB has dedicated `get_storage_quota_mb()`; admins read/write all. **`admin_config.updated_by` is FK to profiles WITHOUT cascade** — wipe RPCs must null it before deleting profiles.
- `profiles.email_notif_*` — five granular email-pref booleans (default true), each gating one Resend email type (`new_follower`, `new_message`, `group_request`, `new_comment`, `invite_redeemed`). Master switch is `profiles.email_notifications`; OFF master skips all transactional email.
- `profiles.welcome_email_sent` — bool. `send-welcome-email` Edge Function flips this true after first send.
- `profiles.lumens_current_period`, `lumens_lifetime`, `current_period_started`, `previous_period_lumens`, `is_founding_member` — `lumens_current_period` drives the sidebar widget + tier; `lumens_lifetime` is monotonic. Tier is computed (not stored): `getTierFromLumens(lumens_current_period)` (frontend) / `compute_tier()` (SQL).
- `lumen_transactions` — append-only log. Columns: `user_id`, `kind`, `value`, `meta` JSONB, `created_at`. RLS: own + admin SELECT; no client INSERT — only via `award_lumens` SECURITY DEFINER RPC.
- `apply_founding_member_status` trigger — sets `profiles.is_founding_member = true` for signups before `admin_config.founding_member_cutoff`.
- `user_storage_files` — append-only log of every uploaded blob. Columns: `user_id`, `bucket`, `path`, `size_bytes`, `mime_type`, `file_name`, `source_kind`, `source_id`. UNIQUE on (bucket, path). Valid `source_kind`: `'post'|'library'|'avatar'|'profile_cover'|'group_avatar'|'group_cover'`. Every post upload (feed/group/project) uses `'post'` with `source_id = posts.id`.
- **`follows.target_id` is TEXT** (polymorphic — stores either `profiles.id` or `groups.id` depending on `target_type`). When comparing to a uuid, cast: `target_id = some_uuid::text`.
- **`reposts.user_id` FK is `ON DELETE NO ACTION`** — destructive ops on auth.users must `delete from reposts where true` first.

## RPCs

All `SECURITY DEFINER`. Admin-only RPCs require `is_admin = true` on the caller's profile.

### Admin-only

- `get_admin_user_list()` — all users with activation_stage, ghost_segment, last_active, lumens_current_period, lumens_lifetime, is_founding_member; bot excluded.
- `get_user_activation_stages()` — funnel counts per activation stage.
- `get_ghost_users()` — users with ≤2 actions, inactive 5+ days.
- `get_at_risk_alerts()` — counts for the three Overview at-risk tiles (ghost users, quiet groups, pending templates).
- `get_at_risk_users(p_limit)` — ≥3 actions, silent 7+ days, signed up 14+ days ago.
- `get_quiet_champions(p_limit)` — 3+ followers but <3 posts: credibility-without-voice users worth a personal nudge.
- `send_admin_nudge(p_target_user_ids, p_message, p_bot_user_id)` — DM users as bot; creates conversation if needed.
- `send_bot_message(p_conversation_id, p_message, p_bot_user_id)` — reply in existing bot conversation.
- `get_bot_conversations(p_bot_user_id)`, `get_bot_conversation_messages(p_conversation_id, p_bot_user_id)` — bot DM reads (bypass RLS).
- `get_invite_codes_with_stats()` — all codes with computed status + creator name.
- `get_invite_tree(p_code)` — per-signup flags + level-2 invitees; branches on `is_multi_use`.
- `get_admin_posts(p_limit, p_offset, p_search, p_type, p_hidden)` — paginated unified-posts table + report_count; returns `{ total, posts }`.
- `get_content_health()` — `{ groups, projects }` each with posts_this_week + last_post_at + health (active/quiet/dead).
- `get_moderation_queue(p_status)` — reported posts aggregated with reports array (reporter/reason/note) plus `context_kind` + `context_id`.
- `get_retention_cohorts()` — D7 (7-14 day cohort active in last 7d) + D30 (30-60 day cohort active in last 30d) with cohort_size, retained, pct.
- `get_weekly_signups()` — last 12 weeks: `[{ week_start, count, cumulative }]`.
- `get_daily_active_users()` — last 30 days: `[{ day, count }]` where active = posted/commented/liked that day.
- `get_signup_method_breakdown(p_days)` — ORCID vs invite-code cohort comparison: avg posts/comments/lumens, % activated.
- `get_work_mode_stats(p_days)` — per-segment users + avg posts/comments/lumens/groups + % w/ publication.
- `get_tier_distribution()` — count + pct at each Lumen tier.
- `get_top_inviters(p_limit)` — codes_created/claimed, active_invitees (≥1 post), conversion_pct.
- `get_feature_adoption()` — % of users who ever posted/commented/joined group/added library item/created project/added publication/sent DM/followed.
- `get_content_performance(p_days)` — per post-type (paper/text/deep_dive): posts, avg_likes, avg_comments, pct_with_3plus_commenters. All contexts.
- `get_lumens_histogram()` — 9 buckets across `lumens_lifetime` (0 / 1-25 / 26-100 / 101-250 / 251-500 / 501-1000 / 1001-2000 / 2001-5000 / 5000+).
- `get_profile_completeness()` — % of users with bio/avatar/publication/orcid/field_tags/work_history.
- `get_consent_rates()` — counts + pct for email_notifications, email_marketing, analytics_consent.
- `get_hot_papers(p_limit)` — papers with ≥2 distinct discussers (admin view, no min-engagement gate); aggregates across all contexts.
- `get_power_posters(p_days, p_limit)` — top posters: name, work_mode, lumens, tier, post_count. All contexts.
- `get_power_commenters(p_days, p_limit)` — top substantive (>50 char) commenters in window.
- `get_admin_config(p_key)` / `set_admin_config(p_key, p_value)` — admin-config kv (non-admins may read three public keys; admins all).
- `send_admin_post(p_mode, p_content, p_bot_user_id, p_post_type, p_paper_*, p_tags, p_group_id, p_target_user_ids, p_is_deep_dive, p_deep_dive_title, p_deep_dive_cover_url, p_image_url)` — modes: `broadcast` (one feed post visibility=public), `targeted` (per-user feed post visibility=private with `target_user_id` set + `admin_post` notification), `group` (one post with `context_kind='group'` + visibility derived from `groups.is_public`). Sets `is_admin_post=true`.
- `admin_wipe_platform()` — destructive reset for fresh testing. Captures storage paths into a temp table, deletes all non-bot users, sweeps tombstoned rows, wipes bot-authored content (preserves bot's avatar/profile_cover), nulls `admin_config.updated_by`, clears `invite_codes`/`invite_code_uses`/`invite_rate_limits`/`waitlist`/`orcid_pending`. Returns `(bucket, path)[]` for the client to sweep storage. **Footguns it has been patched for**: `pg_safeupdate` requires `where true`; `reposts.user_id` FK is non-cascade; `admin_config.updated_by` FK is non-cascade; `follows.target_id` is text-cast-to-uuid; `library_items.added_by` (not user_id).
- `get_waitlist()`, `get_waitlist_count()` — waitlist admin reads.
- `get_admin_storage_usage()` — `{ total_bytes, total_files, per_user, per_bucket }`.
- `get_admin_user_storage_files(p_user_id)` — admin drill-down; same enriched rows as `get_my_storage_usage().files`. Read-only by design.

### Authenticated users

- `claim_invite_code(p_code)` — personal codes only; sets `claimed_by`/`claimed_at`.
- `get_paper_stats_public()` — paper aggregates for POTW algorithm; aggregates across all contexts (a paper in a group post + a feed post counts as one paper). Filters hidden/admin posts, requires non-empty DOI+title, min engagement (≥2 posts OR ≥1 comment); returns `{ paper_doi, paper_title, paper_journal, paper_year (text), discussions, participants, total_comments }`.
- `award_lumens(p_user_id, p_amount, p_reason, p_category, p_meta)` — fire-and-forget; bumps `profiles.lumens_current_period` + `lumens_lifetime`. Skips silently for the bot. **Always wrap in try/catch (or two-arg `.then`) and gate on `LUMENS_ENABLED`** — must never block the user-facing action.
- `get_lumen_history(p_limit)` — own transaction history for `LumensScreen`.
- `get_post_likers(p_post_id, p_limit, p_offset)` — paginated like-list. Inlines the four-policy visibility check + `visibility != 'private'` guard so the SECURITY DEFINER body returns nothing if the caller can't see the post. Powers `LikersModal`.
- `pin_post(p_post_id)` / `unpin_post(p_post_id)` — toggles `posts.pinned_at`. Owner check is enforced inside the RPC: group → `groups.created_by = auth.uid()`; project → `project_members.role='owner' and user_id = auth.uid()`. Feed posts always return false. No-cap by design — the user opted out of capping pinned count.
- `record_storage_file(p_bucket, p_path, p_size_bytes, p_mime_type, p_file_name, p_source_kind, p_source_id)` — fire-and-forget; upserts a `user_storage_files` row keyed on (bucket, path). **Mandatory after every successful `supabase.storage.upload()`** — see Storage tracking convention.
- `delete_user_file(p_id)` — own-only. Returns `{ bucket, path }` for the client to call `supabase.storage.from(bucket).remove([path])`. Side-effects by `source_kind`:
  - `post` → compares stored path against `posts.image_url` and `posts.deep_dive_cover_url`. Regular-attachment match nulls `image_url`/`file_name`/`file_type` and sets `file_deleted_at = now()`. Deep-dive-cover match clears `deep_dive_cover_url` + `deep_dive_cover_position` (does NOT touch `file_deleted_at` — the rest of the article stays). Inline images embedded in deep-dive HTML are not stripped — the storage delete leaves a broken image; the user must edit the post to remove it cleanly.
  - `library` → DELETE the `library_items` row.
  - `avatar`/`profile_cover`/`group_avatar`/`group_cover` → raises (must be replaced, not deleted).
- `cleanup_replaced_storage_files(p_source_kind, p_source_id, p_keep_path)` — own-only. Returns orphan blobs `[{ bucket, path }, ...]` for the client to sweep. Only operates on the four singleton replaceable kinds. **Mandatory at all four singleton upload sites** because the path includes the file extension (`<id>/avatar.<ext>`) — replacing `.jpg` with `.png` writes to a different path and would otherwise leave the old blob + tracking row behind.
- `get_my_storage_usage()` — `{ total_bytes, total_files, buckets, files }`. Each file row enriched with `context_label` (paper title / 80-char content excerpt / library item title / "Profile photo" / "Profile cover" / "Group: NAME"), `context_group_slug` (for `/g/:slug` deep links), and `already_deleted` (true when linked post's `file_deleted_at` is set). Powers `StoragePanel` (Account Settings) + `LibraryFilesView`; the per-user quota check (`checkRemainingQuota`) reads `total_bytes` from here.
- `get_storage_quota_mb()` — integer quota in MB (default 50, sourced from `admin_config.storage_quota_mb`). Granted to all authenticated users.
- `delete_own_account()` — soft-deletes: stamps `profiles.deletion_scheduled_at = now()` + inserts an `account_deletion_scheduled` notification (triggers email with recovery link). Returns the timestamp. Idempotent. Does NOT touch `auth.users`; the user stays signed in and `App.jsx` shows the recovery modal.
- `cancel_account_deletion()` — clears `profiles.deletion_scheduled_at` for the caller.
- `purge_deleted_accounts()` — pg_cron daily 03:17 UTC. Hard-deletes accounts past the 30-day grace; removes their tracked storage blobs first, then `auth.users` (cascade does the rest). NOT granted to authenticated; superuser/cron only.
- `get_my_admin_groups_for_handoff()` — returns groups where the caller is the **only** admin (with co-admin count + `other_members` JSONB sorted by tenure). `AccountSettingsScreen` calls this when entering schedule-delete confirm; the chosen handoff (`UPDATE group_members SET role='admin'`) or dissolution (`DELETE groups`) runs before `delete_own_account()` so groups never end up adminless. If a handoff fails, the schedule aborts cleanly.

## Edge Functions

App-callable functions use the anon JWT from `EDGE_HEADERS` in constants.js. Webhook-fired functions verify any valid Supabase JWT (legacy `anon` key) supplied in the webhook's Authorization header — the new `sb_publishable_*` key format is **not a JWT** and gets rejected with `INVALID_JWT_FORMAT`.

- **`extract-publications`** (`EDGE_FN`): `mode: 'full_cv' | 'publications'`; input `{ base64, mediaType }` for PDF or `{ text }` for plain text; returns `{ result: { profile, work_history, education, honors, languages, skills, publications } }`.
- **`auto-tag`**: input `{ content, paperTitle, paperJournal, paperAbstract }`; returns `{ tags: string[] }`. Enabled by `AUTO_TAG_ENABLED`. Always best-effort (never blocks publish).
- **`orcid-callback`**: ORCID OAuth redirect target; bridges `auth.users` ↔ `orcid_pending`, then redirects back with `?orcid_token=…` for AuthScreen to complete signup. **Must run with `verify_jwt = false`** — the default would 401 the redirect from ORCID since the user has no Supabase JWT yet. Pinned in `supabase/config.toml` under `[functions.orcid-callback]`. Future `supabase functions deploy orcid-callback` runs honour this. Every other Edge Function keeps verification on.
- **`validate-invite`**: server-side invite-code check (legacy; AuthScreen now does this client-side).
- **`send-email-notification`**: webhook on `notifications` INSERT. Dispatches Resend transactional email for `new_follower`, `new_message`, `group_join_request`, `group_request_approved`, `new_comment`, `invite_redeemed`. Inline HTML bodies built per type — Resend's `template_id` is **not** for transactional sends, only for Broadcasts. Gated on master + granular email prefs.
- **`send-welcome-email`**: webhook on `profiles` UPDATE. Sends a one-shot welcome email when `name` is set and `welcome_email_sent = false`, then flips the flag.

## Conventions

### Styling & navigation

- **Always use `T.*` tokens** — never hardcode colours. **No CSS files** — all styles inline. **No React Router** — screen switching via `setScreen(id)` in App; Supabase queries via `.from()` chained calls; no ORM.
- **Public routes** (no auth, no sidebar): `/p/:slug` PublicProfilePage, `/s/:postId` PublicPostPage, `/paper/:doi` PaperDetailPage, `/g/:slug` PublicGroupProfileScreen, `/c/:slug` CardPage, `/privacy`/`/terms`/`/cookies` LegalPage (markdown from `public/legal/*.md`).
- **`/g/:slug` auth'd-member redirect**: when a signed-in user is a member of the group, App.jsx skips PublicGroupProfileScreen and routes them into the in-app group view (sets `activeGroupId`, `screen='groups'`, `replaceState` to `/`). Non-members and unauth visitors keep landing on the public page. Two optional query params on the same URL: `?project=<uuid>` auto-opens that project inside the group (via `initialProjectId`); `?tab=feed|projects|library|members|profile` lands on a specific group tab (via `initialTab`). Both are one-shot — consumed by GroupScreen on first mount and cleared via `onInitialProjectIdConsumed` / `onInitialTabConsumed` callbacks so subsequent re-mounts don't auto-restore. Used for manual deep-link sharing (the Luminary system user-guides project lives at `/g/<slug>?tab=projects` or `/g/<slug>?project=<uuid>`).
- **Deep-dive return-to-context**: `PostCard`'s "Continue reading" handler writes `sessionStorage.post_return_to = { screen, activeGroupId?, initialProjectId? }` before `window.location.href = '/s/:postId'`. App.jsx reads + clears it on mount, restoring the in-app context so the back button on `PublicPostPage` lands the user back in the group/project they were browsing instead of the general feed. Feed posts skip the stash. Logic: group post → `{screen:'groups', activeGroupId: post.context_id}`; project post in a group → `{screen:'groups', activeGroupId: project_group_id, initialProjectId: post.context_id}`; standalone project post → `{screen:'projects', initialProjectId: post.context_id}`. `initialProjectId` is consumed once on first mount of GroupScreen / ProjectsScreen and cleared via `onInitialProjectIdConsumed` callback so subsequent re-mounts don't auto-reopen.
- **Unauthenticated `/`**: shows `LandingScreen` until a sign-in CTA; `App.jsx` tracks via `showAuthScreen` state. Exceptions where AuthScreen renders without a session: `/admin`, ORCID callback (`?orcid_token=…`), ORCID error redirect.
- **Settings deep link**: `?settings=…` opens Account Settings post-auth (used by transactional emails). App.jsx clears the param via `history.replaceState` after opening.
- **sessionStorage keys**: `prefill_paper` (Library/Explore "Share this paper" → PostComposer; doi/title/journal/year/authors/abstract/citation), `open_conversation` (profile "Message" button → MessagesScreen), `prefill_invite_code` (LandingScreen invite form → AuthScreen signup).
- **Responsive**: no media queries; `useWindowSize` returns `{ isMobile }` (< 768px). Mobile pattern: hide 200/220px sidebar, replace with horizontal scrolling pills (GroupScreen / ProjectScreen) or a slide-in drawer (LibraryScreen). Single global bell in App.jsx's mobile top bar (mobile) and the left sidebar nav (desktop).
- **Admin Inbox** is not in the left nav — reachable only via direct section state; AdminShell uses `padding:0, overflow:hidden` when `section === 'inbox'`.

### Posts (unified)

- **Components**: `src/posts/PostCard.jsx` renders feed/group/project posts (branches on `post.context_kind`). `src/posts/PostComposer.jsx` handles create + edit (takes `context = { kind, ... }` and optional `editPost`).
- **Post types**: only `text` and `paper` are selectable. File uploads (image/video/audio/pdf/data/file) attach to text posts and set `post_type` to the upload category. `link` and `tip` types no longer exist.
- **Use `posts_with_meta`** when filtering posts by context — joins are pre-baked.
- **Embedding `profiles` from `posts` (FK disambiguation)**: `posts` has two FKs to `profiles` — `user_id` (author) and `target_user_id` (targeted admin posts). A bare `posts(...,profiles(...))` embed returns `PGRST201 / 300 Multiple Choices`. Pin the join: `posts(...,profiles!posts_user_id_fkey(...))`. Cleaner alternative: read from `posts_with_meta` (author baked in as `author_*`, no embed needed). `comments` and `likes` each have only one FK to profiles, so a bare embed works there.
- **Destructive ops**: chain `.select()` on `.delete()`/`.update()` so RLS rejections (which return `data: null, error: null`) become visible. Pattern reference: `src/projects/ProjectScreen.jsx → deleteProject` and `src/projects/ProjectsScreen.jsx → deleteProject` — both check `data?.length === 0` and surface a clear "delete blocked" alert.
- **`paper_citation`** stored at post-creation time (PostComposer); never fetched lazily in feed cards. Format: `AbbrevJournal. Year Mon;Volume(Issue):Pages. doi: DOI`. Builders: `buildCitationFromCrossRef`/`buildCitationFromEpmc` (utils.js), `buildCitationFromRef` (referenceUtils.js).
- **Tag display**: PostCard pills render bare tag text — no leading `#`. DB stores tags without `#` (PostComposer strips on save).
- **Feed truncation**: PostCard truncates long text posts to ~6 lines with a gradient fade matching the card bg + inline Read more / Show less. Threshold: plain text > 400 chars. Skipped for `post_type === 'paper'`, `is_admin_post`, and `is_deep_dive`. Constants: `TRUNCATE_CHAR_THRESHOLD`, `TRUNCATE_LINE_HEIGHT` at top of `PostCard.jsx`.
- **Deep-dive feed card**: when `is_deep_dive` and content has ≥50 words, body is replaced with a compact article preview — optional cover image (full-width 200px object-cover, rounded top corners via `overflow:hidden`), explicit `deep_dive_title` (or first-line extraction for legacy posts), ~325-char preview, read time, "Continue reading →" navigates to `/s/:postId` via `window.location.href` (so cmd-click opens a new tab). First content line is only stripped from the preview when the title was implicit. Shorter deep dives fall back to the regular text path.
- **Deep-dive edit goes through PostComposer, not inline edit**: PostCard calls `onEditPost(post)` instead of toggling the inline RichTextEditor. App.jsx routes that to PostComposer with `editPost={post}` — pre-fills content/title/cover/position/tags/visibility/paper fields and saves with UPDATE (Lumens / inviter +100 / group notify / auto-tag suppressed in edit mode). Non-deep-dive posts still use the inline editor. The `onEditPost` prop is threaded through `FeedScreen`, `GroupScreen → GroupFeed`, `ProjectsScreen → ProjectScreen → ProjectFeed`, and `GroupScreen → ProjectScreen → ProjectFeed`.
- **Move-to-folder UI** (project context): owner ⋯ menu in `PostCard` includes `📁 Move to folder…` when an `availableFolders={[{id, name}, ...]}` prop is passed. ProjectFeed passes the project's folders. Writes `posts.folder_id`. "All posts" (folder_id=null) is always offered first. PostCard ignores the prop in feed/group context.
- **Likes-list modal** (`src/posts/LikersModal.jsx`): clicking the like count opens a paginated list. 50/page via `get_post_likers`. Wired everywhere PostCard is rendered.
- **Pin to top** (group/project only): PostCard takes a `canPin` prop — true when the viewer is the context owner. When set + `context_kind in ('group','project')`, the ⋯ menu shows `📌 Pin to top` / `📌 Unpin from top`, and a `📌 Pinned` badge renders next to the Deep Dive badge. Wired via `pin_post` / `unpin_post` RPCs (server enforces owner). GroupFeed/ProjectFeed order by `pinned_at desc nullsFirst:false, created_at desc`. GroupFeed only passes `canPin` when no project filter is active — when filtering to a sub-project, pinning happens inside the project view. Feed (public) feed never sees pinned items.

### Rich text & HTML

- **HTML sanitiser** (`src/lib/htmlUtils.js`) — allow-list: `b/strong/i/em/u/h1-h4/ul/ol/li/p/br/a/div/span/blockquote/sup/hr/img/iframe/figure/figcaption`. `img` keeps only `src` (must be `https://`) + `alt` + `loading="lazy"` + `data-size` (kept only when value is `'small'|'medium'|'large'`). `iframe` keeps `src` only if it matches `https://www.youtube.com/embed/<id>` or `https://player.vimeo.com/video/<id>` — anything else is stripped to a text node. Editor's video button funnels input through `toEmbedUrl()` to canonicalise YouTube/Vimeo URLs into the embed form.
- **`htmlToPlain(html)`** — use for plain-text excerpts of sanitised HTML (deep-dive previews, comment previews). Uses the browser's HTML parser to strip tags AND decode entities (`&nbsp;`/`&amp;`/etc.) — a regex-only `.replace(/<[^>]+>/g, '')` leaves entity codes as literal text.
- **RichTextEditor** (`src/components/RichTextEditor.jsx`): the `isDeepDive` prop swaps into article mode — sticky toolbar (`position: sticky; top: 0; zIndex: 50` + soft shadow), WYSIWYG body matching PublicPostPage typography (Source Serif 4 20px, h1-h4 + blockquote + img + iframe), Style dropdown (Paragraph / H1-H4) instead of inline H2/H3, plus 🖼️ image and ▶ video buttons. Image upload writes to `post-files` and follows storage tracking: pass `postId` to record immediately, or `onPendingImage` to hand the upload back for post-publish flushing (PostComposer pattern: `pendingImagesRef` collected in the editor callback, looped through `record_storage_file` after the post insert returns).
- **Pasted HTML** (Word / Docs / web) goes through `normalisePastedHtml()` first — converts style-encoded `font-weight`/`font-style`/`text-decoration` spans into `<strong>`/`<em>`/`<u>`, strips conditional comments + `<xml>` blocks + `o:`/`w:`/`m:`/`v:` namespaced elements that leak Word metadata — then through `sanitiseHtml()` to the allow-list.
- **Inline image resize** (deep-dive): clicking an inline image opens a floating S/M/L/Full toolbar + remove ✕. Choice stored as `data-size="small|medium|large"` on `<img>` (`full` removes the attribute). Resize CSS lives in **`src/components/PostContentStyles.jsx`** mounted globally in `App.jsx` next to `{fonts}` — single source of truth for any post-content rule that must apply across all three render paths (SafeHtml `.rc`, PublicPostPage `.article-body`, RichTextEditor `[data-deep-dive]`). When adding cross-cutting post-content rules, add them to `PostContentStyles` rather than duplicating per scope. **Don't add inline `style` attributes to inserted images** — they outrank the `data-size` selector and break the resize. The composer strips `style` whenever the user picks a new size; the insertHTML for new images intentionally writes no style.
- **Deep-dive composer fields** (PostComposer, `isDeepDive=true`): a serif Title input (saved to `posts.deep_dive_title`) and a Cover image uploader (uploaded immediately to `post-files`, URL saved to `posts.deep_dive_cover_url`, storage row recorded against the post id after the insert returns) render above the RichTextEditor. Both optional. Deep-dive mode is intentionally available in **all** contexts — projects use it for user-guide articles.
- **Compose is always App-level** (PostComposer mounts only at `screen='post'`): GroupFeed and ProjectFeed do NOT mount PostComposer inline. Their compose buttons call an `onOpenCompose(context)` prop (rooted at App.jsx) which sets `composePrefill = { context, returnScreen }` and flips to `screen='post'`. The same path the personal-feed compose button has always taken. Reason: PostComposer's outer wrapper has `overflowY: 'auto'` so the deep-dive sticky toolbar can pin to a single scroll container. Mounting it inline inside a feed (which also has `overflowY: 'auto'`) creates a nested-scroll situation where the toolbar pins to one ancestor but content scrolls in another — text bleeds past the toolbar's z-index plane. App-level mount = single scroll container = sticky behaves identically across all contexts. After publish/cancel, App routes back to `composePrefill.returnScreen` (`'groups'` / `'projects'` / `'feed'`). Edit also goes through App-level (existing path via `setEditingPost(post); setScreen('post')`). Don't add inline composer mounts — they will reintroduce the nested-overflow z-index bug.
- **PublicPostPage article view** (`/s/:postId`): Substack-style — 680px column on `T.bg`, `ReadingProgressBar`, `ArticleHeader` (optional cover + 40px author avatar + title + meta + date + read time, no "Article" badge), `ArticleBody` (20px / 1.7; Source Serif 4 for deep dives; h1-h4/blockquote/img/iframe styles via scoped `.article-body` CSS — sanitised HTML rendered directly so SafeHtml's outer wrapper doesn't collapse the font size to 13px), Paper/file/link/tag tail, `ArticleFooter` (author bio + Follow + Share + Join discussion), `CommentsSection`. Auth detected via `getSession` + `onAuthStateChange`. **Visibility branch**: `'public'` renders for any visitor; `'members'` shows a "this post is in a private group/project — sign in or join" CTA when RLS blocks the read; `'private'` 404s for everyone except author + admins. RLS does the heavy lifting; PublicPostPage adds a defensive client-side guard for the private case.

### Storage

- **Storage tracking (mandatory)**: every `supabase.storage.from(bucket).upload(...)` site MUST follow up with a fire-and-forget `supabase.rpc('record_storage_file', { p_bucket, p_path, p_size_bytes: file.size, p_mime_type: file.type, p_file_name: file.name, p_source_kind, p_source_id }).then(() => {}, () => {})` — otherwise the file is invisible to the user's Files view, the admin roll-up, and the quota check. `source_id` for non-post kinds: `library_items.id`, `user.id` (avatar/profile_cover), `group.id` (group_avatar/cover). Pattern reference: `src/posts/PostComposer.jsx → uploadFileToStorage` returning `{ url, path }`, then `record_storage_file` after the post insert returns.
- **Storage cleanup (mandatory for singletons)**: the four singleton replaceable kinds (`avatar`/`profile_cover`/`group_avatar`/`group_cover`) include the file extension in the path — replacing `.jpg` with `.png` writes to a different path. Upload site MUST also call `cleanup_replaced_storage_files(p_source_kind, p_source_id, p_keep_path)` after `record_storage_file` and `supabase.storage.from(bucket).remove(...)` the returned orphan paths. Pattern reference: `src/profile/ProfileScreen.jsx` `uploadAvatar`/`uploadCover` and `src/groups/GroupProfile.jsx` `uploadAvatar`/`uploadCover`.
- **Cache-bust upsert URLs**: storage upserts to a fixed path (`<userId>/avatar.<ext>`, `group-avatars/<groupId>.<ext>`, `group-covers/<groupId>.<ext>`) keep the public URL string identical between uploads, so browsers serve cached bytes. Append `?v=<Date.now()>` to the URL stored on `profiles.avatar_url`/`groups.avatar_url`/`groups.cover_url` so the next render forces a fresh fetch. Storage ignores the query param.
- **Storage quota (mandatory check)**: non-singleton uploads (post attachments, deep-dive covers + inline images, library PDFs, group post attachments, group library PDFs) MUST call `await checkRemainingQuota(file.size)` from `src/lib/storageQuota.js` BEFORE the storage upload runs, and abort if it returns a non-null error string. Per-file size caps live alongside in `FILE_LIMITS` constants per call site; the helper handles total-cap math. Singleton uploads skip the quota check (replace-on-upload makes the net delta near zero) but per-file caps still apply. Visual indicator: `<StorageQuotaBar usedBytes quotaBytes />` — green <80%, amber 80–99%, rose ≥100%. Default quota 50 MB; admin edits via `/admin → Storage` (writes `admin_config.storage_quota_mb`).
- **Per-user UI**: `get_my_storage_usage()` powers `StoragePanel` (Account Settings) + `LibraryFilesView` (the Files view inside LibraryScreen). Deletion goes through `delete_user_file(p_id)` which returns `{ bucket, path }` for the client to call `supabase.storage.from(bucket).remove([path])`.
- **Avatar crop pattern**: user avatar (`ProfileScreen`) and group avatar (`GroupProfile`) uploads run through `AvatarCropModal` (`react-easy-crop`, square crop, circular preview, zoom slider, output 512×512 in the original MIME). The cropped Blob is wrapped back into a `File` so the existing `uploadAvatar` flow + `record_storage_file` keep working unchanged. Group covers do NOT use the crop modal — see CoverRepositioner.
- **CoverRepositioner** (`src/components/CoverRepositioner.jsx`): shared drag-to-reposition for deep-dive covers (PostComposer, height 200) and group covers (GroupProfile edit mode, height 160). Vertical position only, returns 0–100 % stored as `object-position: 50% Y%`. Touch + mouse. Optional `onDragEnd` for callers that persist on release (group cover saves immediately; deep-dive cover saves with the post insert).

### Lumens (gamification)

- Live system. **`LUMENS_ENABLED` flag in constants.js gates every `award_lumens` call site** — never call the RPC unconditionally.
- **Earning sites** (frontend, no DB triggers): `post_created` (PostComposer +5, **suppressed in edit mode**), `comment_posted` (PostCard +2), `comment_received` (PostCard +10, deduped to first comment per commenter via `lumen_transactions` lookup), `post_reposted` (PostCard +20, skip self), `discussion_threshold` (PostCard +50 when distinct commenter count just hits 3, deduped via `lumen_transactions`), `invited_user_active` (PostComposer +100, async IIFE on first post, **only on initial create**).
- Every call site uses the two-arg form `.then(() => {}, () => {})` (NOT `.catch()` — see Misc) so failures cannot block the user-facing action. After awarding, optimistic `setProfile(p => ({ ...p, lumens_current_period: p.lumens_current_period + N }))` keeps the sidebar widget in sync; cross-user updates flow through the realtime profile subscription.
- **Tiers**: `Catalyst` 0–499 / `Pioneer` 500–1999 / `Beacon` 2000–4999 / `Luminary` 5000+ (from `TIER_CONFIG`). Only `luminary` tier renders any visible decoration: a gold (`#C9A961`) ring on the avatar via the optional `tier` prop on `Av`. Feed `PostCard` avatars do **not** yet pass the tier — gold ring is currently visible on profile pages and the sidebar widget only.
- **Lumens analytics** (`captureLumensEarned` in `src/lib/analytics.js`): every `award_lumens` site fires a `lumens_earned` PostHog event. Self-award sites pass `prevLumens` so the helper also fires `tier_reached` when the award crosses a `getTierFromLumens` threshold. Cross-user awards skip `prevLumens` and tag `recipient_id` in meta.
- **Realtime profile sync**: `App.jsx` subscribes to a `postgres_changes` UPDATE on the user's own `profiles` row (channel `profile-self-${userId}`) and merges `payload.new` into `profile` state. Required because `award_lumens` runs server-side; this is what keeps the sidebar Lumens count in sync after a fire-and-forget RPC. Requires `alter publication supabase_realtime add table profiles;`.

### Notifications

- **Denormalisation**: group/paper context (e.g. `group_id`, `group_name`, `paper_title`) is written into `notifications.meta` JSONB at insert time. NotifsScreen reads meta directly without re-joining; emails read meta in the Edge Function. Renaming a group later does not retroactively update existing notifications.
- **Dedup**: DM send (`MessagesScreen.sendMessage`) and comment publish (`PostCard.submitComment`/`submitQuickReply`) only insert a notification if no unread notification of the same type already exists for the same `target_id`. Prevents bell-spam and per-message email floods on active threads.
- **Insert sites** (frontend, no DB triggers): follow → FollowBtn; DM → MessagesScreen; comment → PostCard; group join request → GroupScreen.JoinRequestPanel; approve/leave/alumni/public-join → GroupMembers + GroupScreen.PublicJoinPanel; invite redeemed → AuthScreen.handleInviteSignup.

### Misc

- **work_mode** adapts UI but never restricts access. `clinician_scientist` shows researcher view (h-index, citations), not clinical stats. `WORK_MODE_MAP` in constants.js maps id → `{ icon, label }`.
- **`LUMINARY_TEAM_USER_ID`** in constants.js — UUID `af56ef6f-635a-438b-8c8a-41cc84751bca`; bot account; `is_admin` is NOT set on its profile.
- **Invite code validation (AuthScreen)**: multi-use event codes check `uses_count >= max_uses`; personal codes check `claimed_by IS NOT NULL`. Validated `codeRow` in useRef used post-signup to insert `invite_code_uses` (event) or call `claim_invite_code` RPC (personal).
- **Group RLS** uses SECURITY DEFINER helpers (`get_my_group_ids()`, `get_my_admin_group_ids()`, etc.) to avoid infinite recursion.
- **Fuzzy dedup** for profile imports: `deduplicateSectionFuzzy` + `scoreWorkMatch`/`scoreEduMatch` in utils.js.
- **projectTemplates.js**: `FAST_TEMPLATES` (fast-4 picker), `GALLERY_TEMPLATES` (gallery-only); `galleryOnly: true` excluded from the fast-4 picker; `applyTemplate(template, name, projectId, userId)` → `{ folders, posts }`.
- **Analytics**: PostHog consent-gated via `analytics_consent_at` on profiles. `capture(event, properties)` from `src/lib/analytics.js` — call after successful Supabase operations. Never call before the await or in an error branch.
- **Fire-and-forget supabase.rpc**: `supabase.rpc()` returns a `PostgrestBuilder` which is `PromiseLike` (implements `.then()` only). It does **not** have `.catch()` — calling `.catch(() => {})` throws `TypeError: ....catch is not a function` synchronously and aborts the surrounding async function. Use the two-arg form `.then(() => {}, () => {})` for fire-and-forget rpc calls (or `await` inside a try/catch). Same applies to `supabase.from(...).select/insert/update/delete()` chains.
- **ORCID badge** (`src/components/OrcidBadge.jsx` + `OrcidIcon.jsx`): the iD logo only renders next to authenticated iDs (`profiles.orcid_verified === true`, set by the OAuth signup path in `AuthScreen`). The OrcidImporter never sets that flag, so importer-only users get the link without the icon — matches ORCID's brand guidance distinguishing authenticated vs asserted iDs. Wired into ProfileScreen / UserProfileScreen / PublicProfilePage. The icon alone is also used on the AuthScreen + LandingScreen "Sign in / Join with ORCID" buttons.
