# Luminary Prototype — Product State
_Last updated: 2026-04-14_

## What exists and works

### Core auth & onboarding
- Email/password sign-up and login (Supabase Auth)
- First-run onboarding wizard: follow suggested users, add first publication
- Auto-generated `profile_slug` for public profile URLs

### Feed
- For You / Following toggle
- All / Papers tab filter
- Rich post types: text, paper (DOI lookup), link, upload (image/video/audio/PDF/CSV), tip
- Like, comment (threaded, inline), edit, delete
- AI auto-tagging via `auto-tag` edge function
- Manual hashtags + visibility (Everyone / Followers only)
- Right sidebar: profile mini-card, Founding Fellows banner, Paper of the Week (static)

### Explore
- Full-text search (debounced ilike across post content, paper fields, tags)
- Topic tag chips: 8 preset science topics
- Right sidebar: same topic chips + featured papers

### Network
- Followers / Following / Suggested tabs
- Follow/unfollow any user
- Message button → opens DM
- Suggested connections from unfollowed profiles

### Groups
- Create private research groups
- Group feed: text posts within a group
- Follow groups

### Notifications
- Types: new_post, new_comment, paper_comment, new_follower, group_announcement, group_member_added
- Unread badge; batch-mark as read on open

### Direct Messages
- Conversation list with last message preview + unread badge
- Real-time thread (Supabase channel subscription)
- Compose button (pencil icon) → New Message panel
- New Message panel: suggested people (follows + followers) + live name search
- Optimistic send; marks read on open
- Entry from any user's profile via Message button

### My Profile
- Editable: name, title, institution, location, bio, ORCID, Twitter
- Sections: work history, education, volunteering, organizations, honors, languages, skills, patents
- Import: LinkedIn ZIP, ORCID API, CV upload (PDF/DOCX)
- Fuzzy dedup with conflict resolver on import
- Publications tab: CRUD, CrossRef search, ORCID import, CV import
- Share panel: slug editor, visibility toggles per section, SVG badge, QR code

### User Profile (other users)
- View another user's About / Publications / Posts
- Follow, Message buttons
- Back navigation

### Paper Detail
- Paper metadata, abstract, linked posts
- Follow paper by DOI
- Compose post about paper (auth only)
- Public URL: `/paper/:doi`

### Public pages (no auth)
- `/p/:slug` — public profile (respects visibility settings)
- `/s/:postId` — public post
- `/paper/:doi` — public paper detail

### Gamification
- Sidebar XP badge: "Lv.1 — Researcher, 0 XP" — static/decorative, not wired to activity

---

## Known gaps / not yet built

- **Mobile layout**: No responsive design. App is desktop-only (200px sidebar + multi-column grids break on phones).
- **XP / leveling system**: Decorative only.
- **Search**: No global people or paper search (Explore only searches posts).
- **Group posts**: Only text type; no rich media in groups.
- **Notifications**: No push notifications; no email digests.
- **Moderation / reporting**: None.
- **Analytics**: No usage tracking.
- **PWA / offline**: Not configured.

---

## Tech debt / rough edges

- `FOLLOWS_MIGRATION.sql`, `SUPABASE_MIGRATION.sql`, `migration_*.sql` files were deleted from repo (applied to DB already).
- `TASK.md` contains historical task tracking — not a live plan.
- No unit or integration tests.
- `useCallback` / `useMemo` used sparingly; some components re-render more than needed.
- Unread message count polled every 30s (could be real-time subscription instead).
