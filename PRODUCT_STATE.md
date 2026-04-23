# Luminary Prototype — Product State
_Last updated: 2026-04-23 (rev 10)_

## What exists and works

### Core auth & onboarding
- Email/password sign-up and login (Supabase Auth)
- ORCID OAuth login (production client ID; `/authenticate` scope only; pending row bridged via `orcid_pending` table)
- First-run onboarding wizard: follow suggested users + add first publication
- Auto-generated `profile_slug` for public profile URLs
- Invite-code gate: dual-mode validation — personal (single-use, `claimed_by`) and event (multi-use, `invite_code_uses` table); checks `locked_at`, `expires_at`, and use limits; validated code stored in `useRef` for post-signup claim step

### Feed
- For You / Following toggle; All / Papers tab filter
- Post types: `text` (rich text, with live link preview) and `paper` (DOI or EPMC lookup); file attachments (image/video/audio/PDF/CSV/file) can be added to text posts and set the stored `post_type` to the upload category
- Like, comment (threaded, inline), edit, delete, repost
- AI auto-tagging via `auto-tag` edge function; manual hashtags; visibility (Everyone / Followers only)
- Right sidebar: Paper of the Week (config-driven — `most_discussed` distinct users, `most_commented` comment total, or admin manual DOI pick) + Founding Fellows banner
- `FeedTipCard` / Luminary Board: shows admin-configured board message (title, message, optional CTA) when `admin_config.luminary_board.enabled = true`; falls back to cycling `FEED_TIPS` from constants.js when board is off or unconfigured

### Explore
- Tabs: Posts, Researchers, Papers, Groups
- Posts: full-text search with tier-1 discipline filter + tier-2 chips
- Papers: Discussed on Luminary + in researcher profiles + Europe PMC search (cursor-based pagination, "Add to library", "Share this paper")
- Researchers: search by name/institution/title
- Groups: tier-1 filter chips + text search

### Network
- Followers / Following / Suggested tabs; stats row
- Follow/unfollow any user; Message button → opens DM
- Suggested connections from unfollowed profiles; 2-column friend card grid

### Groups
- Create public or closed groups (name, description, research_topic)
- **GroupScreen**: 200px sidebar + Feed / Members / Library / Projects / Profile tabs
- **GroupFeed**: sticky posts first; post types text/paper; file uploads; auto-tag; notifies all members
- **GroupPostCard**: like, comment, edit, delete, sticky toggle, repost to public feed
- **GroupMembers**: admin list + member list; promote/demote/remove; join requests with approve/reject; closed groups show JoinRequestPanel; public groups show PublicJoinPanel
- **GroupLibrary**: Search PMC, DOI, upload, .ris/.bib import, ClinicalTrials.gov search; 3-dot menu (move/remove); "Share this paper"
- **GroupProjects**: same template gallery + archiving/pinning flow as personal projects (admin/member only)
- **GroupProfile**: group stats, leader info, collaborator list, publications, SVG badge export, QR code; admin can edit metadata inline
- **PublicGroupProfileScreen** (`/g/:slug`): public group page with stats, recent posts, publications (no auth)

### Notifications
- Types: `new_post`, `new_comment`, `paper_comment`, `new_follower`, `group_post`
- `group_post` → click navigates to group; unread badge; mark-all-read on open

### Direct Messages
- Conversation list (280px) with unread badge; real-time thread via Supabase channel subscription
- Compose → NewMessagePanel: suggested people (follows + followers, deduped) + live name search
- Optimistic send; marks read on open; `startConversation()` helper uses canonical ID sort to prevent duplicates
- Entry from any user card via Message button (`sessionStorage.open_conversation`)

### My Profile
**Header**: avatar, name, title, institution; discipline as `"Tier2 (Tier1)"`; sector (no emoji); INTERESTS one-liner (comma-separated topic_interests); business card link

**Tabs: About / Publications / Posts**

- About tab: editable work history, education, volunteering, organizations, honors, languages, skills, patents, grants; empty sections hidden in view mode, shown when editing; compact entry layout (36px letter/emoji avatar, title 14px, subtitle 13px, date 12px, 2-line expandable description)
- Imports: LinkedIn ZIP (full profile.csv parse), ORCID API, AI CV import (PDF/DOCX/TXT via `extract-publications` edge function)
- Fuzzy dedup with `ConflictResolverModal` on all imports
- Publications tab: CRUD, EPMC name search, ORCID import, AI import, .ris/.bib import, export (BibTeX / RIS / PDF)
- Share panel: slug editor, per-section visibility toggles, SVG badge, QR code
- Login email displayed as read-only in the business card edit section (above work email) and in Account Settings; labelled "Login email — not editable here"
- Profile completion meter (`ProfileCompletionMeter`): milestone checklist with 5 stages (Newcomer → Luminary); confetti on stage unlock; CTA actions link to relevant edit flows

### User Profile (other users)
- Tabs: About / Publications / Posts; Follow, Message buttons
- Discipline `"Tier2 (Tier1)"`; sector without emoji; INTERESTS one-liner in header
- work_mode badge (clinician=green, industry=amber, clinician_scientist=blue, researcher=violet)
- Clinical identity block (hospital, years_in_practice, additional_quals chips) for `clinician` only — `clinician_scientist` shows researcher view (h-index, citations)
- Dynamic stats row: `clinician` mode replaces citations/h-index with years_in_practice + clinical_highlight; `clinician_scientist` retains research stats
- Publications tab label: "Publications & Presentations (N)" for `clinician` only

### Business Card (`/c/:slug`)
- Public card with vCard download; `work_mode`-aware field ordering
- QR overlay (`CardQROverlay`); card_address fully removed

### Paper Detail (`/paper/:doi`)
- Metadata, abstract, linked posts; follow paper; compose post (auth only); public + in-app

### Public Post (`/s/:postId`)
- Single post + comments, no auth

### Public Profile (`/p/:slug`)
- Respects `profile_visibility` JSONB; clinical block shown for `clinician` only; `clinician_scientist` shows researcher stats; discipline format matches auth views

### Library
- **Personal library**: LibraryFolderSidebar (200px) + main content; Unsorted virtual folder (folder_id IS NULL)
- **Add options per folder**: Search PMC, Enter DOI, Upload file, Import .ris/.bib, Search ClinicalTrials.gov
- **ClinicalTrials.gov search** (`LibraryClinicalTrialSearch`): ClinicalTrials.gov API v2, returns study cards for import
- **LibraryRisImporter**: parse client-side, preview 5 items, folder picker (existing or auto-create "Import YYYY-MM-DD"), bulk insert
- **LibraryItemCard**: 3-dot menu (move to folder / remove); "Share this paper" → prefills NewPostScreen
- **Unsorted view**: inline "Move to folder" select per item
- Right panel: Bookmarks (saved posts, unsave + navigate)

### Projects
- **ProjectsScreen**: card grid with unread badge, "Last post X ago", 🟢 Active / ⚪ Quiet indicator; quiet nudge (dismissible, localStorage, 5-day threshold); 📌 on pinned cards; "📦 Archived (N)" collapsed section at bottom
- **ProjectScreen**: folder sidebar + ProjectFeed; read-only amber banner when archived; archive/unarchive from ··· menu; ProjectMembers tab
- **ProjectFeed**: updates `last_read_at` on mount; like, comment, sticky on posts
- **ProjectPostCard**: like, comment, edit, delete, sticky
- **ProjectMembers**: member list; owner can add from group members or remove
- **CreateProjectModal**: step 1 = fast-4 template picker + "Browse all" link; step 2 = name + description; handles built-in and community template types
- **TemplateGallery**: ⭐ Curated tab (filter chips: All/Research/Clinical/Industry/Collaboration) + 👥 Community tab; community empty state; pending templates shown with amber badge to submitter
- **Built-in templates**: fast-4 (conference, journal_club, weekly_team_meeting, clinical_training) + 7 gallery-only (research_project, grant_application, advisory_board, literature_review, lab_onboarding, product_launch, regulatory_submission)
- **Community templates**: user-submitted via SaveAsTemplateModal (2-step: metadata + review starter posts); status='pending' until approved via SQL; CommunityTemplateCard shows submitter + 👍 rating
- **GroupProjects**: same flow in group context (admin/member only)

### Admin Panel (`/admin`)
- Gated via `is_admin = true` on `profiles`; non-admins hit NotFoundScreen
- Left nav (220px): Overview / Users / Invites / Templates / Content / Interventions / Analytics — Analytics is placeholder; all others fully implemented

**Invite management** (fully implemented):
- Full invite code table loaded via `get_invite_codes_with_stats()` RPC
- Column filters on Type, Status, Created By — per-column dropdown, outside-click dismiss
- Multi-select + bulk Lock / Unlock / Delete actions
- Creator column with promoter KPI: `X/Y shared` ratio with traffic-light colouring
- Inline tree expand via `get_invite_tree(code)` RPC: per-signup flags (profile complete, first post, 7-day activity), level-2 invitees, summary metrics
- Inline code editing (label, max uses for event codes, expiry date)
- `CreateCodeModal`: Personal (1 random code) / Batch (N codes, shared label) / Event (multi-use memorable code)

**User management** (fully implemented):
- Full user table via `get_admin_user_list()` RPC; bot account excluded
- Activation stage badges: Identified → Credible → Connected → Active → Visible
- Ghost segment badges: 👻 Stuck (zero activity) / ⚡ Almost (≤2 actions, 5+ days inactive)
- Filters: stage, ghost segment, work mode dropdowns + text search; Clear button
- Multi-select + sticky bulk bar → `BulkNudgeModal` (4 templates + free compose; sends DM + notification as Luminary Team bot)
- `UserDetailPanel`: slide-in panel with stats, recent posts, groups, admin notes (saves on blur); "View profile ↗" + "Send nudge"

**Template approval** (fully implemented):
- Pending / Approved / Rejected tabs; loads `community_templates` by status
- Template rows: icon, name, category, description, submitter, folder + post counts, timestamp
- Approve → `status = 'approved'` (appears in community gallery); Reject → `status = 'rejected'`
- Approved tab: Unpublish (moves to rejected); Rejected tab: Restore to pending
- Preview modal: full template detail with folders + starter posts; Approve/Reject from modal
- Overview at-risk alert "Review templates →" links directly to this section

**Content** (fully implemented):
- Posts tab: paginated table (50/page), search + type/featured/hidden filters, reported posts highlighted amber; Feature (24h/48h/7d/permanent), Unfeature, Hide/Unhide, Delete actions
- Groups tab: health table (🟢 Active / 🟡 Quiet / 🔴 Dead); member count, posts/week, last active; filter by health
- Projects tab: same as groups for active projects
- Moderation tab: reported posts queue with Dismiss / Hide / Delete actions; status filter (pending/dismissed/actioned)

**Post reporting** (user-facing, fully implemented):
- Non-owner ··· menu in PostCard and GroupPostCard includes 🚩 Report option
- ReportModal: 5 reason options, optional note, duplicate detection
- Admin report badge on PostCard (visible to admins only)
- Featured posts: violet tinted wrapper + ✦ FEATURED header in PostCard — visual distinction only, normal chronological sort order
- Admin posts (`is_admin_post = true`): violet left border + ✦ FROM LUMINARY TEAM header in PostCard
- Targeted posts (`target_user_id`): filtered client-side — only the recipient sees them in their feed

**Interventions** (fully implemented):
- **Compose tab**: broadcast / targeted / group post composer; text or paper (DOI lookup via CrossRef); sent as Luminary Team bot via `send_admin_post` RPC
- **Luminary Board tab**: enable/disable + edit the sidebar board card (title, message, optional CTA URL/label); takes effect on next feed load
- **Paper of Week tab**: algorithm mode (most_discussed or most_commented) or manual DOI pick; saved to `admin_config`
- **Milestone post tab**: edit the heading/message/CTA labels used in the profile-completion milestone post; affects future milestone posts only

**Inbox** (fully implemented):
- Shows all conversations where the Luminary Team bot is a participant
- Conversation list sorted by most recent; click to open thread
- Thread: bot messages right-aligned (violet), user messages left-aligned; real-time updates via Supabase subscription
- Reply box sends as Luminary Team bot via `send_bot_message` RPC (Enter to send)
- Reads bypass RLS via `get_bot_conversations` + `get_bot_conversation_messages` SECURITY DEFINER RPCs

### Gamification
- Sidebar: static "Lv.1 — Researcher, 0 XP" badge — decorative
- `ProfileCompletionMeter`: live milestone system (5 stages, confetti) — wired to real DB counts

### Analytics
- PostHog consent-gated analytics via `analytics_consent_at` on profiles (separate from `marketing_consent_at` for email marketing)
- Opt-in asked at sign-up; togglable in Account Settings
- `opt_out_capturing_by_default: true` — no data sent until user consents
- 15 events instrumented: `signed_up`, `invite_code_used`, `post_created`, `post_liked`, `comment_posted`, `group_created`, `group_joined`, `group_left`, `publication_added`, `library_item_added`, `project_created`, `template_used`, `template_submitted`, `dm_sent`, `onboarding_completed`, `profile_stage_reached`
- Requires `REACT_APP_POSTHOG_KEY` in Vercel env vars (Production scope)

---

## Known gaps / not yet built

- **Mobile layout**: No responsive design. Desktop-only (200px sidebar + multi-column grids break on phones). `useWindowSize` hook exists but not wired to layout yet.
- **XP / leveling system**: Sidebar badge is decorative. ProfileCompletionMeter stages are real but don't write to the `xp`/`level` columns.
- **Push notifications / email digests**: No push; no email. `email_notifications` preference stored but not actioned.
- **Admin panel**: Analytics tab is placeholder. Admin Inbox is fully implemented but not in the left nav — reachable only via direct `section` state.
- **PWA / offline**: Not configured.
- **End-to-end encryption for group posts**: Schema has `content_iv`/`content_encrypted` columns but encryption is not implemented.

---

## Pending migrations (not yet run in production)

- **`migration_profile_v2.sql` (partial)**: Additive parts applied — new split address columns (`work_street`, `work_city`, `work_postal_code`, `work_country`, `location_city`, `location_country`) and `work_mode = 'both'` → `'clinician_scientist'` rename are live. DROP of `card_address` / `card_show_address` deferred; columns still exist on profiles.
- **`migration_admin_interventions.sql`**: Creates `admin_config` table + RLS; seeds `luminary_board`, `paper_of_week`, `milestone_post_template` rows; adds `get_admin_config`, `set_admin_config`, `send_admin_post` RPCs; adds `is_admin_post` + `target_user_id` columns to `posts`; DROP+CREATE `posts_with_meta` view to include new columns.

---

## Tech debt / rough edges
- `src/screens/GroupsScreen.jsx` is a legacy file — active version is `src/groups/GroupsScreen.jsx`. Legacy file must not be edited.
- `saveTopics` / `editingTopics` / `topicDraft` / `savingTopics` state in ProfileScreen is dead code (topic_interests editing was moved to main edit form).
- Unread DM count polled every 30s (could be real-time subscription).
- No unit or integration tests.
- `useCallback` / `useMemo` used sparingly; some large components re-render more than needed.
