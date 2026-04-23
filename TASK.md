# Task: Admin Panel — Interventions Section (Phase 6H)

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task builds the Interventions section of the Super Admin Panel
and makes several user-facing improvements driven by admin controls:

1. **Luminary Board** — replaces the hardcoded FeedTipCard with an
   admin-editable message board in the feed right sidebar
2. **Unified post composer** — one tool to send posts as "Luminary Team"
   to all users (broadcast), specific users (targeted), or a group
3. **Featured posts** — visual distinction (tinted background + badge)
   for featured posts, normal sort order preserved
4. **Paper of the Week upgrade** — admin controls: manual pick OR
   algorithm (most-discussed by distinct users), with a mode toggle
5. **Milestone template editor** — admin edits the profile completion
   celebration post content from the panel
6. **AdminShell** — new "Interventions" nav item wiring everything

> ⚠️ FeedScreen.jsx and FeedTipCard are user-facing files touched by
> multiple items in this task. Read them carefully before modifying.
> Make surgical changes only.

---

## Prerequisites — check admin_config table

Before writing any code, check whether `admin_config` table already
exists (it may have been created by Phase 6D if that ran):

```sql
select exists (
  select from information_schema.tables
  where table_schema = 'public'
  and table_name = 'admin_config'
);
```

The migration below uses `CREATE TABLE IF NOT EXISTS` — safe to run
regardless of whether Phase 6D ran.

---

## Step 1 — SQL migration

Create `migration_admin_interventions.sql`:

```sql
-- admin_config: key-value store for admin-controlled settings
-- (CREATE IF NOT EXISTS — safe whether or not Phase 6D ran)
create table if not exists admin_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz default now(),
  updated_by  uuid references profiles(id)
);

alter table admin_config enable row level security;

-- Drop existing policies if any (from Phase 6D) and recreate cleanly
drop policy if exists "ac_select"           on admin_config;
drop policy if exists "ac_select_admin"     on admin_config;
drop policy if exists "ac_select_milestone" on admin_config;
drop policy if exists "ac_insert"           on admin_config;
drop policy if exists "ac_update"           on admin_config;

-- Admin can read all keys
-- Regular users can read: milestone_post_template, luminary_board
create policy "ac_select" on admin_config for select
  using (
    key in ('milestone_post_template', 'luminary_board')
    or (select is_admin from profiles where id = auth.uid())
  );

create policy "ac_insert" on admin_config for insert
  with check ((select is_admin from profiles where id = auth.uid()));

create policy "ac_update" on admin_config for update
  using ((select is_admin from profiles where id = auth.uid()));

-- Seed: Luminary Board default content
insert into admin_config (key, value) values (
  'luminary_board',
  jsonb_build_object(
    'enabled',  true,
    'title',    'Welcome to Luminary',
    'message',  'Share your research. Connect with peers. Build something meaningful together.',
    'cta_label', null,
    'cta_url',   null
  )
) on conflict (key) do nothing;

-- Seed: Paper of the Week settings
insert into admin_config (key, value) values (
  'paper_of_week',
  jsonb_build_object(
    'mode',           'algorithm',
    -- 'algorithm' | 'manual'
    'algorithm',      'most_discussed',
    -- 'most_discussed' (distinct users posting same DOI) |
    -- 'most_commented' (existing behaviour)
    'manual_post_id', null,
    'manual_doi',     null
  )
) on conflict (key) do nothing;

-- Seed: Milestone post template (safe if already seeded by Phase 6D)
insert into admin_config (key, value) values (
  'milestone_post_template',
  jsonb_build_object(
    'heading',    'Your profile is complete! 🎉',
    'message',    'You''ve taken a big step. Your Luminary profile is now live and ready to be discovered by other researchers.',
    'cta1_label', 'View my profile →',
    'cta1_type',  'profile',
    'cta2_label', '🪪 Virtual business card',
    'cta2_type',  'card'
  )
) on conflict (key) do nothing;

-- RPC helpers (CREATE OR REPLACE — idempotent)
create or replace function get_admin_config(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return (select value from admin_config where key = p_key);
end;
$$;

create or replace function set_admin_config(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  insert into admin_config (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update
    set value      = excluded.value,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

-- RPC: send_admin_post
-- Inserts a post from Luminary Team bot in one of three modes:
-- broadcast (all users see it), targeted (specific users), group (group feed)
-- SECURITY DEFINER allows inserting with user_id = bot bypassing RLS
create or replace function send_admin_post(
  p_mode             text,     -- 'broadcast' | 'targeted' | 'group'
  p_content          text,
  p_bot_user_id      uuid,
  p_target_user_ids  uuid[]  default null,
  p_group_id         uuid    default null,
  p_post_type        text    default 'text',
  p_paper_doi        text    default null,
  p_paper_title      text    default null,
  p_paper_journal    text    default null,
  p_paper_authors    text    default null,
  p_paper_abstract   text    default null,
  p_paper_year       int     default null,
  p_paper_citation   text    default null,
  p_link_url         text    default null,
  p_link_title       text    default null,
  p_link_description text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id  uuid;
  v_post_id    uuid;
  v_sent       int := 0;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_content is null or trim(p_content) = '' then
    raise exception 'content cannot be empty';
  end if;

  if p_mode = 'broadcast' then
    -- One post visible to everyone
    insert into posts (
      user_id, post_type, content, visibility,
      is_admin_post,
      paper_doi, paper_title, paper_journal, paper_authors,
      paper_abstract, paper_year, paper_citation,
      link_url, link_title, link_description
    ) values (
      p_bot_user_id, p_post_type, p_content, 'everyone',
      true,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
      p_paper_abstract, p_paper_year, p_paper_citation,
      p_link_url, p_link_title, p_link_description
    )
    returning id into v_post_id;
    v_sent := 1;

  elsif p_mode = 'targeted' then
    -- One post per target user, only visible to them
    foreach v_target_id in array p_target_user_ids loop
      insert into posts (
        user_id, target_user_id, post_type, content, visibility,
        is_admin_post,
        paper_doi, paper_title, paper_journal, paper_authors,
        paper_abstract, paper_year, paper_citation,
        link_url, link_title, link_description
      ) values (
        p_bot_user_id, v_target_id, p_post_type, p_content, 'everyone',
        true,
        p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
        p_paper_abstract, p_paper_year, p_paper_citation,
        p_link_url, p_link_title, p_link_description
      )
      returning id into v_post_id;

      -- Notify target user
      insert into notifications (
        user_id, actor_id, notif_type, target_type, target_id, read
      ) values (
        v_target_id, p_bot_user_id, 'new_post', 'post',
        v_post_id::text, false
      );
      v_sent := v_sent + 1;
    end loop;

  elsif p_mode = 'group' then
    -- Post to a group feed
    insert into group_posts (
      group_id, user_id, post_type, content,
      paper_doi, paper_title, paper_journal, paper_authors,
      paper_abstract, paper_year, paper_citation,
      link_url, link_title, link_description
    ) values (
      p_group_id, p_bot_user_id, p_post_type, p_content,
      p_paper_doi, p_paper_title, p_paper_journal, p_paper_authors,
      p_paper_abstract, p_paper_year, p_paper_citation,
      p_link_url, p_link_title, p_link_description
    )
    returning id into v_post_id;
    v_sent := 1;
  end if;

  return jsonb_build_object('sent', v_sent, 'post_id', v_post_id);
end;
$$;

-- Add is_admin_post flag to posts (used for visual differentiation)
alter table posts
  add column if not exists is_admin_post boolean default false;

-- Add target_user_id if not already present (Phase 6D may have added it)
alter table posts
  add column if not exists target_user_id uuid references profiles(id)
    on delete cascade;

-- Index for efficient feed filtering
create index if not exists idx_posts_admin
  on posts(is_admin_post) where is_admin_post = true;

create index if not exists idx_posts_target_user
  on posts(target_user_id) where target_user_id is not null;

grant execute on function get_admin_config(text)        to authenticated;
grant execute on function set_admin_config(text, jsonb) to authenticated;
grant execute on function send_admin_post(text, text, uuid, uuid[],
  uuid, text, text, text, text, text, text, int, text,
  text, text, text)                                     to authenticated;
```

Tell the user to run this in Supabase SQL Editor.

Also recreate `posts_with_meta` view to include `is_admin_post` and
`target_user_id` columns. Read the current view definition first, then
DROP + CREATE. Tell the user to run the resulting SQL.

---

## Step 2 — FeedTipCard.jsx → Luminary Board

Read `FeedTipCard.jsx` and `constants.js` (FEED_TIPS) before modifying.

### Update FeedTipCard to read from admin_config

Rename the component conceptually to "Luminary Board" but keep the
filename as `FeedTipCard.jsx` to avoid import changes across the app.

The component should:
1. On mount, fetch `luminary_board` config from `admin_config` table:
   ```javascript
   const { data } = await supabase
     .from('admin_config')
     .select('value')
     .eq('key', 'luminary_board')
     .single();
   ```
2. If `data.value.enabled === false` — render nothing (existing
   dismiss behaviour preserved)
3. If `data` is null or fetch fails — fall back to cycling through
   `FEED_TIPS` from constants.js (existing behaviour preserved)
4. If `data.value.enabled === true` — render the admin-configured
   board instead of the hardcoded tips

### Luminary Board render (when admin content is set):

```jsx
<div style={{
  background: T.v2,
  border: `1px solid ${T.v}`,
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 14,
}}>
  {/* Header */}
  <div style={{
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      <div style={{
        fontSize: 14, color: T.v3, fontWeight: 700,
      }}>
        ✦ Luminary
      </div>
    </div>
    {/* Existing dismiss/hide button — keep whatever exists */}
  </div>

  {/* Title */}
  {board.title && (
    <div style={{
      fontFamily: "'DM Serif Display', serif",
      fontSize: 15, color: T.text, marginBottom: 6,
    }}>
      {board.title}
    </div>
  )}

  {/* Message */}
  <div style={{
    fontSize: 13, color: T.mu, lineHeight: 1.6,
    marginBottom: board.cta_label ? 10 : 0,
  }}>
    {board.message}
  </div>

  {/* Optional CTA */}
  {board.cta_label && board.cta_url && (
    <a href={board.cta_url} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'inline-block', fontSize: 12.5,
        color: T.v, fontWeight: 700, textDecoration: 'none',
      }}
    >
      {board.cta_label} →
    </a>
  )}
</div>
```

---

## Step 3 — FeedScreen.jsx — featured posts + admin posts

Read FeedScreen.jsx carefully. Two surgical changes:

### Featured post visual differentiation

Find where PostCard is rendered in the feed list. Pass an `isFeatured`
prop when the post has `is_featured = true` and hasn't expired:

```javascript
const isActiveFeatured = post.is_featured &&
  (!post.featured_until || new Date(post.featured_until) > new Date());
```

In PostCard.jsx, when `isFeatured` is true, wrap the card with a subtle
tinted background and badge. Do not change sort order — featured posts
appear in their natural chronological position, just visually distinct:

```jsx
// Wrap existing PostCard content:
<div style={{
  background: isActiveFeatured ? T.v2 : 'transparent',
  borderRadius: isActiveFeatured ? 14 : 0,
  border: isActiveFeatured ? `1.5px solid ${T.v}` : 'none',
  marginBottom: isActiveFeatured ? 2 : 0,
}}>
  {isActiveFeatured && (
    <div style={{
      padding: '6px 14px 0',
      fontSize: 11, fontWeight: 700, color: T.v,
      letterSpacing: 0.3,
    }}>
      ✦ FEATURED
    </div>
  )}
  {/* existing PostCard content */}
</div>
```

### Admin post visual differentiation

When `post.is_admin_post === true`, render with a distinct violet-left-
border treatment:

```jsx
<div style={{
  borderLeft: post.is_admin_post ? `3px solid ${T.v}` : 'none',
  paddingLeft: post.is_admin_post ? 12 : 0,
  marginLeft: post.is_admin_post ? -12 : 0,
}}>
  {post.is_admin_post && (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.v,
      marginBottom: 4, letterSpacing: 0.3,
    }}>
      ✦ FROM LUMINARY TEAM
    </div>
  )}
  {/* existing PostCard content */}
</div>
```

### Feed filter update

Ensure the feed query filters correctly:
- `is_hidden = false` (already added in Phase 6G)
- `target_user_id IS NULL OR target_user_id = current_user_id`
  (targeted posts only show to their recipient)

Find the existing feed filter (added in Phase 6G for milestone posts):
```javascript
const visible = withSlugData.filter(p =>
  p.target_user_id == null || p.target_user_id === user?.id
);
```
This should already handle targeted admin posts correctly. Verify it's
present; add if missing.

---

## Step 4 — Paper of the Week upgrade in FeedScreen.jsx

Find the existing Paper of the Week `useEffect` in FeedScreen.jsx
(runs once on mount, fetches up to 200 paper posts, aggregates by DOI).

Replace the hardcoded "most commented" logic with config-driven logic:

```javascript
useEffect(() => {
  const fetchPotw = async () => {
    // Fetch admin config for paper of week settings
    const { data: configRow } = await supabase
      .from('admin_config')
      .select('value')
      .eq('key', 'paper_of_week')
      .single();

    const config = configRow?.value || {
      mode: 'algorithm',
      algorithm: 'most_discussed',
    };

    if (config.mode === 'manual' && config.manual_post_id) {
      // Manual pick: fetch the specific post
      const { data: post } = await supabase
        .from('posts_with_meta')
        .select('paper_doi, paper_title, paper_journal, paper_year')
        .eq('id', config.manual_post_id)
        .single();

      if (post?.paper_doi) {
        setPotw({
          doi:          post.paper_doi,
          title:        post.paper_title,
          journal:      post.paper_journal,
          year:         post.paper_year,
          discussCount: 1,
          mode:         'manual',
        });
      }
      return;
    }

    // Algorithm mode: fetch paper posts and aggregate
    const { data: posts } = await supabase
      .from('posts_with_meta')
      .select('paper_doi, paper_title, paper_journal, paper_year, user_id, comment_count')
      .eq('post_type', 'paper')
      .not('paper_doi', 'is', null)
      .limit(200);

    if (!posts?.length) return;

    // Aggregate by DOI
    const byDoi = {};
    posts.forEach(p => {
      if (!byDoi[p.paper_doi]) {
        byDoi[p.paper_doi] = {
          doi:          p.paper_doi,
          title:        p.paper_title,
          journal:      p.paper_journal,
          year:         p.paper_year,
          userIds:      new Set(),
          commentCount: 0,
        };
      }
      byDoi[p.paper_doi].userIds.add(p.user_id);
      byDoi[p.paper_doi].commentCount += (p.comment_count || 0);
    });

    // Pick best based on algorithm setting
    const algorithm = config.algorithm || 'most_discussed';
    const best = Object.values(byDoi).sort((a, b) => {
      if (algorithm === 'most_discussed') {
        // Most distinct users posting about the same paper
        return b.userIds.size - a.userIds.size;
      } else {
        // most_commented: existing behaviour
        return b.commentCount - a.commentCount;
      }
    })[0];

    if (!best) return;

    // CrossRef fallback for missing metadata (existing logic — preserve)
    let title   = best.title;
    let journal = best.journal;

    if (!title || !journal) {
      try {
        const res  = await fetch(
          `https://api.crossref.org/works/${encodeURIComponent(best.doi)}`
        );
        const json = await res.json();
        const w    = json.message;
        title   = title   || w.title?.[0]         || best.doi;
        journal = journal || w['container-title']?.[0] || '';
      } catch {
        title   = title   || best.doi;
        journal = journal || '';
      }
    }

    setPotw({
      doi:          best.doi,
      title,
      journal,
      year:         best.year,
      discussCount: algorithm === 'most_discussed'
        ? best.userIds.size
        : best.commentCount,
      mode:         algorithm,
    });
  };

  fetchPotw();
}, [supabase]);
```

Update the Paper of the Week inline display in FeedScreen to show the
discuss count with appropriate label:

```jsx
// In the potw display section:
<div style={{ fontSize: 11.5, color: T.mu, marginTop: 4 }}>
  {potw.mode === 'most_discussed'
    ? `${potw.discussCount} researcher${potw.discussCount !== 1 ? 's' : ''} discussing this`
    : `${potw.discussCount} comment${potw.discussCount !== 1 ? 's' : ''}`
  }
</div>
```

---

## Step 5 — ProfileCompletionMeter.jsx — read milestone template

Find the useEffect that fires when stage reaches 5 and inserts the
milestone post with hardcoded HTML content.

Replace hardcoded values with DB fetch:

```javascript
// Before inserting milestone post, fetch template:
const { data: configRow } = await supabase
  .from('admin_config')
  .select('value')
  .eq('key', 'milestone_post_template')
  .single();

const tpl        = configRow?.value || {};
const heading    = tpl.heading    || 'Your profile is complete! 🎉';
const message    = tpl.message    || 'You\'ve taken a big step. Your Luminary profile is now live.';
const cta1Label  = tpl.cta1_label || 'View my profile →';
const cta2Label  = tpl.cta2_label || '🪪 Virtual business card';
```

Use these variables in the HTML content string. Also add
`target_user_id: user.id` to the insert:

```javascript
await supabase.from('posts').insert({
  user_id:        user.id,
  target_user_id: user.id,
  post_type:      'milestone',
  visibility:     'everyone',
  content:        buildMilestoneHtml(heading, message, cta1Label, cta2Label),
});
```

Extract the HTML construction into a local `buildMilestoneHtml()`
function so template variables slot in cleanly. The HTML structure
(gradient bar, serif heading, message, two CTAs) stays identical —
only the text becomes dynamic.

---

## Step 6 — InterventionsSection.jsx

Create `src/admin/InterventionsSection.jsx` with four tabs:
Compose / Luminary Board / Paper of Week / Milestone.

```jsx
import React, { useState } from 'react';
import { T } from '../../lib/constants';
import ComposeTab      from './interventions/ComposeTab';
import BoardTab        from './interventions/BoardTab';
import PaperOfWeekTab  from './interventions/PaperOfWeekTab';
import MilestoneTab    from './interventions/MilestoneTab';

const TABS = [
  { id: 'compose',   label: '✦ Compose'          },
  { id: 'board',     label: '📋 Luminary Board'   },
  { id: 'potw',      label: '📄 Paper of Week'    },
  { id: 'milestone', label: '🎉 Milestone Post'   },
];

export default function InterventionsSection({ supabase, user }) {
  const [tab, setTab] = useState('compose');

  return (
    <div>
      <h1 style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 32, color: T.text, margin: '0 0 20px',
      }}>
        Interventions
      </h1>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: `1px solid ${T.bdr}`,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 18px', border: 'none',
            cursor: 'pointer', background: 'transparent',
            fontFamily: 'inherit', fontSize: 13.5,
            fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? T.v : T.mu,
            borderBottom: tab === t.id
              ? `2px solid ${T.v}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'compose'   && <ComposeTab     supabase={supabase} user={user} />}
      {tab === 'board'     && <BoardTab       supabase={supabase} />}
      {tab === 'potw'      && <PaperOfWeekTab supabase={supabase} />}
      {tab === 'milestone' && <MilestoneTab   supabase={supabase} />}
    </div>
  );
}
```

Create `src/admin/interventions/` folder with four sub-components:

### ComposeTab.jsx

Three-mode composer. Reuses the same DOI lookup and paper metadata
pattern as `NewPostScreen.jsx`.

```jsx
import React, { useState, useEffect } from 'react';
import { T, LUMINARY_TEAM_USER_ID } from '../../../lib/constants';
import Av from '../../../components/Av';
import Spinner from '../../../components/Spinner';
import { buildCitationFromCrossRef } from '../../../lib/utils';
import { capture } from '../../../lib/analytics';

const MODES = [
  { id: 'broadcast', label: '📢 Broadcast',  desc: 'All users see this in their feed' },
  { id: 'targeted',  label: '🎯 Targeted',   desc: 'Specific users only'              },
  { id: 'group',     label: '👥 Group',      desc: 'Post to a group feed'             },
];

const POST_TYPES = [
  { id: 'text',  label: '✏️ Text'  },
  { id: 'paper', label: '📄 Paper' },
];

export default function ComposeTab({ supabase, user }) {
  const [mode, setMode]           = useState('broadcast');
  const [postType, setPostType]   = useState('text');
  const [content, setContent]     = useState('');

  // Recipient state
  const [users, setUsers]         = useState([]);
  const [groups, setGroups]       = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [userSearch, setUserSearch]   = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Paper state
  const [doi, setDoi]             = useState('');
  const [doiLoading, setDoiLoading] = useState(false);
  const [paperData, setPaperData] = useState(null);
  const [doiError, setDoiError]   = useState('');

  // Send state
  const [sending, setSending]     = useState(false);
  const [sent, setSent]           = useState(false);
  const [sendError, setSendError] = useState('');

  // Load users and groups on mount
  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      const [usersRes, groupsRes] = await Promise.all([
        supabase.rpc('get_admin_user_list'),
        supabase.from('groups').select('id, name').order('name'),
      ]);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
      setLoadingUsers(false);
    };
    load();
  }, [supabase]);

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.name?.toLowerCase().includes(q) ||
           u.institution?.toLowerCase().includes(q);
  });

  const toggleUser = (id) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const lookupDoi = async () => {
    if (!doi.trim()) return;
    setDoiLoading(true);
    setDoiError('');
    setPaperData(null);
    try {
      const res  = await fetch(
        `https://api.crossref.org/works/${encodeURIComponent(doi.trim())}`
      );
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      const w    = json.message;
      const citation = buildCitationFromCrossRef(w, doi.trim());
      setPaperData({
        doi:      doi.trim(),
        title:    w.title?.[0]             || '',
        journal:  w['container-title']?.[0] || '',
        authors:  (w.author || [])
          .map(a => `${a.family || ''} ${(a.given || '')[0] || ''}.`.trim())
          .join(', '),
        abstract: w.abstract || '',
        year:     w.published?.['date-parts']?.[0]?.[0] || null,
        citation,
      });
    } catch {
      setDoiError('DOI not found. Check the format and try again.');
    }
    setDoiLoading(false);
  };

  const canSend = () => {
    if (!content.trim()) return false;
    if (mode === 'targeted' && selectedUserIds.size === 0) return false;
    if (mode === 'group' && !selectedGroupId) return false;
    if (postType === 'paper' && !paperData) return false;
    return true;
  };

  const handleSend = async () => {
    if (!canSend()) return;
    setSending(true);
    setSendError('');

    const payload = {
      p_mode:        mode,
      p_content:     content.trim(),
      p_bot_user_id: LUMINARY_TEAM_USER_ID,
      p_post_type:   postType,
    };

    if (mode === 'targeted') {
      payload.p_target_user_ids = Array.from(selectedUserIds);
    }
    if (mode === 'group') {
      payload.p_group_id = selectedGroupId;
    }
    if (postType === 'paper' && paperData) {
      payload.p_paper_doi      = paperData.doi;
      payload.p_paper_title    = paperData.title;
      payload.p_paper_journal  = paperData.journal;
      payload.p_paper_authors  = paperData.authors;
      payload.p_paper_abstract = paperData.abstract;
      payload.p_paper_year     = paperData.year;
      payload.p_paper_citation = paperData.citation;
    }

    const { error } = await supabase.rpc('send_admin_post', payload);

    setSending(false);
    if (error) {
      setSendError(error.message || 'Send failed.');
      return;
    }

    capture('admin_post_sent', {
      mode,
      post_type: postType,
      recipient_count: mode === 'targeted' ? selectedUserIds.size : 1,
    });

    setSent(true);
    setTimeout(() => {
      setSent(false);
      setContent('');
      setPaperData(null);
      setDoi('');
      setSelectedUserIds(new Set());
      setSelectedGroupId('');
    }, 2000);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>

      {/* Left: mode + recipient selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Mode selector */}
        <div style={{
          background: T.w, border: `1px solid ${T.bdr}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            Delivery mode
          </div>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px', border: 'none',
              borderBottom: `1px solid ${T.bdr}`,
              background: mode === m.id ? T.v2 : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{
                fontSize: 13, fontWeight: mode === m.id ? 700 : 500,
                color: mode === m.id ? T.v3 : T.text,
              }}>
                {m.label}
              </div>
              <div style={{ fontSize: 11.5, color: T.mu, marginTop: 2 }}>
                {m.desc}
              </div>
            </button>
          ))}
        </div>

        {/* Targeted: user picker */}
        {mode === 'targeted' && (
          <div style={{
            background: T.w, border: `1px solid ${T.bdr}`,
            borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: `1px solid ${T.bdr}`,
              fontSize: 11, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              Recipients ({selectedUserIds.size})
            </div>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.bdr}` }}>
              <input
                placeholder="Search users…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 7,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 12, outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit', color: T.text,
                }}
              />
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {loadingUsers ? (
                <div style={{ padding: 16, textAlign: 'center' }}>
                  <Spinner />
                </div>
              ) : filteredUsers.map(u => (
                <div key={u.id} onClick={() => toggleUser(u.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer',
                  background: selectedUserIds.has(u.id) ? T.v2 : 'transparent',
                  borderBottom: `1px solid ${T.bdr}`,
                }}>
                  <input type="checkbox" readOnly
                    checked={selectedUserIds.has(u.id)}
                    style={{ flexShrink: 0, cursor: 'pointer' }}
                  />
                  <Av size={22} name={u.name} color={u.avatar_color} url="" />
                  <div style={{
                    fontSize: 12.5, color: T.text, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {u.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Group: group selector */}
        {mode === 'group' && (
          <div style={{
            background: T.w, border: `1px solid ${T.bdr}`,
            borderRadius: 12, padding: '14px',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4,
              marginBottom: 8,
            }}>
              Select group
            </div>
            <select
              value={selectedGroupId}
              onChange={e => setSelectedGroupId(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: T.s2,
                fontSize: 13, color: T.text, fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value="">Choose a group…</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: compose */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: 20,
      }}>
        {/* Post type */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {POST_TYPES.map(t => (
            <button key={t.id} onClick={() => setPostType(t.id)} style={{
              padding: '7px 14px', borderRadius: 9, border: 'none',
              background: postType === t.id ? T.v2 : T.s2,
              color: postType === t.id ? T.v3 : T.mu,
              fontWeight: postType === t.id ? 700 : 500,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Text content */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          placeholder={
            postType === 'paper'
              ? 'Add a note about this paper (optional)…'
              : mode === 'broadcast'
              ? 'Write a message to all users…'
              : 'Write your message…'
          }
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.s2,
            fontSize: 13, color: T.text, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none',
            boxSizing: 'border-box', marginBottom: 14,
          }}
        />

        {/* Paper DOI lookup */}
        {postType === 'paper' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={doi}
                onChange={e => setDoi(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupDoi()}
                placeholder="Enter DOI e.g. 10.1056/NEJMoa2304741"
                style={{
                  flex: 1, padding: '8px 11px', borderRadius: 8,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 13, color: T.text, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <button onClick={lookupDoi} disabled={doiLoading} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: T.v, color: '#fff', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {doiLoading ? '…' : 'Look up'}
              </button>
            </div>
            {doiError && (
              <div style={{ fontSize: 12, color: T.ro, marginBottom: 8 }}>
                {doiError}
              </div>
            )}
            {paperData && (
              <div style={{
                padding: '10px 12px', borderRadius: 9,
                background: T.s2, border: `1px solid ${T.bdr}`,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3,
                }}>
                  {paperData.title}
                </div>
                <div style={{ fontSize: 12, color: T.mu }}>
                  {paperData.journal}
                  {paperData.year ? ` · ${paperData.year}` : ''}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preview of delivery */}
        <div style={{
          fontSize: 12, color: T.mu, marginBottom: 14,
          padding: '8px 12px', background: T.s2,
          borderRadius: 8, border: `1px solid ${T.bdr}`,
        }}>
          {mode === 'broadcast' && '📢 Will appear in all users\' For You feeds'}
          {mode === 'targeted'  && `🎯 Will appear only for ${selectedUserIds.size} selected user${selectedUserIds.size !== 1 ? 's' : ''}`}
          {mode === 'group'     && `👥 Will post to the selected group feed`}
          {' · Sent as '}
          <strong>Luminary Team</strong>
        </div>

        {sendError && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13, marginBottom: 10,
          }}>
            {sendError}
          </div>
        )}

        {sent && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.gr2, color: T.gr, fontSize: 13,
            fontWeight: 600, marginBottom: 10, textAlign: 'center',
          }}>
            ✓ Sent successfully
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleSend}
            disabled={sending || sent || !canSend()}
            style={{
              padding: '10px 24px', borderRadius: 9, border: 'none',
              background: T.v, color: '#fff', fontWeight: 600,
              fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (sending || sent || !canSend()) ? 0.6 : 1,
            }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### BoardTab.jsx

Admin editor for the Luminary Board sidebar message.

```jsx
import React, { useState, useEffect } from 'react';
import { T } from '../../../lib/constants';
import Spinner from '../../../components/Spinner';

export default function BoardTab({ supabase }) {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [board, setBoard]       = useState({
    enabled:   true,
    title:     '',
    message:   '',
    cta_label: '',
    cta_url:   '',
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_admin_config', {
        p_key: 'luminary_board',
      });
      if (data) setBoard({ ...board, ...data });
      setLoading(false);
    };
    load();
  }, [supabase]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await supabase.rpc('set_admin_config', {
      p_key:   'luminary_board',
      p_value: board,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (key, val) => setBoard(prev => ({ ...prev, [key]: val }));

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        background: T.am2, border: `1px solid ${T.am}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 20,
        fontSize: 13, color: T.am,
      }}>
        ⚡ Changes take effect immediately for all users on next feed load.
      </div>

      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 22px',
      }}>
        {/* Enable toggle */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 18,
          paddingBottom: 16, borderBottom: `1px solid ${T.bdr}`,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
              Show Luminary Board
            </div>
            <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
              Visible in the right sidebar of the feed
            </div>
          </div>
          <button
            onClick={() => set('enabled', !board.enabled)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: board.enabled ? T.gr : T.s3,
              color: board.enabled ? '#fff' : T.mu,
              fontWeight: 600, fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {board.enabled ? 'On' : 'Off'}
          </button>
        </div>

        {/* Fields */}
        {[
          { label: 'Title',       key: 'title',     placeholder: 'e.g. Welcome to Luminary' },
          { label: 'Message',     key: 'message',   placeholder: 'The message shown to all users', multiline: true },
          { label: 'CTA Label',   key: 'cta_label', placeholder: 'e.g. Learn more (optional)' },
          { label: 'CTA URL',     key: 'cta_url',   placeholder: 'https://… (optional)' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5,
            }}>
              {f.label}
            </div>
            {f.multiline ? (
              <textarea
                value={board[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                rows={3}
                placeholder={f.placeholder}
                style={{
                  width: '100%', padding: '9px 11px', borderRadius: 8,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 13, color: T.text, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                value={board[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{
                  width: '100%', padding: '9px 11px', borderRadius: 8,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 13, color: T.text, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>
              ✓ Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### PaperOfWeekTab.jsx

Admin controls for the Paper of the Week sidebar.

```jsx
import React, { useState, useEffect } from 'react';
import { T } from '../../../lib/constants';
import Spinner from '../../../components/Spinner';

export default function PaperOfWeekTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [config, setConfig]   = useState({
    mode:           'algorithm',
    algorithm:      'most_discussed',
    manual_post_id: null,
    manual_doi:     null,
  });
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_admin_config', {
        p_key: 'paper_of_week',
      });
      if (data) setConfig(data);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const toSave = { ...config };
    if (config.mode === 'manual') {
      // Store the manual DOI input
      toSave.manual_doi     = manualInput.trim() || null;
      toSave.manual_post_id = null; // DOI-based for now
    }
    await supabase.rpc('set_admin_config', {
      p_key:   'paper_of_week',
      p_value: toSave,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 22px',
      }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16,
        }}>
          Paper of the Week — sidebar control
        </div>

        {/* Mode toggle */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
          }}>
            Mode
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'algorithm', label: '⚡ Automatic' },
              { id: 'manual',    label: '✋ Manual pick' },
            ].map(m => (
              <button key={m.id} onClick={() => set('mode', m.id)} style={{
                padding: '8px 16px', borderRadius: 9, border: 'none',
                background: config.mode === m.id ? T.v2 : T.s2,
                color: config.mode === m.id ? T.v3 : T.mu,
                fontWeight: config.mode === m.id ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Algorithm options */}
        {config.mode === 'algorithm' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
            }}>
              Algorithm
            </div>
            {[
              {
                id:    'most_discussed',
                label: '👥 Most discussed',
                desc:  'Paper posted by the most distinct researchers',
              },
              {
                id:    'most_commented',
                label: '💬 Most commented',
                desc:  'Paper with the most total comments',
              },
            ].map(a => (
              <button
                key={a.id}
                onClick={() => set('algorithm', a.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', borderRadius: 9, border: 'none',
                  background: config.algorithm === a.id ? T.v2 : T.s2,
                  marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <div style={{
                  fontSize: 13,
                  fontWeight: config.algorithm === a.id ? 700 : 500,
                  color: config.algorithm === a.id ? T.v3 : T.text,
                }}>
                  {a.label}
                </div>
                <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
                  {a.desc}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Manual pick */}
        {config.mode === 'manual' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
            }}>
              DOI of paper to feature
            </div>
            <input
              value={manualInput || config.manual_doi || ''}
              onChange={e => setManualInput(e.target.value)}
              placeholder="e.g. 10.1056/NEJMoa2304741"
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: T.s2,
                fontSize: 13, color: T.text, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 12, color: T.mu, marginTop: 6 }}>
              The paper must have been posted on Luminary by at least one user.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>
              ✓ Saved · Takes effect on next feed load
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

### MilestoneTab.jsx

Admin editor for the profile completion celebration post.

```jsx
import React, { useState, useEffect } from 'react';
import { T } from '../../../lib/constants';
import Spinner from '../../../components/Spinner';

export default function MilestoneTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [tpl, setTpl]         = useState({
    heading:    '',
    message:    '',
    cta1_label: '',
    cta2_label: '',
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_admin_config', {
        p_key: 'milestone_post_template',
      });
      if (data) setTpl(data);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const set = (key, val) => setTpl(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await supabase.rpc('set_admin_config', {
      p_key:   'milestone_post_template',
      p_value: tpl,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
  );

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        background: T.am2, border: `1px solid ${T.am}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 20,
        fontSize: 13, color: T.am,
      }}>
        ⚠️ Changes affect future milestone posts only. Users who have
        already completed their profile are not affected.
      </div>

      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 22px',
      }}>
        {[
          { label: 'Heading',          key: 'heading',    multiline: false },
          { label: 'Message',          key: 'message',    multiline: true  },
          { label: 'CTA button 1',     key: 'cta1_label', multiline: false },
          { label: 'CTA button 2',     key: 'cta2_label', multiline: false },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 11.5, fontWeight: 700, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5,
            }}>
              {f.label}
            </div>
            {f.multiline ? (
              <textarea
                value={tpl[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '9px 11px', borderRadius: 8,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 13, color: T.text, fontFamily: 'inherit',
                  resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <input
                value={tpl[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                style={{
                  width: '100%', padding: '9px 11px', borderRadius: 8,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  fontSize: 13, color: T.text, fontFamily: 'inherit',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save template'}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>
              ✓ Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Step 7 — AdminShell.jsx — add Interventions nav item

Add import:

```javascript
import InterventionsSection from './InterventionsSection';
```

Update NAV_ITEMS to final confirmed structure:

```javascript
const NAV_ITEMS = [
  { id: 'overview',      label: 'Overview',      icon: '📊' },
  { id: 'users',         label: 'Users',         icon: '👥' },
  { id: 'invites',       label: 'Invites',       icon: '🎟️' },
  { id: 'templates',     label: 'Templates',     icon: '📋' },
  { id: 'content',       label: 'Content',       icon: '🗂️' },
  { id: 'interventions', label: 'Interventions', icon: '⚡' },
  { id: 'analytics',     label: 'Analytics',     icon: '📈' },
];
```

Extend the content area conditional:

```jsx
{section === 'interventions'
  ? <InterventionsSection supabase={supabase} user={user} />
  : // ... existing sections
}
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- `groups.owner_id`, `groups.is_private` (legacy fields)
- Existing feed, profile, groups, projects, library, messages screens
  beyond the surgical changes in Steps 3, 4, 5
- Existing admin sections (Overview, Users, Invites, Templates, Content)
- The `FEED_TIPS` array in constants.js — keep as fallback
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_admin_interventions.sql in Supabase SQL Editor

# 2. Recreate posts_with_meta view to include is_admin_post
#    and target_user_id columns (Claude Code generates this SQL)
#    Run in Supabase SQL Editor

# 3. Verify:
#    select key, value from admin_config order by key;
#    -- should show: luminary_board, milestone_post_template, paper_of_week

# 4. Deploy:
git add . && git commit -m "Phase 6H: Interventions — unified composer, Luminary Board, Paper of Week upgrade, milestone template editor" && git push
```

---

## Remind the user

**Testing broadcast post end-to-end:**
1. Admin panel → Interventions → Compose → Broadcast mode
2. Write a message, click Send
3. Log in as any other user
4. Check their For You feed — the post should appear with
   "✦ FROM LUMINARY TEAM" label and violet left border

**Testing targeted post:**
1. Admin panel → Interventions → Compose → Targeted mode
2. Select one user, write a message, send
3. Log in as that user — post appears in their feed
4. Log in as a DIFFERENT user — post does NOT appear

**Testing Luminary Board:**
1. Admin panel → Interventions → Luminary Board
2. Edit the title and message, save
3. Open the main feed — right sidebar should show updated content
4. Toggle "Off" — board disappears from sidebar

**Testing Paper of Week algorithm:**
1. Admin panel → Interventions → Paper of Week
2. Switch between Most discussed / Most commented, save
3. Reload the feed — Paper of the Week sidebar card should reflect
   the algorithm change

---

## Testing checklist

**Migration:**
- [ ] `admin_config` table exists with correct RLS
- [ ] Three keys seeded: `luminary_board`, `paper_of_week`, `milestone_post_template`
- [ ] `posts.is_admin_post` column exists, defaults to false
- [ ] `posts.target_user_id` column exists (or already existed from Phase 6D)
- [ ] `posts_with_meta` view updated to include both new columns
- [ ] `send_admin_post` RPC exists and rejects non-admin callers
- [ ] `get_admin_config` and `set_admin_config` RPCs exist

**Luminary Board (FeedTipCard):**
- [ ] Feed sidebar shows Luminary Board content from admin_config
- [ ] Editing title/message in admin panel updates sidebar on next feed load
- [ ] Toggle Off hides the board from the sidebar
- [ ] Falls back to FEED_TIPS cycling if admin_config fetch fails
- [ ] Existing dismiss behaviour preserved

**Compose tab — Broadcast:**
- [ ] Post appears in all users' For You feeds
- [ ] "✦ FROM LUMINARY TEAM" label and violet left border visible
- [ ] Text post type works
- [ ] Paper post type: DOI lookup works, paper card renders
- [ ] Send button disabled until content is entered

**Compose tab — Targeted:**
- [ ] User list loads with search
- [ ] Selecting users highlights them with checkboxes
- [ ] Post appears ONLY in selected users' feeds
- [ ] Post does NOT appear for other users
- [ ] Notification sent to target users

**Compose tab — Group:**
- [ ] Group dropdown loads all groups
- [ ] Selecting a group and sending posts to that group's feed
- [ ] Post appears in group feed as Luminary Team

**Featured posts (FeedScreen):**
- [ ] Featured posts show tinted violet background + "✦ FEATURED" badge
- [ ] Non-featured posts unaffected
- [ ] Sort order unchanged — featured posts appear chronologically
- [ ] Expired featured posts revert to normal appearance

**Paper of the Week:**
- [ ] Most discussed algorithm shows paper with most distinct user posters
- [ ] Most commented algorithm shows existing behaviour
- [ ] Manual pick: entering a DOI and saving shows that specific paper
- [ ] Sidebar label updates to reflect algorithm ("X researchers discussing this")
- [ ] Falls back gracefully if no papers exist yet

**Milestone template:**
- [ ] Editing heading/message/CTAs and saving persists to admin_config
- [ ] New user completing profile sees updated milestone post content
- [ ] Existing milestone posts unchanged

**Interventions nav:**
- [ ] Interventions appears in AdminShell nav (7 items total)
- [ ] Clicking Interventions renders InterventionsSection with 4 tabs
- [ ] All other admin nav items still work correctly
- [ ] `npm run build` succeeds with no new warnings
