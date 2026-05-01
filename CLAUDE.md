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

**No React Router.** Navigation is state-based in `App.jsx` via a `screen` state variable. The one exception is public profile pages (`/p/:slug`), which are detected from `window.location.pathname` in a `useState` initializer, before auth runs. `vercel.json` has a SPA rewrite rule.

**All inline styles** using design tokens from `src/lib/constants.js`. No CSS files, no CSS modules, no Tailwind.

**Design tokens** (import `T` from `src/lib/constants.js`):
```
T.bg    = #f2f3fb   (app background)
T.w     = #fff      (card/panel background)
T.s2    = #f7f8fe   (input background)
T.s3    = #eef0fc   (subtle)
T.bdr   = #e3e5f5   (border)
T.text  = #1b1d36   (body text)
T.mu    = #7a7fa8   (muted text)
T.v     = #6c63ff   (violet primary)
T.v2    = #eeecff   (violet tint)
T.v3    = #5a52e8   (violet dark)
T.bl    = #4285f4   (blue)
T.bl2   = #e8f0fe   (blue tint)
T.gr    = #10b981   (green)
T.gr2   = #ecfdf5   (green tint)
T.am    = #f59e0b   (amber)
T.am2   = #fef3c7   (amber tint)
T.ro    = #f43f5e   (rose/error)
T.ro2   = #fff1f3   (rose tint)
T.te    = #0ea5e9   (teal)
T.te2   = #f0f9ff   (teal tint)
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

> `src/screens/GroupsScreen.jsx` is legacy — do not edit; active groups screen is `src/groups/GroupsScreen.jsx`.

**Phase 15 file changes**: `src/feed/PostCard.jsx`, `src/groups/GroupPostCard.jsx`, `src/groups/GroupNewPost.jsx`, `src/projects/ProjectPostCard.jsx`, and `src/screens/NewPostScreen.jsx` no longer exist — they were collapsed into `src/posts/PostCard.jsx` + `src/posts/PostComposer.jsx`. Don't write new code that imports from those paths.

## Database Tables

**Core:** `profiles`, `posts` (unified for feed + group + project; `posts_with_meta` view), `likes`, `comments`, `reposts`, `follows`, `publications`, `notifications`, `conversations`, `messages`, `saved_posts`, `lumen_transactions`, `user_storage_files`

**Groups:** `groups` (`groups_with_stats` view), `group_members`, `group_join_requests`, `group_invites`, `group_follows`. **No `group_posts*` tables** — group content lives in unified `posts` with `context_kind = 'group'`.

**Library:** `library_folders`, `library_items`, `bookmark_folders`

**Projects:** `projects`, `project_members`, `project_folders`, `community_templates`, `community_template_ratings`. **No `project_posts*` tables** — project content lives in unified `posts` with `context_kind = 'project'`.

**Admin/Auth:** `invite_codes`, `invite_code_uses`, `invite_rate_limits`, `post_reports`, `orcid_pending`, `waitlist`, `admin_config`

**Non-obvious schema facts:**
- **Unified `posts` schema** (Phase 15): every post — feed / group / project — lives in this one table. Key columns:
  - `context_kind` text NOT NULL CHECK in (`'feed'|'group'|'project'`)
  - `context_id` uuid — null for feed; `groups.id` for group; `projects.id` for project. CHECK enforces `(context_kind = 'feed') = (context_id is null)`.
  - `visibility` text NOT NULL CHECK in (`'public'|'members'|'private'`) — drives both RLS branches and the `/s/:postId` public-URL gate. `public` = world-readable; `members` = context membership required; `private` = author + admin only.
  - Plus all the prior post columns: `user_id`, `content`, `post_type`, `paper_*`, `image_url`/`file_name`/`file_type`/`file_deleted_at`, `is_deep_dive` + `deep_dive_title` / `deep_dive_cover_url` / `deep_dive_cover_position`, `tags`, `tier1`, `tier2`, `is_admin_post`, `target_user_id`, `hidden`, `created_at`, `edited_at`. Phase 15 dropped the unused `is_featured` / `featured_until` / `featured_at` columns.
  - A `posts_validate_context` BEFORE INSERT/UPDATE trigger validates that `context_id` actually points at a real `groups.id` / `projects.id` row (in addition to the CHECK).
  - Indexes: partial composite indexes on `(created_at desc) where context_kind='feed' and not hidden`, `(context_id, created_at desc) where context_kind='group' and not hidden`, same for project; plus `(paper_doi)` partial, `(target_user_id)` partial, `(is_admin_post, created_at desc)` partial.
- **`posts_with_meta` view** (Phase 15): one view for all contexts. Joins `profiles` (author, with `deletion_scheduled_at is null` filter), LEFT JOIN `groups` (when `context_kind='group'`), LEFT JOIN `projects` (when `context_kind='project'`). Exposes denormalised `author_*`, `group_name`, `group_slug`, `group_is_public`, `project_name`, `project_icon`, `project_cover_color`, `project_group_id` (parent group of a group-owned project — used by composer to surface the "this project is owned by Group X" heads-up). Plus aggregates `like_count`, `comment_count`, `repost_count`, `user_liked`, `user_reposted`, `report_count`.
- **Five RLS policies on `posts`** all OR'd by Postgres: `posts_select_own` (`user_id = auth.uid()`); `posts_select_feed` (feed posts that are not hidden, not private, and either not targeted or targeted at the caller); `posts_select_group` (group posts not hidden / not private, where the caller is a group member or the group `is_public`); `posts_select_project` (project posts not hidden / not private, where the caller is a project member OR a member of the project's parent group — the user-guide pattern); `posts_select_admin` (admin sees everything). INSERT policy gates context membership — feed posts free, group/project posts require membership. Admin can do all (used for moderation hide/edit/delete).
- **Unified `likes` and `comments`** — primary key `(post_id, user_id)` for likes. Comments are flat (no `parent_id`). Both have RLS gated on whether the caller can SELECT the parent post. Admin override on comments for moderation.
- `profiles.work_mode`: `'researcher'|'clinician'|'industry'|'clinician_scientist'` (`'clinician_scientist'` replaced legacy `'both'`)
- `profiles.admin_notes`: internal only, never shown to users
- `profiles.is_admin` is locked down (Phase 14): a `block_self_admin` BEFORE UPDATE trigger rejects flips unless the caller is already admin, and `auth.uid() IS NULL` (dashboard SQL / service role) bypasses. Promotion is therefore SQL-editor-only.
- `groups.created_by` is authoritative owner (`owner_id` was dropped in Phase 12.2 — never use)
- `groups.is_public` is authoritative visibility (`is_private` is legacy — never use)
- `group_members.role` is plain TEXT (`'admin'|'member'|'alumni'`), not a PostgreSQL enum; legacy `'owner'` was migrated → `'admin'`
- `library_items.folder_id` NULL = Unsorted inbox; query with `.is('folder_id', null)` not `.eq`. The owner FK is `library_items.added_by` (NOT `user_id`) and is `ON DELETE SET NULL`.
- `bookmark_folders` — user's bookmark tree. Self-FK `parent_id` (CASCADE delete) gives nested folders; frontend caps at 2 levels (top + one level of subfolders). RLS: own-only.
- `saved_posts` schema post-Phase-15: `(id, user_id, post_id, folder_id, saved_at)`. Single `post_id` covers all contexts. The legacy `saved_posts.group_post_id` was dropped.
- `projects`: personal → `user_id = created_by, group_id = NULL`; group → `user_id = NULL, group_id = group`. Editable fields: `name`, `description`, `icon` (emoji), `cover_color` (#hex). No `cover_url` column — projects don't support a cover image.
- `post_reports` post-Phase-15: single `post_id` FK to unified posts; UNIQUE(post_id, reporter_id). The old `group_post_id` column + the exclusive CHECK constraint were dropped.
- `invite_codes`: personal = single-use via `claimed_by`; event = `is_multi_use=true`, tracked in `invite_code_uses`
- `conversations`: `user_id_a/b` sorted canonically to prevent duplicates
- `posts.is_admin_post` (bool, default false) — set on posts created via `send_admin_post` RPC; shown with ✦ FROM LUMINARY TEAM header in PostCard
- `groups.cover_position` (text, default `'50% 50%'`) — `object-position` value for the group cover crop, set by the drag-to-reposition UI in GroupProfile edit mode. Honoured at every group cover render site.
- `posts.deep_dive_title`, `posts.deep_dive_cover_url`, `posts.deep_dive_cover_position` (text) — explicit title, cover image URL, and `object-position` value (e.g. `'50% 30%'`) for the 200px feed crop. The composer's `CoverRepositioner` lets the user drag the cover to pick what's visible. PublicPostPage renders the cover at natural height and ignores the position. When `deep_dive_title` is empty, PostCard / PublicPostPage fall back to extracting the title from the first line of `content` (legacy behaviour for posts written before these columns existed).
- **Account deletion FK behaviours** (Phases 12.2 + 12.4 + 15): `conversations.user_id_a/b`, `messages.sender_id`, and the unified `comments.user_id` are `ON DELETE SET NULL` so DM threads and discussion structure survive when a user is purged. Authored *posts* still cascade (right-to-be-forgotten on top-level content). Frontend renders "Deleted user" + greyed avatar wherever the joined profile resolves to null.
- `posts.target_user_id` (uuid, FK profiles) — targeted posts are gated server-side via the `posts_select_feed` RLS policy (`target_user_id is null or target_user_id = auth.uid()`); milestone posts also use this column.
- `admin_config` — key/value store for admin-controlled settings; keys: `luminary_board`, `paper_of_week`, `milestone_post_template`, `storage_quota_mb`, `founding_member_cutoff`; read via `get_admin_config(p_key)`, written via `set_admin_config(p_key, p_value)`; RLS + RPC allow all authenticated users to read `luminary_board`, `paper_of_week`, `milestone_post_template`; the quota MB has its own dedicated `get_storage_quota_mb()` reader; admins can read/write all keys. `admin_config.updated_by` is FK to profiles WITHOUT cascade — the wipe RPC nulls it before deleting profiles.
- `profiles.email_notif_new_follower`, `email_notif_new_message`, `email_notif_group_request`, `email_notif_new_comment`, `email_notif_invite_redeemed` — granular email-pref booleans (default true), each gating one Resend email type. Master switch is `profiles.email_notifications`; an OFF master skips all transactional email regardless of granular state.
- `profiles.welcome_email_sent` — bool, default false. The `send-welcome-email` Edge Function flips this to true after first send so subsequent profile UPDATEs don't re-send. Existing users were backfilled to true in `migration_email_notifications.sql`.
- `profiles.lumens_current_period`, `lumens_lifetime`, `current_period_started`, `previous_period_lumens`, `is_founding_member` — added in `migration_gamification.sql`. `lumens_current_period` drives the sidebar widget and tier; `lumens_lifetime` is monotonic. Tier is computed (not stored) via `getTierFromLumens(lumens_current_period)` (frontend) / `compute_tier()` (SQL helper).
- `lumen_transactions` — append-only log of every Lumen award. Columns: `user_id`, `kind` (e.g. `post_created`, `comment_received`, `discussion_threshold`), `value`, `meta` JSONB (e.g. `{ post_id, commenter_id }`), `created_at`. RLS allows users to SELECT own rows + admins to SELECT all; no client INSERT — only via `award_lumens` SECURITY DEFINER RPC.
- `admin_config.founding_member_cutoff` — JSONB seeded by migration; `apply_founding_member_status` trigger sets `profiles.is_founding_member = true` for signups before cutoff.
- `user_storage_files` — append-only-ish log of every uploaded blob. Columns: `user_id`, `bucket`, `path`, `size_bytes`, `mime_type`, `file_name`, `source_kind`, `source_id`. UNIQUE on (bucket, path) so avatar replacements (`upsert: true`) overwrite the row instead of duplicating. Post-Phase-15 valid `source_kind` values: `'post'|'library'|'avatar'|'profile_cover'|'group_avatar'|'group_cover'`. The legacy `'group_post'` kind is dead — every post upload (feed / group / project) uses `source_kind='post'` and `source_id=posts.id`.
- `posts.file_deleted_at` — timestamptz, nullable. Set by `delete_user_file` when the user deletes an attachment; image_url/file_name/file_type are nulled out at the same time. The unified PostCard / PublicPostPage render a "📎 File removed by author" placeholder when this is set instead of the file preview.
- `profiles.deletion_scheduled_at` (timestamptz, nullable) — set by `delete_own_account()` to mark a 30-day soft-delete grace window. `purge_deleted_accounts()` (pg_cron daily) hard-deletes any row where this is older than 30 days. `cancel_account_deletion()` clears it. `posts_with_meta` filters out deletion-pending authors via the join.
- `follows.target_id` is **TEXT** (polymorphic — stores either a `profiles.id` or `groups.id` depending on `target_type`). When comparing to a uuid, cast: `target_id = some_uuid::text`. The Phase 14.1 wipe RPC was bitten by this.
- `reposts.user_id` FK to profiles is `ON DELETE NO ACTION` — the wipe RPC explicitly `delete from reposts where true` before the auth.users delete to avoid a FK violation.

## RPCs

All are SECURITY DEFINER. Admin-only RPCs require `is_admin = true` on the caller's profile.

**Admin-only:**
- `get_admin_user_list()` — all users with activation_stage, ghost_segment, last_active, **lumens_current_period, lumens_lifetime, is_founding_member**; bot excluded
- `get_user_activation_stages()` — funnel counts per activation stage
- `get_ghost_users()` — users with ≤2 actions, inactive 5+ days
- `get_at_risk_alerts()` — counts for the three Overview at-risk tiles (ghost users, quiet groups, pending templates). Phase 15 rewrote this to query unified posts.
- `send_admin_nudge(p_target_user_ids, p_message, p_bot_user_id)` — DM users as bot; creates conversation if needed
- `send_bot_message(p_conversation_id, p_message, p_bot_user_id)` — reply in existing bot conversation
- `get_bot_conversations(p_bot_user_id)` — all bot conversations (bypasses RLS)
- `get_bot_conversation_messages(p_conversation_id, p_bot_user_id)` — messages for a bot conversation
- `get_invite_codes_with_stats()` — all codes with computed status + creator name
- `get_invite_tree(p_code)` — per-signup flags + level-2 invitees; branches on `is_multi_use`
- `get_admin_posts(p_limit, p_offset, p_search, p_type, p_hidden)` — paginated unified-posts table + report_count; returns `{ total, posts }`. Phase 15 dropped the `p_featured` arg and the `link_*` columns from the result.
- `get_content_health()` — returns `{ groups, projects }` each with posts_this_week + last_post_at + health (active/quiet/dead). Reads from unified posts.
- `get_moderation_queue(p_status)` — single posts table now (no UNION). Returns reported posts aggregated with reports array (reporter/reason/note) plus the post's `context_kind` + `context_id`.
- `get_retention_cohorts()` — D7 (7-14 day cohort active in last 7d) + D30 (30-60 day cohort active in last 30d) with cohort_size, retained, pct
- `get_weekly_signups()` — last 12 weeks: `[{ week_start, count, cumulative }]`
- `get_daily_active_users()` — last 30 days: `[{ day, count }]` where active = posted/commented/liked that day
- `get_signup_method_breakdown(p_days)` — ORCID vs invite-code cohort comparison: avg posts/comments/lumens, % activated
- `get_work_mode_stats(p_days)` — per-segment users + avg posts/comments/lumens/groups + % w/ publication
- `get_tier_distribution()` — count + pct at each Lumen tier (catalyst/pioneer/beacon/luminary)
- `get_top_inviters(p_limit)` — top inviters: codes_created/claimed, active_invitees (≥1 post), conversion_pct
- `get_feature_adoption()` — % of users who ever posted/commented/joined group/added library item/created project/added publication/sent DM/followed
- `get_content_performance(p_days)` — per post-type (paper/text/deep_dive): posts, avg_likes, avg_comments, pct_with_3plus_commenters. Counts across all contexts post-Phase-15.
- `get_lumens_histogram()` — 9 buckets across `lumens_lifetime` (0 / 1-25 / 26-100 / 101-250 / 251-500 / 501-1000 / 1001-2000 / 2001-5000 / 5000+)
- `get_profile_completeness()` — % of users with bio / avatar / publication / orcid / field_tags / work_history
- `get_consent_rates()` — counts + pct for email_notifications, email_marketing, analytics_consent
- `get_hot_papers(p_limit)` — papers with ≥2 distinct discussers (admin view, no min-engagement gate); aggregates across all contexts (a paper discussed in a group + the feed counts as one paper)
- `get_power_posters(p_days, p_limit)` — top posters in window: name, work_mode, lumens, tier, post_count. Counts across all contexts.
- `get_power_commenters(p_days, p_limit)` — top substantive (>50 char) commenters in window
- `get_at_risk_users(p_limit)` — ≥3 actions, silent 7+ days, signed up 14+ days ago
- `get_quiet_champions(p_limit)` — 3+ followers but <3 posts: credibility-without-voice users worth a personal nudge
- `get_admin_config(p_key)` — returns `value` JSONB; non-admins may read `luminary_board`, `paper_of_week`, `milestone_post_template`; admins read all
- `set_admin_config(p_key, p_value)` — upserts admin config; admin only
- `send_admin_post(p_mode, p_content, p_bot_user_id, p_post_type, p_paper_doi, p_paper_title, p_paper_journal, p_paper_year, p_paper_authors, p_paper_abstract, p_paper_citation, p_tags, p_group_id, p_target_user_ids, p_is_deep_dive, p_deep_dive_title, p_deep_dive_cover_url, p_image_url)` — Phase 15 signature. Modes: `broadcast` (one feed post visibility=public), `targeted` (per-user feed post visibility=private with `target_user_id` set + `admin_post` notification), `group` (one post with `context_kind='group'` + visibility derived from `groups.is_public`). Sets `is_admin_post=true`. Phase 15 used a DO-block to drop all prior overloads (paper_year-as-int + bg_color variants accreted over time).
- `admin_wipe_platform()` (Phase 14.1) — destructive reset for fresh testing. Captures storage paths into a temp table, deletes all non-bot users, sweeps tombstoned rows, wipes bot-authored content (preserves bot's avatar/profile_cover), nulls `admin_config.updated_by` for non-bot rows, clears `invite_codes`/`invite_code_uses`/`invite_rate_limits`/`waitlist`/`orcid_pending`. Returns `(bucket, path)[]` for the client to sweep storage blobs. Several footguns this RPC has been patched for (in this order): `pg_safeupdate` requires `where true`; `reposts.user_id` FK is non-cascade; `admin_config.updated_by` FK is non-cascade; `follows.target_id` is text-cast-to-uuid; `library_items.added_by` (not user_id).
- `get_waitlist()` (Phase 14.1) — admin-only, ordered by created_at desc; returns id/full_name/email/institution/role_title/referral_source/is_priority/created_at
- `get_waitlist_count()` (Phase 14.1) — count for the dashboard stat card

**Authenticated users:**
- `claim_invite_code(p_code)` — personal codes only; sets `claimed_by`/`claimed_at`
- `get_paper_stats_public()` — paper aggregates for POTW algorithm; aggregates across all contexts post-Phase-15 (a paper in a group post + a feed post counts as one paper). Filters hidden/admin posts, requires non-empty DOI+title, min engagement (≥2 posts OR ≥1 comment); returns `{ paper_doi, paper_title, paper_journal, paper_year (text), discussions, participants, total_comments }`
- `award_lumens(p_user_id, p_amount, p_reason, p_category, p_meta)` — fire-and-forget; inserts a `lumen_transactions` row + bumps `profiles.lumens_current_period` and `lumens_lifetime`. Skips silently for the Luminary Team bot. Always wrapped in `try/catch` (or two-arg `.then(() => {}, () => {})`) and gated on `LUMENS_ENABLED` at call sites — must never block the user-facing action.
- `get_lumen_history(p_limit)` — own transaction history for `LumensScreen`
- `get_post_likers(p_post_id, p_limit, p_offset)` (Phase 15) — paginated list of users who liked a post. Returns `(user_id, name, slug, avatar_color, avatar_url, work_mode, is_following, liked_at)`. Inlines the four-policy visibility check + `visibility != 'private'` guard so the SECURITY DEFINER body returns nothing if the caller can't see the post. Powers `LikersModal`.
- `record_storage_file(p_bucket, p_path, p_size_bytes, p_mime_type, p_file_name, p_source_kind, p_source_id)` — fire-and-forget; upserts a `user_storage_files` row keyed on (bucket, path). **Must be called after every successful `supabase.storage.upload()`** — see Storage tracking convention below.
- `delete_user_file(p_id)` — own-only. Returns `{ bucket, path }` for the client to call `supabase.storage.from(bucket).remove([path])`. Side-effects by `source_kind`: for `post`, the RPC compares the stored path against `posts.image_url` and `posts.deep_dive_cover_url` — a regular attachment match nulls `image_url`/`file_name`/`file_type` and sets `file_deleted_at = now()` (PostCard/PublicPostPage placeholder); a deep-dive cover match clears `deep_dive_cover_url` + resets `deep_dive_cover_position` and **does not** touch file_deleted_at (the rest of the article stays). Inline images embedded in the deep-dive HTML are not stripped (the storage delete leaves a broken image — the user must edit the post to remove inline images cleanly). `library` → DELETE the library_items row. `avatar`/`profile_cover`/`group_avatar`/`group_cover` → raises (must be replaced, not deleted). The legacy `'group_post'` source_kind branch was dropped in Phase 15.
- `cleanup_replaced_storage_files(p_source_kind, p_source_id, p_keep_path)` — own-only. Returns `[{ bucket, path }, ...]` for the orphan blobs the client should sweep via `supabase.storage.remove()`. Only operates on the four singleton replaceable kinds (`avatar`, `profile_cover`, `group_avatar`, `group_cover`). Mandatory follow-up at all four upload sites because the storage path includes the file extension (`<id>/avatar.<ext>`) — replacing a `.jpg` with a `.png` writes to a different path and would otherwise leave the old blob + tracking row behind.
- `get_my_storage_usage()` — returns `{ total_bytes, total_files, buckets: [{bucket, bytes, files}], files: [...] }`. Each file row is enriched (via `migration_storage_enriched.sql`) with `context_label` (paper title / 80-char content excerpt / library item title / "Profile photo" / "Profile cover" / "Group: NAME"), `context_group_slug` (so the client can build `/g/:slug` deep links for group items), and `already_deleted` (true when the linked post's `file_deleted_at` is set). Powers the `StoragePanel` summary in Account Settings + the `LibraryFilesView` review UI inside LibraryScreen; the per-user quota check (`src/lib/storageQuota.js → checkRemainingQuota`) reads `total_bytes` from here.
- `get_storage_quota_mb()` — returns the integer quota in MB (default 50, sourced from `admin_config.storage_quota_mb`). Granted to all authenticated users. Admins edit via the existing `set_admin_config('storage_quota_mb', N)` from the admin Storage section.
- `delete_own_account()` — soft-deletes: stamps `profiles.deletion_scheduled_at = now()` and inserts an `account_deletion_scheduled` notification (which triggers the email webhook with the recovery link). Returns the timestamp. Idempotent — re-calling returns the existing schedule. Does NOT touch `auth.users`; the user stays signed in and `App.jsx` shows the recovery modal.
- `cancel_account_deletion()` — clears `profiles.deletion_scheduled_at` for the caller. Wired to the recovery modal's "Cancel deletion" button.
- `purge_deleted_accounts()` — pg_cron job (scheduled daily at 03:17 UTC). Hard-deletes accounts past the 30-day grace: removes their tracked storage blobs first, then `auth.users` (cascade does the rest). NOT granted to authenticated; superuser/cron only.
- `get_my_admin_groups_for_handoff()` — returns groups where the caller is the **only** admin (with co-admin count and an `other_members` JSONB array sorted by tenure). `AccountSettingsScreen` calls this when entering the schedule-delete confirm flow and renders a per-group successor dropdown; the chosen handoff (`UPDATE group_members SET role='admin'`) or dissolution (`DELETE groups`) runs before `delete_own_account()` so groups never end up adminless. If a handoff fails the schedule aborts cleanly.

**Admin storage:**
- `get_admin_storage_usage()` — returns `{ total_bytes, total_files, per_user: [...], per_bucket: [...] }`. Admin only.
- `get_admin_user_storage_files(p_user_id)` — admin-only drill-down used by the admin Storage section row expand. Returns the same enriched file rows as `get_my_storage_usage().files` for any user. Read-only by design — admins do not delete user files via this UI; they use the existing moderation tools (hide post, etc.).

## Edge Functions

App-callable functions use the anon JWT from `EDGE_HEADERS` in constants.js. Webhook-fired functions verify any valid Supabase JWT (legacy `anon` key) supplied in the webhook's Authorization header — the new `sb_publishable_*` key format is not a JWT and gets rejected with `INVALID_JWT_FORMAT`.

- **`extract-publications`** (`EDGE_FN`): `mode:'full_cv'` or `mode:'publications'`; input `{ base64, mediaType }` for PDF or `{ text }` for plain text; returns `{ result: { profile, work_history, education, honors, languages, skills, publications } }`
- **`auto-tag`**: input `{ content, paperTitle, paperJournal, paperAbstract }`; returns `{ tags: string[] }`; enabled by `AUTO_TAG_ENABLED` in constants.js; always best-effort (never blocks publish)
- **`orcid-callback`**: ORCID OAuth redirect target; bridges `auth.users` ↔ `orcid_pending` row, then redirects back with `?orcid_token=…` for AuthScreen to complete signup. **Must run with `verify_jwt = false`** — the default would 401 the redirect from ORCID since the user has no Supabase JWT yet. Pinned in `supabase/config.toml` under `[functions.orcid-callback]`. Future `supabase functions deploy orcid-callback` runs honour this. Every other Edge Function keeps verification on.
- **`validate-invite`**: server-side invite-code check (legacy; AuthScreen now does this client-side)
- **`send-email-notification`**: webhook-triggered on `notifications` INSERT. Dispatches Resend transactional email for `new_follower`, `new_message`, `group_join_request`, `group_request_approved`, `new_comment`, `invite_redeemed`. Inline HTML bodies built per type — Resend's `template_id` is **not** for transactional sends, only for Broadcasts. Gated on master + granular email prefs.
- **`send-welcome-email`**: webhook-triggered on `profiles` UPDATE. Sends a one-shot welcome email when `name` is set and `welcome_email_sent = false`, then flips the flag.

## Conventions

- **Always use `T.*` tokens** — never hardcode colours
- **No CSS files** — all styles inline
- **No React Router** — screen switching via `setScreen(id)` in App; Supabase queries use `.from()` chained calls; no ORM
- **Unified post components** (Phase 15): `src/posts/PostCard.jsx` (renders feed / group / project posts; branches on `post.context_kind`) and `src/posts/PostComposer.jsx` (create + edit; takes a `context = { kind: 'feed' | 'group' | 'project', ... }` prop and an optional `editPost` for edit mode). The legacy `feed/PostCard`, `groups/GroupPostCard`, `projects/ProjectPostCard`, `screens/NewPostScreen`, `groups/GroupNewPost` files are gone.
- **Post types**: only `text` and `paper` are selectable in PostComposer. File uploads (image/video/audio/pdf/data/file) attach to text posts and set `post_type` to the upload category. `link` and `tip` types no longer exist.
- **Visibility column** (Phase 15): `posts.visibility` is `'public' | 'members' | 'private'`. Public posts surface in `/s/:postId` for unauthenticated visitors; members-only posts require the user to satisfy the context RLS branch; private posts are author + admin only. Defaults: feed posts default `public`; group posts inherit from `groups.is_public`; project posts default `members`.
- **Context kinds + RLS** (Phase 15): five OR'd select policies on `posts` — own / feed / group / project / admin. Group + project policies use the SECURITY DEFINER helper `get_my_group_ids()` to avoid the group_members RLS round-trip. Project policy also surfaces posts where the project's `group_id` matches a group the caller is a member of (the user-guide-articles-in-projects pattern). When writing a query that filters posts by context, use `posts_with_meta` so the joins are pre-baked.
- **paper_citation** stored at post-creation time (PostComposer); never fetched lazily in feed cards. Format: `AbbrevJournal. Year Mon;Volume(Issue):Pages. doi: DOI`. Builders: `buildCitationFromCrossRef`/`buildCitationFromEpmc` (utils.js), `buildCitationFromRef` (referenceUtils.js).
- **library_items.folder_id** NULL = Unsorted; query with `.is('folder_id', null)` not `.eq('folder_id', null)`
- **work_mode** adapts UI but never restricts access. `clinician_scientist` shows researcher view (h-index, citations), not clinical stats. `WORK_MODE_MAP` in constants.js maps id → `{ icon, label }`.
- **sessionStorage.prefill_paper** — passes paper metadata from Library/Explore "Share this paper" into PostComposer; keys: doi, title, journal, year, authors, abstract, citation
- **sessionStorage.open_conversation** — set by profile "Message" button to open a specific DM thread on navigation to MessagesScreen
- **`LUMINARY_TEAM_USER_ID`** in constants.js — UUID `af56ef6f-635a-438b-8c8a-41cc84751bca`; bot account; `is_admin` is NOT set on its profile
- **Invite code validation (AuthScreen)**: multi-use event codes check `uses_count >= max_uses`; personal codes check `claimed_by IS NOT NULL`; validated `codeRow` in useRef used post-signup to insert `invite_code_uses` (event) or call `claim_invite_code` RPC (personal)
- **Admin Inbox** not in the left nav — reachable only via direct section state; AdminShell uses `padding:0, overflow:hidden` when `section === 'inbox'`
- **Group RLS** uses SECURITY DEFINER helpers (`get_my_group_ids()`, `get_my_admin_group_ids()`, etc.) to avoid infinite recursion
- **Fuzzy dedup** for profile imports: `deduplicateSectionFuzzy` + `scoreWorkMatch`/`scoreEduMatch` in utils.js
- **projectTemplates.js**: `FAST_TEMPLATES` (fast-4 picker), `GALLERY_TEMPLATES` (gallery-only); `galleryOnly: true` excluded from fast-4 picker; `applyTemplate(template, name, projectId, userId)` → `{ folders, posts }`
- **Public routes** (no auth, no sidebar): `/p/:slug` → PublicProfilePage, `/s/:postId` → PublicPostPage, `/paper/:doi` → PaperDetailPage, `/g/:slug` → PublicGroupProfileScreen, `/c/:slug` → CardPage, `/privacy` `/terms` `/cookies` → LegalPage (renders markdown from `public/legal/*.md`)
- **Unauthenticated root `/`**: shows `LandingScreen` instead of `AuthScreen` until the user clicks a sign-in CTA. App.jsx tracks this via `showAuthScreen` state. Exceptions where AuthScreen renders directly even without a session: `/admin`, ORCID callback (`?orcid_token=…`), ORCID error redirect.
- **Settings deep link**: `?settings=…` on any URL opens the Account Settings panel after auth. Used by transactional emails (e.g. "Manage preferences" link). App.jsx clears the param via `history.replaceState` after opening.
- **sessionStorage.prefill_invite_code** — set by LandingScreen's invite form on a successful client-side validation; AuthScreen reads it on mount, clears it, and pre-fills the invite-code field while switching to the signup → invite path.
- **Notification denormalisation** — group/paper context (e.g. `group_id`, `group_name`, `paper_title`) is written into `notifications.meta` JSONB at insert time. NotifsScreen reads meta directly without re-joining; emails read meta in the Edge Function. Renaming a group later does not retroactively update existing notifications.
- **Notification dedup** — DM send (`MessagesScreen.sendMessage`) and comment publish (`PostCard.submitComment` / `submitQuickReply`) only insert a notification if no unread notification of the same type already exists for the same `target_id`. This prevents bell-spam and per-message email floods on active threads.
- **Notification insert sites** (frontend, no DB triggers): follow → FollowBtn; DM → MessagesScreen; comment → PostCard; group join request → GroupScreen.JoinRequestPanel; approve/leave/alumni/public-join → GroupMembers + GroupScreen.PublicJoinPanel; invite redeemed → AuthScreen.handleInviteSignup
- **Analytics**: PostHog consent-gated via `analytics_consent_at` on profiles. `capture(event, properties)` from `src/lib/analytics.js` — import and call after successful Supabase operations. Never call before the await or in an error branch.
- **Fire-and-forget supabase.rpc**: `supabase.rpc()` returns a `PostgrestBuilder` which is `PromiseLike` (implements `.then()` only). It does **not** have `.catch()` — calling `.catch(() => {})` throws `TypeError: ....catch is not a function` synchronously and aborts the surrounding async function. Use the two-arg form `.then(() => {}, () => {})` for fire-and-forget rpc calls (or `await` inside a try/catch). The same applies to `supabase.from(...).select/insert/update/delete()` chains.
- **ORCID badge** (`src/components/OrcidBadge.jsx` + `OrcidIcon.jsx`): the iD logo only renders next to authenticated iDs (`profiles.orcid_verified === true`, set by the OAuth signup path in `AuthScreen`). The OrcidImporter never sets that flag, so importer-only users get the link without the icon — matches ORCID's brand guidance distinguishing authenticated vs asserted iDs. Wired into ProfileScreen / UserProfileScreen / PublicProfilePage. The icon alone is also used on the AuthScreen + LandingScreen "Sign in / Join with ORCID" buttons.
- **Avatar crop pattern**: user avatar (`ProfileScreen`) and group avatar (`GroupProfile`) uploads run through `AvatarCropModal` (`react-easy-crop`, square crop, circular preview, zoom slider, output 512×512 in the original MIME). The cropped Blob is wrapped back into a `File` so the existing `uploadAvatar` flow + `record_storage_file` RPC keep working unchanged. Group covers do NOT use the crop modal — see CoverRepositioner.
- **CoverRepositioner** (`src/components/CoverRepositioner.jsx`): shared drag-to-reposition component used for deep-dive covers (PostComposer, height 200) and group covers (GroupProfile edit mode, height 160). Tracks vertical position only, returns 0–100 percentage stored as `object-position: 50% Y%`. Touch + mouse. Optional `onDragEnd` so callers can persist on release (group cover saves immediately; deep-dive cover saves with the post insert).
- **Cache-bust upsert URLs**: storage upserts to a fixed path (`<userId>/avatar.<ext>`, `group-avatars/<groupId>.<ext>`, `group-covers/<groupId>.<ext>`) keep the public URL string identical between uploads, so browsers serve cached bytes. Append `?v=<Date.now()>` to the URL stored on `profiles.avatar_url` / `groups.avatar_url` / `groups.cover_url` so the next render forces a fresh fetch. Storage ignores the query param.
- **Lumens analytics** (`captureLumensEarned` in `src/lib/analytics.js`): every `award_lumens` call site fires a `lumens_earned` PostHog event. Self-award sites pass `prevLumens` so the helper also fires `tier_reached` when the award crosses a `getTierFromLumens` threshold. Cross-user awards (recipient is on a different session) skip `prevLumens` and tag `recipient_id` in meta so PostHog can attribute the event server-side later.
- **HTML sanitiser allowed tags** (`src/lib/htmlUtils.js`): `b/strong/i/em/u/h1-h4/ul/ol/li/p/br/a/div/span/blockquote/sup/hr/img/iframe/figure/figcaption`. `img` keeps only `src` (must be `https://`) + `alt` + `loading="lazy"`. `iframe` keeps `src` only if it matches `https://www.youtube.com/embed/<id>` or `https://player.vimeo.com/video/<id>` — anything else (raw watch URLs, arbitrary embeds) is stripped to a text node. The editor's video button funnels input through `toEmbedUrl()` to convert YouTube watch / shorts / `youtu.be` and Vimeo URLs into the canonical embed form.
- **Embedding `profiles` from `posts` (FK disambiguation)**: `posts` has two FKs to `profiles` — `user_id` (post author) and `target_user_id` (for targeted admin posts). A bare `posts(...,profiles(...))` PostgREST embed returns `PGRST201 / 300 Multiple Choices` because both FKs are valid candidates. Pin the join with the explicit FK constraint name: `posts(...,profiles!posts_user_id_fkey(...))`. The cleaner alternative is to read from `posts_with_meta` (the author join is already baked in as `author_name` / `author_avatar_url` etc., so no embed needed). `comments` and `likes` each only have one FK to profiles, so a bare `profiles(...)` embed works there.
- **Feed post truncation**: the unified `PostCard` truncates long text posts to ~6 lines with a gradient fade matching the card background and an inline Read more / Show less control. Threshold: plain text > 400 chars. Skipped for `post_type === 'paper'`, `is_admin_post === true`, and `is_deep_dive === true` — deep dives render the article-card preview instead. Constants at the top of `PostCard.jsx` (`TRUNCATE_CHAR_THRESHOLD`, `TRUNCATE_LINE_HEIGHT`).
- **Deep-dive feed card**: when `post.is_deep_dive` and content has ≥50 words, the body is replaced with a compact article preview — optional cover image (full-width 200px object-cover, rounded top corners via `overflow:hidden` on the card), explicit `deep_dive_title` (or first-line extraction for posts written before the title column existed), ~325-char preview, read time, and "Continue reading →" that navigates to `/s/:postId` via `window.location.href` (so cmd-click opens a new tab). The first content line is only stripped from the preview when the title was implicit. Shorter deep dives fall back to the regular text path.
- **Deep-dive edit goes through PostComposer, not inline edit**: when the user clicks Edit on a deep-dive post in PostCard's ⋯ menu, PostCard calls `onEditPost(post)` instead of toggling the inline RichTextEditor. App.jsx routes that to PostComposer with `editPost={post}` — pre-fills content / title / cover / position / tags / visibility / paper fields and saves with UPDATE (Lumens / inviter +100 / group notify / auto-tag are all suppressed in edit mode). Non-deep-dive posts still use the inline editor. The `onEditPost` prop is threaded through `FeedScreen`, `GroupScreen → GroupFeed`, `ProjectsScreen → ProjectScreen → ProjectFeed`, and `GroupScreen → ProjectScreen → ProjectFeed` (group-owned-project view).
- **Inline image resize** (deep-dive only): clicking an inline image in the editor opens a small floating S/M/L/Full toolbar plus a remove ✕ button. The choice is stored as `data-size="small|medium|large"` on the `<img>` (`full` removes the attribute). The sanitiser allow-list keeps `data-size` only when it's one of those three values. Reader CSS in `RichTextEditor` (editor preview) and PublicPostPage's `.article-body` applies `max-width: 33% / 60% / 85%` accordingly. **Don't add inline `style` attributes to inserted images** — they outrank the data-size CSS selector and break the resize. The composer strips `style` whenever the user picks a new size for safety, and the insertHTML for new images intentionally does not write a style attribute.
- **Tag display**: pills in PostCard render the bare tag text — no leading `#`. Database stores tags without `#` too (PostComposer strips it on save).
- **Likes-list modal** (`src/posts/LikersModal.jsx`): clicking the like count on any post opens a paginated list. 50 per page via `get_post_likers(p_post_id, p_limit, p_offset)`. Wired everywhere PostCard is rendered (feed / group / project / public-post-page comments thread / paper-detail page).
- **PublicPostPage article view** (`/s/:postId`): Substack-style reading view — 680px column on `T.bg`, `ReadingProgressBar` at the top, `ArticleHeader` (optional cover image at the top for deep dives + 40px author avatar + title + author meta + date + read time, no "Article" badge), `ArticleBody` (20px / 1.7; Source Serif 4 for deep dives + h1/h2/h3/h4/blockquote/img/iframe styles via scoped `.article-body` CSS — sanitised HTML rendered directly so SafeHtml's outer wrapper doesn't collapse the font size to 13px), Paper / file / link / tag tail, `ArticleFooter` (author bio card + Follow + Share + Join discussion), and `CommentsSection` (real comments table; readable by everyone, signed-in users get a textarea, own-comment delete; unauth visitors see a "Sign in to join" CTA). Auth detected inside the page via `getSession` + `onAuthStateChange`. **Visibility branch** (Phase 15): `posts.visibility === 'public'` renders for any visitor; `'members'` shows a "this post is in a private group/project — sign in or join" CTA when RLS blocks the read; `'private'` 404s for everyone except the author and admins. RLS does the heavy lifting; PublicPostPage adds a defensive client-side guard for the private case.
- **RichTextEditor capabilities**: shared editor in `src/components/RichTextEditor.jsx`. The `isDeepDive` prop swaps the editor into article mode — sticky toolbar (`position: sticky; top: 0; zIndex: 50` + soft shadow), WYSIWYG body matching PublicPostPage typography (Source Serif 4 20px, h1/h2/h3/h4 + blockquote + img + iframe), Style dropdown (Paragraph / H1-H4) instead of inline H2/H3 buttons, plus 🖼️ image and ▶ video buttons. Link button is always available. Image upload writes to `post-files` and follows the storage-tracking convention: pass `postId` to record immediately, or `onPendingImage` to hand the upload back to the parent for post-publish flushing (PostComposer pattern: `pendingImagesRef` collected in the editor callback, looped through `record_storage_file` after the post insert returns). Video URLs go through `toEmbedUrl()` (htmlUtils) before insertion to canonicalise YouTube / Vimeo URLs into the sanitiser-allowed `/embed/` form. **Pasted HTML** (Word / Docs / web) goes through `normalisePastedHtml()` first — converts style-encoded `font-weight`/`font-style`/`text-decoration` spans into `<strong>`/`<em>`/`<u>`, strips conditional comments + `<xml>` blocks + `o:`/`w:`/`m:`/`v:` namespaced elements that leak Word metadata strings — then through `sanitiseHtml()` to the allow-list.
- **Deep-dive composer fields** (PostComposer, `isDeepDive=true`): a serif Title input (saved to `posts.deep_dive_title`) and a Cover image uploader (uploaded immediately to `post-files`, URL saved to `posts.deep_dive_cover_url`, storage row recorded against the post id after the insert returns) render above the RichTextEditor. Both are optional. Deep-dive mode is intentionally available in **all** contexts (feed / group / project) — projects use it for user-guide articles. The cover upload uses the same `uploadFileToStorage` helper as the inline attachment.
- **Storage tracking (mandatory pattern)**: Every `supabase.storage.from(bucket).upload(...)` call site MUST follow up with a fire-and-forget `supabase.rpc('record_storage_file', { p_bucket, p_path, p_size_bytes: file.size, p_mime_type: file.type, p_file_name: file.name, p_source_kind, p_source_id }).then(() => {}, () => {})` — otherwise the file is invisible to the user's Files view, the admin roll-up, and the quota check. Valid `source_kind` post-Phase-15: `'post'|'library'|'avatar'|'profile_cover'|'group_avatar'|'group_cover'`. Every post upload (feed, group, project) uses `'post'` with `source_id = posts.id` — the legacy `'group_post'` kind is dead. `source_id` for the others: `library_items.id`, `user.id` (avatar/profile_cover), `group.id` (group_avatar/cover). Pattern reference: `src/posts/PostComposer.jsx` (look for `uploadFileToStorage` returning `{ url, path }`, then the `record_storage_file` rpc call after the post insert returns). For the four singleton replaceable kinds (`avatar`/`profile_cover`/`group_avatar`/`group_cover`), the upload path includes the file extension, so a different-extension upload creates an orphan — the upload site MUST also call `cleanup_replaced_storage_files(p_source_kind, p_source_id, p_keep_path)` after `record_storage_file` and `supabase.storage.from(bucket).remove(...)` the returned orphan paths. Pattern reference: `src/profile/ProfileScreen.jsx` `uploadAvatar` / `uploadCover` and `src/groups/GroupProfile.jsx` `uploadAvatar` / `uploadCover`. Per-user UI uses `get_my_storage_usage()`; deletion goes through `delete_user_file(p_id)` which returns `{ bucket, path }` so the client can call `supabase.storage.from(bucket).remove([path])` afterwards. Components: `src/components/StoragePanel.jsx` (Account Settings summary card) + `src/library/LibraryFilesView.jsx` (the file manager, surfaced as the Files view inside LibraryScreen).
- **Storage quota (mandatory check)**: Non-singleton uploads (post attachments, deep-dive covers + inline images, library PDFs, group post attachments, group library PDFs) MUST call `await checkRemainingQuota(file.size)` from `src/lib/storageQuota.js` BEFORE the storage upload runs and abort if it returns a non-null error string. Per-file size caps live alongside in `FILE_LIMITS` constants per call site (already in place); the quota helper handles the total-cap math. Singleton uploads (avatar / profile cover / group avatar+cover) skip the quota check (replace-on-upload makes the net delta near zero) but per-file caps still apply. Visual indicator: `<StorageQuotaBar usedBytes={...} quotaBytes={...} />` (`src/components/StorageQuotaBar.jsx`) — green <80%, amber 80–99%, rose ≥100%. Default quota is 50 MB; admin can change it via `/admin → Storage` (writes `admin_config.storage_quota_mb`).
- **Lumens (gamification)**: Live system. `LUMENS_ENABLED` flag in constants.js gates every `award_lumens` call site — never call the RPC unconditionally. Earning sites (frontend, no DB triggers): `post_created` (PostComposer +5, **suppressed in edit mode**), `comment_posted` (PostCard +2), `comment_received` (PostCard +10, deduped to first comment per commenter via `lumen_transactions` lookup), `post_reposted` (PostCard +20, skip self), `discussion_threshold` (PostCard +50 when distinct commenter count just hits 3, deduped via `lumen_transactions`), `invited_user_active` (PostComposer +100, async IIFE on first post, **only on initial create**). Every call site uses the two-arg form `.then(() => {}, () => {})` (NOT `.catch()` — that throws on PostgrestBuilder) so failures cannot block the user-facing action. After awarding, optimistic `setProfile(p => ({ ...p, lumens_current_period: p.lumens_current_period + N }))` keeps the sidebar widget in sync; cross-user updates flow through the realtime profile subscription. Tiers (`Catalyst` 0–499 / `Pioneer` 500–1999 / `Beacon` 2000–4999 / `Luminary` 5000+) come from `TIER_CONFIG`. Only `luminary` tier renders any visible decoration: a gold (`#C9A961`) ring on the avatar via the optional `tier` prop on `Av`.
- **Realtime profile sync**: App.jsx subscribes to a `postgres_changes` UPDATE on the user's own `profiles` row (channel `profile-self-${userId}`) and merges payload.new into `profile` state. Required because `award_lumens` runs server-side; this is what keeps the sidebar Lumens count in sync after a fire-and-forget RPC. Requires `alter publication supabase_realtime add table profiles;` in Supabase.
- **`Av` tier prop**: Optional. When `tier === 'luminary'`, wraps the avatar in a 2px gold (#C9A961) ring via an outer div. Zero visual change for callers that omit the prop. Feed `PostCard` avatars do **not** yet pass the tier — gold ring is currently visible on profile pages and the sidebar widget only.
- **Responsive**: no media queries; `useWindowSize` hook returns `{ isMobile }` (< 768px). Mobile-adapted screens use the same pattern: hide a 200/220px sidebar and replace it with horizontal scrolling pills (GroupScreen / ProjectScreen) or a slide-in drawer (LibraryScreen). The single global bell lives in App.jsx's mobile top bar (mobile) and the left sidebar nav (desktop) — feed-card / screen-header bell duplicates have been removed.
