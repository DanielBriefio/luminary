# Luminary — Product State Briefing

> **Date:** April 2026  
> **Stack:** React 18 (CRA) · Supabase (Postgres + Auth + Storage + Edge Functions) · Vercel  
> **Repo:** github.com/DanielBriefio/luminary  
> **Purpose:** Research networking and knowledge-sharing platform for scientists and medical affairs professionals. Think LinkedIn × ResearchGate — modern, fast, science-first.

---

## Architecture

- **No React Router.** Navigation is state-based via a `screen` variable in `App.jsx`.  
  Exception: public profile (`/p/:slug`) and public post (`/s/:postId`) URLs are detected from `window.location.pathname` before auth runs and render without any login wall.
- **All inline styles** using a shared design token object (`T` from `src/lib/constants.js`). No CSS files, no Tailwind.
- **Supabase** handles auth, database, file storage (`post-files` bucket), and two edge functions.
- **Vercel** auto-deploys on every push to `main`.

---

## Implemented Features

### Authentication
- Email/password sign-up and sign-in via Supabase Auth.
- Session persists across page reloads.

---

### Feed (`FeedScreen`)
- **For You** tab: all posts from all users, newest first.
- **Following** tab: posts from followed users + posts that reference a paper DOI the user is following.
- **All / Papers** sub-tabs to filter by post type.
- Reposts are surfaced in both feed modes (with repost attribution shown on the card).
- Right sidebar: profile mini-card (name, title, institution, avatar), "Founding Fellows" message, and a static Paper of the Week card.

---

### Post Creation (`NewPostScreen`)
Five post types, each with distinct metadata:

| Type | What it stores |
|------|---------------|
| **Text** | Rich HTML content (bold, italic, links) |
| **Paper** | DOI lookup via CrossRef API → title, journal, authors, abstract, year auto-filled. Search by author name via CrossRef (shows citation count + Open Access badge). |
| **Link** | Title + URL + live link preview (fetches OG/title from URL) |
| **Upload** | Image (10 MB), video (200 MB), audio (50 MB), PDF (25 MB), CSV (5 MB) → Supabase Storage |
| **Tip** | Plain short-form text |

All posts support:
- Manual hashtags (space/comma separated input).
- **AI auto-tagging** via `auto-tag` Supabase edge function (appended to manual tags, max 10 total, best-effort — never blocks publish).
- **Visibility toggle:** Everyone / Followers only.

---

### Post Card (`PostCard`)
- **Like/unlike** with optimistic UI update and count display.
- **Repost/un-repost** with optimistic UI and count display.
- **Comments** — lazy-loaded on expand, inline compose, displayed inline below post.
- **Edit / Delete** (owner only, behind a dropdown `⋯` menu with a confirm step for delete).
- **Follow paper by DOI** or **follow the post author** via reusable `FollowBtn`.
- Post type badge (Paper, Photo, Audio, Link, Tip).
- **Share modal** — copy link, native share API (mobile), share to X/Twitter, LinkedIn, WhatsApp. Link goes to `/s/:postId`.
- **Open Graph tags** on the public post page (`/s/:postId`) — `og:title`, `og:description`, `og:image` (uploaded media, YouTube thumbnail, or branded Luminary fallback PNG with wordmark).

---

### Explore (`ExploreScreen`)
- Full-text search against post content (`ilike`, debounced 400 ms).
- Topic tag chips: #GLP1, #CryoEM, #CRISPR, #OpenScience, #DigitalHealth, #MedicalAffairs, #RWE, #WomensHealth — clicking prefills the search box.

---

### My Network (`NetworkScreen`)
- **Stats strip:** Friends count · Following count · Followers count · Papers followed count.
- **Friends section:** People you follow who follow you back (shown as grid cards with avatar, name, title, institution + unfollow button).
- **Friend Suggestions section:** People who follow you but you haven't followed back — "Follow back" CTA.
- **Following section:** People you follow who haven't followed back yet.
- **Papers I'm Following section:** All papers (by DOI) the user follows. Shows paper title, journal, year, DOI, and an unfollow button. Metadata is resolved from existing posts in the feed. Ordered most-recently-followed first.
- **People You May Know sidebar:** 2nd-degree connections (people my followees follow) + same-institution fallback. "+ Follow" CTA.
- **Following / Followers modals:** Click either stat chip to open a full list with follow/unfollow actions inline.
- All follow/unfollow actions are optimistic — UI updates before the Supabase write confirms.

---

### Groups (`GroupsScreen`)
- Create private research groups with a name and institution.
- Group feed: text posts within the group context.
- Creator is automatically added as `owner` in `group_members`.
- Non-owners can follow groups via `FollowBtn`.

---

### Notifications (`NotifsScreen`)
Notification types:
- `new_post` — someone you follow posted
- `new_comment` — someone commented on your post
- `paper_comment` — someone commented on a paper you're following
- `new_follower` — someone started following you
- `group_announcement` — group announcement
- `group_member_added` — you were added to a group

Behaviour: unread badge in sidebar nav, marks all as read on open, actor profiles fetched in batch.

---

### My Profile (`ProfileScreen`)
**Three tabs: About · Publications · Posts**

**About tab — editable fields:**
- Name (with prefix e.g. "Dr.", middle name, suffix e.g. "PhD")
- Title, Institution, Location, Bio, ORCID, Twitter/X handle

**Import menu (top-right dropdown):**
| Source | What it imports |
|--------|----------------|
| **LinkedIn ZIP** | Parses `profile.csv`, `positions.csv`, `education.csv`, `volunteer.csv`, `organizations.csv`, `honors.csv`, `languages.csv`, `skills.csv`, `patents.csv`. Fuzzy dedup with a `ConflictResolverModal` for work/edu conflicts. |
| **ORCID** | Fetches from `pub.orcid.org` API — imports employment, education, works (publications). Also supports importing **Grants & Funding** from ORCID separately. |
| **CV upload** (PDF / DOCX / TXT) | Calls `extract-publications` edge function (`mode:'full_cv'`) — extracts bio, title, location, honors, languages, skills, work history, education, and publications in one shot. |

**Profile sections** (stored as JSONB arrays in `profiles`):
`work_history`, `education`, `volunteering`, `organizations`, `honors`, `languages`, `skills`, `patents`, `grants`

**Publications tab** (`PublicationsTab`):
- Full CRUD on the `publications` table.
- CrossRef author name search (auto-derives "Last First" and "Last FI" variants).
- ORCID import, CV import — same importers reused.
- Conflict-aware dedup on import with preview before committing.
- Publication types: journal, conference, poster, lecture, book, review, preprint, other.

**Posts tab:** shows all posts the user has authored.

**Share Profile panel** (right-side drawer):
- Edit `profile_slug` (auto-generated from name, must be unique).
- Per-section visibility toggles (work, education, volunteering, organizations, skills, publications).
- SVG badge export (320 px wide, gradient, name/title/institution).
- QR code generated via the `qrcode` npm package.

---

### Public Profile (`/p/:slug`)
- No auth required — works as a plain URL.
- Respects `profile_visibility` JSONB (per-section toggles).
- Shows: avatar, name (with prefix/suffix), title, institution, bio, work history, education, skills, publications.
- Tabs: About / Publications.
- Publication stats shown: h-index (estimated), total citations, publication count.
- Page `<title>` set to `"Name — Luminary"` for SEO.

---

### Public Post Page (`/s/:postId`)
- No auth required.
- Full post rendered with correct OG tags for rich link previews when shared on social media.
- Branded fallback OG image (Luminary wordmark + gradient) when no media is attached.

---

### Other / Infrastructure
- `UserProfileScreen` — view any other user's profile (About, Publications, Posts tabs) from inside the app.
- `RichTextEditor` — contenteditable editor with bold/italic/link toolbar.
- `LinkPreview` component — fetches OG data from URLs and renders a preview card inline.
- `ConflictResolverModal` — side-by-side dedup UI for import conflicts.
- `ExpandableBio` — truncated bio with "Show more" toggle.
- Gamification sidebar badge: "Lv.1 — Researcher, 0 XP" (currently static/decorative).
- Supabase DB trigger: notifies paper followers when a comment is posted on a paper they follow.

---

## Database Tables (key ones)

| Table | Purpose |
|-------|---------|
| `profiles` | User profile + all JSONB section arrays |
| `posts` | All post content and metadata |
| `posts_with_meta` | VIEW: posts + `like_count`, `comment_count`, `repost_count` |
| `likes` | user_id ↔ post_id |
| `reposts` | user_id ↔ post_id |
| `comments` | Threaded comments on posts |
| `follows` | `follower_id`, `target_type` (user/paper/group), `target_id` |
| `groups` / `group_members` / `group_posts` | Private research groups |
| `notifications` | All notification types with JSONB `meta` |
| `publications` | User publication records |

---

## Edge Functions

| Function | Purpose |
|----------|---------|
| `extract-publications` | CV extraction — profile fields + work/edu + publications from PDF/DOCX/text via Claude AI |
| `auto-tag` | Extracts relevant hashtags from post content + paper metadata via Claude AI |

---

## What to Build Next — Recommendations

### High Priority (core product gaps)

1. **Direct Messaging**  
   The network exists but users can't contact each other. Even a basic DM thread (sender/recipient, messages table, unread badge) would unlock real networking value.

2. **Notifications for new followers + post interactions as push/email**  
   Currently notifications only show inside the app. Adding email digests (via Supabase Edge Functions + Resend/SendGrid) for `new_follower` and `new_comment` would drive re-engagement.

3. **Explore — search beyond post content**  
   Search currently only hits `posts.content`. It should also search `profiles` (name, institution, title) and `publications` (title, authors, journal). Ideally a single search bar returns mixed results with type labels.

4. **Paper detail page**  
   Right now papers are only visible as posts. A dedicated `/paper/:doi` page that aggregates all posts, comments, and followers for a given DOI would make "following a paper" feel like a first-class feature.

5. **Real XP / gamification**  
   The sidebar already shows "Lv.1 — Researcher, 0 XP". Wire it to real activity: post = +10 XP, comment = +5, new follower = +15, publication added = +25. Add level thresholds and a leaderboard to make it sticky.

---

### Medium Priority (polish + retention)

6. **Onboarding flow**  
   New users land on an empty feed. A 3-step wizard (pick topics → follow suggested researchers → add one publication) would dramatically improve Day 1 activation.

7. **Hashtag/topic pages**  
   Clicking `#CRISPR` in a post currently does nothing inside the app. These should navigate to a filtered feed view. Topic pages with follower counts would also make the Explore section much more useful.

8. **Post bookmarks / saved posts**  
   A simple `saves` table (user_id ↔ post_id) with a bookmark icon on `PostCard` and a "Saved" tab on the profile page.

9. **Richer comment threads**  
   Comments are flat. Adding reply-to threading (parent_comment_id) and reactions (👍 🔬 🤔) on comments would increase depth of discussion.

10. **Profile completion meter**  
    Show a % complete bar on `ProfileScreen` that nudges users to fill in bio, add a publication, link ORCID, etc. Correlates directly with network quality.

---

### Longer Term

11. **Groups — full feature parity**  
    Groups exist but are minimal. Add: member list, group announcements, file attachments in group posts, invite by email, and group discovery in Explore.

12. **Publication citation graph**  
    Use CrossRef/OpenAlex APIs to show which papers in a user's publications cite each other, and surface "people who published in the same journal" as connection suggestions.

13. **Conference / Event listings**  
    A simple events table (name, date, location, URL) with an RSVP/interested button — relevant conferences auto-surfaced based on a user's publication topics.

14. **Mobile app / PWA**  
    The current UI is desktop-first. Adding a `manifest.json`, service worker, and responsive breakpoints would make it installable on mobile without a native app.
