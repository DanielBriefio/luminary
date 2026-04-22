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
  App.jsx                        — Root: auth, routing, sidebar, nav, activeGroupId state
  supabase.js                    — Supabase client
  index.js                       — React entry point
  lib/
    constants.js                 — T (tokens), NAV, PUB_TYPES, EDGE_FN, EDGE_HEADERS
    utils.js                     — timeAgo, fuzzy dedup, match scoring, buildCitationFromEpmc, buildCitationFromCrossRef
    referenceUtils.js            — parseRis, parseBib, buildCitationFromRef (client-side .ris/.bib parsers)
    htmlUtils.js                 — sanitiseHtml
    fileUtils.js                 — getFileCategory
    linkedInUtils.js             — parseCsv, parseLinkedInDate, formatDateRange, cleanBio, buildName
    pubUtils.js                  — typeIcon, typeLabel
    useWindowSize.js             — useWindowSize hook (isMobile < 768px)
    useSuggestedTopics.js        — topic suggestion logic
    projectTemplates.js          — PROJECT_TEMPLATES, FAST_TEMPLATES, GALLERY_TEMPLATES, GALLERY_FILTER_CATEGORIES, applyTemplate
    profileMilestones.js         — MILESTONES, STAGES, STAGE_REWARDS, computeStage (used by ProfileCompletionMeter)
  components/
    Av.jsx                       — Avatar (avatar_color or avatar_url)
    Btn.jsx                      — Button: variant="" grey / "v" violet outline / "s" violet solid
    Bdg.jsx                      — Badge
    Inp.jsx                      — Labelled input
    Spinner.jsx                  — Loading spinner
    FollowBtn.jsx                — Follow/unfollow (user | paper | group)
    PaperPreview.jsx             — Paper card preview (reads paper_citation from DB; falls back to paper_journal)
    FilePreview.jsx              — File attachment preview
    SafeHtml.jsx                 — Sanitized HTML renderer
    RichTextEditor.jsx           — contenteditable editor with bold/italic/link toolbar
    ConflictResolverModal.jsx    — Dedup conflict resolution UI for imports
    ExpandableBio.jsx            — Truncated bio with expand toggle
    Linkify.jsx                  — Auto-link URLs in text
    LinkPreview.jsx              — URL preview card
    ShareModal.jsx               — Share/repost UI
    BottomNav.jsx                — Mobile bottom navigation
    TopicInterestsPicker.jsx     — Topic selection UI
  screens/
    AuthScreen.jsx               — Login / sign-up (card, maxWidth 420px); handles ORCID callback
    OnboardingScreen.jsx         — First-run wizard: follow suggestions + add publications
    NewPostScreen.jsx            — Compose: text, paper, link, upload, tip
    ExploreScreen.jsx            — Search posts + topic tag browse; Papers tab has EPMC search with pagination and "Add to library"
    NotifsScreen.jsx             — Notifications (mark-as-read); supports group_post type
    NetworkScreen.jsx            — Followers/following, suggested connections (2-col grid)
    MessagesScreen.jsx           — DM conversations + real-time threads + compose panel
    AccountSettingsScreen.jsx    — Account settings (email, password, notifications, data export)
    SettingsScreen.jsx           — Settings (legal links, danger zone, sign out)
    ResetPasswordScreen.jsx      — Password recovery
  feed/
    FeedScreen.jsx               — Main feed (For You / Following, All / Papers tabs; 2-col grid + right sidebar with live Paper of the Week)
    PostCard.jsx                 — Post display: like, comment, edit, delete, follow
  profile/
    ProfileScreen.jsx            — Editable profile (About / Publications / Posts tabs)
    PublicationsTab.jsx          — Publications: manual add, EPMC search, .ris/.bib import, AI import, export (.bib/.ris/PDF)
    LinkedInImporter.jsx         — LinkedIn ZIP export parser
    OrcidImporter.jsx            — ORCID API importer
    PublicProfilePage.jsx        — Public profile at /p/:slug (no auth required)
    UserProfileScreen.jsx        — View another user's profile (auth required; maxWidth 740px)
    ShareProfilePanel.jsx        — Share panel: slug editor, visibility, SVG badge, QR code
    PubRow.jsx                   — Single publication row
    SectionGroup.jsx             — Collapsible profile section group
    BusinessCardView.jsx         — Business card visualisation; work_mode aware (hospital + work_phone/address ordering for clinician/clinician_scientist)
    CardPage.jsx                 — Public card at /c/:slug
    CardQROverlay.jsx            — QR overlay shown on business card; subtitle adapts to work_mode
    CvExportPanel.jsx            — CV export functionality
  post/
    PublicPostPage.jsx           — Public post at /s/:postId (no auth required; maxWidth 640px)
  paper/
    PaperDetailPage.jsx          — Paper detail at /paper/:doi (public + auth; maxWidth 740px)
  library/
    LibraryScreen.jsx            — Personal library: folders, paper search, DOI entry, file upload, .ris/.bib import, bookmarks
    LibraryFolderSidebar.jsx     — Folder list sidebar; supports "Unsorted" virtual folder (showInbox/inboxCount props)
    LibraryItemCard.jsx          — Library item: 3-dot menu (move to folder / remove), Share this paper, showInlineMove prop for Unsorted view
    LibraryPaperSearch.jsx       — Europe PMC search panel for adding papers to library
    LibraryRisImporter.jsx       — .ris/.bib import panel: parses file, previews, folder picker (existing or new "Import YYYY-MM-DD")
  groups/
    GroupsScreen.jsx             — Group list: My Groups + Discover; create group button
    GroupScreen.jsx              — Group container: 200px sidebar + Feed/Members/Library tabs
    GroupFeed.jsx                — Group post feed (sticky posts first); compose trigger
    GroupNewPost.jsx             — Post composer: text, paper (EuropePMC), link; auto-tag
    GroupPostCard.jsx            — Group post: like, comment, edit, delete, sticky, repost-to-public
    GroupMembers.jsx             — Members list; admin controls: promote/demote/remove; join requests
    GroupLibrary.jsx             — Group library: folders, paper search, DOI entry, file upload, .ris/.bib import, clinical trial search
    CreateGroupModal.jsx         — Create group: name, description, research_topic, public/closed toggle
    GroupProjects.jsx            — Group projects tab: list + create (same gallery flow as ProjectsScreen)
    GroupProfile.jsx             — Group profile tab: stats, leader, publications, SVG badge, QR, admin edit
    PublicGroupProfileScreen.jsx — Public group page at /g/:slug (no auth required)
  projects/
    ProjectsScreen.jsx           — Personal projects list + header with "Browse templates" + "New project"
    ProjectScreen.jsx            — Individual project view (folders sidebar + post feed); archive/unarchive; read-only banner when archived
    ProjectFeed.jsx              — Project post feed; updates last_read_at on mount
    ProjectPostCard.jsx          — Project post card: like, comment, edit, delete, sticky
    ProjectMembers.jsx           — Members list; owner can add/remove members
    CreateProjectModal.jsx       — 2-step modal: template picker → name; accepts preselectedTemplate prop (skips to step 2); handles community template type
    TemplateGallery.jsx          — Full-screen gallery: Curated/Community tabs + filter chips; CommunityTemplateCard with ratings
    SaveAsTemplateModal.jsx      — 2-step: metadata + review/edit starter posts → submit to community_templates
  components/
    ProfileCompletionMeter.jsx   — Milestone tracker with confetti; stages: Newcomer → Contributor → Scholar → Fellow → Luminary
    FeedTipCard.jsx              — Dismissible tip card in feed (from FEED_TIPS in constants.js)
    CardQROverlay.jsx            — QR overlay shown on business card; subtitle adapts to work_mode
    Footer.jsx                   — Simple footer (used in public pages)
  admin/
    AdminShell.jsx               — Admin shell: 220px left nav (Overview/Users/Invites/Inbox/Analytics) + content area; gated via is_admin; no padding + overflow:hidden for inbox section
    InvitesSection.jsx           — Invite management: code table, inline invite tree, conversion metrics, lock/unlock
    CreateCodeModal.jsx          — Create invite codes: Personal (1 code), Batch (N codes), Event (multi-use memorable code)
    UsersSection.jsx             — User table: activation stage + ghost segment badges, column filters, multi-select bulk bar, opens UserDetailPanel
    UserDetailPanel.jsx          — 400px slide-in panel: stats grid, recent posts, groups, admin notes (saves on blur), "Send nudge" button
    BulkNudgeModal.jsx           — Nudge compose modal: 4 quick-fill templates + free compose; calls send_admin_nudge RPC as Luminary Team bot
    InboxSection.jsx             — Bot conversation inbox: conversation list + real-time thread; replies sent via send_bot_message RPC
  library/
    LibraryClinicalTrialSearch.jsx — ClinicalTrials.gov API v2 search; returns study cards for library import
```

> **Note:** `src/screens/GroupsScreen.jsx` is a legacy file — the active groups screen is `src/groups/GroupsScreen.jsx`. The legacy file should not be edited.

## Screens & Features

### Feed (`FeedScreen`)
- Toggle: **For You** (all posts) / **Following** (posts by followed users + followed papers by DOI)
- Tabs: **All** / **Papers**
- Right sidebar: live **Paper of the Week** (most-commented paper by DOI across all posts, fetched from CrossRef) + "Founding Fellows" message
- `posts_with_meta` view gives `like_count`, `comment_count`, and `paper_citation`

### New Post (`NewPostScreen`)
Five post types:
- **Text** — rich text (bold, italic, links via `RichTextEditor`)
- **Paper** — DOI lookup via CrossRef API (auto-fills title, journal, authors, abstract, year, citation string); EPMC search also supported; citation string stored as `paper_citation` on publish
- **Link** — title + URL
- **Upload** — image (10MB), video (200MB), audio (50MB), PDF (25MB), CSV (5MB) → Supabase Storage `post-files` bucket
- **Tip** — plain text tip

All posts support:
- Manual hashtags (space/comma separated)
- AI auto-tagging via `auto-tag` edge function (appended to manual tags, max 10 total, best-effort)
- Visibility: **Everyone** / **Followers only**

### Post Card (`PostCard`)
- Like/unlike (optimistic update)
- Comments (lazy load, inline compose, threaded on post)
- Edit / delete (owner only, dropdown menu)
- Follow paper by DOI or follow post author via `FollowBtn`
- Post type badge; paper posts show `paper_citation` string

### Explore (`ExploreScreen`)
- Tabs: **Posts**, **Researchers**, **Papers**, **Groups**
- Posts tab: full-text search with discipline filter (TIER1_LIST) and tier-2 chips
- Papers tab — three sections:
  - Discussed on Luminary (deduplicated by DOI)
  - In researcher profiles
  - From Europe PMC: shows total hit count, cursor-based "Load more" pagination (10 at a time), "Add to library" button (inserts into `library_items` with `folder_id: null` → appears in Unsorted), "Share this paper" prefills NewPostScreen with citation
- Researchers tab: search by name/institution/title
- Groups tab: tier-1 filter chips + search

### Library (`LibraryScreen`)
- Left panel: folder sidebar (200px) + main content area
- **Unsorted** virtual folder: shows `library_items` where `folder_id IS NULL` (added via Explore "Add to library"); inline "Move to folder" select + Remove per item
- Regular folders: items have a **3-dot menu** (···) with "Move to folder" (inline folder picker) and "Remove"
- Add paper options per folder: 🔍 Search Europe PMC, 🔗 Enter DOI, 📄 Upload file, 📑 Import .ris / .bib
- **LibraryRisImporter**: drop-zone panel, parses file client-side, previews first 5 papers, folder picker (existing folders or auto-create "Import YYYY-MM-DD"), bulk-inserts all items
- **Share this paper** button on each item: prefills NewPostScreen via `sessionStorage.prefill_paper`
- Right panel: Bookmarks (saved posts, with unsave and navigation)

### Network (`NetworkScreen`)
- Tabs: **Followers** / **Following** / **Suggested**
- Stats row: follower count, following count, mutual connections
- Suggested users from profiles not yet followed
- Friend cards in a 2-column grid
- Right sidebar: 264px (quick follow suggestions)
- Message button on each user card → opens DM thread

### Groups (`src/groups/`)
- **GroupsScreen**: My Groups list + Discover (public groups search); "Create group" opens modal
- **CreateGroupModal**: name (required), description, research_topic, public/closed toggle; inserts to `groups` with `created_by: user.id`, then adds creator to `group_members` as `role: 'admin'`
- **GroupScreen**: 200px sidebar (initials avatar, name, topic, member count, role badge, Feed/Members/Library tabs, leave/delete); non-members see JoinRequestPanel (closed) or PublicJoinPanel (public)
- **GroupFeed**: fetches `group_posts_with_meta` ordered by `is_sticky DESC, created_at DESC`; compose trigger opens GroupNewPost inline
- **GroupNewPost**: post types text/paper/link; uploads to `post-files` bucket; fire-and-forget auto-tag; notifies all group members (`notif_type: 'group_post'`); stores `paper_citation`
- **GroupPostCard**: like/comment (group tables); sticky toggle; repost to public `posts` table; owner+admin menu; shows `paper_citation`
- **GroupMembers**: admin list + member list with promote/demote/remove; pending join requests with approve/reject
- **GroupLibrary**: same add controls as personal library (Search PMC, DOI, Upload, .ris/.bib import, ClinicalTrials.gov search); 3-dot menu per item; "Share this paper"; admin/member can add, admin can delete any item
- **GroupProfile** (`GroupProfile.jsx` — Profile tab inside GroupScreen): group stats (posts, members, pubs), leader info, collaborators, publications list, SVG badge export, QR code; admin can edit group metadata inline
- **PublicGroupProfileScreen** (`/g/:slug` — no auth required): public-facing group page with stats, recent posts, publications; for groups with a `group_slug`

### Notifications (`NotifsScreen`)
- Types handled: `new_post`, `new_comment`, `paper_comment`, `new_follower`, `group_post`
- `group_post` notifications: click → `onViewGroup(groupId)` → navigates to group
- Unread badge count; marks all as read on open
- Actor profiles fetched in batch

### My Profile (`ProfileScreen`)
Tabs: **About**, **Publications**, **Posts**

**About tab** — editable fields: name, title, institution, location, bio, topic_interests (chip input), orcid, twitter; discipline shown as `"Tier2 (Tier1)"`; sector shown without emoji; empty sections (Work, Education, etc.) hidden in view mode, shown when `editing === true`

Import menu (top-right):
- **LinkedIn ZIP** — parses `profile.csv`, `positions.csv`, `education.csv`, `volunteer.csv`, `organizations.csv`, `honors.csv`, `languages.csv`, `skills.csv`, `patents.csv`. Fuzzy dedup with `ConflictResolverModal` for work + education conflicts.
- **ORCID** — fetches from `pub.orcid.org/v3.0/{id}/record`, imports employment + education + works
- **AI import of full CV** (PDF/DOCX/TXT) — calls `extract-publications` edge function in `mode:'full_cv'`, imports bio/title/location/honors/languages/skills/work_history/education + publications

Profile sections (stored as JSONB arrays in `profiles`):
`work_history`, `education`, `volunteering`, `organizations`, `honors`, `languages`, `skills`, `patents`, `grants`

**Publications tab** (`PublicationsTab`):
- CRUD for `publications` table
- Europe PMC name search (auto-derives name variants: "Last First", "Last FI")
- ORCID import (reuses `OrcidImporter`)
- **🤖 AI publication import** (PDF/DOCX/TXT) — calls `extract-publications` edge function in `mode:'publications'`; per-item confirm/skip
- **📑 Import .ris / .bib** — client-side parse via `referenceUtils.js`; deduplicates against existing pubs; bulk "Import all" with preview
- Export dropdown: **BibTeX (.bib)**, **RIS (.ris)**, **PDF** (Vancouver/NLM format, opens print dialog)
- Conflict-aware dedup on import
- Types: journal, conference, poster, lecture, book, review, preprint, other

**Share profile** (`ShareProfilePanel` — right-side drawer):
- Edit `profile_slug` (auto-generated from name)
- Per-section visibility toggles (work, education, volunteering, organizations, skills, publications)
- SVG badge export (320px wide, gradient, name/title/institution)
- QR code via `qrcode` npm package

### Direct Messages (`MessagesScreen`)
- Left panel: conversation list (280px fixed width) with unread badge
- Compose button (pencil icon) in header → opens `NewMessagePanel`
- `NewMessagePanel`: search bar + suggested people (follows + followers, deduped) → live name search when typing
- Right panel: real-time message thread (Supabase channel subscription)
- Optimistic message send; marks messages read on open
- `startConversation(userId, otherUserId, supabase)` exported helper — canonical ID sorting prevents duplicate conversations
- Entry point from profile `Message` button: sets `sessionStorage.open_conversation` then navigates to messages screen

### User Profile (`UserProfileScreen`)
- Auth-required view of another user's profile (tabs: About, Publications, Posts)
- Follow/unfollow, Message buttons; back navigation returns to previous screen
- **work_mode badge** with colour coding: clinician=green, industry=amber, clinician_scientist=blue, researcher=violet
- **Clinical identity block**: `primary_hospital`, `years_in_practice`, `additional_quals` chips (shown for clinician/clinician_scientist)
- **Dynamic stats row**: clinician/clinician_scientist replaces citations/h-index with years_in_practice + clinical_highlight; grid column count adjusts to item count
- **Topic interests** one-liner in header (below sector line): `INTERESTS topic1, topic2, …`; edited via chip input in main edit form
- Publications tab label: "Publications & Presentations (N)" for clinician/clinician_scientist mode

### Paper Detail (`PaperDetailPage`)
- Works both public (`/paper/:doi`) and auth-required (in-app)
- Shows paper metadata, abstract, linked posts, follow paper button
- Auth-only: compose a post about the paper

### Public Post (`/s/:postId`)
- No auth required
- Shows a single post with comments

### Onboarding (`OnboardingScreen`)
- Shown to new users (0 follows + 0 publications) after first login
- Steps: follow suggested users, add first publication
- Sets `onboarding_completed` on profile when dismissed

### Public Profile (`/p/:slug`)
- No auth required
- Reads `profiles` by `profile_slug`, respects `profile_visibility` JSONB
- Shows: avatar, name, title, institution, bio, work history, education, skills, publications
- Tab: About / Publications
- **work_mode aware**: clinician/clinician_scientist shows clinical identity block (hospital, years, quals chips) before bio; dynamic stats row replaces citations/h-index with clinical metrics; Publications tab label adapts; patient_population + additional_quals sections shown in About

### Projects (`ProjectsScreen`, `GroupProjects`)
- **ProjectsScreen**: personal projects list; header has "🗂️ Browse templates" + "+ New project"; empty state has "Create your first project"
- **TemplateGallery**: full-screen discovery screen; two top-level tabs: ⭐ Curated | 👥 Community; curated side has filter chips (All / Research / Clinical / Industry / Collaboration); template cards show icon, description, used-by, key action chips, preview post snippet; "Use template" → CreateProjectModal at step 2; "Preview" → modal with full folder list + example posts
- **CreateProjectModal**: step 1 = fast-4 template picker + "Browse all templates →" dashed button; step 2 = name + description + create; `preselectedTemplate` prop skips directly to step 2; handles both built-in and community template types
- **Template types (built-in)**: fast-4 (conference, journal_club, weekly_team_meeting, clinical_training) + 7 gallery-only (research_project, grant_application, advisory_board, literature_review, lab_onboarding, product_launch, regulatory_submission)
- **Project status**: `active` (default) | `archived` — archive via ··· menu on card; archived projects shown in collapsed "📦 Archived (N)" section at bottom of ProjectsScreen; read-only banner inside archived project
- **Project pinning**: `is_pinned` column; pin via ··· menu; pinned projects sorted first; 📌 badge on card
- **Unread badges + activity**: `last_read_at` per member in `project_members`; unread count badge on card; "Last post X ago" + 🟢 Active / ⚪ Quiet indicator; quiet nudge (dismissible) after 5 days of no posts
- **Save as template**: ··· menu → SaveAsTemplateModal; two-step: metadata + review/edit starter posts; submits to `community_templates` with status='pending'
- **Community templates** (`community_templates` table): user-submitted; admin approves via SQL; appear in Community tab with submitter attribution + 👍 rating; ratings stored in `community_template_ratings`
- **ProjectMembers**: member list + add-from-group-members panel; owner can remove members
- **GroupProjects**: same gallery flow + archiving/pinning available to admin/member roles in group context

### Admin Panel (`AdminShell`)
- Gated via `is_admin boolean` on `profiles`; non-admins hit NotFoundScreen (route existence hidden)
- Left nav (220px): Overview / Users / Invites / Inbox / Analytics — Overview/Analytics are placeholders; Users, Invites, Inbox are fully implemented
- Mounted at `screen === 'admin'` in App.jsx
- Main content area: `padding: 0, overflow: hidden` when `section === 'inbox'`; normal `28px 32px` padding + `overflow: auto` otherwise

**Invites section** (`InvitesSection`):
- Loads all codes via `get_invite_codes_with_stats()` RPC — returns computed status, uses count, creator name
- Column filters: Type (personal/batch/event), Status (active/used/locked/expired), Created By — per-column ▾ dropdown, outside-click dismiss via `useRef`+`useEffect`
- Multi-select checkboxes + bulk action bar: Lock / Unlock / Delete (confirm step before delete)
- `codeType(c)` helper: returns `'event'` if `is_multi_use`, `'batch'` if `batch_label`, else `'personal'`
- Creator column with promoter KPI badge: `X/Y shared` ratio (green ≥50% / amber <50% / grey 0 used); computed client-side via `creatorStats` useMemo
- Inline expand → `InviteTree` loaded via `get_invite_tree(code)` RPC — shows each signup with `completed_profile`, `made_first_post`, `active_7d` flags, level-2 invitees, and summary metrics row
- `CodeActions` menu: Copy, Edit, Lock/Unlock, Delete (with `window.confirm`)
- `EditCodeForm`: modal overlay — Label, Max uses (event codes only), Expiry date; saves via direct table update

**Create code modal** (`CreateCodeModal`):
- **Personal**: 1 random 8-char code; uses ambiguous-char-free alphabet (no I/O/0/1)
- **Batch**: N codes with shared `batch_label` + optional prefix
- **Event**: custom memorable code; `is_multi_use = true`; duplicate caught via Postgres `23505` unique constraint error

**Users section** (`UsersSection` + `UserDetailPanel` + `BulkNudgeModal`):
- Loads all users via `get_admin_user_list()` RPC — returns activation stage, ghost segment, last active, posts/groups counts, invite code used; bot account excluded
- Activation stages: `identified` → `credible` → `connected` → `active` → `visible` (colour-coded badges)
- Ghost segments: `stuck` (zero activity) / `almost` (≤2 actions, inactive 5+ days) — rose/amber badges
- Column filters: stage, ghost segment, work mode — `<select>` dropdowns + text search (name/institution/title); Clear button
- Multi-select + sticky bulk bar → `BulkNudgeModal`
- `UserDetailPanel`: 400px slide-in right panel; stats grid (joined, last active, posts, groups, invite code used, work mode); recent 5 posts; groups list; admin notes textarea (saves on blur, updates local state); "View profile ↗" + "Send nudge" footer
- `BulkNudgeModal`: 4 quick-fill templates (Welcome / Complete profile / First post / Come back) + free compose; recipient avatar chips for ≤8 users; calls `send_admin_nudge` RPC with `LUMINARY_TEAM_USER_ID`

**Inbox section** (`InboxSection`):
- 280px conversation list + flex-1 thread panel; fills full height (no outer padding)
- Conversation list loaded via `get_bot_conversations(p_bot_user_id)` RPC (SECURITY DEFINER — bypasses RLS); sorted by `last_message_at desc`; shows other user avatar, name, last message preview, time ago
- Thread loaded via `get_bot_conversation_messages(p_conversation_id, p_bot_user_id)` RPC; bot messages right-aligned (violet), user messages left-aligned (subtle)
- Real-time subscription on `messages` table for active conversation; auto-scrolls to bottom
- Reply box: Enter to send, Shift+Enter for newline; calls `send_bot_message` RPC; optimistically updates conversation preview

## Database Schema (live — verified against Supabase 2026-04-22)

### `profiles`
id (uuid, FK auth.users, NOT NULL),
name (TEXT NOT NULL, default ''),
title (TEXT, default ''), institution (TEXT, default ''), location (TEXT, default ''), bio (TEXT, default ''),
field_tags (TEXT[], default '{}'),
h_index (int, default 0), i10_index (int, default 0), xp (int, default 0), level (int, default 1),
avatar_color (TEXT, default 'me'),
orcid (TEXT, default ''), twitter (TEXT, default ''), website (TEXT, default ''),
created_at (timestamptz, default now()),
work_history (JSONB, default '[]'), education (JSONB, default '[]'),
certifications (JSONB, default '[]'),
linkedin_imported_at (timestamptz),
volunteering (JSONB, default '[]'), organizations (JSONB, default '[]'),
honors (JSONB, default '[]'), languages (JSONB, default '[]'),
skills (JSONB, default '[]'), patents (JSONB, default '[]'),
li_publications (JSONB, default '[]'),
avatar_url (TEXT, default ''),
orcid_imported_at (timestamptz),
profile_slug (TEXT UNIQUE, nullable),
profile_visibility (JSONB NOT NULL, default '{"posts":true,"skills":true,"education":true,"publications":true,"volunteering":true,"work_history":true,"organizations":true}'),
grants (JSONB, default '[]'),
name_prefix (TEXT, default ''), name_suffix (TEXT, default ''),
first_name (TEXT, default ''), middle_name (TEXT, default ''), last_name (TEXT, default ''),
onboarding_completed (bool, default false),
topic_interests (TEXT[], default '{}'),
card_email (TEXT, default ''), card_phone (TEXT, default ''),
card_address (TEXT, default '' — deferred drop; still in DB, removed from all code),
card_linkedin (TEXT, default ''), card_website (TEXT, default ''),
card_visible (bool, default true),
card_show_email (bool, default false), card_show_phone (bool, default false),
card_show_address (bool, default false — deferred drop; still in DB, removed from all code),
card_show_linkedin (bool, default true), card_show_website (bool, default true),
card_show_orcid (bool, default true), card_show_twitter (bool, default true),
signup_method (TEXT, default 'invite'), orcid_verified (bool, default false),
identity_tier1 (TEXT, default ''), identity_tier2 (TEXT, default ''),
email_notifications (bool, default true), email_marketing (bool, default false),
marketing_consent_at (timestamptz), terms_accepted_at (timestamptz), privacy_accepted_at (timestamptz),
activation_milestones (JSONB, default '{}') — milestone completion state for ProfileCompletionMeter,
work_mode (TEXT, default 'researcher': 'researcher' | 'clinician' | 'industry' | 'clinician_scientist'),
-- Note: 'clinician_scientist' replaces the legacy 'both' value (migration_profile_v2.sql)
subspeciality (TEXT, default ''), years_in_practice (int),
primary_hospital (TEXT, default ''), patient_population (TEXT, default ''),
additional_quals (TEXT[], default '{}'),
clinical_highlight_label (TEXT, default ''), clinical_highlight_value (TEXT, default ''),
work_phone (TEXT, default ''), work_address (TEXT, default ''),
card_show_work_phone (bool, default false), card_show_work_address (bool, default false),
work_street (TEXT), work_city (TEXT), work_postal_code (TEXT), work_country (TEXT),
location_city (TEXT), location_country (TEXT),
admin_notes (TEXT) — internal admin-only field, never shown to users

### `posts`
id, user_id, content, post_type, visibility,
paper_title, paper_journal, paper_doi, paper_abstract, paper_authors, paper_year,
paper_citation (TEXT) — formatted citation string stored at post creation,
link_title, link_url, link_source,
image_url, file_type, file_name,
tags (TEXT[]), tier1, tier2 (TEXT[]),
group_id (uuid, nullable), group_name (TEXT, nullable),
is_deep_dive (bool),
created_at

### `posts_with_meta`
VIEW: posts + author profile fields + like_count, comment_count, repost_count,
user_liked (bool), user_reposted (bool),
author_work_mode, author_slug (profile_slug),
— includes paper_citation, group_id, group_name, is_deep_dive from posts table

### `likes`
id, user_id, post_id, created_at

### `comments`
id, post_id, user_id, content, created_at

### `reposts`
id, user_id, post_id, created_at

### `follows`
id, follower_id, target_type (user|paper|group), target_id (TEXT), created_at

### `group_follows`
id, group_id, user_id, created_at — UNIQUE(group_id, user_id)
- Used for following a group without joining it. Separate from the `follows` table (which handles user/paper/group follows via `target_type`).
- RLS: gf_select (true), gf_insert (auth.uid() = user_id), gf_delete (auth.uid() = user_id)

### `publications`
id, user_id, title, authors, journal, year, doi, pub_type, venue,
pmid, source, citations, is_open_access, full_text_url, citation (TEXT), created_at

### `notifications`
id, user_id, actor_id, notif_type, target_type, target_id, meta (JSONB), read, created_at
- notif_type values in use: new_post, new_comment, paper_comment, new_follower, group_post

### `conversations`
id, user_id_a, user_id_b (sorted for canonical dedup), last_message, last_message_at, created_at

### `messages`
id, conversation_id, sender_id, content, read_at, created_at, updated_at, inserted_at,
topic, extension, payload (JSONB), event, private

### `invite_codes`
id, code, created_by, claimed_by, claimed_at, batch_label, attempts, locked_at, created_at,
label (TEXT), max_uses (int, default 1), notes (TEXT), expires_at (timestamptz),
is_multi_use (bool, default false), uses_count (int, default 0)
- Personal codes: single-use; `claimed_by` stores the one user; `is_multi_use = false`
- Event codes: multi-use; `is_multi_use = true`; uses tracked in `invite_code_uses`; `uses_count` incremented on each signup

### `invite_code_uses`
id, code_id (FK invite_codes), user_id (FK profiles), claimed_at — UNIQUE(code_id, user_id)
- Tracks every individual use of a multi-use event code
- RLS: icu_insert (auth.uid() = user_id), icu_select (own row or is_admin)

### `invite_rate_limits`
ip, window_start, attempts

### `orcid_pending`
id, token, orcid_id, name, bio, institution, title,
work_history, education, publications, keywords (all TEXT/JSON strings), expires_at, created_at

### `groups`
id, name, description, research_topic, avatar_url, cover_url,
slug (TEXT UNIQUE — auto-generated by `group_slug_trigger` on INSERT, calls `generate_group_slug()`),
is_public (bool, default true) — **use this for public/closed logic**,
is_private (bool, legacy — do not use),
owner_id (uuid, legacy — nullable, do not use for new logic),
created_by (uuid FK profiles — use this),
institution (legacy), field_tags (TEXT[], legacy),
created_at, updated_at

### `group_invites`
id, group_id, created_by, token (TEXT UNIQUE, auto-generated 12-char lowercase hex),
expires_at (default now()+7 days), max_uses (default 10), use_count (default 0),
created_at
- Token-based invite links scoped to a single group. Distinct from `invite_codes` (platform-wide signup gate — different table, different purpose).
- RLS: ginv_select (group member), ginv_insert (group admin), ginv_delete (created_by)

### `group_members`
id, group_id, user_id,
role (TEXT: 'admin' | 'member' | 'alumni' — stored as text, not enum),
display_role (TEXT), joined_at, last_read_at (timestamptz, default now()), created_at
- Legacy 'owner' role was migrated → 'admin'

### `group_join_requests`
id, group_id, user_id, message, status ('pending'|'approved'|'rejected'), created_at

### `group_posts`
id, group_id, user_id, content (NOT NULL), post_type,
paper_doi, paper_title, paper_journal, paper_authors, paper_abstract, paper_year,
paper_citation (TEXT) — formatted citation string stored at post creation,
link_url, link_title, link_description,
image_url, file_type, file_name,
tags (TEXT[]), tier1, tier2 (TEXT[]),
content_iv, content_encrypted (bool),
is_sticky (bool), is_announcement (bool), is_reposted_public (bool),
edited_at, created_at

### `groups_with_stats`
VIEW: groups + member_count, admin_count, alumni_count, active_member_count,
publication_count (library_items flagged is_group_publication=true in group folders)
— not documented previously; present in live DB

### `group_posts_with_meta`
VIEW: group_posts + author_name, author_title, author_institution,
author_avatar (avatar_color), author_avatar_url,
author_identity_tier1, author_identity_tier2,
author_group_role, author_display_role,
like_count, comment_count
— includes paper_citation (view was recreated to include this column)

### `group_post_likes`
id, post_id, user_id, created_at

### `group_post_comments`
id, post_id, user_id, content (NOT NULL), read_at, created_at

### `library_folders`
id, user_id (nullable — null for group folders), group_id (nullable — null for personal folders),
name, sort_order, created_at

### `library_items`
id, folder_id (nullable — NULL means Unsorted, i.e. added without a folder),
added_by (user_id), title, authors, journal, year, doi, abstract,
citation (TEXT), cited_by_count, is_open_access, full_text_url,
pdf_url, pdf_name, notes,
is_group_publication (bool — used in group library to flag group's own publications),
added_at, created_at

### `saved_posts`
id, user_id, post_id (nullable), group_post_id (nullable), saved_at

### `projects`
id, user_id (nullable — NULL for group projects, equals created_by for personal projects),
group_id (nullable — NULL for personal projects),
created_by (uuid FK profiles — always set; the person who created it; used in RLS insert check),
name, description,
icon (TEXT), cover_color (TEXT),
status (TEXT: 'active' | 'archived'), is_pinned (bool),
template_type (TEXT, default 'blank' — stores the template type used at creation, e.g. 'conference', 'journal_club'; null for projects created without a template),
created_at, updated_at
- Personal project: user_id = created_by, group_id = NULL
- Group project: user_id = NULL, group_id = group, created_by = creator
- RLS select uses user_id for personal access, group_id for group access

### `project_members`
id, project_id, user_id, role (TEXT: 'owner' | 'member'),
last_read_at (timestamptz), joined_at, created_at

### `project_folders`
id, project_id, name, sort_order, created_at

### `project_posts`
id, project_id, folder_id (nullable), user_id,
content, post_type, is_sticky (bool), is_starter (bool),
content_iv (TEXT), content_encrypted (bool),
paper_doi, paper_title, paper_journal, paper_authors, paper_abstract, paper_year,
paper_citation (TEXT),
link_url, link_title,
image_url, file_type, file_name,
tags (TEXT[]), tier1 (TEXT), tier2 (TEXT[]),
edited_at (timestamptz),
created_at, updated_at

### `project_posts_with_meta`
VIEW: project_posts + author profile fields (name, title, institution, avatar_color,
avatar_url, identity_tier2) + like_count, comment_count,
folder_name (from project_folders),
project_name, project_icon, project_color, project_group_id (from projects)

### `project_post_likes`
id, post_id, user_id, created_at

### `project_post_comments`
id, post_id, user_id, content (NOT NULL), created_at

### `community_templates`
id, submitted_by (FK profiles), status (TEXT: 'pending'|'approved'|'rejected'),
name, description, used_by, filter_category, icon, color,
folders (JSONB), starter_posts (JSONB), preview_posts (JSONB),
rating_count (int), created_at, updated_at
— RLS: anyone sees approved; submitter sees own pending; submitter can update while pending

### `community_template_ratings`
id, template_id (FK community_templates), user_id (FK profiles),
created_at — UNIQUE(template_id, user_id)

### `waitlist`
id (uuid PK), full_name (TEXT NOT NULL), email (TEXT NOT NULL),
institution (TEXT, nullable), role_title (TEXT, nullable),
referral_source (TEXT, nullable), is_priority (bool, default false),
created_at (timestamptz)
- RLS enabled; one policy: `anon_insert_waitlist` (INSERT, with_check = true) — anonymous users can insert, nobody can read/update/delete via RLS
- Written to by a public landing page outside this repo; no select policy means rows are not readable by the app
- 1 row as of 2026-04-22 snapshot

## RLS — invite_codes (key policies)

- `ic_admin_insert`: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`
- `ic_admin_update`: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`
- `ic_admin_delete`: `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`
- Select and claim policies for non-admin users remain unchanged

## RLS — Groups (key policies)

All group RLS uses SECURITY DEFINER helper functions to avoid infinite recursion:
- `get_my_group_ids()` — group_ids where I am any role
- `get_my_admin_group_ids()` — group_ids where I am admin
- `get_my_member_group_ids()` — group_ids where I am admin or member
- `get_public_group_ids()` — groups where is_public = true
- `get_my_member_post_ids()` — post ids in groups where I am admin or member

Key policies (as of DB snapshot 2026-04-22, groups_select fixed post-snapshot):
- `groups_select`: `is_public = true OR created_by = auth.uid() OR id IN (get_my_group_ids())` — restored intended policy (was briefly wide-open as `auth.uid() IS NOT NULL`)
- `groups_insert`: `auth.uid() IS NOT NULL`
- `groups_update`: `id IN (get_my_admin_group_ids())`

## RLS — library_items (key policies)

- `li_insert`: `added_by = auth.uid() AND (folder_id IS NULL OR folder_id IN (SELECT id FROM library_folders))`
- `li_select`: `(folder_id IS NULL AND added_by = auth.uid()) OR folder_id IN (SELECT id FROM library_folders)`
- `li_update`: `added_by = auth.uid() OR folder_id IN (admin group folder check)`
- `li_delete`: `added_by = auth.uid() OR folder_id IN (admin group folder check)`
— The null folder_id policies enable the Unsorted inbox (papers added from Explore without a folder)

## RPCs (Supabase)

**`get_admin_user_list()`** — SECURITY DEFINER; requires `is_admin = true`
- Returns all profiles (bot excluded by UUID) with: `last_active` (max across posts/comments/likes), `posts_count`, `groups_count`, `invite_code_used`, `activation_stage` (CASE: visible/active/connected/credible/identified), `ghost_segment` (CASE: stuck/almost/null)
- Called by `UsersSection` on mount

**`get_user_activation_stages()`** — SECURITY DEFINER; requires `is_admin = true`
- Returns funnel counts for each of the 5 activation stages (excluding bot account)
- Intended for Overview dashboard

**`get_ghost_users()`** — SECURITY DEFINER; requires `is_admin = true`
- Returns users with ≤2 total actions and inactive for 5+ days, with `ghost_segment` label
- Intended for Overview dashboard

**`send_admin_nudge(p_target_user_ids uuid[], p_message text, p_bot_user_id uuid)`** — SECURITY DEFINER; requires `is_admin = true`
- Loops over target users; finds or creates conversation (canonical ID sort); inserts message with `sender_id = bot`; inserts `new_message` notification for each recipient
- Called by `BulkNudgeModal` with `LUMINARY_TEAM_USER_ID`

**`send_bot_message(p_conversation_id uuid, p_message text, p_bot_user_id uuid)`** — SECURITY DEFINER; requires `is_admin = true`
- Inserts a reply into an existing conversation with `sender_id = bot`; updates `conversations.last_message`; notifies the other participant
- Called by `InboxSection` reply box

**`get_bot_conversations(p_bot_user_id uuid)`** — SECURITY DEFINER; requires `is_admin = true`
- Returns all `conversations` rows where the bot is a participant, sorted by `last_message_at desc`
- Needed because RLS on `conversations` restricts reads to `auth.uid()` participants

**`get_bot_conversation_messages(p_conversation_id uuid, p_bot_user_id uuid)`** — SECURITY DEFINER; requires `is_admin = true`
- Returns all `messages` for a given conversation (verifies bot is a participant first)
- Needed because RLS on `messages` restricts reads to conversation participants

**`get_invite_codes_with_stats()`** — SECURITY DEFINER; requires `is_admin = true` on caller's profile
- Returns all `invite_codes` rows enriched with: computed `status` (`active` / `used` / `locked` / `expired`) via CASE expression; `created_by_name` from profiles JOIN
- Called by `InvitesSection` on mount; no arguments

**`get_invite_tree(p_code text)`** — SECURITY DEFINER; requires `is_admin = true`
- Returns signups for a given code with per-user flags: `completed_profile`, `made_first_post`, `active_7d`; plus level-2 invitees (codes created by each signup) and summary metrics (`total_signups`, `completed_profiles`, `made_first_posts`, `active_7d_count`)
- Branches on `is_multi_use`: personal codes join via `claimed_by`; event codes join via `invite_code_uses`

**`claim_invite_code(p_code text)`** — SECURITY DEFINER (pre-existing)
- Used only for personal (single-use) codes at signup; sets `claimed_by` and `claimed_at`

## Edge Functions (Supabase)

Both use the anon JWT from `EDGE_HEADERS` in constants.js.

**`extract-publications`** (`EDGE_FN`)
- `mode: 'full_cv'` — extracts profile fields + work/edu + publications from PDF/DOCX/text
- `mode: 'publications'` — extracts publications only (used by "AI publication import" in PublicationsTab)
- Input: `{ base64, mediaType }` for PDF, or `{ text }` for plain text/DOCX
- Returns: `{ result: { profile, work_history, education, honors, languages, skills, publications } }`

**`auto-tag`**
- Extracts hashtags from post content + paper metadata
- Input: `{ content, paperTitle, paperJournal, paperAbstract, linkTitle }`
- Returns: `{ tags: string[] }` (tag names without `#`)
- Enabled by `AUTO_TAG_ENABLED = true` in constants.js; always best-effort (never blocks publish)

## Citation Strings

Paper posts store a pre-formatted citation string (`paper_citation`) at creation time — no runtime fetching in feed cards.

**Sources:**
- DOI lookup (CrossRef) → `buildCitationFromCrossRef(w, doi)` in `utils.js`
- EPMC search result → `buildCitationFromEpmc(r)` in `utils.js`
- RIS/BibTeX import → `buildCitationFromRef({ journal, year, volume, issue, pages, doi })` in `referenceUtils.js`

Format: `AbbrevJournal. Year Mon;Volume(Issue):Pages. doi: DOI`

The `posts_with_meta` and `group_posts_with_meta` views were recreated (DROP + CREATE) to include `paper_citation` — `CREATE OR REPLACE VIEW` cannot insert a column mid-definition.

## Gamification (Decorative / In Progress)

Sidebar shows a level badge: "Lv.1 — Researcher, 0 XP". The XP bar and level system is currently static/decorative — not yet wired to real activity.

## Layout Architecture

**Desktop layout** (always-on):
- Outer: `display:flex, height:100vh, overflow:hidden`
- Left: 200px sidebar (logo, nav, XP badge, profile mini-card + sign out)
- Right: `flex:1` main content area, each screen manages its own scroll

**Screens with 2-column grid** (main + 264px right sidebar):
- `FeedScreen`, `ExploreScreen`, `NetworkScreen`
- Pattern: `gridTemplateColumns: '1fr 264px'`

**Screens with internal split panel** (fixed left panel + flexible right):
- `MessagesScreen`: 280px conversation list + flex-1 thread
- `GroupScreen`: 200px group sidebar + flex-1 content

**Screens with centred content** (no sidebar):
- `NewPostScreen` (maxWidth 640px), `ProfileScreen`, `UserProfileScreen` (740px), `PaperDetailPage` (740px), `PublicPostPage` (640px), `PublicProfilePage` (780px)

**Public routes** (no auth, no sidebar):
- `/p/:slug` → PublicProfilePage
- `/s/:postId` → PublicPostPage
- `/paper/:doi` → PaperDetailPage

## Conventions

- **Always use `T.*` tokens** — never hardcode colours
- **No CSS files** — all styles inline
- **No React Router** — screen switching via `setScreen(id)` in App
- **Supabase queries** use `.from()` chained calls; no ORM
- **Fuzzy dedup** for imports: `deduplicateSectionFuzzy` + `scoreWorkMatch` / `scoreEduMatch` in `src/lib/utils.js`
- Public profile pages skip auth entirely (`if(publicSlug) return` early in useEffect)
- **groups.role** is stored as plain TEXT ('admin'|'member'|'alumni'), not a PostgreSQL enum
- **groups.created_by** is the authoritative owner field; `owner_id` is legacy and nullable — never use `owner_id` in new code
- **groups.is_public** is the authoritative visibility field; `is_private` is legacy — never use `is_private` in new code
- **paper_citation** is stored at post-creation time (NewPostScreen, GroupNewPost); never fetched lazily in feed cards
- **library_items.folder_id** is nullable — NULL means Unsorted (added from Explore); always query with `.is('folder_id', null)` for inbox, not `.eq('folder_id', null)`
- **Responsive**: No media queries exist yet. All styles are inline JS. `useWindowSize` hook in `src/lib/useWindowSize.js` returns `{ isMobile }` (< 768px).
- **sessionStorage.prefill_paper** — used to pass paper metadata from Library/Explore "Share this paper" into NewPostScreen; keys: `doi, title, journal, year, authors, abstract, citation`
- **work_mode** adapts UI but never restricts access; check `work_mode === 'clinician'` only for clinical-specific display (clinical identity block, clinical stats, "Publications & Presentations" label); `clinician_scientist` shows the researcher view (h-index, citations) since they are primarily researchers who also do patient care; `WORK_MODE_MAP` in `constants.js` maps id → `{ icon, label }`
- **projectTemplates.js** exports: `PROJECT_TEMPLATES` (all templates keyed by type), `FAST_TEMPLATES` (fast-4 array), `GALLERY_TEMPLATES` (galleryOnly array), `GALLERY_FILTER_CATEGORIES` (filter tab defs), `applyTemplate(template, name, projectId, userId)` → `{ folders, posts }`; `galleryOnly: true` templates are excluded from the fast-4 picker
- **`LUMINARY_TEAM_USER_ID`** in `constants.js` — UUID of the Luminary Team bot account (`af56ef6f-635a-438b-8c8a-41cc84751bca`); used by `BulkNudgeModal` and `InboxSection`; bot profile has `name = 'Luminary Team'`, `is_admin` is NOT set on its profile
- **Invite code validation (AuthScreen)**: dual-mode — direct DB query against `invite_codes`; validation checks `locked_at` (rate-limit), `expires_at` (expiry), then branches: multi-use event codes check `uses_count >= max_uses`; personal codes check `claimed_by IS NOT NULL`; validated `codeRow` stored in `useRef` and used post-signup to either insert `invite_code_uses` + increment `uses_count` (event) or call `claim_invite_code` RPC (personal)
