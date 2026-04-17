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
    utils.js                     — timeAgo, fuzzy dedup, match scoring
    htmlUtils.js                 — sanitiseHtml
    fileUtils.js                 — getFileCategory
    linkedInUtils.js             — parseCsv, parseLinkedInDate, formatDateRange, cleanBio, buildName
    pubUtils.js                  — typeIcon, typeLabel
    useWindowSize.js             — useWindowSize hook (isMobile < 768px)
    useSuggestedTopics.js        — topic suggestion logic
  components/
    Av.jsx                       — Avatar (avatar_color or avatar_url)
    Btn.jsx                      — Button: variant="" grey / "v" violet outline / "s" violet solid
    Bdg.jsx                      — Badge
    Inp.jsx                      — Labelled input
    Spinner.jsx                  — Loading spinner
    FollowBtn.jsx                — Follow/unfollow (user | paper | group)
    PaperPreview.jsx             — Paper card preview
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
    ExploreScreen.jsx            — Search posts + topic tag browse (2-col grid with right sidebar)
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
    PublicationsTab.jsx          — Publications: manual add, search, import
    LinkedInImporter.jsx         — LinkedIn ZIP export parser
    OrcidImporter.jsx            — ORCID API importer
    PublicProfilePage.jsx        — Public profile at /p/:slug (no auth required)
    UserProfileScreen.jsx        — View another user's profile (auth required; maxWidth 740px)
    ShareProfilePanel.jsx        — Share panel: slug editor, visibility, SVG badge, QR code
    PubRow.jsx                   — Single publication row
    SectionGroup.jsx             — Collapsible profile section group
    BusinessCardView.jsx         — Business card visualisation
    CardPage.jsx                 — Public card at /c/:slug
    CvExportPanel.jsx            — CV export functionality
  post/
    PublicPostPage.jsx           — Public post at /s/:postId (no auth required; maxWidth 640px)
  paper/
    PaperDetailPage.jsx          — Paper detail at /paper/:doi (public + auth; maxWidth 740px)
  groups/
    GroupsScreen.jsx             — Group list: My Groups + Discover; create group button
    GroupScreen.jsx              — Group container: 200px sidebar + Feed/Members tabs
    GroupFeed.jsx                — Group post feed (sticky posts first); compose trigger
    GroupNewPost.jsx             — Post composer: text, paper (EuropePMC), link; auto-tag
    GroupPostCard.jsx            — Group post: like, comment, edit, delete, sticky, repost-to-public
    GroupMembers.jsx             — Members list; admin controls: promote/demote/remove; join requests
    CreateGroupModal.jsx         — Create group: name, description, research_topic, public/closed toggle
```

> **Note:** `src/screens/GroupsScreen.jsx` is a legacy file — the active groups screen is `src/groups/GroupsScreen.jsx`. The legacy file should not be edited.

## Screens & Features

### Feed (`FeedScreen`)
- Toggle: **For You** (all posts) / **Following** (posts by followed users + followed papers by DOI)
- Tabs: **All** / **Papers**
- Right sidebar: live **Paper of the Week** (most-commented paper by DOI across all posts, fetched from CrossRef) + "Founding Fellows" message
- `posts_with_meta` view gives `like_count` and `comment_count`

### New Post (`NewPostScreen`)
Five post types:
- **Text** — rich text (bold, italic, links via `RichTextEditor`)
- **Paper** — DOI lookup via CrossRef API (auto-fills title, journal, authors, abstract, year)
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
- Post type badge

### Explore (`ExploreScreen`)
- Full-text search against `posts_with_meta.content` (ilike, debounced 400ms)
- Topic tag chips: #GLP1, #CryoEM, #CRISPR, #OpenScience, #DigitalHealth, #MedicalAffairs, #RWE, #WomensHealth
- 2-column grid: main results + 264px right sidebar (topic chips + featured papers)

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
- **GroupScreen**: 200px sidebar (initials avatar, name, topic, member count, role badge, Feed/Members tabs, leave/delete); non-members see JoinRequestPanel (closed) or PublicJoinPanel (public)
- **GroupFeed**: fetches `group_posts_with_meta` ordered by `is_sticky DESC, created_at DESC`; compose trigger opens GroupNewPost inline
- **GroupNewPost**: post types text/paper/link; uploads to `post-files` bucket; fire-and-forget auto-tag; notifies all group members (`notif_type: 'group_post'`)
- **GroupPostCard**: like/comment (group tables); sticky toggle; repost to public `posts` table; owner+admin menu
- **GroupMembers**: admin list + member list with promote/demote/remove; pending join requests with approve/reject

### Notifications (`NotifsScreen`)
- Types handled: `new_post`, `new_comment`, `paper_comment`, `new_follower`, `group_post`
- `group_post` notifications: click → `onViewGroup(groupId)` → navigates to group
- Unread badge count; marks all as read on open
- Actor profiles fetched in batch

### My Profile (`ProfileScreen`)
Tabs: **About**, **Publications**, **Posts**

**About tab** — editable fields: name, title, institution, location, bio, orcid, twitter

Import menu (top-right):
- **LinkedIn ZIP** — parses `profile.csv`, `positions.csv`, `education.csv`, `volunteer.csv`, `organizations.csv`, `honors.csv`, `languages.csv`, `skills.csv`, `patents.csv`. Fuzzy dedup with `ConflictResolverModal` for work + education conflicts.
- **ORCID** — fetches from `pub.orcid.org/v3.0/{id}/record`, imports employment + education + works
- **CV upload** (PDF/DOCX/TXT) — calls `extract-publications` edge function in `mode:'full_cv'`, imports bio/title/location/honors/languages/skills/work_history/education + publications

Profile sections (stored as JSONB arrays in `profiles`):
`work_history`, `education`, `volunteering`, `organizations`, `honors`, `languages`, `skills`, `patents`, `grants`

**Publications tab** (`PublicationsTab`):
- CRUD for `publications` table
- CrossRef name search (auto-derives name variants: "Last First", "Last FI")
- ORCID import (reuses `OrcidImporter`)
- CV import (reuses `extract-publications` edge function, `mode:'full_cv'`)
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
- Follow/unfollow, Message buttons
- Back navigation returns to previous screen

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

## Database Schema (live — verified against Supabase 2026-04-17)

### `profiles`
id (FK auth.users), name, title, institution, location, bio, orcid, twitter, website,
avatar_color, avatar_url, profile_slug (TEXT UNIQUE), profile_visibility (JSONB),
work_history (JSONB), education (JSONB), volunteering (JSONB), organizations (JSONB),
honors (JSONB), languages (JSONB), skills (JSONB), patents (JSONB), grants (JSONB),
li_publications (JSONB), certifications (JSONB),
first_name, middle_name, last_name, name_prefix, name_suffix,
identity_tier1, identity_tier2, field_tags (TEXT[]), topic_interests (TEXT[]),
h_index, i10_index, xp, level,
onboarding_completed (bool), signup_method, orcid_verified, orcid_imported_at,
linkedin_imported_at,
email_notifications (bool), email_marketing (bool),
marketing_consent_at, terms_accepted_at, privacy_accepted_at,
card_email, card_phone, card_address, card_linkedin, card_website,
card_visible, card_show_email, card_show_phone, card_show_address,
card_show_linkedin, card_show_website, card_show_orcid, card_show_twitter,
created_at

### `posts`
id, user_id, content, post_type, visibility,
paper_title, paper_journal, paper_doi, paper_abstract, paper_authors, paper_year,
link_title, link_url, link_source,
image_url, file_type, file_name,
tags (TEXT[]), tier1, tier2 (TEXT[]),
created_at

### `posts_with_meta`
VIEW: posts + author profile fields + like_count, comment_count

### `likes`
id, user_id, post_id, created_at

### `comments`
id, post_id, user_id, content, created_at

### `reposts`
id, user_id, post_id, created_at

### `follows`
id, follower_id, target_type (user|paper|group), target_id (TEXT), created_at

### `publications`
id, user_id, title, authors, journal, year, doi, pub_type, venue,
pmid, source, citations, is_open_access, full_text_url, created_at

### `notifications`
id, user_id, actor_id, notif_type, target_type, target_id, meta (JSONB), read, created_at
- notif_type values in use: new_post, new_comment, paper_comment, new_follower, group_post

### `conversations`
id, user_id_a, user_id_b (sorted for canonical dedup), last_message, last_message_at, created_at

### `messages`
id, conversation_id, sender_id, content, read_at, created_at, updated_at, inserted_at,
topic, extension, payload (JSONB), event, private

### `invite_codes`
id, code, created_by, claimed_by, claimed_at, batch_label, attempts, locked_at, created_at

### `invite_rate_limits`
ip, window_start, attempts

### `orcid_pending`
id, token, orcid_id, name, bio, institution, title,
work_history, education, publications, keywords (all TEXT/JSON strings), expires_at, created_at

### `groups`
id, name, description, research_topic, avatar_url, cover_url,
is_public (bool, default true) — **use this for public/closed logic**,
is_private (bool, legacy — do not use),
owner_id (uuid, legacy — nullable, do not use for new logic),
created_by (uuid FK profiles — use this),
institution (legacy), field_tags (TEXT[], legacy),
created_at, updated_at

### `group_members`
id, group_id, user_id,
role (TEXT: 'admin' | 'member' | 'alumni' — stored as text, not enum),
display_role (TEXT), joined_at, created_at
- Legacy 'owner' role was migrated → 'admin'

### `group_join_requests`
id, group_id, user_id, message, status ('pending'|'approved'|'rejected'), created_at

### `group_posts`
id, group_id, user_id, content (NOT NULL), post_type,
paper_doi, paper_title, paper_journal, paper_authors, paper_abstract, paper_year,
link_url, link_title, link_description,
image_url, file_type, file_name,
tags (TEXT[]), tier1, tier2 (TEXT[]),
content_iv, content_encrypted (bool),
is_sticky (bool), is_announcement (bool), is_reposted_public (bool),
edited_at, created_at

### `group_posts_with_meta`
VIEW: group_posts + author_name, author_title, author_institution,
author_avatar (avatar_color), author_avatar_url,
author_identity_tier1, author_identity_tier2,
author_group_role, author_display_role,
like_count, comment_count

### `group_post_likes`
id, post_id, user_id, created_at

### `group_post_comments`
id, post_id, user_id, content (NOT NULL), read_at, created_at

## RLS — Groups (key policies)

All group RLS uses SECURITY DEFINER helper functions to avoid infinite recursion:
- `get_my_group_ids()` — group_ids where I am any role
- `get_my_admin_group_ids()` — group_ids where I am admin
- `get_my_member_group_ids()` — group_ids where I am admin or member
- `get_public_group_ids()` — groups where is_public = true
- `get_my_member_post_ids()` — post ids in groups where I am admin or member

Key policy: `groups_select` allows `is_public = true OR created_by = auth.uid() OR id in (get_my_group_ids())`. The `created_by` check is critical — it allows the creator to read back the group immediately after insert, before the group_members row is added.

## Edge Functions (Supabase)

Both use the anon JWT from `EDGE_HEADERS` in constants.js.

**`extract-publications`** (`EDGE_FN`)
- `mode: 'full_cv'` — extracts profile fields + work/edu + publications from PDF/DOCX/text
- Input: `{ base64, mediaType }` for PDF, or `{ text }` for plain text/DOCX
- Returns: `{ result: { profile, work_history, education, honors, languages, skills, publications } }`

**`auto-tag`**
- Extracts hashtags from post content + paper metadata
- Input: `{ content, paperTitle, paperJournal, paperAbstract, linkTitle }`
- Returns: `{ tags: string[] }` (tag names without `#`)
- Enabled by `AUTO_TAG_ENABLED = true` in constants.js; always best-effort (never blocks publish)

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
- **Responsive**: No media queries exist yet. All styles are inline JS. `useWindowSize` hook in `src/lib/useWindowSize.js` returns `{ isMobile }` (< 768px).
