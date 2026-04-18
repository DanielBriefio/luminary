# Task: Groups — Phase 2 Refinements

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

Phase 2 has already been built. This task adds refinements to the
groups feature covering navigation improvements, group badge cards,
taxonomy for research areas, public group profiles with QR codes,
group following with feed integration, unread indicators, and
"From [Group]" links in posts.

Do NOT re-implement anything already built in Phase 1 or Phase 2.
Read the existing group files carefully before making changes.

---

## Step 1 — SQL migration

Create `migration_groups_phase2b.sql` in the project root:

```sql
-- Group slug for public profile URL
alter table groups
  add column if not exists slug             text unique,
  add column if not exists tier1            text    default '',
  add column if not exists tier2            text[]  default '{}',
  add column if not exists research_details text    default '',
  -- Visibility toggles for public profile
  add column if not exists public_show_members    boolean default true,
  add column if not exists public_show_leader     boolean default true,
  add column if not exists public_show_location   boolean default true,
  add column if not exists public_show_contact    boolean default false,
  add column if not exists public_show_posts      boolean default true,
  add column if not exists public_profile_enabled boolean default false;

-- Auto-generate slug from group name on insert
create or replace function generate_group_slug()
returns trigger language plpgsql as $$
declare
  base_slug text;
  final_slug text;
  counter   integer := 0;
begin
  base_slug := lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  loop
    exit when not exists (
      select 1 from groups where slug = final_slug and id != new.id
    );
    counter    := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;
  new.slug := final_slug;
  return new;
end;
$$;

create trigger group_slug_trigger
  before insert on groups
  for each row
  when (new.slug is null or new.slug = '')
  execute function generate_group_slug();

-- Backfill slugs for existing groups
update groups set slug = null where slug is null or slug = '';

-- Group follows (users following groups to see their public posts)
create table if not exists group_follows (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_follows enable row level security;
create policy "gf_select" on group_follows for select using (true);
create policy "gf_insert" on group_follows for insert
  with check (auth.uid() = user_id);
create policy "gf_delete" on group_follows for delete
  using (auth.uid() = user_id);

create index if not exists idx_group_follows_user
  on group_follows(user_id);
create index if not exists idx_group_follows_group
  on group_follows(group_id);

-- Track unread group posts per member
-- We use a simple "last_read_at" approach per member per group
alter table group_members
  add column if not exists last_read_at timestamptz default now();
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Navigation fix: Groups sidebar button

In `App.jsx` (or wherever the sidebar nav is rendered), change the
Groups nav item behaviour:

**Current:** clicking Groups when already in a group does nothing.
**New:** clicking Groups ALWAYS navigates to the GroupsScreen overview.

```javascript
// In the nav click handler:
case 'groups':
  setActiveGroupId(null);  // clear active group
  setScreen('groups');
  break;
```

Inside `GroupScreen.jsx`, remove the "All Groups" / "← Back" link
from the group sidebar — the main nav Groups button now serves this
purpose. Replace it with a subtle breadcrumb at the top of the
group sidebar:

```jsx
<div
  onClick={() => { setActiveGroupId(null); setScreen('groups'); }}
  style={{
    fontSize: 11, color: T.mu, cursor: 'pointer',
    padding: '8px 14px 0', display: 'flex', alignItems: 'center', gap: 4,
  }}
>
  ← All groups
</div>
```

---

## Step 3 — Group badge cards on overview

In `src/groups/GroupsScreen.jsx`, replace the current group list
items with rich badge cards.

### Fetch data for badges

```javascript
const fetchMyGroups = async () => {
  const { data } = await supabase
    .from('group_members')
    .select(`
      role, last_read_at,
      groups(
        id, name, slug, avatar_url, cover_url, is_public,
        research_topic, research_details, tier1, tier2,
        location, contact_email,
        group_members(count),
        group_stats(active_member_count, alumni_count)
      )
    `)
    .eq('user_id', user.id)
    .in('role', ['admin', 'member', 'alumni']);
  return data || [];
};

// Fetch unread count per group
const fetchUnreadCounts = async (groupIds) => {
  // For each group, count posts newer than last_read_at
  const counts = {};
  for (const item of myGroupMemberships) {
    const { count } = await supabase
      .from('group_posts')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', item.groups.id)
      .gt('created_at', item.last_read_at || '1970-01-01');
    counts[item.groups.id] = count || 0;
  }
  return counts;
};

// Fetch mutual members for each group
const fetchMutualMembers = async (groupId) => {
  // People I follow who are in this group
  const { data: following } = await supabase
    .from('follows')
    .select('target_id')
    .eq('follower_id', user.id)
    .eq('target_type', 'user');

  const followingIds = (following || []).map(f => f.target_id);
  if (!followingIds.length) return [];

  const { data } = await supabase
    .from('group_members')
    .select('user_id, profiles(name, avatar_url, avatar_color)')
    .eq('group_id', groupId)
    .in('user_id', followingIds)
    .limit(3);
  return data || [];
};
```

### Group badge card design

```jsx
function GroupBadgeCard({ membership, unreadCount, onSelect, onFollow, currentUserId }) {
  const group   = membership.groups;
  const isAdmin = membership.role === 'admin';
  const isMember = ['admin','member'].includes(membership.role);

  return (
    <div
      onClick={() => onSelect(group.id)}
      style={{
        position: 'relative',
        background: T.w,
        border: `1.5px solid ${unreadCount > 0 ? T.v : T.bdr}`,
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow .15s',
        boxShadow: unreadCount > 0
          ? '0 2px 12px rgba(108,99,255,.15)'
          : '0 1px 4px rgba(0,0,0,.06)',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = unreadCount > 0
        ? '0 2px 12px rgba(108,99,255,.15)' : '0 1px 4px rgba(0,0,0,.06)'}
    >
      {/* Unread badge */}
      {unreadCount > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: T.v, color: '#fff',
          fontSize: 10.5, fontWeight: 700,
          padding: '2px 7px', borderRadius: 20, minWidth: 20,
          textAlign: 'center',
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}

      {/* Cover strip */}
      <div style={{
        height: 6,
        background: group.cover_url
          ? `url(${group.cover_url}) center/cover`
          : 'linear-gradient(90deg, #667eea, #764ba2, #f093fb)',
      }}/>

      <div style={{ padding: '14px 16px 16px' }}>
        {/* Top row: avatar + name + badges */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          {/* Group avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: T.v2, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 20, fontWeight: 700,
            color: T.v, overflow: 'hidden', border: `2px solid ${T.w}`,
            boxShadow: '0 1px 4px rgba(0,0,0,.1)',
          }}>
            {group.avatar_url
              ? <img src={group.avatar_url} alt=""
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : group.name?.charAt(0).toUpperCase()
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 14, fontWeight: 700,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {group.name}
              </span>
              {isAdmin && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 20, background: T.v, color: '#fff',
                  textTransform: 'uppercase', letterSpacing: '.05em',
                }}>
                  Admin
                </span>
              )}
              <span style={{
                fontSize: 9.5, fontWeight: 600, padding: '1px 6px',
                borderRadius: 20,
                background: group.is_public ? T.gr2 : T.am2,
                color: group.is_public ? T.gr : T.am,
                border: `1px solid ${group.is_public ? 'rgba(16,185,129,.2)' : 'rgba(245,158,11,.2)'}`,
              }}>
                {group.is_public ? '🌐 Public' : '🔒 Closed'}
              </span>
            </div>

            {/* Taxonomy tags */}
            {(group.tier1 || group.tier2?.length > 0) && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {group.tier1 && (
                  <span style={{
                    fontSize: 10.5, padding: '1px 7px', borderRadius: 20,
                    background: '#f1f0ff', color: '#5b52cc', fontWeight: 600,
                  }}>
                    {group.tier1}
                  </span>
                )}
                {(group.tier2 || []).slice(0, 2).map(t => (
                  <span key={t} style={{
                    fontSize: 10.5, padding: '1px 7px', borderRadius: 20,
                    background: T.v2, color: T.v, fontWeight: 600,
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Leader / PI */}
        {group.leader_display && (
          <div style={{ fontSize: 12, color: T.mu, marginBottom: 6 }}>
            👤 {group.leader_display}
          </div>
        )}

        {/* Location */}
        {group.location && (
          <div style={{ fontSize: 12, color: T.mu, marginBottom: 6 }}>
            📍 {group.location}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 14, marginBottom: 10,
          paddingTop: 8, borderTop: `1px solid ${T.bdr}`,
        }}>
          {[
            [group.group_stats?.active_member_count || 0, 'members'],
            [0, 'publications'],  // Phase 4
          ].map(([n, label]) => (
            <div key={label} style={{ fontSize: 11.5, color: T.mu }}>
              <strong style={{ color: T.text, fontWeight: 700 }}>{n}</strong> {label}
            </div>
          ))}
        </div>

        {/* Action button */}
        {!isMember && (
          <button
            onClick={e => { e.stopPropagation(); onFollow(group); }}
            style={{
              width: '100%', padding: '7px',
              borderRadius: 9, fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
              border: `1.5px solid ${T.v}`,
              background: T.v2, color: T.v,
            }}
          >
            {group.is_public ? '+ Join group' : '🔒 Request to join'}
          </button>
        )}
      </div>
    </div>
  );
}
```

Show My Groups as a grid (2 columns on desktop, 1 on narrow sidebar):
```javascript
gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'
```

---

## Step 4 — Taxonomy picker on group create/edit

In `CreateGroupModal.jsx` and in the group profile edit mode in
`GroupProfile.jsx`, replace the free-text "Research topic" field with:

**Research Area (taxonomy):**
- Tier 1 dropdown (same TIER1_LIST from constants.js)
- Tier 2 multi-select (filtered by selected Tier 1, same getTier2 helper)
- Max 3 Tier 2 selections

**Research Details (free text):**
- Rename existing `research_topic` field to "Research Details"
- Keep as free text textarea
- Placeholder: "Describe your group's specific research focus, methods,
  or goals in more detail..."

Update the save handler to include `tier1` and `tier2` columns.

Import `TAXONOMY, TIER1_LIST, getTier2` from `../lib/constants`.

```jsx
{/* Tier 1 */}
<select value={tier1} onChange={e => { setTier1(e.target.value); setTier2([]); }}
  style={{...selectStyle}}>
  <option value="">Select primary discipline...</option>
  {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
</select>

{/* Tier 2 — shown when Tier 1 selected */}
{tier1 && (
  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
    {getTier2(tier1).map(t => (
      <button key={t}
        onClick={() => setTier2(prev =>
          prev.includes(t) ? prev.filter(x=>x!==t)
          : prev.length < 3 ? [...prev, t] : prev
        )}
        style={{
          padding:'3px 10px', borderRadius:20, cursor:'pointer',
          fontSize:11.5, fontFamily:'inherit', fontWeight:500,
          border:`1.5px solid ${tier2.includes(t) ? T.v : T.bdr}`,
          background: tier2.includes(t) ? T.v2 : T.w,
          color: tier2.includes(t) ? T.v : T.text,
        }}>
        {t}
      </button>
    ))}
  </div>
)}
```

---

## Step 5 — Public group profile at /g/:slug

Similar to `/p/:slug` for user profiles, add a public group profile
route detected in `App.jsx` before auth:

```javascript
// In App.jsx, before auth check:
const path = window.location.pathname;
if (path.startsWith('/g/')) {
  const slug = path.replace('/g/', '');
  return <PublicGroupProfileScreen slug={slug}/>;
}
```

Create `src/groups/PublicGroupProfileScreen.jsx`:

Fetch group by slug:
```javascript
const { data: group } = await supabase
  .from('groups')
  .select(`
    *, 
    group_members(count),
    group_stats(active_member_count, alumni_count)
  `)
  .eq('slug', slug)
  .eq('public_profile_enabled', true)
  .single();
```

Show fields based on visibility toggles (`public_show_*` columns).

Layout — same clean style as `/p/:slug` user profile:
- Cover image + avatar
- Group name + taxonomy badges
- Leader/PI (if `public_show_leader`)
- Location + website + contact (if `public_show_location` / `public_show_contact`)
- Stats: Members / Alumni / Publications (if `public_show_members`)
- Research area (taxonomy) + research details
- Recent public posts from this group (if `public_show_posts`)
  — only posts with `is_reposted_public = true`

Bottom action buttons:
```jsx
<Btn variant="s">
  {group.is_public ? 'Join this group' : 'Request to join'}
</Btn>
<Btn onClick={() => window.location.href = 'https://luminary.to'}>
  View on Luminary
</Btn>
```

### QR code and sharing

In the group profile edit section (Admin only), add a "Public Profile"
subsection:

```
Public profile
[ ] Enable public profile at luminary.to/g/your-group-slug

Slug: [your-group-slug] [Edit]

Show on public profile:
[✓] Member count    [✓] Group leader
[✓] Location        [ ] Contact email
[✓] Public posts

[QR Code — 180px]
luminary.to/g/your-group-slug
[Copy link]  [Download QR]
```

Generate QR the same way as the user business card — using the `qrcode`
npm package already in the project:

```javascript
useEffect(() => {
  if (!group?.slug || !group?.public_profile_enabled) return;
  const QRCode = require('qrcode');
  QRCode.toCanvas(
    document.getElementById('group-qr'),
    `https://luminary.to/g/${group.slug}`,
    { width: 180, margin: 1, color: { dark: '#1a1a2e', light: '#ffffff' } }
  );
}, [group?.slug, group?.public_profile_enabled]);
```

### Slug editing

Allow Admin to edit the slug (with uniqueness validation):
```javascript
const updateSlug = async (newSlug) => {
  const clean = newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const { error } = await supabase
    .from('groups')
    .update({ slug: clean })
    .eq('id', groupId);
  if (error?.code === '23505') setSlugError('This slug is already taken.');
};
```

---

## Step 6 — Follow groups

In `GroupProfile.jsx` and the public group profile, non-members can
follow a public group to see its public posts in their Following feed.

The existing `FollowBtn` component supports `targetType="group"` — use it:

```jsx
<FollowBtn
  targetType="group"
  targetId={group.id}
  currentUserId={user?.id}
/>
```

This uses the existing `follows` table. No new table needed.

In `FeedScreen.jsx`, update the Following feed query to include
reposted group posts from groups the user follows:

```javascript
// In the Following feed fetch, add:
// Get group IDs the user follows
const { data: followedGroups } = await supabase
  .from('follows')
  .select('target_id')
  .eq('follower_id', user.id)
  .eq('target_type', 'group');

const followedGroupIds = (followedGroups || []).map(f => f.target_id);

// Fetch reposted public posts from those groups
let groupReposts = [];
if (followedGroupIds.length) {
  const { data } = await supabase
    .from('group_posts_with_meta')
    .select('*')
    .in('group_id', followedGroupIds)
    .eq('is_reposted_public', true)
    .order('created_at', { ascending: false })
    .limit(20);
  groupReposts = data || [];
}

// Merge with regular following posts and re-sort by created_at
const allPosts = [...regularPosts, ...groupReposts]
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
```

In `PostCard.jsx` (or wherever group reposts are displayed), if the
post has a `group_id` field, show:

```jsx
{post.group_id && post.group_name && (
  <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 6 }}>
    Shared from{' '}
    <button
      onClick={e => {
        e.stopPropagation();
        onViewGroup && onViewGroup(post.group_id);
      }}
      style={{
        color: T.v, fontWeight: 700,
        border: 'none', background: 'transparent',
        cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 'inherit', padding: 0,
      }}
    >
      {post.group_name}
    </button>
  </div>
)}
```

Pass `onViewGroup` callback from App.jsx through FeedScreen → PostCard.
When clicked: `setActiveGroupId(post.group_id); setScreen('groups');`

---

## Step 7 — Unread indicators

### Groups sidebar nav badge

In the sidebar nav, show a count badge on the Groups nav item for
total unread posts across all the user's groups:

```javascript
// In App.jsx, fetch total unread group posts
const fetchGroupUnreadCount = async () => {
  if (!user) return;
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id, last_read_at')
    .eq('user_id', user.id)
    .in('role', ['admin', 'member']);

  if (!memberships?.length) { setGroupUnreadCount(0); return; }

  let total = 0;
  for (const m of memberships) {
    const { count } = await supabase
      .from('group_posts')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', m.group_id)
      .gt('created_at', m.last_read_at || '1970-01-01');
    total += count || 0;
  }
  setGroupUnreadCount(total);
};
```

Show in the sidebar next to the Groups nav item (same pattern as
the Messages unread badge):
```jsx
{groupUnreadCount > 0 && (
  <span style={{
    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
    background: T.v, color: '#fff',
    padding: '1px 6px', borderRadius: 20,
    minWidth: 18, textAlign: 'center',
  }}>
    {groupUnreadCount > 99 ? '99+' : groupUnreadCount}
  </span>
)}
```

Poll every 60 seconds (less frequent than messages since group posts
are less time-sensitive than DMs):
```javascript
useEffect(() => {
  fetchGroupUnreadCount();
  const interval = setInterval(fetchGroupUnreadCount, 60000);
  return () => clearInterval(interval);
}, [user]);
```

### Update last_read_at when entering a group feed

In `GroupFeed.jsx`, when the component mounts or groupId changes,
update the member's `last_read_at` to now:

```javascript
useEffect(() => {
  if (!groupId || !user) return;
  // Mark as read
  supabase
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .then(() => {
      // Trigger refresh of unread count in parent
      onMarkRead && onMarkRead();
    });
}, [groupId]);
```

Pass `onMarkRead` callback from App.jsx → GroupScreen → GroupFeed.
In App.jsx, `onMarkRead` calls `fetchGroupUnreadCount()` to refresh
the sidebar badge.

---

## Step 8 — Notifications for group membership changes

In `GroupMembers.jsx`, when a new member joins or is approved:

```javascript
// Notify all admins of the group when someone joins
const notifyAdminsOfJoin = async (groupId, newMemberId) => {
  const { data: admins } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'admin')
    .neq('user_id', newMemberId);

  if (!admins?.length) return;

  await supabase.from('notifications').insert(
    admins.map(a => ({
      user_id:   a.user_id,
      type:      'group_member_joined',
      actor_id:  newMemberId,
      target_id: groupId,
      meta:      { group_name: groupName },
    }))
  );
};

// Notify admins when a member leaves
const notifyAdminsOfLeave = async (groupId, leavingUserId) => {
  const { data: admins } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'admin')
    .neq('user_id', leavingUserId);

  if (!admins?.length) return;

  await supabase.from('notifications').insert(
    admins.map(a => ({
      user_id:   a.user_id,
      type:      'group_member_left',
      actor_id:  leavingUserId,
      target_id: groupId,
      meta:      { group_name: groupName },
    }))
  );
};
```

Call `notifyAdminsOfJoin` after:
- Direct join (public group)
- Admin approves a join request

Call `notifyAdminsOfLeave` after:
- Member clicks "Leave group"
- Alumni clicks "Remove myself"

In `NotifsScreen.jsx`, handle two new notification types:
- `group_member_joined` → "[Name] joined [Group Name]"
- `group_member_left`   → "[Name] left [Group Name]"

---

## Step 9 — Explore Groups tab update

In `ExploreScreen.jsx`, update the Groups tab search to filter by
taxonomy (using the new `tier1` column):

```javascript
const searchGroups = async (query, tier1Filter) => {
  let q = supabase
    .from('groups')
    .select('id, name, slug, description, research_topic, tier1, tier2,
      avatar_url, is_public, location')
    .eq('is_searchable', true);

  if (query) {
    q = q.or(
      `name.ilike.%${query}%,` +
      `research_topic.ilike.%${query}%,` +
      `research_details.ilike.%${query}%`
    );
  }

  if (tier1Filter) {
    q = q.eq('tier1', tier1Filter);
  }

  const { data } = await q.limit(10);
  return data || [];
};
```

Show Tier 1 filter chips above the group results (same pattern as
the Posts tab Tier 1 filter):
```jsx
{TIER1_LIST.map(t1 => (
  <button key={t1}
    onClick={() => setGroupTier1Filter(f => f === t1 ? '' : t1)}
    style={{...chipStyle, active: groupTier1Filter === t1}}>
    {t1}
  </button>
))}
```

---

## What NOT to change

- Phase 1 group post logic, GroupNewPost, GroupPostCard internals
- Phase 2 GroupProfile edit fields already built (avatar upload, cover,
  collaborating groups, contact)
- User profile, messages, main feed (beyond the Following feed addition)
- Run `npm run build` when done

---

## Remind the user

1. Run `migration_groups_phase2b.sql` in Supabase SQL Editor first
2. The trigger auto-generates slugs for new groups and backfills
   existing groups — verify slugs were created:
   `select id, name, slug from groups;`
3. Public profile at `/g/slug` only works when `public_profile_enabled = true`
   in the group settings — Admin must explicitly enable it
4. The Following feed group posts integration requires that posts were
   explicitly reposted to public (is_reposted_public = true) — purely
   private group posts never appear in the personal feed
5. Test the unread badge flow: post in a group as User A, log in as
   User B (member of same group), verify the Groups sidebar badge shows
   a count, then open the group feed and verify the badge clears
