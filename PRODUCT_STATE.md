# Luminary Prototype — Product State
_Last updated: 2026-04-28 (rev 18)_

## What exists and works

### Landing page (unauthenticated `/`)
- Replaces direct-to-AuthScreen for unauth visitors at root
- Sticky header (Have-an-invite-code / Join with ORCID / Log in), hero with tagline + dual CTAs, inline invite-code form with client-side validation, 3 feature pillars, 12-card auto-advancing use-case carousel (pauses on hover), 3 "Who Luminary is for" cards (Researchers / Clinicians / Industry), **"Built for scientists, not advertisers" privacy block** (4 trust facts in 2x2 grid: no third-party tracking / consent-only analytics / data never sold / inbox control + forward-looking note on sponsored content), **violet "Luminary is free" strip** (3 checkmarks: full access / no card / no premium tier), waitlist form (with `?ref=` URL-param capture for source attribution), legal footer
- Validated invite code is handed off to AuthScreen via `sessionStorage.prefill_invite_code` so the user lands directly on the signup form with their code pre-filled
- Mobile responsive (single-column grids, full-width CTAs, compact header) below 768px via `useWindowSize`
- ORCID OAuth handler matches AuthScreen exactly (same client ID, redirect URI, `state=signup`)

### ORCID integration
- **AuthScreen + LandingScreen CTAs**: official ORCID iD logo (inline SVG, `src/components/OrcidIcon.jsx`) on the "Sign up / Sign in / Join with ORCID" buttons. Brand-asset-licensed for integrators.
- **Profile badge** (`OrcidBadge`): renders next to the ORCID link on ProfileScreen / UserProfileScreen / PublicProfilePage. Shows the iD logo only when `profiles.orcid_verified === true` (set by the OAuth signup path); importer-only iDs (typed into the OrcidImporter) link out without the icon. Tooltip clarifies "authenticated via ORCID OAuth" vs "self-asserted".
- ORCID OAuth signup writes both `profiles.orcid` and `profiles.orcid_verified = true`; OrcidImporter writes `orcid` + `orcid_imported_at` only. The two paths converge on the same `profiles.orcid` column.

### Core auth & onboarding
- Email/password sign-up and login (Supabase Auth)
- ORCID OAuth login (production client ID; `/authenticate` scope only; pending row bridged via `orcid_pending` table)
- First-run onboarding wizard: follow suggested users + add first publication
- Auto-generated `profile_slug` for public profile URLs
- Invite-code gate: dual-mode validation — personal (single-use, `claimed_by`) and event (multi-use, `invite_code_uses` table); checks `locked_at`, `expires_at`, and use limits; validated code stored in `useRef` for post-signup claim step
- **Privacy context box** in AuthScreen `ConsentBlock` (above the four consent toggles): violet panel with "🔒 A note on privacy" — explains no third-party data sharing, no retargeting pixels, anonymised analytics gated on consent below, and the future sponsored-content carve-out. Toggles themselves unchanged.

### Feed
- Sort modes (Personalised / Chronological) and mode pills (All / My Field / Researcher) on a single header row alongside the Filter button
- All / Papers content-type tabs live **inside** the Filter panel (not as a separate row) and are tracked separately from tier filters: client-side post filter only fires when tier filters are set, so `Papers` is server-side only
- Bell icon (with unread badge) sits next to the reload icon at the top of the feed; reload icon enlarged
- Compose card at top: dashed-border "Share your thoughts…" button that opens NewPostScreen
- Post types: `text` (rich text, with live link preview) and `paper` (DOI or EPMC lookup); file attachments (image/video/audio/PDF/CSV/file) can be added to text posts and set the stored `post_type` to the upload category
- Like, comment (threaded, inline), edit, delete, repost
- Quick-reply input on PostCard hides whenever the inline comment thread is open — no double-input UI
- **Long-post truncation**: text posts > 400 chars clip to ~6 lines with a gradient fade and inline Read more / Show less. Paper posts and admin posts are never truncated. Same behaviour in `GroupPostCard` and `ProjectPostCard`.
- **Deep-dive article card** (PostCard only): when `is_deep_dive` and content has ≥50 words, the body is replaced with a compact preview — optional cover image (full-width 200px, `object-fit:cover`, `object-position` from `deep_dive_cover_position` so the author's chosen crop is honoured, rounded top corners), explicit `deep_dive_title` (or first-line extraction for old posts), ~325-char preview, read-time, and "Continue reading →" linking to `/s/:postId`.
- AI auto-tagging via `auto-tag` edge function; manual hashtags; visibility (Everyone / Followers only)
- Right sidebar: Paper of the Week (config-driven — `most_discussed` total posts, `most_commented` total comments, or admin manual DOI pick; uses `get_paper_stats_public()` RPC; min engagement filter ≥2 posts OR ≥1 comment) + Founding Fellows banner
- `FeedTipCard` / Luminary Board: shows admin-configured board message (title, message, optional CTA) when `admin_config.luminary_board.enabled = true`; falls back to cycling `FEED_TIPS` from constants.js when board is off or unconfigured

### Rich-text editor (NewPostScreen, PostCard edit, ComposeTab, project + group composers)
- Shared component `RichTextEditor`. Default mode: bold / italic / underline / lists / Style dropdown (Paragraph / Heading / Subheading) / link
- **Deep-dive mode** (`isDeepDive=true`): WYSIWYG body matching the published `PublicPostPage` typography (Source Serif 4 20px / 1.7, h1-h4 + blockquote + img + iframe), Style dropdown extended to H1-H4, plus ❝ blockquote, ─ divider, 📄 Cite, 🖼️ image, ▶ video. **Sticky toolbar** stays pinned to the top of the viewport while scrolling long articles. NewPostScreen also surfaces a serif **Title input** + **Cover image uploader with drag-to-reposition** above the editor when deep-dive is on (saved to `posts.deep_dive_title` / `posts.deep_dive_cover_url` / `posts.deep_dive_cover_position`). The 200px-tall reposition preview matches the PostCard feed crop, so the author can pick exactly what's visible there.
- **Inline images** (deep-dive): file picker → uploads to `post-files` bucket → inserts `<img>`. Storage tracking handled per the convention: pass `postId` to record immediately, or `onPendingImage` to defer (NewPostScreen flushes via `pendingImagesRef` after the post insert). Cover image follows the same deferred-record flow.
- **Video embeds** (deep-dive): YouTube / Vimeo URL → normalised through `toEmbedUrl()` into the canonical `/embed/` form → inserted as a sandboxed `<iframe>` (sanitiser rejects any other iframe src)
- **DOI cite** (deep-dive): inserts `<sup>(N)</sup>` at cursor + appends a Vancouver-style numbered reference at the bottom; deep-link to `https://doi.org/<doi>`
- **Pasted HTML** (Word / Docs / web pages): runs through `normalisePastedHtml()` first — converts style-encoded `font-weight`/`font-style`/`text-decoration` spans into `<strong>` / `<em>` / `<u>`, strips `<xml>` blocks, conditional comments, and `o:`/`w:`/`m:`/`v:` namespaced Word elements — then through `sanitiseHtml()` to the allow-list. Bold / italic / headings / lists from Word and Docs survive cleanly.

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
- **GroupProfile**: group stats, leader info, collaborator list, publications, SVG badge export, QR code; admin can edit metadata inline. Avatar uses `AvatarCropModal` (square crop). Cover image uses drag-to-reposition (`CoverRepositioner`, height 160) in edit mode; release saves to `groups.cover_position`. Both display sites (GroupProfile non-edit, PublicGroupProfileScreen) honour the saved `object-position`.
- **PublicGroupProfileScreen** (`/g/:slug`): public group page with stats, recent posts, publications (no auth)

### Notifications
- Types: `new_post`, `new_comment`, `paper_comment`, `new_follower`, `group_post`, `group_announcement`, `group_member_added`, `group_join_request`, `group_request_approved`, `group_alumni_granted`, `group_member_joined`, `group_member_left`, `invite_redeemed`
- Bell-icon click navigates: post-types → `/s/:postId`; group-types → group; otherwise → actor profile
- Unread badge polled every 30s in App.jsx; mark-all-read on NotifsScreen open
- Group/paper context denormalised into `notifications.meta` (`group_id`, `group_name`, `paper_title`) at insert time
- DM and new_comment notifications are deduped per-target: a flurry of comments on one post (or messages in one thread) produces one notification + one email until the recipient marks it read

### Email notifications (Resend)
- Two Edge Functions: `send-email-notification` (notifications-table INSERT webhook) and `send-welcome-email` (profiles-table UPDATE webhook)
- Wired types: `new_follower`, `new_message`, `group_join_request`, `group_request_approved`, `new_comment`, `invite_redeemed`, plus the one-shot welcome on profile UPDATE with `name` set
- Welcome email body includes a "🔒 Your data, your science" privacy + free-tier panel between the feature bullets and the sign-off (matches the landing-page trust messaging)
- Inline branded HTML bodies (DM Sans + DM Serif Display, violet accent, "Manage preferences" link with `?settings=email` deep-link to AccountSettings)
- Per-recipient gate: master `email_notifications` toggle plus five granular toggles (`email_notif_new_follower`, `_new_message`, `_group_request`, `_new_comment`, `_invite_redeemed`); UI lives under Account Settings → Email preferences as nested toggles, only shown when master is on
- `welcome_email_sent` flag prevents duplicate welcomes; existing pre-system users were backfilled to true
- All HTML sanitised via `escape()` helper to avoid injection from user-controlled fields (names, group names, post excerpts)
- Webhook header authentication uses the legacy `anon` JWT — new `sb_publishable_*` keys are not JWTs and get rejected with `INVALID_JWT_FORMAT`

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
- **Avatar crop**: file picker → `AvatarCropModal` (`react-easy-crop`, square crop, circular preview, zoom slider, 512×512 output) → existing upload + storage tracking flow. Same flow for group avatars in `GroupProfile`. Avatar URLs are cache-busted (`?v=<ts>`) so browsers refetch after replacement.
- Profile completion meter (`ProfileCompletionMeter`): 12 milestones across 5 stages (Identified → Visible) at thresholds 3 / 5 / 7 / 9 / 12; confetti on stage unlock; CTA actions link to relevant edit flows. Simplified in 2026-04: ORCID-required, first-publication, and 5-publications milestones removed; "Follow 3 researchers" relaxed to 1.

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
- Substack-style article reading view: 680px column on `T.bg`, fixed scroll progress bar, conditional "← Back" link, top bar (Lumi/nary + "Join Luminary →" hidden when signed in)
- `ArticleHeader`: optional cover image at the top (full-width, natural height, 8px radius) for deep dives with `deep_dive_cover_url` set; 40px author avatar (with tier ring); author name + title + institution + formatted date + read time; large serif title — prefers `deep_dive_title`, falls back to first-line extraction (< 120 chars) for older deep dives
- `ArticleBody`: 20px / 1.7 reading typography. **Source Serif 4** for deep dives (regular + bold cuts so emphasis is visible — DM Serif Display only ships at weight 400), DM Sans for regular posts. Scoped CSS for h1 / h2 / h3 / h4 / blockquote / lists / images / iframes. Sanitised HTML is rendered directly (not via `<SafeHtml>`, whose outer wrapper would inject a 13px font-size). The first content line is only stripped from the body when the title was implicit — explicit-title deep dives keep their full body intact.
- `ArticleFooter`: divider + author bio card (avatar + bio + Follow) + Share + 💬 Join the discussion (smooth-scrolls to comments)
- `CommentsSection`: real comments table (joined to profiles), readable by everyone, signed-in users get a textarea (Enter to submit, own-comment delete). Unauth visitors see a violet "Sign in to join the discussion" CTA
- Auth detected inside the page via `getSession` + `onAuthStateChange`

### Public Profile (`/p/:slug`)
- Respects `profile_visibility` JSONB; clinical block shown for `clinician` only; `clinician_scientist` shows researcher stats; discipline format matches auth views

### Library
- **Sidebar (220px)**: unified left rail with two sections — **Bookmarks** at the top (All bookmarks / Unsorted / nested folders, capped at 2 levels via `bookmark_folders.parent_id`) and **Library Folders** below. Selecting any bookmark folder takes over the main panel; the right-side Bookmarks card was removed.
- **Personal library**: Unsorted virtual folder (folder_id IS NULL)
- **Add options per folder**: Search PMC, Enter DOI, Upload file, Import .ris/.bib, Search ClinicalTrials.gov
- **ClinicalTrials.gov search** (`LibraryClinicalTrialSearch`): ClinicalTrials.gov API v2, returns study cards for import
- **LibraryRisImporter**: parse client-side, preview 5 items, folder picker (existing or auto-create "Import YYYY-MM-DD"), bulk insert
- **LibraryItemCard**: 3-dot menu (rename / move to folder / remove); "Share this paper" → prefills NewPostScreen. Inline rename edits `library_items.title` (Enter saves, Esc cancels) — useful for cryptic filenames after upload.
- **Unsorted view**: inline "Move to folder" select per item
- **Bookmarks main view**: card list filtered by selected folder (or "All"); per-card folder dropdown moves a bookmark; "All bookmarks" view shows each item's current folder name as a tag.

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
- Posts tab: paginated table (50/page), search + type/hidden filters, reported posts highlighted amber; Hide/Unhide, Delete, View actions
- Groups tab: health table (🟢 Active / 🟡 Quiet / 🔴 Dead); member count, posts/week, last active; filter by health
- Projects tab: same as groups for active projects
- Moderation tab: reported posts queue with Dismiss / Hide / Delete actions; status filter (pending/dismissed/actioned)

**Post reporting** (user-facing, fully implemented):
- Non-owner ··· menu in PostCard and GroupPostCard includes 🚩 Report option
- ReportModal: 5 reason options, optional note, duplicate detection
- Admin report badge on PostCard (visible to admins only)
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

### Account deletion (30-day soft-delete with recovery + admin handoff)
- "Schedule deletion" in Account Settings → Danger zone runs `get_my_admin_groups_for_handoff()` first. If the user is the only admin of any groups, the confirm card grows a per-group successor dropdown (longest-tenured other member as default, "Dissolve" as fallback). Handoffs run before the schedule timestamp is set; if any fail, the whole flow aborts so the user is never left mid-state.
- After handoffs, `delete_own_account()` sets `profiles.deletion_scheduled_at = now()` and inserts an `account_deletion_scheduled` notification (fires the email webhook with the recovery link).
- User stays signed in; the local profile bumps `deletion_scheduled_at` and `App.jsx` swaps in a full-screen recovery modal showing the purge date + "Cancel deletion" / "Sign out" buttons.
- Account remains hidden from the feed during the grace window — `posts_with_meta` view filters `where pr.deletion_scheduled_at is null`. Profile / group lookups also hide pending-delete users.
- Recovery: opening any URL while signed in surfaces the modal; the email contains a `?recover_account=1` deep link. `cancel_account_deletion()` RPC clears the timestamp.
- After 30 days, `purge_deleted_accounts()` (pg_cron daily 03:17 UTC) hard-deletes the account: removes tracked storage blobs, then `auth.users` (cascade does the rest).
- **What survives the purge** (Phases 12.2 + 12.4): DM threads + every message stay (`conversations.user_id_a/b` and `messages.sender_id` are SET NULL); comments on others' posts stay (`comments` / `group_post_comments` / `project_post_comments` user_id SET NULL). Frontend renders "Deleted user" + greyed avatar across MessagesScreen, PostCard / GroupPostCard / ProjectPostCard comments, and the PublicPostPage CommentsSection. Compose area in MessagesScreen is replaced with a polite "replies aren't possible" banner.
- **What gets removed** (right-to-be-forgotten): authored posts (text + group + project), profile, library, bookmarks, lumens, likes, reposts, follows, publications, storage blobs.
- Email is wired through the existing `send-email-notification` edge function. `account_deletion_scheduled` is a critical type — it bypasses the master `email_notifications` toggle so the user always sees the recovery option.

### Storage management
- Every upload (post / group post / library / avatar / group avatar+cover) writes a row to `user_storage_files` via the `record_storage_file` RPC at the call site — see CLAUDE.md "Storage tracking (mandatory pattern)".
- **Account Settings → Storage**: violet total card with bytes + per-bucket chips and a `Manage storage →` button. Lightweight overview for the drawer; no file list inside the drawer.
- **`StorageScreen`** (`screen === 'storage'`): full-width manager grouped by source kind (Post attachments / Group post attachments / Library files / Profile photo / Group avatars / Group covers / Other). Each row shows the linked context (paper title or content excerpt / library title / group name), size, date, a `View ↗` deep link (`/s/:postId` for posts, `/g/:slug` for group items), and a Delete button where deletable.
- **Soft-delete attachments**: deleting a post / group post attachment sets `file_deleted_at = now()` on the row + nulls `image_url` / `file_name` / `file_type`. PostCard / GroupPostCard / ProjectPostCard render `📎 File removed by author` placeholder; the post body stays. Library deletions remove the `library_items` row entirely. Avatars and group images cannot be deleted — only replaced via the regular upload flow.
- **Admin Storage section** (`/admin → Storage`): global total, per-bucket totals, sortable per-user roll-up. Click any user row to expand; lazy-fetches that user's enriched file list via `get_admin_user_storage_files(p_user_id)` and renders inline. Read-only — admins moderate via existing tools (hide / delete post).
- Quotas not enforced yet. `total_bytes` from `get_my_storage_usage()` is the future hook for a per-user quota check.

### Lumens / Gamification
- **Lumens** are points awarded for contributing to the community. Live system, gated behind `LUMENS_ENABLED` feature flag in constants.js.
- Four tiers (computed from `lumens_current_period`): **Catalyst** 0–499 / **Pioneer** 500–1999 / **Beacon** 2000–4999 / **Luminary** 5000+. Only the Luminary tier carries any visible decoration: a 2px gold (#C9A961) ring on the avatar (via the optional `tier` prop on `Av`).
- **Earning hooks** (frontend, fire-and-forget RPC, all `try/catch`-wrapped): `post_created` +5 (NewPostScreen), `comment_posted` +2 (PostCard, commenter), `comment_received` +10 (PostCard, post owner — deduped to first comment per commenter via `lumen_transactions` lookup), `post_reposted` +20 (PostCard, post owner — skip self), `discussion_threshold` +50 (PostCard, post owner when distinct commenter count first hits 3, deduped), `invited_user_active` +100 (NewPostScreen, on inviter's first post — looks up `invite_codes.created_by`)
- **Sidebar widget**: Lumens count + tier name merged into the profile box (avatar + first name + tier line); top bar removed entirely. Settings gear moved to the sidebar header next to the QR icon.
- **LumensScreen** (`screen === 'lumens'`): tier hero card with progress bar to next tier, "Recent earnings" list (timestamps include date+time, post excerpts hydrated from `tx.meta.post_id`), tier ladder, and earning rules table.
- **Cross-user sync**: `award_lumens` runs server-side, so App.jsx subscribes to a realtime UPDATE on the user's own `profiles` row to keep the sidebar count in sync. Optimistic `setProfile` bump applied locally for snappier UX.
- **Admin Users tab**: Lumens column with sort, showing count + tier name; uses the updated `get_admin_user_list()` RPC.
- `ProfileCompletionMeter`: live milestone system (5 stages, confetti) — wired to real DB counts. Separate from Lumens; tracks profile completeness, not contribution.
- Founding members: `is_founding_member` flag set by trigger for signups before `admin_config.founding_member_cutoff`.

### Analytics
- PostHog consent-gated analytics via `analytics_consent_at` on profiles (separate from `marketing_consent_at` for email marketing)
- Opt-in asked at sign-up; togglable in Account Settings
- `opt_out_capturing_by_default: true` — no data sent until user consents
- 15 events instrumented: `signed_up`, `invite_code_used`, `post_created`, `post_liked`, `comment_posted`, `group_created`, `group_joined`, `group_left`, `publication_added`, `library_item_added`, `project_created`, `template_used`, `template_submitted`, `dm_sent`, `onboarding_completed`, `profile_stage_reached`
- Requires `REACT_APP_POSTHOG_KEY` in Vercel env vars (Production scope)

---

## Known gaps / not yet built

- **Mobile layout (in-app)**: Landing page is responsive, but the authenticated app is still desktop-only — 200px sidebar + multi-column grids break on phones. `useWindowSize` is wired into `App.jsx`, `BottomNav`, and `LandingScreen` but most authenticated screens haven't been adapted.
- **Push notifications / email digests**: Transactional emails ship (Resend, six event types + welcome). No push, no weekly digest.
- **Admin panel**: Analytics tab is placeholder. Admin Inbox is fully implemented but not in the left nav — reachable only via direct `section` state.
- **PWA / offline**: Not configured.
- **End-to-end encryption for group posts**: Schema has `content_iv`/`content_encrypted` columns but encryption is not implemented.
- **Gold avatar ring in feed**: Av currently renders the `luminary`-tier ring on profile pages and the sidebar widget only. Feed `PostCard` avatars do not pass the `tier` prop — would require recreating `posts_with_meta` to expose author lumens/tier.

---

## Pending migrations (not yet run in production)

- **`migration_profile_v2.sql` (partial)**: Additive parts applied — new split address columns (`work_street`, `work_city`, `work_postal_code`, `work_country`, `location_city`, `location_country`) and `work_mode = 'both'` → `'clinician_scientist'` rename are live. DROP of `card_address` / `card_show_address` deferred; columns still exist on profiles.

## Recently shipped migrations

- **`migration_email_notifications.sql`** (Phase 7A): adds `email_notif_new_follower`, `email_notif_new_message`, `email_notif_group_request`, `welcome_email_sent` to profiles; backfills existing users.
- **`migration_email_notifications_v2.sql`** (Phase 7B): adds `email_notif_new_comment`, `email_notif_invite_redeemed`; respects master toggle for backfill.
- **`migration_admin_interventions.sql`**: Creates `admin_config` table + RLS; seeds `luminary_board`, `paper_of_week`, `milestone_post_template` rows; adds `get_admin_config`, `set_admin_config`, `send_admin_post` RPCs; adds `is_admin_post` + `target_user_id` columns to `posts`; DROP+CREATE `posts_with_meta` view to include new columns.
- **`migration_gamification.sql`** (Phase 8): adds `lumens_current_period`, `lumens_lifetime`, `current_period_started`, `previous_period_lumens`, `is_founding_member` to profiles; creates `lumen_transactions` table + RLS; adds `award_lumens`, `get_lumen_history` RPCs and `compute_tier` helper; seeds `founding_member_cutoff` admin_config; installs `apply_founding_member_status` trigger. Requires `alter publication supabase_realtime add table profiles;` for cross-user sidebar sync.
- **`migration_admin_lumens.sql`** (Phase 8 follow-up): replaces `get_admin_user_list()` to also return `lumens_current_period`, `lumens_lifetime`, `is_founding_member`.
- **`migration_storage_tracking.sql`** (Phase 9): creates `user_storage_files` table + RLS, adds `file_deleted_at` to posts / group_posts / project_posts, installs `record_storage_file`, `delete_user_file`, `get_my_storage_usage`, `get_admin_storage_usage` RPCs, backfills from `storage.objects`, and DROP+CREATEs all three `*_with_meta` views to expose `file_deleted_at`.
- **`migration_storage_enriched.sql`** (Phase 9.1): replaces `get_my_storage_usage` to enrich each file row with `context_label`, `context_group_slug`, and `already_deleted` so the dedicated `StorageScreen` can show paper titles / content excerpts and per-row deep links.
- **`migration_admin_storage_files.sql`** (Phase 9.2): adds the admin-only `get_admin_user_storage_files(p_user_id)` RPC for the per-user drill-down in the admin Storage section.
- **`migration_account_soft_delete.sql`** + **`migration_account_soft_delete_fix.sql`** (Phase 10): adds `profiles.deletion_scheduled_at`, rewrites `delete_own_account()` (returns timestamptz; inserts `account_deletion_scheduled` notification using `notif_type` column — fix migration patches the original which used wrong column name `type`), adds `cancel_account_deletion()` and `purge_deleted_accounts()`, DROP+CREATE `posts_with_meta` to filter deletion-pending authors. pg_cron schedule pinned in a comment block — run manually once.
- **`migration_bookmark_folders.sql`** (Phase 11): creates `bookmark_folders` (self-FK `parent_id`) + RLS, adds `saved_posts.folder_id` (FK ON DELETE SET NULL so deleting a folder unsets bookmarks instead of dropping them).
- **`migration_deepdive_title_cover.sql`** (Phase 12): adds `posts.deep_dive_title` + `posts.deep_dive_cover_url`, then DROP+CREATE `posts_with_meta` so the new columns flow through the view (preserves the deletion-pending filter from Phase 10).
- **`migration_deepdive_cover_position.sql`** (Phase 12.1): adds `posts.deep_dive_cover_position` (text, default `'50% 50%'`) for the drag-to-reposition cover preview; DROP+CREATE `posts_with_meta`.
- **`migration_account_deletion_safety.sql`** (Phase 12.2): drops legacy `groups.owner_id` (cascade footgun) and switches `conversations.user_id_a/b` + `messages.sender_id` from CASCADE to SET NULL so DM threads survive when one party is purged.
- **`migration_handoff_groups.sql`** (Phase 12.3): adds `get_my_admin_groups_for_handoff()` RPC — returns groups where the caller is the sole admin, used by the schedule-delete confirm flow to prompt for a successor.
- **`migration_tombstone_comments.sql`** (Phase 12.4): switches `comments` / `group_post_comments` / `project_post_comments` `user_id` from CASCADE to SET NULL so threads keep their structure when an author is purged. Frontend renders "Deleted user" + greyed avatar in place of the missing author across all four comment surfaces (PostCard top + thread, GroupPostCard top + thread, ProjectPostCard, PublicPostPage CommentsSection).
- **`migration_group_cover_position.sql`** (Phase 12.5): adds `groups.cover_position` (text, default `'50% 50%'`) for the drag-to-reposition group cover.

## Storage RLS policy required

The user-folder UPDATE policy on `storage.objects` is required for avatar replacement (upsert: true downgrades to UPDATE on the second upload):

```sql
create policy "users can update own files in post-files"
  on storage.objects for update to authenticated
  using (bucket_id = 'post-files' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'post-files' and split_part(name, '/', 1) = auth.uid()::text);
```

Without it, the second avatar upload fails with "new row violates row-level security policy".

---

## Tech debt / rough edges
- `src/screens/GroupsScreen.jsx` is a legacy file — active version is `src/groups/GroupsScreen.jsx`. Legacy file must not be edited.
- `saveTopics` / `editingTopics` / `topicDraft` / `savingTopics` state in ProfileScreen is dead code (topic_interests editing was moved to main edit form).
- Unread DM count polled every 30s (could be real-time subscription).
- No unit or integration tests.
- `useCallback` / `useMemo` used sparingly; some large components re-render more than needed.
