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
  lib/        — constants.js (T, EDGE_FN, EDGE_HEADERS, LUMINARY_TEAM_USER_ID), utils.js,
                referenceUtils.js, projectTemplates.js, profileMilestones.js, useWindowSize.js,
                htmlUtils.js, fileUtils.js, linkedInUtils.js, pubUtils.js, useSuggestedTopics.js
  components/ — Av, Btn, Bdg, Inp, Spinner, FollowBtn, PaperPreview, FilePreview, SafeHtml,
                RichTextEditor, ConflictResolverModal, ReportModal, ExpandableBio, Linkify,
                LinkPreview, ShareModal, BottomNav, TopicInterestsPicker,
                ProfileCompletionMeter, FeedTipCard, Footer
  screens/    — AuthScreen, OnboardingScreen, NewPostScreen, ExploreScreen, NotifsScreen,
                NetworkScreen, MessagesScreen, AccountSettingsScreen, SettingsScreen, ResetPasswordScreen
  feed/       — FeedScreen, PostCard
  profile/    — ProfileScreen, PublicationsTab, UserProfileScreen, PublicProfilePage,
                ShareProfilePanel, PubRow, SectionGroup, BusinessCardView, CardPage,
                CardQROverlay, CvExportPanel, LinkedInImporter, OrcidImporter
  post/       — PublicPostPage (/s/:postId)
  paper/      — PaperDetailPage (/paper/:doi)
  library/    — LibraryScreen, LibraryFolderSidebar, LibraryItemCard, LibraryPaperSearch,
                LibraryRisImporter, LibraryClinicalTrialSearch
  groups/     — GroupsScreen (active), GroupScreen, GroupFeed, GroupNewPost, GroupPostCard,
                GroupMembers, GroupLibrary, GroupProfile, PublicGroupProfileScreen,
                CreateGroupModal, GroupProjects
  projects/   — ProjectsScreen, ProjectScreen, ProjectFeed, ProjectPostCard, ProjectMembers,
                CreateProjectModal, TemplateGallery, SaveAsTemplateModal
  admin/      — AdminShell, InvitesSection, CreateCodeModal, UsersSection, UserDetailPanel,
                BulkNudgeModal, TemplatesSection, ContentSection, InboxSection
```

> `src/screens/GroupsScreen.jsx` is legacy — do not edit; active groups screen is `src/groups/GroupsScreen.jsx`.

## Database Tables

**Core:** `profiles`, `posts` (`posts_with_meta` view), `likes`, `comments`, `reposts`, `follows`, `publications`, `notifications`, `conversations`, `messages`, `saved_posts`

**Groups:** `groups` (`groups_with_stats` view), `group_members`, `group_posts` (`group_posts_with_meta` view), `group_post_likes`, `group_post_comments`, `group_join_requests`, `group_invites`, `group_follows`

**Library:** `library_folders`, `library_items`

**Projects:** `projects`, `project_members`, `project_folders`, `project_posts` (`project_posts_with_meta` view), `project_post_likes`, `project_post_comments`, `community_templates`, `community_template_ratings`

**Admin/Auth:** `invite_codes`, `invite_code_uses`, `invite_rate_limits`, `post_reports`, `orcid_pending`, `waitlist`

**Non-obvious schema facts:**
- `profiles.work_mode`: `'researcher'|'clinician'|'industry'|'clinician_scientist'` (`'clinician_scientist'` replaced legacy `'both'`)
- `profiles.admin_notes`: internal only, never shown to users
- `groups.created_by` is authoritative owner (`owner_id` is legacy/nullable — never use)
- `groups.is_public` is authoritative visibility (`is_private` is legacy — never use)
- `group_members.role` is plain TEXT (`'admin'|'member'|'alumni'`), not a PostgreSQL enum; legacy `'owner'` was migrated → `'admin'`
- `library_items.folder_id` NULL = Unsorted inbox; query with `.is('folder_id', null)` not `.eq`
- `projects`: personal → `user_id = created_by, group_id = NULL`; group → `user_id = NULL, group_id = group`
- `post_reports`: CHECK exactly one of `post_id`/`group_post_id` must be set; UNIQUE(post_id, reporter_id)
- `invite_codes`: personal = single-use via `claimed_by`; event = `is_multi_use=true`, tracked in `invite_code_uses`
- `conversations`: `user_id_a/b` sorted canonically to prevent duplicates
- `posts_with_meta` and `group_posts_with_meta` views were DROP+CREATE'd (not `CREATE OR REPLACE`) to add `paper_citation` mid-definition

## RPCs (all SECURITY DEFINER, require `is_admin = true`)

- `get_admin_user_list()` — all users with activation_stage, ghost_segment, last_active; bot excluded
- `get_user_activation_stages()` — funnel counts per activation stage
- `get_ghost_users()` — users with ≤2 actions, inactive 5+ days
- `send_admin_nudge(p_target_user_ids, p_message, p_bot_user_id)` — DM users as bot; creates conversation if needed
- `send_bot_message(p_conversation_id, p_message, p_bot_user_id)` — reply in existing bot conversation
- `get_bot_conversations(p_bot_user_id)` — all bot conversations (bypasses RLS)
- `get_bot_conversation_messages(p_conversation_id, p_bot_user_id)` — messages for a bot conversation
- `get_invite_codes_with_stats()` — all codes with computed status + creator name
- `get_invite_tree(p_code)` — per-signup flags + level-2 invitees; branches on `is_multi_use`
- `claim_invite_code(p_code)` — personal codes only; sets `claimed_by`/`claimed_at`
- `get_admin_posts(p_limit, p_offset, p_search, p_type, p_featured, p_hidden)` — paginated posts + report_count; returns `{ total, posts }`
- `get_content_health()` — returns `{ groups, projects }` each with posts_this_week + health (active/quiet/dead)
- `get_moderation_queue(p_status)` — reported posts aggregated with reports array (reporter/reason/note)

## Edge Functions

Both use the anon JWT from `EDGE_HEADERS` in constants.js.

- **`extract-publications`** (`EDGE_FN`): `mode:'full_cv'` or `mode:'publications'`; input `{ base64, mediaType }` for PDF or `{ text }` for plain text; returns `{ result: { profile, work_history, education, honors, languages, skills, publications } }`
- **`auto-tag`**: input `{ content, paperTitle, paperJournal, paperAbstract, linkTitle }`; returns `{ tags: string[] }`; enabled by `AUTO_TAG_ENABLED` in constants.js; always best-effort (never blocks publish)

## Conventions

- **Always use `T.*` tokens** — never hardcode colours
- **No CSS files** — all styles inline
- **No React Router** — screen switching via `setScreen(id)` in App; Supabase queries use `.from()` chained calls; no ORM
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
- **Public routes** (no auth, no sidebar): `/p/:slug` → PublicProfilePage, `/s/:postId` → PublicPostPage, `/paper/:doi` → PaperDetailPage, `/g/:slug` → PublicGroupProfileScreen, `/c/:slug` → CardPage
- **Gamification**: XP/level badge in sidebar is decorative — not wired to real activity yet
- **Responsive**: no media queries; `useWindowSize` hook returns `{ isMobile }` (< 768px)
