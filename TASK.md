# Task: Analytics Section 7 — Admin Panel

## Context

Read CLAUDE.md, PRODUCT_STATE.md, SCHEMA.md, and TASK.md.

Check what RPCs already exist before writing any new SQL. Several
analytics-adjacent RPCs are already live:
- `get_platform_stats()`
- `get_user_activation_stages()`
- `get_ghost_users()`
- `get_content_health()`
- `get_activity_sparklines()`
- `get_at_risk_alerts()`
- `get_admin_user_list()`
- `get_invite_codes_with_stats()`
- `get_invite_tree()`

Read these RPC definitions first. Reuse what exists. Only write new
RPCs for metrics not already covered.

---

## Goal

Replace the current Analytics placeholder in the admin panel with a
real four-tab analytics dashboard. The purpose is decision support —
not wallpaper metrics. Each tab answers a specific question:

- **Health** — is this working?
- **Growth** — who is joining and why?
- **Product** — which features matter?
- **Behaviour** — who to engage with personally?

A shared time range selector (7d / 30d / 90d / all time) applies
across all tabs.

---

## Tab 1 — Health

Answers: is the platform retaining users?

Key metrics to show:
- Total users, new signups in period (with trend vs previous period)
- **D7 retention** — of users who signed up 7-14 days ago, what % were active in the last 7 days? Show cohort size, retained count, percentage. Colour code: green ≥30%, amber ≥15%, red below.
- **D30 retention** — same pattern for 30-60 day cohort vs last 30 days
- **Activation funnel** — reuse `get_user_activation_stages()`. Show each stage as a bar with count, percentage of total, and drop-off % from previous stage
- **Weekly signups** — cumulative growth line chart (last 12 weeks)
- **Daily active users** — bar chart (last 30 days). Active = posted, commented, or liked that day
- PostHog links: Retention chart, Activation funnel, Live events

---

## Tab 2 — Growth

Answers: who is joining and which channel produces better users?

Key metrics:
- **Signup method breakdown** — ORCID vs invite code, count and %
- **Behaviour by signup method** — compare ORCID cohort vs email cohort: avg posts, avg comments, avg Lumens, % activated. Simple comparison table.
- **Work mode breakdown** — researcher / clinician / industry / clinician_scientist. Count + avg posts + avg Lumens per segment.
- **Tier distribution** — how many users at each tier (Catalyst/Pioneer/Beacon/Luminary). Horizontal bars using tier colours from TIER_CONFIG.
- **Top inviters** — top 20 users by active invitees brought in. Show: name, codes created, codes claimed, active invitees (those who posted at least once), conversion rate %.

---

## Tab 3 — Product

Answers: which features are being used and what content works?

Key metrics:
- **Feature adoption** — for each feature, % of total users who have ever used it. Features: posted, commented, joined group, added library item, created project, added publication, sent DM, followed someone. Show as horizontal progress bars, colour coded (≥50% green, ≥25% amber, below red).
- **Content performance by type** — paper vs text vs deep dive. For each: total posts, avg likes, avg comments, % with 3+ commenters. Table format.
- **Lumens distribution** — histogram showing how Lumens are distributed across users. Buckets: 0, 1-25, 26-100, 101-250, 251-500, 501-1000, 1001-2000, 2001-5000, 5000+. Shows whether the earning mechanics are being triggered.
- **Profile completeness** — % of users with bio, avatar, publication, ORCID, field tags, work history. Helps identify which profile fields nobody fills in.
- **User preferences / consent rates** — email notifications on %, email marketing on %, analytics consent %. Colour coded ≥70% green, 40-70% amber, below red.
- **Group health summary** — count of Active / Quiet / Dead groups. Reuse `get_content_health()` or existing group health logic.
- **Hot papers** — papers discussed by 2+ distinct users. DOI, title, participant count. Empty state if none yet.
- PostHog links: Feature adoption trends, Lumens earned events, Board dismissed events

---

## Tab 4 — Behaviour

Answers: who should I personally reach out to?

Key metrics:
- **Segment comparison** — behaviour by work_mode. For each segment: user count, avg posts, avg comments, avg Lumens, avg groups joined, % with publication. Table format.
- **Power posters** — top 20 users by post count in the selected period. Show name, work mode, tier, post count, Lumens.
- **Power commenters** — top 20 by substantive comments (>50 chars) in period. Same columns.
- **At-risk users** — users who had ≥3 actions total but have been silent for 7+ days and signed up 14+ days ago. Show name, work mode, tier, days silent, total posts. Max 30 rows. Include a "Nudge" button per row that opens the admin nudge modal pre-filled with that user.
- **Quiet champions** — users followed by 3+ others but with fewer than 3 posts. They have credibility but aren't posting. Worth a personal nudge. Show name, work mode, follower count, post count.
- **Deletion feedback** — if `deletion_feedback` table exists, show reason breakdown. If table doesn't exist yet, skip this section silently.

---

## Shared components to build

- **StatCard** — label, large number, optional trend arrow vs previous period, optional benchmark note
- **PreferenceRow** — label, horizontal bar, percentage, optional count
- **SectionCard** — titled card wrapper with subtitle
- **UserRow** — avatar + name + work mode + tier badge + metrics. Reuse `Av` component with tier prop.
- **SimpleBarChart / SimpleLineChart** — check if recharts is in package.json first. If yes, use it. If no, simple SVG is fine. Charts are admin-only and don't need to be interactive.
- **PostHogLinks** — compact row of "Open in PostHog →" links

---

## AdminShell wiring

The Analytics nav item already exists. Replace the current placeholder
content with the new AnalyticsSection component.

---

## One small addition — FeedTipCard

Add `capture('board_dismissed')` PostHog event when the Luminary Board
dismiss button is clicked. One line addition to the existing handler.
This feeds the product analytics tab.

---

## What NOT to change

- Any existing admin section
- Any existing RPCs — extend only if needed, never modify existing ones
- `GroupsScreen.jsx` legacy file
- Run `npm run build` when done

---

## Notes on empty states

With few users many metrics will be empty or zero. Every chart and
table needs a graceful empty state. The dashboard should be useful
from day one even with zero data — metrics that need more users to
be meaningful should say so (e.g. "D7 retention requires at least
one cohort of users 7+ days old").

Benchmark guidance to show in the UI:
- D7 retention ≥ 30% = healthy
- D30 retention ≥ 20% = healthy
- Feature adoption ≥ 50% = good signal
- These are starting points — adjust based on real cohort data
