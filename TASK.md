# Task: Admin Enhancements + Email Fix + Doc Split (Phase 7B)

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task bundles several related improvements:

1. **Admin Inbox → left nav** — currently reachable only via direct
   state; add to AdminShell NAV_ITEMS
2. **group_member_joined email** — add to Edge Function inline HTML
3. **Edge Function sync** — reconcile repo vs deployed dashboard version
4. **User table enhancements** — invite_codes_remaining column, sortable
   columns, direct message button per row, top-up codes in UserDetailPanel
5. **Content Posts tab fixes** — remove invalid post type filters,
   add sortable columns, show deep-dive indicator
6. **get_admin_user_list() RPC** — add invite_codes_remaining field
7. **CLAUDE.md split** → CLAUDE.md (conventions) + SCHEMA.md (database)
8. **CLAUDE.md post-type correction** — text and paper only; remove
   references to link, tip, upload as active post types

> ⚠️ Step 3 (Edge Function sync) must happen BEFORE any Edge Function
> edits. The repo file and Supabase dashboard may have diverged. Do not
> overwrite dashboard changes with stale repo content.

---

## Step 1 — Admin Inbox → left nav

In `src/admin/AdminShell.jsx`, add Inbox to `NAV_ITEMS`:

```javascript
const NAV_ITEMS = [
  { id: 'overview',      label: 'Overview',      icon: '📊' },
  { id: 'users',         label: 'Users',         icon: '👥' },
  { id: 'invites',       label: 'Invites',       icon: '🎟️' },
  { id: 'templates',     label: 'Templates',     icon: '📋' },
  { id: 'content',       label: 'Content',       icon: '🗂️' },
  { id: 'interventions', label: 'Interventions', icon: '⚡' },
  { id: 'inbox',         label: 'Inbox',         icon: '💬' },
  { id: 'analytics',     label: 'Analytics',     icon: '📈' },
];
```

Find the existing `InboxSection` import (it exists but is not in the
nav). Wire it in the content area conditional alongside the other
sections. Do not change InboxSection itself.

Add an unread indicator to the Inbox nav item if any bot conversations
have unread messages — check if InboxSection already computes this;
if so, surface it as a small red dot on the nav item. If not, skip
the indicator for now.

---

## Step 2 — Edge Function sync (do this first, before any edits)

Before touching `supabase/functions/send-email-notification/index.ts`,
run this in the terminal to see the currently deployed function:

```bash
supabase functions download send-email-notification
```

If that command is unavailable, ask the user to copy the current
content from the Supabase Dashboard → Edge Functions →
`send-email-notification` → Edit and paste it here before proceeding.

The goal: ensure the local file matches what is actually deployed.
If there are differences between the local repo file and the dashboard
version, use the dashboard version as the source of truth (it reflects
edits made after the last deploy).

---

## Step 3 — Add group_member_joined email to Edge Function

Once the file is synced (Step 2), edit
`supabase/functions/send-email-notification/index.ts`:

### Add to EMAIL_TYPES set

Find the `EMAIL_TYPES` constant (a Set or Record of handled notification
types). Add `'group_member_joined'` alongside the existing types.

### Add to PREF_COLUMN map

`group_member_joined` should use `email_notif_group_request` as its
preference gate — group admins who want group request emails also want
to know when someone joins publicly.

```typescript
'group_member_joined': 'email_notif_group_request',
```

### Add templateVariables case

In the `templateVariables` building section, add a case for
`group_member_joined`. The notification meta contains `group_id` and
`group_name` (same as `group_join_request`). The actor is the user
who joined.

```typescript
if (notif_type === 'group_member_joined') {
  templateVariables = {
    ...templateVariables,
    member_name:  actor.name,
    group_name:   meta?.group_name || 'your group',
    group_url:    APP_URL,
  };
}
```

### Add to renderHtml()

Inside the `renderHtml()` function, add a case for
`group_member_joined` following the exact same HTML pattern as the
other notification types. Use the `shell()` wrapper for consistent
branding:

```typescript
case 'group_member_joined': {
  const body = `
    <p style="margin:0 0 16px;font-size:16px;color:#1A1B2E;">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:#1A1B2E;line-height:1.6;">
      <strong>${escape(v.member_name)}</strong> has joined your group
      <strong>${escape(v.group_name)}</strong> on Luminary.
    </p>
    <p style="margin:0;font-size:13px;color:#8B8FA8;">
      Say hello and welcome them to the group.
    </p>
  `;
  return shell(body, v.group_url, `View ${escape(v.group_name)} →`);
}
```

### Add to buildSubject()

```typescript
case 'group_member_joined':
  return `${escape(v.member_name)} joined ${escape(v.group_name)} ✦`;
```

### Deploy

After edits:
```bash
supabase functions deploy send-email-notification
```

---

## Step 4 — SQL migration

Create `migration_admin_enhancements.sql`:

```sql
-- Update get_admin_user_list() to include invite_codes_remaining
-- (replaces existing function — CREATE OR REPLACE is safe)
create or replace function get_admin_user_list()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    from (
      select
        p.id,
        p.name,
        p.title,
        p.institution,
        p.work_mode,
        p.avatar_color,
        p.avatar_url,
        p.profile_slug,
        p.onboarding_completed,
        p.admin_notes,
        p.created_at,

        -- Last active
        greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) as last_active,

        -- Counts
        (select count(*) from posts        where user_id = p.id)::int as posts_count,
        (select count(*) from group_members where user_id = p.id)::int as groups_count,

        -- Active unclaimed personal invite codes remaining
        (
          select count(*)::int
          from invite_codes ic
          where ic.created_by = p.id
            and ic.is_multi_use = false
            and ic.claimed_by is null
            and ic.locked_at is null
            and (ic.expires_at is null or ic.expires_at > now())
        ) as invite_codes_remaining,

        -- Invite code used at signup
        coalesce(
          (select ic.code from invite_codes ic
           where ic.claimed_by = p.id limit 1),
          (select ic.code from invite_code_uses icu
           join invite_codes ic on ic.id = icu.code_id
           where icu.user_id = p.id limit 1)
        ) as invite_code_used,

        -- Activation stage
        case
          when exists(select 1 from posts where user_id = p.id)
            and p.profile_slug is not null
            then 'visible'
          when exists(select 1 from posts where user_id = p.id)
            then 'active'
          when exists(select 1 from follows where follower_id = p.id)
            or exists(select 1 from group_members where user_id = p.id)
            then 'connected'
          when coalesce(p.onboarding_completed, false) = true
            or exists(select 1 from publications where user_id = p.id)
            then 'credible'
          else 'identified'
        end as activation_stage,

        -- Ghost segment
        case
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) = 0 then 'stuck'
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) <= 2
          and greatest(
            (select max(created_at) from posts    where user_id = p.id),
            (select max(created_at) from comments where user_id = p.id),
            (select max(created_at) from likes    where user_id = p.id)
          ) < now() - interval '5 days'
          then 'almost'
          else null
        end as ghost_segment

      from profiles p
      where p.id != (
        select id from profiles where name = 'Luminary Team' limit 1
      )
    ) t
  );
end;
$$;
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 5 — UsersSection.jsx enhancements

Read `src/admin/UsersSection.jsx` carefully before modifying.

### 5a — Add invite_codes_remaining column to table

Add a new column to the user table grid between "Groups" and "Stage":

```
☐  Avatar+Name | Work Mode | Joined | Last Active |
Posts | Groups | Codes | Stage | Ghost | Actions
```

Update `gridTemplateColumns` to accommodate the new column.

In `UserRow`, render `invite_codes_remaining` with colour coding:
- ≥3 remaining: `T.gr` (green — healthy)
- 1–2 remaining: `T.am` (amber — low)
- 0 remaining: `T.ro` (red — exhausted)

```jsx
<div style={{
  fontSize: 13,
  color: user.invite_codes_remaining >= 3 ? T.gr
       : user.invite_codes_remaining >= 1 ? T.am
       : T.ro,
  fontWeight: 600,
  textAlign: 'center',
}}>
  {user.invite_codes_remaining ?? 0}
</div>
```

### 5b — Sortable columns

Add sort state to UsersSection:

```javascript
const [sortBy, setSortBy]     = useState('created_at');
const [sortDir, setSortDir]   = useState('desc');

const toggleSort = (col) => {
  if (sortBy === col) {
    setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  } else {
    setSortBy(col);
    setSortDir('desc');
  }
};
```

Apply sort client-side after filtering:

```javascript
const sorted = [...filtered].sort((a, b) => {
  const aVal = a[sortBy] ?? 0;
  const bVal = b[sortBy] ?? 0;
  if (typeof aVal === 'string') {
    return sortDir === 'asc'
      ? aVal.localeCompare(bVal)
      : bVal.localeCompare(aVal);
  }
  return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
});
```

Sortable columns: `posts_count`, `groups_count`,
`invite_codes_remaining`, `created_at`, `last_active`.

Update column headers to show sort indicator (▲ / ▼) when active:

```jsx
<SortableHeader
  label="Posts"
  col="posts_count"
  sortBy={sortBy}
  sortDir={sortDir}
  onSort={toggleSort}
/>
```

```jsx
function SortableHeader({ label, col, sortBy, sortDir, onSort }) {
  const active = sortBy === col;
  return (
    <div
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        userSelect: 'none',
        color: active ? T.v : T.mu,
        fontWeight: active ? 700 : 600,
      }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.3 }}>
        {active && sortDir === 'asc' ? '▲' : '▼'}
      </span>
    </div>
  );
}
```

### 5c — Direct message button per row

In `UserRow`, replace or augment the existing "View" button with two
actions:

```jsx
<div style={{ display: 'flex', gap: 5 }}>
  <button onClick={onOpen} style={rowBtnStyle}>
    View
  </button>
  <button
    onClick={(e) => { e.stopPropagation(); onDirectMessage(); }}
    style={{ ...rowBtnStyle, color: T.v, borderColor: T.v }}
    title="Send nudge"
  >
    ✉
  </button>
</div>
```

`onDirectMessage` selects just this user and opens `BulkNudgeModal`
directly — same as clicking "Send nudge" in the UserDetailPanel.
Add the handler in UsersSection:

```javascript
const handleDirectMessage = (userId) => {
  setSelected(new Set([userId]));
  setShowNudge(true);
};
```

Pass `onDirectMessage={() => handleDirectMessage(user.id)}` to each
`UserRow`.

---

## Step 6 — UserDetailPanel: top-up invite codes

Read `src/admin/UserDetailPanel.jsx` carefully before modifying.

In the stats grid, show `invite_codes_remaining` as one of the stat
cards with the same colour coding as Step 5a.

Below the stats grid, add a "Top up invite codes" section — only
visible when `invite_codes_remaining < 5`:

```jsx
{user.invite_codes_remaining < 5 && (
  <div style={{
    marginBottom: 20,
    padding: '12px 14px',
    background: T.s2,
    borderRadius: 10,
    border: `1px solid ${T.bdr}`,
  }}>
    <div style={{
      fontSize: 12, fontWeight: 700, color: T.mu,
      textTransform: 'uppercase', letterSpacing: 0.4,
      marginBottom: 8,
    }}>
      Invite codes
    </div>
    <div style={{
      fontSize: 13, color: T.mu, marginBottom: 10,
    }}>
      {user.invite_codes_remaining} of 5 codes remaining
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={topUpCount}
        onChange={e => setTopUpCount(Number(e.target.value))}
        style={{
          padding: '6px 10px', borderRadius: 7,
          border: `1px solid ${T.bdr}`, background: T.w,
          fontSize: 13, color: T.text, fontFamily: 'inherit',
          outline: 'none',
        }}
      >
        {Array.from(
          { length: 5 - user.invite_codes_remaining },
          (_, i) => i + 1
        ).map(n => (
          <option key={n} value={n}>+{n} code{n > 1 ? 's' : ''}</option>
        ))}
      </select>
      <button
        onClick={handleTopUp}
        disabled={toppingUp}
        style={{
          padding: '6px 14px', borderRadius: 7, border: 'none',
          background: T.v, color: '#fff', fontSize: 13,
          fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          opacity: toppingUp ? 0.7 : 1,
        }}
      >
        {toppingUp ? 'Generating…' : 'Generate'}
      </button>
    </div>
  </div>
)}
```

Add state and handler:

```javascript
const [topUpCount, setTopUpCount] = useState(1);
const [toppingUp, setToppingUp]  = useState(false);

const handleTopUp = async () => {
  setToppingUp(true);
  const rows = Array.from({ length: topUpCount }, () => ({
    code:        generateRandomCode(), // same pattern as CreateCodeModal
    created_by:  user.id,
    is_multi_use: false,
    max_uses:    1,
    uses_count:  0,
    label:       'Admin top-up',
  }));
  await supabase.from('invite_codes').insert(rows);
  setToppingUp(false);
  // Notify parent to refresh user data
  onNotesUpdated(user.admin_notes); // triggers a re-fetch or pass onRefresh prop
};
```

Import the `generateRandomCode()` helper from wherever `CreateCodeModal`
defines it (likely a shared utility or inline function). If it's inline
in `CreateCodeModal`, extract it to `src/lib/utils.js` so both
components can import it.

The dropdown shows only as many options as codes needed to reach 5.
If user has 4 remaining, only "+1" is available. If user has 0, options
are "+1" through "+5".

---

## Step 7 — ContentSection Posts tab fixes

Read `src/admin/ContentSection.jsx` carefully before modifying.

### 7a — Remove invalid post type filters

Find the `POST_TYPES` array. Replace:
```javascript
const POST_TYPES = ['text', 'paper', 'link', 'upload', 'tip'];
```
With:
```javascript
const POST_TYPES = ['text', 'paper'];
```

Update the filter select options to match.

### 7b — Add sortable columns to Posts tab

Add sort state to `PostsTab`:

```javascript
const [sortCol, setSortCol]   = useState('created_at');
const [sortDir, setSortDir]   = useState('desc');
```

Update `get_admin_posts` RPC call to pass sort parameters, OR sort
client-side on the current page (simpler — the RPC already paginates).
Since we have 50 posts per page, client-side sort is fine:

```javascript
const sortedPosts = [...posts].sort((a, b) => {
  const aVal = a[sortCol] ?? 0;
  const bVal = b[sortCol] ?? 0;
  if (sortCol === 'created_at') {
    return sortDir === 'desc'
      ? new Date(bVal) - new Date(aVal)
      : new Date(aVal) - new Date(bVal);
  }
  return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
});
```

Sortable columns: `created_at`, `comment_count`, `like_count`,
`participant_count` (distinct commenters).

**Note:** `comment_count` and `like_count` likely come from
`posts_with_meta` view. Verify these fields exist in the view — if not,
the `get_admin_posts` RPC needs to be updated to include them. Check
the view definition before proceeding.

Update the Posts tab column headers:

```
Post | Type | Date▼ | Comments | Likes | Featured | Hidden | Actions
```

Replace the plain column headers with `SortableHeader` components
(same pattern as Step 5b — extract to a shared component or duplicate
the pattern).

### 7c — Deep dive indicator

In `PostRow`, detect deep-dive posts. A deep-dive is likely indicated
by `post_type === 'deep_dive'` or a specific flag — read the posts
table schema to confirm. Add a badge alongside the type column:

```jsx
{post.post_type === 'deep_dive' && (
  <span style={{
    fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: T.v2, color: T.v,
    marginLeft: 4,
  }}>
    Deep dive
  </span>
)}
```

If the `get_admin_posts` RPC doesn't return a field that identifies
deep-dive posts, check whether it's stored in `post_type` or as a
separate boolean column, and add it to the RPC SELECT if needed.

### 7d — Add participant_count to get_admin_posts RPC

Update the `get_admin_posts` RPC to include participant count (distinct
commenters per post):

```sql
-- Add to the SELECT in get_admin_posts:
(
  select count(distinct user_id)::int
  from comments
  where post_id = p.id
) as participant_count,
(
  select count(*)::int from likes where post_id = p.id
) as like_count
```

If `comment_count` and `like_count` already come from `posts_with_meta`,
verify they're passed through the RPC. Add only what's missing.

Run the updated `get_admin_posts` as a CREATE OR REPLACE in Supabase
SQL Editor. Tell the user to run it.

---

## Step 8 — CLAUDE.md split into CLAUDE.md + SCHEMA.md

### 8a — Create SCHEMA.md

Extract from CLAUDE.md all content related to:
- Database Schema (all tables with columns)
- Views (`posts_with_meta`, `groups_with_stats`, etc.)
- RPC functions (all `get_*`, `set_*`, `send_*` functions)
- RLS policies
- Edge Functions description

Place extracted content in a new file `SCHEMA.md` at the repo root
with a header:

```markdown
# Luminary — Database Schema Reference
_Extracted from CLAUDE.md — last updated: [today's date]_

> This file covers the live database schema. For coding conventions,
> architecture, and file structure see CLAUDE.md.
```

### 8b — Update CLAUDE.md

After extraction:
- Remove the extracted schema sections from CLAUDE.md
- Add a reference line where the schema sections were:
  ```
  ## Database Schema
  See SCHEMA.md for full schema reference.
  ```
- Add to the "Read first" instruction at the top of CLAUDE.md:
  ```
  For tasks touching the database, also read SCHEMA.md.
  ```

### 8c — Post-type correction in CLAUDE.md

Find any reference to `link`, `tip`, or `upload` as active post types
in NewPostScreen or the posts table `post_type` enum. Update to reflect
that **active post types are `text` and `paper` only**. Legacy rows
with other types may exist in the DB but the UI no longer creates them.

Add a convention note:
```
**Post types:** Active post types are `text` and `paper` only.
Legacy rows with `post_type` values of `link`, `upload`, `tip`,
`milestone`, `admin_nudge`, or `deep_dive` may exist in the DB
but are not created by the current UI. Do not add filters or UI
for these types unless explicitly asked.
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- `groups.owner_id`, `groups.is_private` (legacy fields)
- `projects.user_id` — legacy, coexists with `created_by`
- InboxSection component itself — only wire it to the nav
- Existing email types and HTML templates in Edge Function —
  only add the new `group_member_joined` case
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_admin_enhancements.sql in Supabase SQL Editor
#    (updates get_admin_user_list RPC + get_admin_posts RPC if changed)

# 2. Sync and deploy Edge Function:
supabase functions deploy send-email-notification

# 3. Deploy app changes:
git add . && git commit -m "Phase 7B: Admin inbox nav, group_member_joined email, user table sort + codes, content tab fixes, CLAUDE.md split" && git push
```

---

## Remind the user

**Testing group_member_joined email:**
1. As User B, join a public group owned by User A
2. Check User A's inbox — should receive "User B joined [group]" email
3. Check User A's notification bell — should show the notification

**Testing invite code top-up:**
1. Admin panel → Users → click "View" on a user with < 5 codes
2. UserDetailPanel should show invite codes count and top-up section
3. Select "+2 codes", click Generate
4. Verify 2 new invite_codes rows appear in Supabase with
   `created_by = that user's ID`
5. Codes count in the panel should update

**Testing sortable user table:**
Click each sortable column header twice — first click sorts desc,
second click sorts asc. Verify the sort indicator arrow flips.

**Testing content tab:**
- Post type filter should show only "text" and "paper" options
- Clicking Comments / Likes column headers should sort posts
- Deep dive posts (if any exist) should show the "Deep dive" badge

---

## Testing checklist

**Admin Inbox nav:**
- [ ] Inbox appears in AdminShell left nav between Interventions and Analytics
- [ ] Clicking Inbox renders InboxSection correctly
- [ ] All other nav items still work

**group_member_joined email:**
- [ ] Edge Function synced with dashboard version before edits
- [ ] `group_member_joined` in EMAIL_TYPES and PREF_COLUMN map
- [ ] Joining a public group triggers email to all group admins
- [ ] Email subject: "[member] joined [group] ✦"
- [ ] Email body shows member name and group name correctly
- [ ] HTML-escaped to prevent injection
- [ ] Function deploys without errors

**User table:**
- [ ] `invite_codes_remaining` column visible in table
- [ ] Colour coding: green ≥3, amber 1–2, red 0
- [ ] Clicking Posts column header sorts by posts_count
- [ ] Clicking Groups column header sorts by groups_count
- [ ] Clicking Codes column header sorts by invite_codes_remaining
- [ ] Clicking Joined column header sorts by created_at
- [ ] Clicking Last Active column header sorts by last_active
- [ ] Second click on active column reverses sort direction
- [ ] Sort arrow indicator shows correctly
- [ ] ✉ button per row opens BulkNudgeModal with just that user
- [ ] Existing bulk select and nudge flow unchanged

**UserDetailPanel top-up:**
- [ ] Stats grid shows invite_codes_remaining with colour coding
- [ ] Top-up section visible only when codes < 5
- [ ] Dropdown shows correct number of options (5 - remaining)
- [ ] Generate button creates correct number of invite_codes rows
- [ ] New codes have `created_by = user.id`, `is_multi_use = false`
- [ ] New codes have `label = 'Admin top-up'`

**Content Posts tab:**
- [ ] Post type filter shows only "text" and "paper"
- [ ] No "link", "tip", "upload" options in filter
- [ ] Comments column sortable (desc = most commented first)
- [ ] Likes column sortable
- [ ] Date column sortable (default desc = newest first)
- [ ] Deep dive posts show "Deep dive" badge
- [ ] Participant count visible per post

**CLAUDE.md split:**
- [ ] `SCHEMA.md` created at repo root with database schema content
- [ ] `CLAUDE.md` no longer contains full table/column listings
- [ ] `CLAUDE.md` contains reference to SCHEMA.md
- [ ] `CLAUDE.md` post-type convention note added
- [ ] Both files committed to repo

**Build:**
- [ ] `npm run build` succeeds with no new warnings
