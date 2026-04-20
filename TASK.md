# Task: Deep Dive posts + Profile completion meter

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task covers two features:

**Part A — Deep Dive posts**
A toggle in the post composer that upgrades a regular post into a
richer, structured "Deep Dive" with enhanced formatting tools,
inline DOI citations, and distinct visual treatment in the feed.

**Part B — Research Identity Score (profile completion meter)**
A five-stage milestone tracker on the profile page that measures
professional credibility and discoverability — not just fields filled.
Import actions (LinkedIn, ORCID, CV) automatically complete relevant
milestones.

---

# PART A — Deep Dive posts

## A1 — SQL migration

Create `migration_deepdive.sql`:

```sql
alter table posts
  add column if not exists is_deep_dive boolean default false;
```

Run in Supabase SQL Editor.

---

## A2 — Deep Dive toggle in NewPostScreen

In `src/screens/NewPostScreen.jsx`, add a toggle at the bottom of
the text post composer (only visible for text/regular posts,
not paper posts):

```javascript
const [isDeepDive, setIsDeepDive] = useState(false);
```

```jsx
{/* Deep Dive toggle — shown only for text posts */}
{postType === 'text' && (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 0', borderTop: `1px solid ${T.bdr}`,
    marginTop: 8,
  }}>
    {/* Toggle pill */}
    <div
      onClick={() => setIsDeepDive(d => !d)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: isDeepDive ? T.v : T.s3,
        position: 'relative', cursor: 'pointer',
        transition: 'background .2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: isDeepDive ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left .2s',
      }}/>
    </div>
    <div>
      <div style={{fontSize: 13, fontWeight: 600, color: T.text}}>
        Create a Deep Dive
      </div>
      <div style={{fontSize: 11.5, color: T.mu}}>
        Structured post with sections, citations and richer formatting
      </div>
    </div>
  </div>
)}
```

Save `is_deep_dive` when publishing:
```javascript
await supabase.from('posts').update({
  // ... existing fields
  is_deep_dive: isDeepDive,
}).eq('id', newPostId);
```

---

## A3 — Enhanced RichTextEditor for Deep Dive mode

In `src/components/RichTextEditor.jsx`, when `isDeepDive` is true,
show an expanded toolbar with additional formatting buttons.

Pass `isDeepDive` as a prop to RichTextEditor.

### Additional toolbar buttons (only in Deep Dive mode)

Add these buttons to the toolbar after the existing bold/italic/link:

```jsx
{isDeepDive && (
  <>
    {/* Divider */}
    <div style={{width:1, height:18, background:T.bdr, margin:'0 4px'}}/>

    {/* H2 heading */}
    <TBtn
      title="Section heading"
      onClick={() => execCmd('formatBlock', 'H2')}
    >
      H2
    </TBtn>

    {/* H3 sub-heading */}
    <TBtn
      title="Sub-heading"
      onClick={() => execCmd('formatBlock', 'H3')}
    >
      H3
    </TBtn>

    {/* Blockquote / pull quote */}
    <TBtn
      title="Pull quote"
      onClick={() => execCmd('formatBlock', 'BLOCKQUOTE')}
    >
      ❝
    </TBtn>

    {/* Horizontal divider */}
    <TBtn
      title="Section divider"
      onClick={insertDivider}
    >
      ─
    </TBtn>

    {/* Numbered list */}
    <TBtn
      title="Numbered list"
      onClick={() => execCmd('insertOrderedList')}
    >
      1.
    </TBtn>

    {/* Inline DOI citation */}
    <TBtn
      title="Cite a paper by DOI"
      onClick={() => setShowDoiCite(true)}
    >
      📄
    </TBtn>
  </>
)}
```

### Insert divider

```javascript
const insertDivider = () => {
  document.execCommand('insertHTML', false,
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/><p><br></p>'
  );
};
```

### Deep Dive editor styles

When `isDeepDive` is true, apply richer typography to the contenteditable:

```javascript
// contenteditable style — changes when isDeepDive:
const editorStyle = {
  minHeight:  isDeepDive ? 220 : 120,
  fontSize:   isDeepDive ? 15  : 13,
  lineHeight: isDeepDive ? 1.7 : 1.55,
  padding:    isDeepDive ? '14px 16px' : '10px 12px',
  // Deep Dive gets a subtle background hint
  background: isDeepDive ? '#fafafe' : T.w,
  border: `1.5px solid ${isDeepDive ? T.v : T.bdr}`,
  borderRadius: 12,
  outline: 'none',
  fontFamily: 'inherit',
};
```

Add CSS-in-JS for heading and blockquote styles inside the editor.
Since the app uses inline styles, inject a `<style>` tag once when
the component mounts:

```javascript
useEffect(() => {
  if (!isDeepDive) return;
  const style = document.createElement('style');
  style.id = 'deep-dive-editor-styles';
  style.textContent = `
    [data-deep-dive] h2 {
      font-family: 'DM Serif Display', serif;
      font-size: 20px;
      font-weight: 400;
      margin: 18px 0 8px;
      color: #1a1a2e;
    }
    [data-deep-dive] h3 {
      font-family: 'DM Serif Display', serif;
      font-size: 16px;
      font-weight: 400;
      margin: 14px 0 6px;
      color: #1a1a2e;
    }
    [data-deep-dive] blockquote {
      border-left: 3px solid #6c63ff;
      margin: 12px 0;
      padding: 8px 14px;
      background: #f0effe;
      border-radius: 0 8px 8px 0;
      font-style: italic;
      color: #555;
    }
  `;
  if (!document.getElementById('deep-dive-editor-styles')) {
    document.head.appendChild(style);
  }
  return () => {
    document.getElementById('deep-dive-editor-styles')?.remove();
  };
}, [isDeepDive]);
```

Add `data-deep-dive` attribute to the contenteditable when in Deep Dive mode.

---

## A4 — Inline DOI citation

When the user clicks the 📄 cite button, show a small popover input:

```javascript
const [showDoiCite, setShowDoiCite] = useState(false);
const [citeDoiInput, setCiteDoiInput] = useState('');
const [citeFetching, setCiteFetching] = useState(false);
const [citeError, setCiteError] = useState('');
```

```jsx
{showDoiCite && (
  <div style={{
    position: 'absolute', zIndex: 100,
    background: T.w, border: `1.5px solid ${T.v}`,
    borderRadius: 10, padding: 12, boxShadow: '0 4px 20px rgba(0,0,0,.12)',
    width: 320,
  }}>
    <div style={{fontSize: 12.5, fontWeight: 600, marginBottom: 6}}>
      Insert paper citation
    </div>
    <div style={{display: 'flex', gap: 6}}>
      <input
        autoFocus
        value={citeDoiInput}
        onChange={e => setCiteDoiInput(e.target.value)}
        placeholder="10.1056/NEJMoa..."
        onKeyDown={e => e.key === 'Enter' && insertCitation()}
        style={{
          flex: 1, fontSize: 12.5, padding: '6px 10px',
          border: `1.5px solid ${T.bdr}`, borderRadius: 7,
          fontFamily: 'inherit', outline: 'none',
        }}
      />
      <Btn onClick={insertCitation} disabled={citeFetching}>
        {citeFetching ? '...' : 'Cite'}
      </Btn>
    </div>
    {citeError && (
      <div style={{fontSize: 11.5, color: T.ro, marginTop: 4}}>
        {citeError}
      </div>
    )}
    <button onClick={() => {
      setShowDoiCite(false);
      setCiteDoiInput('');
      setCiteError('');
    }} style={{
      fontSize: 11, color: T.mu, border: 'none',
      background: 'transparent', cursor: 'pointer',
      marginTop: 4, fontFamily: 'inherit',
    }}>
      Cancel
    </button>
  </div>
)}
```

### Citation fetch and insert

```javascript
const insertCitation = async () => {
  if (!citeDoiInput.trim()) return;
  setCiteFetching(true);
  setCiteError('');
  try {
    const resp = await fetch(
      `https://api.crossref.org/works/${encodeURIComponent(citeDoiInput.trim())}`
    );
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    const w    = data.message;
    const authors = (w.author || []).slice(0, 2)
      .map(a => a.family || '').join(', ');
    const year    = w.published?.['date-parts']?.[0]?.[0] || '';
    const journal = w['container-title']?.[0] || '';
    const title   = w.title?.[0] || '';
    const doi     = citeDoiInput.trim();

    // Insert a citation chip into the editor
    const chipHtml = `<a href="https://doi.org/${doi}"
      target="_blank" rel="noopener noreferrer"
      data-doi="${doi}"
      style="display:inline-flex;align-items:center;gap:5px;
        background:#f0effe;border:1px solid rgba(108,99,255,.2);
        border-radius:6px;padding:2px 8px;text-decoration:none;
        font-size:12px;color:#6c63ff;font-weight:600;
        font-style:normal;vertical-align:middle;"
    >📄 ${authors}${authors ? ' · ' : ''}${year}${year ? ' — ' : ''}${journal || title}</a>&nbsp;`;

    document.execCommand('insertHTML', false, chipHtml);

    setShowDoiCite(false);
    setCiteDoiInput('');
  } catch {
    setCiteError('DOI not found. Check the format and try again.');
  }
  setCiteFetching(false);
};
```

---

## A5 — Deep Dive post card visual treatment

In `src/feed/PostCard.jsx`, when `post.is_deep_dive` is true,
apply distinct visual styling:

```jsx
<div style={{
  background: T.w,
  border: post.is_deep_dive
    ? `1.5px solid rgba(108,99,255,.25)`
    : `1px solid ${T.bdr}`,
  borderLeft: post.is_deep_dive
    ? `4px solid ${T.v}`
    : `1px solid ${T.bdr}`,
  borderRadius: 14,
  padding: post.is_deep_dive
    ? (isMobile ? '14px 14px 14px 12px' : '18px 20px 18px 18px')
    : (isMobile ? '10px 12px' : '16px 18px'),
  marginBottom: 12,
}}>
```

Replace the "Post" badge with a "Deep Dive" badge when applicable:

```jsx
{post.is_deep_dive ? (
  <span style={{
    fontSize: 10.5, fontWeight: 700,
    padding: '2px 9px', borderRadius: 20,
    background: T.v2, color: T.v,
    border: `1px solid rgba(108,99,255,.2)`,
  }}>
    🔬 Deep Dive
  </span>
) : null}
```

Apply richer typography to Deep Dive content:

```jsx
<div
  style={{
    fontSize:   post.is_deep_dive ? 15  : 13,
    lineHeight: post.is_deep_dive ? 1.7 : 1.55,
  }}
  // ... existing SafeHtml or content renderer
/>
```

Add heading and blockquote styles for rendered Deep Dive content —
inject once at app level (in App.jsx or index.js):

```javascript
// In App.jsx useEffect on mount:
const style = document.createElement('style');
style.textContent = `
  .deep-dive-content h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 20px; font-weight: 400;
    margin: 18px 0 8px; color: #1a1a2e;
  }
  .deep-dive-content h3 {
    font-family: 'DM Serif Display', serif;
    font-size: 16px; font-weight: 400;
    margin: 14px 0 6px; color: #1a1a2e;
  }
  .deep-dive-content blockquote {
    border-left: 3px solid #6c63ff;
    margin: 12px 0; padding: 8px 14px;
    background: #f0effe; border-radius: 0 8px 8px 0;
    font-style: italic; color: #555;
  }
  .deep-dive-content a[data-doi] {
    display: inline-flex; align-items: center; gap: 5px;
    background: #f0effe;
    border: 1px solid rgba(108,99,255,.2);
    border-radius: 6px; padding: 2px 8px;
    text-decoration: none; font-size: 12px;
    color: #6c63ff; font-weight: 600;
  }
`;
document.head.appendChild(style);
```

Apply `className="deep-dive-content"` to the content wrapper
when `post.is_deep_dive` is true.

---

---

# PART B — Research Identity Score (profile completion meter)

## B1 — SQL migration

Add to `migration_deepdive.sql` (same file):

```sql
-- Track which activation milestones a user has completed
-- Stored as a JSONB object for flexibility
alter table profiles
  add column if not exists activation_milestones jsonb default '{}';

-- Example value:
-- {
--   "name_set": true,
--   "title_set": true,
--   "institution_set": true,
--   "identity_badge_set": true,
--   "photo_set": true,
--   "bio_written": true,
--   "publication_added": true,
--   "orcid_linked": true,
--   "following_3": true,
--   "interests_set": true,
--   "first_post": true,
--   "first_comment": true,
--   "joined_group": true,
--   "public_profile": true,
--   "card_details": true,
--   "publications_5": true
-- }
```

---

## B2 — Milestone definitions

Create `src/lib/profileMilestones.js`:

```javascript
/**
 * Research Identity Score — five stages of profile completion.
 * Each milestone has:
 *   - id: unique key stored in activation_milestones JSONB
 *   - label: shown in the UI
 *   - stage: 1-5
 *   - check(profile, stats): returns true if milestone is complete
 *   - cta: action label shown when incomplete
 *   - ctaAction: screen or action to trigger
 *   - importNote: shown when completed via import
 */

export const MILESTONES = [

  // ── Stage 1: Identified ───────────────────────────────────────────────────
  {
    id: 'name_set', stage: 1,
    label: 'Name and title set',
    check: (p) => !!(p.name?.trim() && p.title?.trim()),
    cta: 'Edit profile', ctaAction: 'edit_profile',
  },
  {
    id: 'institution_set', stage: 1,
    label: 'Institution added',
    check: (p) => !!p.institution?.trim(),
    cta: 'Add institution', ctaAction: 'edit_profile',
  },
  {
    id: 'identity_badge_set', stage: 1,
    label: 'Professional identity badge set',
    check: (p) => !!(p.identity_tier1 && p.identity_tier2),
    cta: 'Set your field', ctaAction: 'edit_profile',
  },

  // ── Stage 2: Credible ─────────────────────────────────────────────────────
  {
    id: 'photo_set', stage: 2,
    label: 'Profile photo added',
    check: (p) => !!p.avatar_url,
    cta: 'Add photo', ctaAction: 'edit_profile',
  },
  {
    id: 'bio_written', stage: 2,
    label: 'Bio written (50+ words)',
    check: (p) => (p.bio || '').trim().split(/\s+/).length >= 50,
    cta: 'Write bio', ctaAction: 'edit_profile',
    importNote: 'Completed via import',
  },
  {
    id: 'publication_added', stage: 2,
    label: 'At least 1 publication added',
    check: (p, s) => (s.publicationCount || 0) >= 1,
    cta: 'Add publication', ctaAction: 'publications',
    importNote: 'Completed via ORCID import',
  },

  // ── Stage 3: Connected ────────────────────────────────────────────────────
  {
    id: 'orcid_linked', stage: 3,
    label: 'ORCID linked and verified',
    check: (p) => !!(p.orcid && p.orcid_verified),
    cta: 'Link ORCID', ctaAction: 'import_orcid',
    importNote: 'Completed via ORCID sign-up',
  },
  {
    id: 'following_3', stage: 3,
    label: 'Following at least 3 researchers',
    check: (p, s) => (s.followingCount || 0) >= 3,
    cta: 'Discover researchers', ctaAction: 'explore',
  },
  {
    id: 'interests_set', stage: 3,
    label: 'Research interests added (3+)',
    check: (p) => (p.topic_interests || []).length >= 3,
    cta: 'Add interests', ctaAction: 'edit_profile',
  },

  // ── Stage 4: Active ───────────────────────────────────────────────────────
  {
    id: 'first_post', stage: 4,
    label: 'First post published',
    check: (p, s) => (s.postCount || 0) >= 1,
    cta: 'Write a post', ctaAction: 'new_post',
  },
  {
    id: 'first_comment', stage: 4,
    label: 'First comment made',
    check: (p, s) => (s.commentCount || 0) >= 1,
    cta: 'Join a discussion', ctaAction: 'feed',
  },
  {
    id: 'joined_group', stage: 4,
    label: 'Joined or created a group',
    check: (p, s) => (s.groupCount || 0) >= 1,
    cta: 'Explore groups', ctaAction: 'groups',
  },

  // ── Stage 5: Visible ──────────────────────────────────────────────────────
  {
    id: 'public_profile', stage: 5,
    label: 'Public profile enabled',
    check: (p) => !!p.profile_slug && p.profile_visibility !== 'private',
    cta: 'Enable public profile', ctaAction: 'share_profile',
  },
  {
    id: 'card_details', stage: 5,
    label: 'Business card contact details added',
    check: (p) => !!(p.card_email || p.card_linkedin || p.card_website),
    cta: 'Add contact details', ctaAction: 'edit_profile',
  },
  {
    id: 'publications_5', stage: 5,
    label: '5 or more publications added',
    check: (p, s) => (s.publicationCount || 0) >= 5,
    cta: 'Add more publications', ctaAction: 'publications',
    importNote: 'Completed via import',
  },
];

export const STAGES = [
  { number: 1, label: 'Identified',  icon: '🔬' },
  { number: 2, label: 'Credible',    icon: '📄' },
  { number: 3, label: 'Connected',   icon: '🔗' },
  { number: 4, label: 'Active',      icon: '💬' },
  { number: 5, label: 'Visible',     icon: '🌐' },
];

export const STAGE_REWARDS = {
  2: 'Your profile now appears in Explore search',
  3: 'You can now send direct messages',
  4: 'Your posts appear in For You feeds across Luminary',
  5: 'Your profile is fully shareable as a research CV',
};

/**
 * Compute which stage the user has reached.
 * A stage is complete when ALL its milestones are done.
 * Stages only move forward — never backward.
 */
export function computeStage(profile, stats) {
  let highestComplete = 0;
  for (const stage of [1, 2, 3, 4, 5]) {
    const stageMilestones = MILESTONES.filter(m => m.stage === stage);
    const allDone = stageMilestones.every(m => m.check(profile, stats));
    if (allDone) highestComplete = stage;
    else break;
  }
  return highestComplete; // 0 = none complete, 5 = fully complete
}

/**
 * Get the milestones for the next incomplete stage.
 */
export function getNextStageMilestones(profile, stats) {
  const currentStage = computeStage(profile, stats);
  const nextStage    = Math.min(currentStage + 1, 5);
  return {
    stage:      nextStage,
    milestones: MILESTONES.filter(m => m.stage === nextStage),
  };
}
```

---

## B3 — ProfileCompletionMeter component

Create `src/components/ProfileCompletionMeter.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import {
  MILESTONES, STAGES, STAGE_REWARDS,
  computeStage, getNextStageMilestones
} from '../lib/profileMilestones';

export default function ProfileCompletionMeter({
  profile, user, setScreen, onAction
}) {
  const [stats,    setStats]    = useState({});
  const [expanded, setExpanded] = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [pubsRes, postsRes, commentsRes, followingRes, groupsRes] =
        await Promise.all([
          supabase.from('publications').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('posts').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('comments').select('id', {count:'exact',head:true})
            .eq('user_id', user.id),
          supabase.from('follows').select('id', {count:'exact',head:true})
            .eq('follower_id', user.id).eq('target_type', 'user'),
          supabase.from('group_members').select('id', {count:'exact',head:true})
            .eq('user_id', user.id).in('role', ['admin','member']),
        ]);
      setStats({
        publicationCount: pubsRes.count  || 0,
        postCount:        postsRes.count || 0,
        commentCount:     commentsRes.count || 0,
        followingCount:   followingRes.count || 0,
        groupCount:       groupsRes.count || 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [user.id]);

  if (loading) return null;

  const currentStage = computeStage(profile, stats);
  const currentStageDef = STAGES[currentStage] || STAGES[0];
  const nextStageDef    = STAGES[Math.min(currentStage, 4)];
  const { stage: nextStage, milestones: nextMilestones } =
    getNextStageMilestones(profile, stats);

  const completedMilestones = MILESTONES.filter(m => m.check(profile, stats));
  const totalMilestones     = MILESTONES.length;
  const completedCount      = completedMilestones.length;

  // Don't show if fully complete
  if (currentStage === 5) return null;

  return (
    <div style={{
      background: T.w, borderRadius: 12,
      border: `1.5px solid rgba(108,99,255,.2)`,
      marginBottom: 16, overflow: 'hidden',
    }}>

      {/* Collapsed header — always visible */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '12px 16px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
        }}
      >
        {/* Stage indicator dots */}
        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
          {STAGES.map((s, i) => (
            <div key={s.number} style={{
              width:  i < currentStage ? 24 : 8,
              height: 8, borderRadius: 4,
              background: i < currentStage ? T.v
                : i === currentStage ? T.v2
                : T.s3,
              border: i === currentStage
                ? `1.5px solid ${T.v}` : 'none',
              transition: 'all .3s',
            }}/>
          ))}
        </div>

        <div style={{flex: 1}}>
          <div style={{fontSize: 12.5, fontWeight: 700}}>
            {currentStageDef.icon} {currentStageDef.label}
            <span style={{
              fontSize: 11, color: T.mu, fontWeight: 400,
              marginLeft: 6,
            }}>
              → {nextStageDef.icon} {nextStageDef.label}
            </span>
          </div>
          <div style={{fontSize: 11.5, color: T.mu, marginTop: 1}}>
            {completedCount} of {totalMilestones} milestones complete
          </div>
        </div>

        <span style={{
          fontSize: 12, color: T.mu, transition: 'transform .2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>
          ▾
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{borderTop: `1px solid ${T.bdr}`}}>

          {/* All 5 stages */}
          {STAGES.map(stageDef => {
            const stageMilestones = MILESTONES.filter(
              m => m.stage === stageDef.number
            );
            const stageComplete = stageMilestones.every(
              m => m.check(profile, stats)
            );
            const isCurrentStage = stageDef.number === currentStage + 1;

            return (
              <div key={stageDef.number} style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${T.bdr}`,
                opacity: stageDef.number > currentStage + 1 ? 0.5 : 1,
              }}>
                {/* Stage header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 16,
                    opacity: stageComplete ? 1 : 0.4,
                  }}>
                    {stageDef.icon}
                  </span>
                  <div style={{flex: 1}}>
                    <span style={{
                      fontSize: 12.5, fontWeight: 700,
                      color: stageComplete ? T.gr : T.text,
                    }}>
                      Stage {stageDef.number}: {stageDef.label}
                    </span>
                    {stageComplete && STAGE_REWARDS[stageDef.number] && (
                      <div style={{fontSize: 11, color: T.gr, marginTop: 1}}>
                        ✓ {STAGE_REWARDS[stageDef.number]}
                      </div>
                    )}
                  </div>
                  {stageComplete && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      color: T.gr, background: T.gr2,
                      padding: '1px 8px', borderRadius: 20,
                    }}>
                      Complete
                    </span>
                  )}
                </div>

                {/* Milestones */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                  {stageMilestones.map(m => {
                    const done = m.check(profile, stats);
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          flexShrink: 0,
                          background: done ? T.gr : 'transparent',
                          border: `1.5px solid ${done ? T.gr : T.bdr}`,
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {done && (
                            <svg width="9" height="9" viewBox="0 0 12 12">
                              <polyline points="2,6 5,9 10,3"
                                stroke="white" strokeWidth="2"
                                fill="none"/>
                            </svg>
                          )}
                        </div>
                        <span style={{
                          fontSize: 12.5, flex: 1,
                          color: done ? T.mu : T.text,
                          textDecoration: done ? 'none' : 'none',
                        }}>
                          {m.label}
                        </span>

                        {/* CTA for incomplete milestones in next stage */}
                        {!done && isCurrentStage && (
                          <button onClick={() => onAction(m.ctaAction)}
                            style={{
                              fontSize: 11, color: T.v, fontWeight: 700,
                              border: `1px solid ${T.v}`,
                              background: T.v2,
                              borderRadius: 20, padding: '2px 9px',
                              cursor: 'pointer', fontFamily: 'inherit',
                              flexShrink: 0,
                            }}>
                            {m.cta} →
                          </button>
                        )}

                        {/* Import shortcut for importable milestones */}
                        {!done && isCurrentStage && m.importNote && (
                          <span style={{
                            fontSize: 10.5, color: T.mu,
                            fontStyle: 'italic',
                          }}>
                            or import
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

## B4 — Wire meter into ProfileScreen

In `src/profile/ProfileScreen.jsx`, render the meter at the top
of the About tab content, above Work Experience:

```jsx
import ProfileCompletionMeter from '../components/ProfileCompletionMeter';

{/* Shown only to the profile owner, not on public profile */}
{activeTab === 'about' && isOwnProfile && (
  <ProfileCompletionMeter
    profile={profile}
    user={user}
    setScreen={setScreen}
    onAction={(action) => {
      // Map action IDs to app navigation
      switch(action) {
        case 'edit_profile':   setEditing(true); break;
        case 'publications':   setActiveTab('publications'); break;
        case 'explore':        setScreen('explore'); break;
        case 'groups':         setScreen('groups'); break;
        case 'new_post':       setScreen('post'); break;
        case 'feed':           setScreen('feed'); break;
        case 'share_profile':  setShowSharePanel(true); break;
        case 'import_orcid':   setShowOrcid(true); break;
        default: break;
      }
    }}
  />
)}
```

---

## B5 — Auto-complete milestones on import

When a LinkedIn, ORCID, or CV import completes successfully,
check which milestones are now satisfied and update the profile
stats display — no additional DB writes needed since `check()`
reads live from `profile` and `stats`.

The meter recalculates automatically on next render since it
queries live data. No extra code needed — the `useEffect` in
`ProfileCompletionMeter` refetches stats on mount.

To give instant feedback after an import, call a prop
`onImportComplete` that triggers a re-render of the meter:

```javascript
// In ProfileScreen, after any import saves to profile:
setProfile(updatedProfile); // this re-renders the meter automatically
```

---

## What NOT to change

- The existing RichTextEditor core logic — extend, don't replace
- Feed fetch and display logic beyond PostCard visual changes
- Group posts, library, projects screens
- The sanitiseHtml function — Deep Dive content still passes through it
- Run `npm run build` when done

---

## Testing checklist

**Deep Dive:**
- [ ] Toggle appears on text post composer only (not paper posts)
- [ ] Toggling on expands toolbar with H2, H3, blockquote, divider, cite buttons
- [ ] H2 in editor renders in DM Serif Display, larger size
- [ ] Blockquote renders with violet left border and light background
- [ ] DOI citation: enter a real DOI → chip appears inline in editor
- [ ] Published Deep Dive post: left violet border in feed card
- [ ] Published Deep Dive: content renders with larger font and line height
- [ ] Deep Dive badge appears instead of generic Post badge
- [ ] Citation chip in published post links to doi.org correctly

**Profile meter:**
- [ ] Meter appears on own profile About tab only (not visible to visitors)
- [ ] Stage dots show correct progress
- [ ] Collapsed view shows current stage → next stage
- [ ] Expanding shows all 5 stages with individual milestones
- [ ] Completed milestones show green checkmark
- [ ] Incomplete milestones in the next stage show CTA buttons
- [ ] CTA buttons navigate correctly (edit profile, explore, etc.)
- [ ] Completing a milestone via LinkedIn import auto-updates meter
- [ ] Meter disappears when all Stage 5 milestones are complete
- [ ] Stages never go backwards if content is removed
