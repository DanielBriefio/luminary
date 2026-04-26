# Task: Gamification System (Phase 8)

## Context

Read CLAUDE.md, PRODUCT_STATE.md, SCHEMA.md, and TASK.md.

This task introduces the Luminary gamification system: a Lumens points
system, four-tier progression (Catalyst → Pioneer → Beacon → Luminary),
visual differentiation per tier, a transparency page, and Founding
Member designation.

**Design principles:**
- Subtle, not gamified-feeling — this is a scientific platform
- Quality over volume — recognition rewards weighted higher than creation
- Annual reset like airline miles — keeps tier earned, not given
- Transparent — users can see exactly how Lumens are earned
- Visual differentiation through tier-coloured avatar borders everywhere

Scope:

1. SQL migration — `lumen_transactions` table, profile columns,
   Founding Member config, tier computation function
2. Lumens earning — wired into existing actions (posts, comments, etc.)
3. `useTier` hook + `TierBadge` + `Av` (avatar) component updates
4. Profile page — tier badge, Lumens count, progress to next tier
5. Lumens transparency page — earning history, rules, tier description
6. Admin config for Founding Member cutoff date
7. Sidebar XP badge → wire to real Lumens data (currently decorative)
8. PostHog events for Lumens earning

> ⚠️ The `Av` (avatar) component is used everywhere on the platform.
> Read it carefully before modifying. The tier border addition must
> not break existing usage — make `tierBorderColor` an optional prop
> that defaults to no border.

---

## Step 1 — SQL migration

Create `migration_gamification.sql`:

```sql
-- ─── Lumens columns on profiles ──────────────────────────────────────────────

alter table profiles
  add column if not exists lumens_current_period   integer default 0,
  add column if not exists lumens_lifetime         integer default 0,
  add column if not exists current_period_started  timestamptz default now(),
  add column if not exists previous_period_lumens  integer default 0,
  add column if not exists is_founding_member      boolean default false;

-- The xp and level columns already exist on profiles but are unused.
-- Leave them in place but do NOT use them — Lumens is the new system.

-- ─── Lumen transactions table (audit trail) ──────────────────────────────────

create table if not exists lumen_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  amount       integer not null,
  reason       text not null,
  -- Examples: 'post_created', 'comment_received', 'post_reposted',
  -- 'invited_user_active', 'post_featured', 'discussion_threshold'
  category     text not null check (category in ('creation', 'engagement', 'recognition')),
  meta         jsonb default '{}',
  -- Optional context: { post_id, actor_id, etc. }
  created_at   timestamptz default now()
);

alter table lumen_transactions enable row level security;

-- Users can read their own transactions
create policy "lt_select_own" on lumen_transactions for select
  using (auth.uid() = user_id);

-- Admins can read all
create policy "lt_select_admin" on lumen_transactions for select
  using ((select is_admin from profiles where id = auth.uid()));

-- Only the system (via SECURITY DEFINER functions) can insert.
-- No direct INSERT policy — only via award_lumens() RPC.

create index if not exists idx_lt_user_created
  on lumen_transactions(user_id, created_at desc);

create index if not exists idx_lt_reason
  on lumen_transactions(reason);

-- ─── Founding Member config ──────────────────────────────────────────────────

-- Stored in admin_config under key 'founding_member_cutoff'
-- Format: { "cutoff_date": "2026-08-01T00:00:00Z" }
insert into admin_config (key, value) values (
  'founding_member_cutoff',
  jsonb_build_object('cutoff_date', (now() + interval '90 days')::text)
) on conflict (key) do nothing;

-- ─── award_lumens RPC (the only way to insert transactions) ──────────────────

create or replace function award_lumens(
  p_user_id uuid,
  p_amount  integer,
  p_reason  text,
  p_category text,
  p_meta    jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if user is the Luminary Team bot (no Lumens for the bot)
  if p_user_id = (select id from profiles where name = 'Luminary Team' limit 1) then
    return;
  end if;

  -- Insert transaction
  insert into lumen_transactions (user_id, amount, reason, category, meta)
  values (p_user_id, p_amount, p_reason, p_category, p_meta);

  -- Update profile totals
  update profiles
  set
    lumens_current_period = lumens_current_period + p_amount,
    lumens_lifetime       = lumens_lifetime + p_amount
  where id = p_user_id;
end;
$$;

grant execute on function award_lumens(uuid, integer, text, text, jsonb) to authenticated;

-- ─── compute_tier helper function ────────────────────────────────────────────

create or replace function compute_tier(p_lumens integer)
returns text
language sql
immutable
as $$
  select case
    when p_lumens >= 5000 then 'luminary'
    when p_lumens >= 2000 then 'beacon'
    when p_lumens >= 500  then 'pioneer'
    else 'catalyst'
  end;
$$;

-- ─── get_lumen_history RPC (transparency page) ───────────────────────────────

create or replace function get_lumen_history(p_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return jsonb_build_object(
    'current_period_lumens', (
      select lumens_current_period from profiles where id = auth.uid()
    ),
    'lifetime_lumens', (
      select lumens_lifetime from profiles where id = auth.uid()
    ),
    'current_period_started', (
      select current_period_started from profiles where id = auth.uid()
    ),
    'previous_period_lumens', (
      select previous_period_lumens from profiles where id = auth.uid()
    ),
    'tier', (
      select compute_tier(lumens_current_period) from profiles where id = auth.uid()
    ),
    'is_founding_member', (
      select is_founding_member from profiles where id = auth.uid()
    ),
    'transactions', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'amount', amount,
          'reason', reason,
          'category', category,
          'meta', meta,
          'created_at', created_at
        ) order by created_at desc)
        from (
          select * from lumen_transactions
          where user_id = auth.uid()
          order by created_at desc
          limit p_limit
        ) t
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function get_lumen_history(integer) to authenticated;

-- ─── apply_founding_member_status trigger ────────────────────────────────────

-- When a new profile is created (onboarding completed), check if it's
-- before the Founding Member cutoff date and mark accordingly.
create or replace function apply_founding_member_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
begin
  -- Only check on the transition to onboarding_completed = true
  if new.onboarding_completed = true and
     (old.onboarding_completed is null or old.onboarding_completed = false) then

    select (value->>'cutoff_date')::timestamptz
    into v_cutoff
    from admin_config
    where key = 'founding_member_cutoff';

    if v_cutoff is not null and now() <= v_cutoff then
      new.is_founding_member := true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_founding_member on profiles;
create trigger trg_apply_founding_member
  before update on profiles
  for each row
  execute function apply_founding_member_status();

-- ─── Backfill: any existing users who completed onboarding ───────────────────
-- (after database reset this should be 0, but the migration is idempotent)

update profiles
set is_founding_member = true
where onboarding_completed = true
  and created_at <= (
    select (value->>'cutoff_date')::timestamptz
    from admin_config
    where key = 'founding_member_cutoff'
  );
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Lumens earning rules

Add `award_lumens()` calls at the success point of each action listed
below. Match the existing pattern used by `capture()` (PostHog) calls
— add right after the successful Supabase insert/update, before any
state updates.

### Earning rules

**Creation (low value):**
| Action | Amount | Reason | File |
|---|---|---|---|
| Post created | 5 | `post_created` | `NewPostScreen.jsx` |
| Comment posted | 2 | `comment_posted` | `PostCard.jsx` |
| Library item added | 1 | `library_item_added` | `LibraryScreen.jsx` |
| Group created | 25 | `group_created` | `CreateGroupModal.jsx` |
| Project created | 10 | `project_created` | `CreateProjectModal.jsx` |
| Onboarding completed | 25 | `onboarding_completed` | `OnboardingScreen.jsx` |

**Engagement (mid value):**
| Action | Amount | Reason | Recipient | File |
|---|---|---|---|---|
| Your post receives a comment (per commenter, deduped) | 5 | `comment_received` | post owner | `PostCard.jsx` |
| Your library item saved by another user | 5 | `library_saved` | original adder | `LibraryScreen.jsx` |

**Recognition (high value):**
| Action | Amount | Reason | Recipient | File |
|---|---|---|---|---|
| Your post is reposted | 10 | `post_reposted` | post owner | `PostCard.jsx` |
| User you invited becomes active (creates first post) | 100 | `invited_user_active` | inviter | `NewPostScreen.jsx` |
| Your post featured by admin | 100 | `post_featured` | post owner | `ContentSection.jsx` (PostsTab) |
| Your community template approved | 50 | `template_approved` | submitter | `TemplatesSection.jsx` |
| Your post starts a discussion (3+ distinct commenters) | 50 | `discussion_threshold` | post owner | `PostCard.jsx` |

### Implementation pattern

For self-rewarding actions (creation):
```javascript
// After successful post insert:
const { data: newPost, error } = await supabase
  .from('posts')
  .insert({ ... })
  .select()
  .single();

if (!error && newPost) {
  await supabase.rpc('award_lumens', {
    p_user_id:  user.id,
    p_amount:   5,
    p_reason:   'post_created',
    p_category: 'creation',
    p_meta:     { post_id: newPost.id, post_type: postType }
  });
  capture('post_created', { post_type: postType });
}
```

For others-rewarding actions (engagement, recognition):
```javascript
// After successful comment insert:
const { data: newComment, error } = await supabase
  .from('comments')
  .insert({ ... })
  .select()
  .single();

if (!error && newComment) {
  // Award commenter for creation
  await supabase.rpc('award_lumens', {
    p_user_id:  user.id,
    p_amount:   2,
    p_reason:   'comment_posted',
    p_category: 'creation',
    p_meta:     { post_id: post.id }
  });

  // Award post owner for engagement (if not self-comment)
  if (post.user_id !== user.id) {
    // Check if this user has already commented on this post (dedupe)
    const { count } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .eq('user_id', user.id);

    // count includes the just-inserted comment, so > 1 means duplicate
    if (count === 1) {
      await supabase.rpc('award_lumens', {
        p_user_id:  post.user_id,
        p_amount:   5,
        p_reason:   'comment_received',
        p_category: 'engagement',
        p_meta:     { post_id: post.id, actor_id: user.id }
      });
    }

    // Check discussion threshold (3+ distinct commenters)
    const { data: distinctCommenters } = await supabase
      .from('comments')
      .select('user_id')
      .eq('post_id', post.id);
    const uniqueCount = new Set(distinctCommenters?.map(c => c.user_id) || []).size;

    if (uniqueCount === 3) {
      // Just hit the threshold — award one-time bonus
      // Check if already awarded for this post
      const { data: existing } = await supabase
        .from('lumen_transactions')
        .select('id')
        .eq('user_id', post.user_id)
        .eq('reason', 'discussion_threshold')
        .filter('meta->>post_id', 'eq', post.id)
        .limit(1);

      if (!existing?.length) {
        await supabase.rpc('award_lumens', {
          p_user_id:  post.user_id,
          p_amount:   50,
          p_reason:   'discussion_threshold',
          p_category: 'recognition',
          p_meta:     { post_id: post.id }
        });
      }
    }
  }
}
```

For "invited user active" (high-value, deferred trigger):
This fires when an invited user creates their FIRST post. Add to
`NewPostScreen.jsx` after successful post insert:

```javascript
// Check if this is the user's first post
const { count: postCount } = await supabase
  .from('posts')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id);

if (postCount === 1) {
  // First post — find the inviter and award them
  const { data: inviteCode } = await supabase
    .from('invite_codes')
    .select('created_by')
    .eq('claimed_by', user.id)
    .single();

  if (inviteCode?.created_by && inviteCode.created_by !== user.id) {
    await supabase.rpc('award_lumens', {
      p_user_id:  inviteCode.created_by,
      p_amount:   100,
      p_reason:   'invited_user_active',
      p_category: 'recognition',
      p_meta:     { invited_user_id: user.id }
    });
  }
}
```

---

## Step 3 — TIER_CONFIG constant + useTier hook

Add to `src/lib/constants.js`:

```javascript
export const TIER_CONFIG = {
  catalyst: {
    name:        'Catalyst',
    min:         0,
    max:         499,
    color:       T.v,         // platform violet — consistent with Luminary brand
    bg:          T.v2,
    ringColor:   null,        // no avatar ring at this tier
    description: 'You\'re igniting the conversation. Every post, comment, and connection you make sparks new thinking on Luminary. Keep contributing — you\'re shaping what this community becomes.',
  },
  pioneer: {
    name:        'Pioneer',
    min:         500,
    max:         1999,
    color:       T.v,
    bg:          T.v2,
    ringColor:   null,        // no avatar ring at this tier
    description: 'You\'re going where others haven\'t yet. Your contributions are establishing your voice in the community, and others are starting to take notice. You\'re charting the path forward.',
  },
  beacon: {
    name:        'Beacon',
    min:         2000,
    max:         4999,
    color:       T.v,
    bg:          T.v2,
    ringColor:   null,        // no avatar ring at this tier
    description: 'You\'re a reference point others navigate by. Your insights guide discussions, your library curates evidence others rely on, and your voice carries weight. The community is stronger because of you.',
  },
  luminary: {
    name:        'Luminary',
    min:         5000,
    max:         null,
    color:       '#C9A961',   // muted gold — reserved, premium, not garish
    bg:          '#C9A96115',
    ringColor:   '#C9A961',   // gold ring — Luminary tier only
    description: 'You embody what this platform stands for. Your influence reaches across the community, and your contributions inspire the next generation of scientists. Welcome to the highest tier — and to The Luminarians, where peers at your level gather.',
  },
};

export const TIER_ORDER = ['catalyst', 'pioneer', 'beacon', 'luminary'];

export function getTierFromLumens(lumens) {
  if (lumens >= 5000) return 'luminary';
  if (lumens >= 2000) return 'beacon';
  if (lumens >= 500)  return 'pioneer';
  return 'catalyst';
}

export function getNextTier(currentTier) {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx < 0 || idx === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

export function getProgressToNextTier(lumens, currentTier) {
  const next = getNextTier(currentTier);
  if (!next) return { progress: 100, needed: 0 }; // already top tier
  const nextMin = TIER_CONFIG[next].min;
  const currentMin = TIER_CONFIG[currentTier].min;
  const range = nextMin - currentMin;
  const earned = lumens - currentMin;
  return {
    progress: Math.min(100, Math.round((earned / range) * 100)),
    needed:   nextMin - lumens,
    nextTier: next,
  };
}
```

---

## Step 4 — Update Av (avatar) component to support Luminary gold ring

Read `src/components/Av.jsx` carefully before modifying.

Add an optional `tier` prop. When `tier === 'luminary'`, render a
subtle gold ring around the avatar. All other tiers render identically
to the current default — no ring, no change.

```jsx
import { TIER_CONFIG } from '../lib/constants';

export default function Av({
  size = 36,
  name = '',
  color,
  url = '',
  tier = null,  // only 'luminary' produces a visual change
  // ... existing props
}) {
  const isLuminary = tier === 'luminary';
  const ringColor  = '#C9A961'; // muted gold
  const ringWidth  = 2;

  // If Luminary tier, wrap in a thin gold ring
  if (isLuminary) {
    return (
      <div style={{
        width:        size + ringWidth * 2,
        height:       size + ringWidth * 2,
        borderRadius: '50%',
        padding:      ringWidth,
        background:   ringColor,
        flexShrink:   0,
      }}>
        {/* Existing avatar rendered at original size */}
        <AvInner size={size} name={name} color={color} url={url} />
      </div>
    );
  }

  // All other tiers — render exactly as before, no changes
  return <AvInner size={size} name={name} color={color} url={url} />;
}
```

Extract the existing avatar rendering logic into a local `AvInner`
component (same file) that accepts the same props as before. This
keeps the Luminary ring wrapper clean and ensures zero visual change
for non-Luminary users.

The `tier` prop is optional — all existing callers that don't pass
`tier` render identically to before. This is a purely additive change.

### Pass tier to Av — only where it matters

Unlike the original plan, we do NOT need to update every Av call
across the app. Only update avatar calls where:

1. **The profile page header** — always has access to profile data
2. **PostCard.jsx** — `posts_with_meta` will include `author_tier`
3. **NotifsScreen.jsx** — actor profiles are already batch-fetched

For all other locations (comments, group members, library, etc.),
omit the `tier` prop for now. The gold ring will appear in the most
visible places (feed, profile) without requiring changes to every
component.

### Add author_tier to posts_with_meta view

```sql
-- Add to the SELECT in posts_with_meta (read existing definition first):
case
  when pa.lumens_current_period >= 5000 then 'luminary'
  else null  -- only Luminary tier triggers a visual change
end as author_tier
```

Returning null for non-Luminary tiers means the Av component receives
no tier prop and renders normally — clean and efficient.

Apply the same to `group_posts_with_meta`.

---

## Step 5 — Profile page tier badge

In `ProfileScreen.jsx`, find the profile header area. Add a tier badge.
For Catalyst, Pioneer, and Beacon tiers use the platform's standard
violet (`T.v` / `T.v2`). Only Luminary gets the gold treatment:

```jsx
import { TIER_CONFIG, getTierFromLumens } from '../lib/constants';

const tier = getTierFromLumens(profile.lumens_current_period || 0);
const tierConfig = TIER_CONFIG[tier];

// Tier badge — violet for all, gold accent for Luminary only
<div style={{
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 12px',
  borderRadius: 20,
  background: tierConfig.bg,
  color: tierConfig.color,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  marginLeft: 8,
}}>
  ✦ {tierConfig.name}
</div>

{profile.is_founding_member && (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: 20,
    background: '#1A1B2E10',
    color: '#1A1B2E',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginLeft: 6,
  }}>
    ★ Founding Member
  </div>
)}
```

The avatar in the profile header should also receive the `tier` prop.

For the **own** profile only (when `profile.id === user.id`), show
the Lumens count + progress to next tier below the badge:

```jsx
{profile.id === user.id && (
  <div style={{ marginTop: 12 }}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      color: T.mu,
    }}>
      <span style={{ fontWeight: 700, color: T.text }}>
        {(profile.lumens_current_period || 0).toLocaleString()} Lumens
      </span>
      <span>this period</span>
      <button
        onClick={() => onNavigate('lumens')}
        style={{
          marginLeft: 'auto',
          padding: '4px 10px',
          borderRadius: 6,
          border: `1px solid ${T.bdr}`,
          background: T.w,
          fontSize: 12,
          color: T.v,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        View history →
      </button>
    </div>

    {/* Progress bar to next tier */}
    {tier !== 'luminary' && (
      <div style={{ marginTop: 8 }}>
        <div style={{
          fontSize: 11,
          color: T.mu,
          marginBottom: 4,
        }}>
          {progress.needed} Lumens to {TIER_CONFIG[progress.nextTier].name}
        </div>
        <div style={{
          height: 4,
          background: T.bdr,
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${progress.progress}%`,
            background: tierConfig.color,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    )}
  </div>
)}
```

---

## Step 6 — Lumens transparency page

Create `src/screens/LumensScreen.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { T, TIER_CONFIG, TIER_ORDER, getTierFromLumens, getNextTier } from '../lib/constants';
import Spinner from '../components/Spinner';

const REASON_LABELS = {
  post_created:           { label: 'You created a post',                icon: '✏️' },
  comment_posted:         { label: 'You commented on a post',           icon: '💬' },
  library_item_added:     { label: 'You added to your library',         icon: '📚' },
  group_created:          { label: 'You created a group',               icon: '👥' },
  project_created:        { label: 'You created a project',             icon: '🗂️' },
  onboarding_completed:   { label: 'You completed onboarding',          icon: '✓'  },
  comment_received:       { label: 'Your post received a comment',      icon: '💬' },
  library_saved:          { label: 'Your library item was saved',       icon: '🔖' },
  post_reposted:          { label: 'Your post was reposted',            icon: '↻'  },
  invited_user_active:    { label: 'A user you invited became active',  icon: '🎟️' },
  post_featured:          { label: 'Your post was featured',            icon: '✦'  },
  template_approved:      { label: 'Your template was approved',        icon: '📋' },
  discussion_threshold:   { label: 'Your post sparked a discussion',    icon: '🔥' },
};

const RULES = [
  {
    category: 'Creation',
    description: 'Lumens for adding content to the platform',
    items: [
      { label: 'Create a post',         amount: 5  },
      { label: 'Comment on a post',     amount: 2  },
      { label: 'Add to your library',   amount: 1  },
      { label: 'Create a group',        amount: 25 },
      { label: 'Create a project',      amount: 10 },
      { label: 'Complete onboarding',   amount: 25, oneTime: true },
    ],
  },
  {
    category: 'Engagement',
    description: 'Lumens earned when others engage with your contributions',
    items: [
      { label: 'A user comments on your post (first time per user)',  amount: 5 },
      { label: 'A user saves your library item',                       amount: 5 },
    ],
  },
  {
    category: 'Recognition',
    description: 'Lumens for influence and quality contributions',
    items: [
      { label: 'Your post is reposted',                                amount: 10  },
      { label: 'A user you invited becomes active',                    amount: 100 },
      { label: 'Your post is featured by Luminary',                    amount: 100 },
      { label: 'Your community template is approved',                  amount: 50  },
      { label: 'Your post sparks a discussion (3+ commenters)',        amount: 50  },
    ],
  },
];

export default function LumensScreen({ supabase, user, profile }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: result } = await supabase.rpc('get_lumen_history', {
        p_limit: 50,
      });
      setData(result);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>;
  }

  const tier = data?.tier || 'catalyst';
  const tierConfig = TIER_CONFIG[tier];
  const lumens = data?.current_period_lumens || 0;
  const next   = getNextTier(tier);
  const nextConfig = next ? TIER_CONFIG[next] : null;
  const periodStart = new Date(data?.current_period_started || Date.now());
  const periodEnd = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  return (
    <div style={{
      maxWidth: 760,
      margin: '0 auto',
      padding: '24px 32px 60px',
    }}>
      {/* Tier hero card */}
      <div style={{
        background: `linear-gradient(135deg, ${tierConfig.color}15 0%, ${tierConfig.color}05 100%)`,
        border: `2px solid ${tierConfig.color}`,
        borderRadius: 16,
        padding: '28px 32px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative accent */}
        <div style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: tierConfig.color,
          opacity: 0.08,
        }} />

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 20,
          background: tierConfig.bg,
          color: tierConfig.color,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          marginBottom: 12,
        }}>
          ✦ {tierConfig.name}
        </div>

        {data?.is_founding_member && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            borderRadius: 20,
            background: '#1A1B2E10',
            color: '#1A1B2E',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            marginBottom: 12,
            marginLeft: 6,
          }}>
            ★ Founding Member
          </div>
        )}

        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 36,
          color: T.text,
          margin: '0 0 4px',
        }}>
          {lumens.toLocaleString()} Lumens
        </h1>

        <p style={{
          fontSize: 14,
          color: T.mu,
          margin: '0 0 18px',
        }}>
          This period · ends {periodEnd.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>

        <p style={{
          fontSize: 15,
          color: T.text,
          lineHeight: 1.6,
          margin: '0 0 18px',
          maxWidth: 560,
        }}>
          {tierConfig.description}
        </p>

        {/* Progress bar to next tier */}
        {next && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              color: T.mu,
              marginBottom: 6,
            }}>
              <span>{tierConfig.name}</span>
              <span style={{ fontWeight: 700 }}>
                {(nextConfig.min - lumens).toLocaleString()} to {nextConfig.name}
              </span>
              <span>{nextConfig.name}</span>
            </div>
            <div style={{
              height: 8,
              background: T.bdr,
              borderRadius: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, ((lumens - tierConfig.min) / (nextConfig.min - tierConfig.min)) * 100)}%`,
                background: `linear-gradient(90deg, ${tierConfig.color}, ${nextConfig.color})`,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Tier ladder */}
      <div style={{
        background: T.w,
        border: `1px solid ${T.bdr}`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: T.text,
          margin: '0 0 16px',
        }}>
          The four tiers
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}>
          {TIER_ORDER.map(t => {
            const config = TIER_CONFIG[t];
            const isCurrent = t === tier;
            return (
              <div key={t} style={{
                padding: '14px 16px',
                borderRadius: 10,
                border: `2px solid ${isCurrent ? config.color : T.bdr}`,
                background: isCurrent ? config.bg : T.w,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: config.color,
                  marginBottom: 4,
                }}>
                  ✦ {config.name}
                </div>
                <div style={{
                  fontSize: 13,
                  color: T.text,
                  fontWeight: 600,
                }}>
                  {config.min.toLocaleString()}
                  {config.max !== null
                    ? ` – ${config.max.toLocaleString()}`
                    : '+'}
                </div>
                <div style={{
                  fontSize: 11,
                  color: T.mu,
                }}>
                  Lumens
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Earning rules */}
      <div style={{
        background: T.w,
        border: `1px solid ${T.bdr}`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: T.text,
          margin: '0 0 6px',
        }}>
          How Lumens are earned
        </h2>
        <p style={{
          fontSize: 13,
          color: T.mu,
          margin: '0 0 18px',
        }}>
          Three ways: by creating, by being engaged with, and by being recognised.
          Recognition counts more than creation.
        </p>

        {RULES.map(category => (
          <div key={category.category} style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: T.text,
              marginBottom: 4,
            }}>
              {category.category}
            </div>
            <div style={{
              fontSize: 12,
              color: T.mu,
              marginBottom: 10,
            }}>
              {category.description}
            </div>
            {category.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < category.items.length - 1
                  ? `1px solid ${T.bdr}` : 'none',
              }}>
                <div style={{ fontSize: 13.5, color: T.text }}>
                  {item.label}
                  {item.oneTime && (
                    <span style={{
                      marginLeft: 8,
                      fontSize: 11,
                      color: T.mu,
                      fontStyle: 'italic',
                    }}>
                      one-time
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: tierConfig.color,
                }}>
                  +{item.amount}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Recent earnings history */}
      <div style={{
        background: T.w,
        border: `1px solid ${T.bdr}`,
        borderRadius: 12,
        padding: '20px 24px',
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20,
          color: T.text,
          margin: '0 0 16px',
        }}>
          Recent earnings
        </h2>

        {(data?.transactions || []).length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: T.mu,
            fontSize: 14,
          }}>
            No Lumens earned yet. Start by creating your first post or
            joining a discussion.
          </div>
        ) : (
          <div>
            {data.transactions.map(tx => {
              const reasonInfo = REASON_LABELS[tx.reason] || {
                label: tx.reason,
                icon: '•',
              };
              return (
                <div key={tx.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${T.bdr}`,
                }}>
                  <div style={{
                    fontSize: 20,
                    flexShrink: 0,
                    width: 28,
                    textAlign: 'center',
                  }}>
                    {reasonInfo.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5,
                      color: T.text,
                      fontWeight: 500,
                    }}>
                      {reasonInfo.label}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: T.mu,
                      textTransform: 'capitalize',
                    }}>
                      {tx.category} · {new Date(tx.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: tierConfig.color,
                  }}>
                    +{tx.amount}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Wire LumensScreen into navigation

Find the main App.jsx routing logic. Add:

```javascript
import LumensScreen from './screens/LumensScreen';

// In the screen conditional:
{screen === 'lumens' && <LumensScreen supabase={supabase} user={user} profile={profile} />}
```

Add a "Lumens" link in the sidebar nav (where Profile, Library, etc.
are listed) — or alternatively only accessible via "View history →"
button on the profile page. Recommendation: accessible via profile
button only for now (keeps the sidebar uncluttered) — power users will
discover it through the profile page.

---

## Step 7 — Sidebar XP badge → wire to Lumens

The sidebar currently shows a decorative XP badge that's unwired.
Find this in the sidebar component (likely in `Sidebar.jsx` or
`AppShell.jsx`).

Replace decorative XP/level display with real Lumens + tier:

```jsx
import { TIER_CONFIG, getTierFromLumens } from '../lib/constants';

const tier = getTierFromLumens(profile.lumens_current_period || 0);
const tierConfig = TIER_CONFIG[tier];

<button
  onClick={() => onNavigate('lumens')}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 9,
    border: `1px solid ${tierConfig.color}40`,
    background: tierConfig.bg,
    cursor: 'pointer',
    fontFamily: 'inherit',
    width: '100%',
  }}
>
  <span style={{
    fontSize: 14,
    color: tierConfig.color,
  }}>
    ✦
  </span>
  <div style={{ flex: 1, textAlign: 'left' }}>
    <div style={{
      fontSize: 11,
      color: T.mu,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      fontWeight: 600,
    }}>
      {tierConfig.name}
    </div>
    <div style={{
      fontSize: 13,
      color: T.text,
      fontWeight: 700,
    }}>
      {(profile.lumens_current_period || 0).toLocaleString()} Lumens
    </div>
  </div>
</button>
```

Clicking the badge navigates to the Lumens transparency page.

---

## Step 8 — PostHog events

Add new event capture in analytics.js for Lumens-related actions.
These complement the existing capture() calls — fire them alongside
the award_lumens RPC:

```javascript
capture('lumens_earned', {
  amount:   p_amount,
  reason:   p_reason,
  category: p_category,
});
```

Add this to each award_lumens call site so PostHog tracks Lumens
earning patterns.

Also add:
```javascript
capture('tier_reached', { tier: 'pioneer' });
```
This requires detecting tier transitions — when a user's
`lumens_current_period` crosses a tier threshold. Implement this in
a SECURITY DEFINER function that runs after award_lumens, OR
client-side after each Lumens earn by comparing previous tier to new
tier.

Client-side approach (simpler):
```javascript
const before = getTierFromLumens(profile.lumens_current_period - amount);
const after  = getTierFromLumens(profile.lumens_current_period);
if (before !== after) {
  capture('tier_reached', { tier: after });
}
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- The unused `xp` and `level` columns on profiles — leave in place,
  don't use, don't remove
- The Luminary Team bot account — it's excluded from Lumens entirely
- Existing tier descriptions text — match the TASK.md text exactly,
  these are user-facing copy
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_gamification.sql in Supabase SQL Editor

# 2. Recreate posts_with_meta and group_posts_with_meta views to
#    include author_tier — Claude Code generates the SQL based on
#    current view definitions.

# 3. Verify:
#    select count(*) from lumen_transactions;  -- should be 0 (new)
#    select award_lumens(auth.uid(), 5, 'test', 'creation', '{}');
#    select * from lumen_transactions;  -- should show 1 row

# 4. Deploy app changes:
git add . && git commit -m "Phase 8: Gamification — Lumens, tiers (Catalyst→Pioneer→Beacon→Luminary), transparency page, Founding Member" && git push
```

---

## Remind the user

**Before testing — admin task:**
Set the Founding Member cutoff date in admin_config:
```sql
update admin_config
set value = jsonb_build_object('cutoff_date', '2026-08-01T00:00:00Z')
where key = 'founding_member_cutoff';
```
Edit the date based on your launch plan. Users who complete onboarding
before this date are marked as Founding Members.

**Testing the gamification system:**

1. **Earn Lumens by creating content:**
   - Create a post → check Lumens count increases by 5
   - Add a comment → check Lumens count increases by 2
   - Look at profile page → tier badge should show

2. **Earn Lumens through engagement:**
   - User B comments on User A's post → User A earns 5 Lumens
   - Check User A's transparency page → see "Your post received a comment +5"

3. **Discussion threshold:**
   - Three different users comment on User A's post → User A earns 50 Lumens
   - Check transaction history shows "Your post sparked a discussion +50"

4. **Tier progression:**
   - Manually award test Lumens via SQL:
     ```sql
     select award_lumens(
       'user-uuid'::uuid, 500, 'test', 'creation', '{}'::jsonb
     );
     ```
   - User should now show as Pioneer with teal accent

5. **Founding Member:**
   - Verify is_founding_member = true on early users
   - Check profile shows "★ Founding Member" badge

6. **Avatar tier rings:**
   - Look at posts in the feed — avatars of Pioneer+ users should
     have coloured rings
   - Top tier (Luminary) should have gold ring

**Tuning thresholds:**
The starting thresholds (500 / 2,000 / 5,000) are estimates. After
20+ users, review the distribution and adjust if needed:
```sql
select tier, count(*)
from (select compute_tier(lumens_current_period) as tier from profiles) t
group by tier;
```
Healthy distribution: most users at Catalyst, some at Pioneer,
few at Beacon, very rare Luminary. If too many users reach Luminary
quickly, raise the threshold.

---

## Testing checklist

**Migration:**
- [ ] `lumen_transactions` table exists with correct RLS
- [ ] `profiles` has 5 new columns (lumens_current_period, lumens_lifetime,
      current_period_started, previous_period_lumens, is_founding_member)
- [ ] `admin_config` has 'founding_member_cutoff' key
- [ ] `award_lumens()` function exists and rejects bot account
- [ ] `compute_tier()` function returns correct tier for various inputs
- [ ] `get_lumen_history()` RPC returns correct structure
- [ ] `apply_founding_member_status` trigger fires on onboarding completion

**Lumens earning:**
- [ ] Post created → 5 Lumens to author
- [ ] Comment posted → 2 Lumens to commenter
- [ ] Comment received (first time per user) → 5 Lumens to post owner
- [ ] Self-comments don't award engagement Lumens
- [ ] Duplicate comments don't double-award engagement Lumens
- [ ] Library item added → 1 Lumen to adder
- [ ] Group created → 25 Lumens
- [ ] Project created → 10 Lumens
- [ ] Onboarding completed → 25 Lumens
- [ ] Post reposted → 10 Lumens to original author
- [ ] Discussion threshold (3+ distinct commenters) → 50 Lumens, one-time
- [ ] Invited user creates first post → 100 Lumens to inviter
- [ ] Post featured by admin → 100 Lumens to author
- [ ] Template approved → 50 Lumens to submitter
- [ ] Bot account (Luminary Team) earns no Lumens

**Tier visualisation:**
- [ ] Luminary tier avatar shows subtle gold ring in PostCard feed
- [ ] Luminary tier avatar shows gold ring on profile page header
- [ ] Luminary tier avatar shows gold ring in NotifsScreen
- [ ] Catalyst / Pioneer / Beacon avatars show NO ring — identical to before
- [ ] Existing avatar callers that don't pass `tier` prop render identically
- [ ] posts_with_meta view includes author_tier (null for non-Luminary)
- [ ] group_posts_with_meta view includes author_tier

**Profile page:**
- [ ] Tier badge displays on profile header
- [ ] Founding Member badge displays for qualifying users
- [ ] Own profile shows Lumens count + progress to next tier
- [ ] "View history →" button navigates to Lumens transparency page

**Lumens transparency page:**
- [ ] Hero card shows current tier with tier-coloured background
- [ ] Tier description text matches TIER_CONFIG description
- [ ] Lumens count displays correctly
- [ ] Progress bar shows accurate progress to next tier
- [ ] Luminary tier shows no progress bar (already at top)
- [ ] Four tier cards displayed with current tier highlighted
- [ ] Earning rules table shows all categories with amounts
- [ ] Recent earnings list shows last 50 transactions
- [ ] Each transaction shows correct icon, label, category, date
- [ ] Empty state shows when user has no transactions

**Sidebar:**
- [ ] Old XP/level badge replaced with tier + Lumens display
- [ ] Sidebar badge shows correct tier name and Lumens count
- [ ] Clicking sidebar badge navigates to Lumens screen

**Founding Member:**
- [ ] Trigger fires when user completes onboarding
- [ ] Cutoff date check works correctly
- [ ] Users who complete onboarding after cutoff are NOT marked
- [ ] Admin can update cutoff_date in admin_config
- [ ] Founding Member badge persists after period reset

**PostHog:**
- [ ] `lumens_earned` event fires for every Lumens award
- [ ] `tier_reached` event fires only on actual tier transitions

**Build:**
- [ ] `npm run build` succeeds with no new warnings
