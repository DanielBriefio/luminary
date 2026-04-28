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
                useSuggestedTopics.js, analytics.js
  components/ — Av, Btn, Bdg, Inp, Spinner, FollowBtn, PaperPreview, FilePreview, SafeHtml,
                RichTextEditor, ConflictResolverModal, ReportModal, ExpandableBio, Linkify,
                LinkPreview, ShareModal, BottomNav, TopicInterestsPicker,
                ProfileCompletionMeter, FeedTipCard, Footer, StoragePanel
  screens/    — LandingScreen, LegalPage, AuthScreen, OnboardingScreen, NewPostScreen,
                ExploreScreen, NotifsScreen, NetworkScreen, MessagesScreen,
                AccountSettingsScreen, SettingsScreen, ResetPasswordScreen, LumensScreen
  feed/       — FeedScreen, PostCard
  profile/    — ProfileScreen, PublicationsTab, UserProfileScreen, PublicProfilePage,
                ShareProfilePanel, PubRow, SectionGroup, BusinessCardView, CardPage,
                CardQROverlay, CvExportPanel, LinkedInImporter, OrcidImporter
  post/       — PublicPostPage (/s/:postId)
  paper/      — PaperDetailPage (/paper/:doi)
  library/    — LibraryScreen, LibraryFolderSidebar, LibraryFilesView, LibraryItemCard,
                LibraryPaperSearch, LibraryRisImporter, LibraryClinicalTrialSearch
  groups/     — GroupsScreen (active), GroupScreen, GroupFeed, GroupNewPost, GroupPostCard,
                GroupMembers, GroupLibrary, GroupProfile, PublicGroupProfileScreen,
                CreateGroupModal, GroupProjects
  projects/   — ProjectsScreen, ProjectScreen, ProjectFeed, ProjectPostCard, ProjectMembers,
                CreateProjectModal, TemplateGallery, SaveAsTemplateModal
  admin/      — AdminShell, InvitesSection, CreateCodeModal, UsersSection, UserDetailPanel,
                BulkNudgeModal, TemplatesSection, ContentSection, InboxSection, InterventionsSection,
                StorageSection
  admin/interventions/ — ComposeTab, BoardTab, PaperOfWeekTab, MilestoneTab
```

> `src/screens/GroupsScreen.jsx` is legacy — do not edit; active groups screen is `src/groups/GroupsScreen.jsx`.

## Database Tables

**Core:** `profiles`, `posts` (`posts_with_meta` view), `likes`, `comments`, `reposts`, `follows`, `publications`, `notifications`, `conversations`, `messages`, `saved_posts`, `lumen_transactions`, `user_storage_files`

**Groups:** `groups` (`groups_with_stats` view), `group_members`, `group_posts` (`group_posts_with_meta` view), `group_post_likes`, `group_post_comments`, `group_join_requests`, `group_invites`, `group_follows`

**Library:** `library_folders`, `library_items`, `bookmark_folders`

**Projects:** `projects`, `project_members`, `project_folders`, `project_posts` (`project_posts_with_meta` view), `project_post_likes`, `project_post_comments`, `community_templates`, `community_template_ratings`

**Admin/Auth:** `invite_codes`, `invite_code_uses`, `invite_rate_limits`, `post_reports`, `orcid_pending`, `waitlist`, `admin_config`

**Non-obvious schema facts:**
- `profiles.work_mode`: `'researcher'|'clinician'|'industry'|'clinician_scientist'` (`'clinician_scientist'` replaced legacy `'both'`)
- `profiles.admin_notes`: internal only, never shown to users
- `groups.created_by` is authoritative owner (`owner_id` is legacy/nullable — never use)
- `groups.is_public` is authoritative visibility (`is_private` is legacy — never use)
- `group_members.role` is plain TEXT (`'admin'|'member'|'alumni'`), not a PostgreSQL enum; legacy `'owner'` was migrated → `'admin'`
- `library_items.folder_id` NULL = Unsorted inbox; query with `.is('folder_id', null)` not `.eq`
- `bookmark_folders` — user's bookmark tree. Self-FK `parent_id` (CASCADE delete) gives nested folders; frontend caps at 2 levels (top + one level of subfolders). RLS: own-only.
- `saved_posts.folder_id` (uuid, nullable, FK `bookmark_folders` ON DELETE SET NULL) — NULL = "Unsorted" bookmark. Deleting a folder unsets bookmarks (they don't disappear).
- `projects`: personal → `user_id = created_by, group_id = NULL`; group → `user_id = NULL, group_id = group`
- `post_reports`: CHECK exactly one of `post_id`/`group_post_id` must be set; UNIQUE(post_id, reporter_id)
- `invite_codes`: personal = single-use via `claimed_by`; event = `is_multi_use=true`, tracked in `invite_code_uses`
- `conversations`: `user_id_a/b` sorted canonically to prevent duplicates
- `posts_with_meta` and `group_posts_with_meta` views were DROP+CREATE'd (not `CREATE OR REPLACE`) to add `paper_citation` mid-definition; `posts_with_meta` was DROP+CREATE'd again to pick up `is_admin_post` and `target_user_id` columns
- `posts.is_admin_post` (bool, default false) — set on posts created via `send_admin_post` RPC; shown with ✦ FROM LUMINARY TEAM header in PostCard
- `groups.cover_position` (text, default `'50% 50%'`) — `object-position` value for the group cover crop, set by the drag-to-reposition UI in GroupProfile edit mode. Honoured at every group cover render site.
- `posts.deep_dive_title`, `posts.deep_dive_cover_url`, `posts.deep_dive_cover_position` (text) — explicit title, cover image URL, and `object-position` value (e.g. `'50% 30%'`) for the 200px feed crop. The composer's `CoverRepositioner` lets the user drag the cover to pick what's visible. PublicPostPage renders the cover at natural height and ignores the position. When `deep_dive_title` is empty, PostCard / PublicPostPage fall back to extracting the title from the first line of `content` (legacy behaviour for posts written before these columns existed). Added in `migration_deepdive_title_cover.sql` + `migration_deepdive_cover_position.sql`; `posts_with_meta` was DROP+CREATE'd each time to expose the new columns.
- **Account deletion FK behaviours** (after the audit + Phases 12.2 / 12.4): `conversations.user_id_a/b`, `messages.sender_id`, and all three comment tables (`comments` / `group_post_comments` / `project_post_comments`) `user_id` columns are `ON DELETE SET NULL` so DM threads and discussion structure survive when a user is purged. Authored *posts* still cascade (right-to-be-forgotten on top-level content). The legacy `groups.owner_id` was dropped — `groups.created_by` is the only owner column. Frontend renders "Deleted user" + greyed avatar wherever `c.profiles` / `otherUser` resolves to null.
- `posts.target_user_id` (uuid, FK profiles) — targeted posts are filtered client-side: only shown to the specific user; milestone posts also use this
- `admin_config` — key/value store for admin-controlled settings; keys: `luminary_board`, `paper_of_week`, `milestone_post_template`; read via `get_admin_config(p_key)`, written via `set_admin_config(p_key, p_value)`; RLS + RPC both allow all authenticated users to read `luminary_board`, `paper_of_week`, `milestone_post_template`; admins can read/write all keys
- `posts.is_featured`, `posts.featured_until`, `posts.featured_at` — columns exist in DB but are unused; featured post feature was removed from the frontend
- `profiles.email_notif_new_follower`, `email_notif_new_message`, `email_notif_group_request`, `email_notif_new_comment`, `email_notif_invite_redeemed` — granular email-pref booleans (default true), each gating one Resend email type. Master switch is `profiles.email_notifications`; an OFF master skips all transactional email regardless of granular state.
- `profiles.welcome_email_sent` — bool, default false. The `send-welcome-email` Edge Function flips this to true after first send so subsequent profile UPDATEs don't re-send. Existing users were backfilled to true in `migration_email_notifications.sql`.
- `profiles.lumens_current_period`, `lumens_lifetime`, `current_period_started`, `previous_period_lumens`, `is_founding_member` — added in `migration_gamification.sql`. `lumens_current_period` drives the sidebar widget and tier; `lumens_lifetime` is monotonic. Tier is computed (not stored) via `getTierFromLumens(lumens_current_period)` (frontend) / `compute_tier()` (SQL helper).
- `lumen_transactions` — append-only log of every Lumen award. Columns: `user_id`, `kind` (e.g. `post_created`, `comment_received`, `discussion_threshold`), `value`, `meta` JSONB (e.g. `{ post_id, commenter_id }`), `created_at`. RLS allows users to SELECT own rows + admins to SELECT all; no client INSERT — only via `award_lumens` SECURITY DEFINER RPC.
- `admin_config.founding_member_cutoff` — JSONB seeded by migration; `apply_founding_member_status` trigger sets `profiles.is_founding_member = true` for signups before cutoff.
- `user_storage_files` — append-only-ish log of every uploaded blob. Columns: `user_id`, `bucket`, `path`, `size_bytes`, `mime_type`, `file_name`, `source_kind` (one of `'post'|'group_post'|'library'|'avatar'|'group_avatar'|'group_cover'|'unknown'`), `source_id`. UNIQUE on (bucket, path) so avatar replacements (`upsert: true`) overwrite the row instead of duplicating. RLS: own SELECT + admin SELECT; no client INSERT/UPDATE/DELETE — only via the SECURITY DEFINER RPCs.
- `posts.file_deleted_at`, `group_posts.file_deleted_at`, `project_posts.file_deleted_at` — timestamptz, nullable. Set by `delete_user_file` when the user deletes an attachment; image_url/file_name/file_type are nulled out at the same time. PostCard / GroupPostCard / ProjectPostCard render a "📎 File removed by author" placeholder when this is set instead of the file preview.
- `profiles.deletion_scheduled_at` (timestamptz, nullable) — set by `delete_own_account()` to mark a 30-day soft-delete grace window. `purge_deleted_accounts()` (pg_cron daily) hard-deletes any row where this is older than 30 days. `cancel_account_deletion()` clears it. `posts_with_meta` view filters `where pr.deletion_scheduled_at is null`, so a pending-delete user's posts are hidden from the feed without losing the rows. The view was DROP+CREATE'd again (`migration_account_soft_delete.sql`) to add the filter; if you ever change the view body again, remember it's filtering on this column.

## RPCs

All are SECURITY DEFINER. Admin-only RPCs require `is_admin = true` on the caller's profile.

**Admin-only:**
- `get_admin_user_list()` — all users with activation_stage, ghost_segment, last_active, **lumens_current_period, lumens_lifetime, is_founding_member**; bot excluded (replaced via `migration_admin_lumens.sql`)
- `get_user_activation_stages()` — funnel counts per activation stage
- `get_ghost_users()` — users with ≤2 actions, inactive 5+ days
- `send_admin_nudge(p_target_user_ids, p_message, p_bot_user_id)` — DM users as bot; creates conversation if needed
- `send_bot_message(p_conversation_id, p_message, p_bot_user_id)` — reply in existing bot conversation
- `get_bot_conversations(p_bot_user_id)` — all bot conversations (bypasses RLS)
- `get_bot_conversation_messages(p_conversation_id, p_bot_user_id)` — messages for a bot conversation
- `get_invite_codes_with_stats()` — all codes with computed status + creator name
- `get_invite_tree(p_code)` — per-signup flags + level-2 invitees; branches on `is_multi_use`
- `get_admin_posts(p_limit, p_offset, p_search, p_type, p_featured, p_hidden)` — paginated posts + report_count; returns `{ total, posts }`
- `get_content_health()` — returns `{ groups, projects }` each with posts_this_week + health (active/quiet/dead)
- `get_moderation_queue(p_status)` — reported posts aggregated with reports array (reporter/reason/note)
- `get_admin_config(p_key)` — returns `value` JSONB; non-admins may read `luminary_board`, `paper_of_week`, `milestone_post_template`; admins read all
- `set_admin_config(p_key, p_value)` — upserts admin config; admin only
- `send_admin_post(p_mode, p_content, p_bot_user_id, p_post_type, ...)` — broadcast (one post, no target_user_id), targeted (per-user post + notification), group (group_posts insert); sets `is_admin_post=true`

**Authenticated users:**
- `claim_invite_code(p_code)` — personal codes only; sets `claimed_by`/`claimed_at`
- `get_paper_stats_public()` — paper aggregates for POTW algorithm; filters hidden/admin posts, requires non-empty DOI+title, min engagement (≥2 posts OR ≥1 comment); returns `{ paper_doi, paper_title, paper_journal, paper_year, discussions, participants, total_comments }`
- `award_lumens(p_kind, p_value, p_meta)` — fire-and-forget; inserts a `lumen_transactions` row + bumps `profiles.lumens_current_period` and `lumens_lifetime`. Skips silently for the Luminary Team bot. Always wrapped in `try/catch` and gated on `LUMENS_ENABLED` at call sites — must never block the user-facing action.
- `get_lumen_history(p_limit)` — own transaction history for `LumensScreen`
- `record_storage_file(p_bucket, p_path, p_size_bytes, p_mime_type, p_file_name, p_source_kind, p_source_id)` — fire-and-forget; upserts a `user_storage_files` row keyed on (bucket, path). **Must be called after every successful `supabase.storage.upload()`** — see Storage tracking convention below.
- `delete_user_file(p_id)` — own-only. Returns `{ bucket, path }` for the client to call `supabase.storage.from(bucket).remove([path])`. Side-effects by `source_kind`: `post`/`group_post` → set `file_deleted_at = now()` + null out image_url/file_name/file_type; `library` → DELETE the library_items row; `avatar`/`group_avatar`/`group_cover` → raises an error (must be replaced, not deleted).
- `get_my_storage_usage()` — returns `{ total_bytes, total_files, buckets: [{bucket, bytes, files}], files: [...] }`. Each file row is enriched (via `migration_storage_enriched.sql`) with `context_label` (paper title / 80-char content excerpt / library item title / "Profile photo" / "Profile cover" / "Group: NAME"), `context_group_slug` (so the client can build `/g/:slug` deep links for group items), and `already_deleted` (true when the linked post's `file_deleted_at` is set). Powers the `StoragePanel` summary in Account Settings + the `LibraryFilesView` review UI inside LibraryScreen; future quota check reads `total_bytes` from here.
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
- **`orcid-callback`**: ORCID OAuth redirect target; bridges `auth.users` ↔ `orcid_pending` row, then redirects back with `?orcid_token=…` for AuthScreen to complete signup
- **`validate-invite`**: server-side invite-code check (legacy; AuthScreen now does this client-side)
- **`send-email-notification`**: webhook-triggered on `notifications` INSERT. Dispatches Resend transactional email for `new_follower`, `new_message`, `group_join_request`, `group_request_approved`, `new_comment`, `invite_redeemed`. Inline HTML bodies built per type — Resend's `template_id` is **not** for transactional sends, only for Broadcasts. Gated on master + granular email prefs.
- **`send-welcome-email`**: webhook-triggered on `profiles` UPDATE. Sends a one-shot welcome email when `name` is set and `welcome_email_sent = false`, then flips the flag.

## Conventions

- **Always use `T.*` tokens** — never hardcode colours
- **No CSS files** — all styles inline
- **No React Router** — screen switching via `setScreen(id)` in App; Supabase queries use `.from()` chained calls; no ORM
- **Post types**: only `text` and `paper` are selectable in NewPostScreen/GroupNewPost. File uploads (image/video/audio/pdf/data/file) attach to text posts and set `post_type` to the upload category. `link` and `tip` types no longer exist.
- **paper_citation** stored at post-creation time (NewPostScreen, GroupNewPost); never fetched lazily in feed cards. Format: `AbbrevJournal. Year Mon;Volume(Issue):Pages. doi: DOI`. Builders: `buildCitationFromCrossRef`/`buildCitationFromEpmc` (utils.js), `buildCitationFromRef` (referenceUtils.js).
- **library_items.folder_id** NULL = Unsorted; query with `.is('folder_id', null)` not `.eq('folder_id', null)`
- **work_mode** adapts UI but never restricts access. `clinician_scientist` shows researcher view (h-index, citations), not clinical stats. `WORK_MODE_MAP` in constants.js maps id → `{ icon, label }`.
- **sessionStorage.prefill_paper** — passes paper metadata from Library/Explore "Share this paper" into NewPostScreen; keys: doi, title, journal, year, authors, abstract, citation
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
- **CoverRepositioner** (`src/components/CoverRepositioner.jsx`): shared drag-to-reposition component used for deep-dive covers (NewPostScreen, height 200) and group covers (GroupProfile edit mode, height 160). Tracks vertical position only, returns 0–100 percentage stored as `object-position: 50% Y%`. Touch + mouse. Optional `onDragEnd` so callers can persist on release (group cover saves immediately; deep-dive cover saves with the post insert).
- **Cache-bust upsert URLs**: storage upserts to a fixed path (`<userId>/avatar.<ext>`, `group-avatars/<groupId>.<ext>`, `group-covers/<groupId>.<ext>`) keep the public URL string identical between uploads, so browsers serve cached bytes. Append `?v=<Date.now()>` to the URL stored on `profiles.avatar_url` / `groups.avatar_url` / `groups.cover_url` so the next render forces a fresh fetch. Storage ignores the query param.
- **Lumens analytics** (`captureLumensEarned` in `src/lib/analytics.js`): every `award_lumens` call site fires a `lumens_earned` PostHog event. Self-award sites pass `prevLumens` so the helper also fires `tier_reached` when the award crosses a `getTierFromLumens` threshold. Cross-user awards (recipient is on a different session) skip `prevLumens` and tag `recipient_id` in meta so PostHog can attribute the event server-side later.
- **HTML sanitiser allowed tags** (`src/lib/htmlUtils.js`): `b/strong/i/em/u/h1-h4/ul/ol/li/p/br/a/div/span/blockquote/sup/hr/img/iframe/figure/figcaption`. `img` keeps only `src` (must be `https://`) + `alt` + `loading="lazy"`. `iframe` keeps `src` only if it matches `https://www.youtube.com/embed/<id>` or `https://player.vimeo.com/video/<id>` — anything else (raw watch URLs, arbitrary embeds) is stripped to a text node. The editor's video button funnels input through `toEmbedUrl()` to convert YouTube watch / shorts / `youtu.be` and Vimeo URLs into the canonical embed form.
- **Embedding `profiles` from `posts` (FK disambiguation)**: `posts` has two FKs to `profiles` — `user_id` (post author) and `target_user_id` (added for targeted admin posts). A bare `posts(...,profiles(...))` PostgREST embed returns `PGRST201 / 300 Multiple Choices` because both FKs are valid candidates. Pin the join with the explicit FK constraint name: `posts(...,profiles!posts_user_id_fkey(...))`. The cleaner alternative is to read from `posts_with_meta` (the author join is already baked in as `author_name` / `author_avatar_url` etc., so no embed needed). `group_posts` only has `user_id → profiles`, so a bare `profiles(...)` embed there works fine.
- **Feed post truncation**: PostCard / GroupPostCard / ProjectPostCard truncate long text posts to ~6 lines with a gradient fade matching the card background and an inline Read more / Show less control. Threshold: plain text > 400 chars. Skipped for `post_type === 'paper'`, `is_admin_post === true`, and (PostCard only) `is_deep_dive === true` — deep dives render the article-card preview instead. Constants live at the top of each card file (`TRUNCATE_CHAR_THRESHOLD`, `TRUNCATE_LINE_HEIGHT`).
- **Deep-dive feed card** (PostCard only): when `post.is_deep_dive` and content has ≥50 words, the body is replaced with a compact article preview — optional cover image (full-width 200px object-cover, rounded top corners via `overflow:hidden` on the card), explicit `deep_dive_title` (or first-line extraction for posts written before the title column existed), ~325-char preview, read time, and "Continue reading →" that navigates to `/s/:postId` via `window.location.href` (so cmd-click opens a new tab). The first content line is only stripped from the preview when the title was implicit. Shorter deep dives fall back to the regular text path.
- **PublicPostPage article view** (`/s/:postId`): rewritten to a Substack-style reading view — 680px column on `T.bg`, `ReadingProgressBar` at the top, `ArticleHeader` (optional cover image at the top for deep dives + 40px author avatar + title + author meta + date + read time, no "Article" badge), `ArticleBody` (20px / 1.7; Source Serif 4 for deep dives + h1/h2/h3/h4/blockquote/img/iframe styles via scoped `.article-body` CSS — sanitised HTML rendered directly so SafeHtml's outer wrapper doesn't collapse the font size to 13px), Paper / file / link / tag tail, `ArticleFooter` (author bio card + Follow + Share + Join discussion), and `CommentsSection` (real comments table; readable by everyone, signed-in users get a textarea, own-comment delete; unauth visitors see a "Sign in to join" CTA). Auth detected inside the page via `getSession` + `onAuthStateChange`.
- **RichTextEditor capabilities**: shared editor in `src/components/RichTextEditor.jsx`. The `isDeepDive` prop swaps the editor into article mode — sticky toolbar (`position: sticky; top: 0`), WYSIWYG body matching PublicPostPage typography (Source Serif 4 20px, h1/h2/h3/h4 + blockquote + img + iframe), Style dropdown (Paragraph / H1-H4) instead of inline H2/H3 buttons, plus 🖼️ image and ▶ video buttons. Link button is always available. Image upload writes to `post-files` and follows the storage-tracking convention: pass `postId` to record immediately, or `onPendingImage` to hand the upload back to the parent for post-publish flushing (NewPostScreen pattern: `pendingImagesRef` collected in the editor callback, looped through `record_storage_file` after the post insert returns). Video URLs go through `toEmbedUrl()` (htmlUtils) before insertion to canonicalise YouTube / Vimeo URLs into the sanitiser-allowed `/embed/` form. **Pasted HTML** (Word / Docs / web) goes through `normalisePastedHtml()` first — converts style-encoded `font-weight`/`font-style`/`text-decoration` spans into `<strong>`/`<em>`/`<u>`, strips conditional comments + `<xml>` blocks + `o:`/`w:`/`m:`/`v:` namespaced elements that leak Word metadata strings — then through `sanitiseHtml()` to the allow-list.
- **Deep-dive composer fields** (NewPostScreen, `isDeepDive=true`): a serif Title input (saved to `posts.deep_dive_title`) and a Cover image uploader (uploaded immediately to `post-files`, URL saved to `posts.deep_dive_cover_url`, storage row recorded against the post id after the insert returns) render above the RichTextEditor. Both are optional. The cover upload uses the same `uploadFileToStorage` helper as the inline attachment.
- **Storage tracking (mandatory pattern)**: Every `supabase.storage.from(bucket).upload(...)` call site MUST follow up with a fire-and-forget `supabase.rpc('record_storage_file', { p_bucket, p_path, p_size_bytes: file.size, p_mime_type: file.type, p_file_name: file.name, p_source_kind, p_source_id }).then(() => {}, () => {})` — otherwise the file is invisible to the user's Files view, the admin roll-up, and any future quota check. `source_kind` must be one of `'post'|'group_post'|'library'|'avatar'|'group_avatar'|'group_cover'|'profile_cover'`. `source_id` is the row id of the linked record (post.id, library_items.id, user.id for avatars / profile_cover, group.id for group_avatar/cover). Pattern reference: `src/screens/NewPostScreen.jsx` (look for `uploadFileToStorage` returning `{ url, path }`, then the `record_storage_file` rpc call after the post insert returns). Per-user UI uses `get_my_storage_usage()`; deletion goes through `delete_user_file(p_id)` which returns `{ bucket, path }` so the client can call `supabase.storage.from(bucket).remove([path])` afterwards. Components: `src/components/StoragePanel.jsx` (Account Settings summary card) + `src/library/LibraryFilesView.jsx` (the actual file manager, surfaced as the Files view inside LibraryScreen).
- **Lumens (gamification)**: Live system. `LUMENS_ENABLED` flag in constants.js gates every `award_lumens` call site — never call the RPC unconditionally. Earning sites (frontend, no DB triggers): `post_created` (NewPostScreen +5), `comment_posted` (PostCard +2), `comment_received` (PostCard +10, deduped to first comment per commenter via `lumen_transactions` lookup), `post_reposted` (PostCard +20, skip self), `discussion_threshold` (PostCard +50 when distinct commenter count just hits 3, deduped via `lumen_transactions`), `invited_user_active` (NewPostScreen +100, async IIFE on first post, looks up `invite_codes.created_by`). Every call site wraps the RPC in `try/catch` with `.catch()` so failures cannot block the user-facing action. After awarding, optimistic `setProfile(p => ({ ...p, lumens_current_period: p.lumens_current_period + N }))` keeps the sidebar widget in sync; cross-user updates flow through the realtime profile subscription. Tiers (`Catalyst` 0–499 / `Pioneer` 500–1999 / `Beacon` 2000–4999 / `Luminary` 5000+) come from `TIER_CONFIG`. Only `luminary` tier renders any visible decoration: a gold (`#C9A961`) ring on the avatar via the optional `tier` prop on `Av`. The legacy decorative XP badge has been removed; ProfileCompletionMeter remains separate (milestones, not Lumens).
- **Realtime profile sync**: App.jsx subscribes to a `postgres_changes` UPDATE on the user's own `profiles` row (channel `profile-self-${userId}`) and merges payload.new into `profile` state. Required because `award_lumens` runs server-side; this is what keeps the sidebar Lumens count in sync after a fire-and-forget RPC. Requires `alter publication supabase_realtime add table profiles;` in Supabase.
- **`Av` tier prop**: Optional. When `tier === 'luminary'`, wraps the avatar in a 2px gold (#C9A961) ring via an outer div. Zero visual change for callers that omit the prop. Feed `PostCard` avatars do **not** yet pass the tier — gold ring is currently visible on profile pages and the sidebar widget only.
- **Responsive**: no media queries; `useWindowSize` hook returns `{ isMobile }` (< 768px). Mobile-adapted screens use the same pattern: hide a 200/220px sidebar and replace it with horizontal scrolling pills (GroupScreen / ProjectScreen) or a slide-in drawer (LibraryScreen). The single global bell lives in App.jsx's mobile top bar (mobile) and the left sidebar nav (desktop) — feed-card / screen-header bell duplicates have been removed.
