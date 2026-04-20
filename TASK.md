# Task: Feed discussion improvements

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

Luminary is built around scientific discussion, but the feed currently
hides conversations — comment counts are the only signal. This task
makes discussions visible and invites participation directly on the
post card.

Changes apply to `src/feed/PostCard.jsx` and where relevant to
`src/groups/GroupPostCard.jsx`. No database changes needed.

---

## Overview of changes

1. Truncate paper abstract to 1 line with Expand/Collapse
2. Show top comment inline below the action bar
3. Commenter avatars on the post card
4. Quick reply box with taxonomy-aware rotating prompts
5. "X researchers from your field are discussing this" relevance hook

---

## Shared setup — fetch top comment and commenters

PostCard already lazy-loads comments when expanded. Add a lightweight
fetch on mount that gets only the top comment and commenter avatars
— NOT the full comment thread (that stays lazy):

```javascript
const [topComment,       setTopComment]       = useState(null);
const [commenterAvatars, setCommenterAvatars] = useState([]);
const [showReplyBox,     setShowReplyBox]     = useState(false);
const [replyText,        setReplyText]        = useState('');
const [promptIndex,      setPromptIndex]      = useState(
  () => Math.floor(Math.random() * 10) // random starting prompt
);

useEffect(() => {
  if (!post.comment_count || post.comment_count === 0) return;

  // Fetch the single most-liked comment (or most recent if no likes)
  supabase
    .from('comments')
    .select(`
      id, content, created_at,
      profiles(name, avatar_url, avatar_color)
    `)
    .eq('post_id', post.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then(({ data }) => { if (data) setTopComment(data); });

  // Fetch avatars of up to 3 unique commenters
  supabase
    .from('comments')
    .select('user_id, profiles(name, avatar_url, avatar_color)')
    .eq('post_id', post.id)
    .order('created_at', { ascending: true })
    .limit(10)
    .then(({ data }) => {
      if (!data) return;
      // Deduplicate by user_id — keep first occurrence
      const seen = new Set();
      const unique = data.filter(c => {
        if (seen.has(c.user_id)) return false;
        seen.add(c.user_id);
        return true;
      });
      setCommenterAvatars(unique.slice(0, 3));
    });
}, [post.id, post.comment_count]);
```

---

## Change 1 — Truncate paper abstract

For paper posts, the abstract currently shows in full which pushes
everything down. Truncate to 1 line by default with Expand/Collapse.

Find where `post.paper_abstract` (or similar) is rendered on paper posts.

```javascript
const [abstractExpanded, setAbstractExpanded] = useState(false);
```

```jsx
{post.post_type === 'paper' && post.paper_abstract && (
  <div style={{marginBottom: 8}}>
    <div style={{
      fontSize: 12.5, color: T.mu, lineHeight: 1.55,
      overflow: abstractExpanded ? 'visible' : 'hidden',
      display: abstractExpanded ? 'block' : '-webkit-box',
      WebkitLineClamp: abstractExpanded ? 'none' : 1,
      WebkitBoxOrient: 'vertical',
    }}>
      {post.paper_abstract}
    </div>
    <button
      onClick={() => setAbstractExpanded(e => !e)}
      style={{
        fontSize: 11.5, color: T.v, fontWeight: 600,
        border: 'none', background: 'transparent',
        cursor: 'pointer', fontFamily: 'inherit',
        padding: '2px 0', marginTop: 2,
      }}
    >
      {abstractExpanded ? '↑ Collapse' : '↓ Read abstract'}
    </button>
  </div>
)}
```

---

## Change 2 — Inline top comment preview

Show the most recent comment directly on the card, below the action
bar. Only shown when `post.comment_count > 0` and `topComment` is loaded.
Clicking it opens the full comment thread (same as clicking the comment
count currently does).

```jsx
{topComment && !showReplyBox && (
  <div
    onClick={() => {/* open full comment thread */}}
    style={{
      marginTop: 10,
      padding: '9px 12px',
      background: T.s2,
      borderRadius: 10,
      border: `1px solid ${T.bdr}`,
      cursor: 'pointer',
      display: 'flex', gap: 8, alignItems: 'flex-start',
    }}
  >
    <Av
      size={24}
      color={topComment.profiles?.avatar_color}
      name={topComment.profiles?.name}
      url={topComment.profiles?.avatar_url || ''}
    />
    <div style={{flex: 1, minWidth: 0}}>
      <span style={{fontSize: 12, fontWeight: 700, marginRight: 5}}>
        {topComment.profiles?.name}
      </span>
      <span style={{
        fontSize: 12.5, color: T.text, lineHeight: 1.45,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {topComment.content?.replace(/<[^>]+>/g, '')}
      </span>
    </div>
    {post.comment_count > 1 && (
      <span style={{
        fontSize: 11, color: T.mu, flexShrink: 0,
        alignSelf: 'center',
      }}>
        +{post.comment_count - 1} more
      </span>
    )}
  </div>
)}
```

---

## Change 3 — Commenter avatars

Show stacked avatars of people who have commented, in the action bar
area next to the comment count. Only shown when `comment_count > 0`.

Replace or augment the existing comment count button:

```jsx
{/* Comment button with stacked avatars */}
<button onClick={openComments} style={{
  display: 'flex', alignItems: 'center', gap: 5,
  border: 'none', background: 'transparent',
  cursor: 'pointer', padding: isMobile ? '6px 6px' : '8px 8px',
}}>
  {/* Stacked avatars — only on desktop */}
  {!isMobile && commenterAvatars.length > 0 && (
    <div style={{display: 'flex', marginRight: 2}}>
      {commenterAvatars.map((c, i) => (
        <div key={c.user_id} style={{
          marginLeft: i === 0 ? 0 : -8,
          zIndex: commenterAvatars.length - i,
          position: 'relative',
          borderRadius: '50%',
          border: `1.5px solid ${T.w}`,
        }}>
          <Av
            size={20}
            color={c.profiles?.avatar_color}
            name={c.profiles?.name}
            url={c.profiles?.avatar_url || ''}
          />
        </div>
      ))}
    </div>
  )}

  {/* Comment icon */}
  <svg width={isMobile ? 15 : 16} height={isMobile ? 15 : 16}
    viewBox="0 0 24 24" fill="none"
    stroke={T.mu} strokeWidth="1.8">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>

  {/* Count — hidden on mobile when 0 */}
  {(!isMobile || post.comment_count > 0) && (
    <span style={{fontSize: isMobile ? 12 : 13, color: T.mu}}>
      {post.comment_count}
    </span>
  )}
</button>
```

---

## Change 4 — Quick reply box with rotating prompts

Show a reply box below the action bar (and below the top comment
preview if present). The box has the user's avatar, a text input,
and a rotating prompt as placeholder text.

### Prompt definitions

Define prompts by taxonomy tier1. Add this constant near the top
of PostCard.jsx or import from lib/constants.js:

```javascript
const DISCUSSION_PROMPTS = {
  'Clinical Medicine': [
    "How does this change your clinical approach?",
    "Have you seen similar outcomes in your practice?",
    "What patient population would benefit most?",
    "Does this align with current guidelines?",
    "What are the real-world implementation challenges?",
  ],
  'Basic Life Sciences': [
    "What mechanism do you think is driving this?",
    "Have you replicated anything similar in your lab?",
    "What's the next experiment you'd run?",
    "Does this challenge any existing models?",
    "What are the key limitations of this approach?",
  ],
  'Pharmacology & Therapeutics': [
    "What are the translational implications?",
    "How does this compare to current standard of care?",
    "What safety signals would you watch for?",
    "Is the therapeutic window realistic?",
    "What biomarker would you use to stratify patients?",
  ],
  'Pharmaceutical & Biotech Industry': [
    "What are the market access implications?",
    "How does this fit into the treatment algorithm?",
    "What evidence gaps remain before approval?",
    "How would you position this vs existing options?",
    "What payer objections do you anticipate?",
  ],
  'Public Health & Epidemiology': [
    "How generalisable are these findings?",
    "What are the policy implications?",
    "Which populations are underrepresented here?",
    "What confounders concern you most?",
    "How would you design the follow-up study?",
  ],
  'Bioengineering & Informatics': [
    "What's the scalability challenge here?",
    "How robust is this to real-world data noise?",
    "What validation dataset would you use?",
    "Is the compute cost realistic for clinical deployment?",
    "What's your benchmark for success?",
  ],
  'Medical Devices & Diagnostics Industry': [
    "What's the regulatory path for this?",
    "How does the clinical workflow integration look?",
    "What's the training requirement for end users?",
    "How does this perform in low-resource settings?",
    "What's the reimbursement case?",
  ],
  'Medical Education & Research Methods': [
    "How would you teach this concept differently?",
    "What's the evidence base for this approach?",
    "How do you assess competency here?",
    "What bias concerns do you have with this design?",
    "How reproducible are these results?",
  ],
  default: [
    "What's your take on this?",
    "How does this apply to your work?",
    "What would you add to this?",
    "What questions does this raise for you?",
    "Have you encountered this in your field?",
  ],
};

const ZERO_COMMENT_PROMPTS = [
  "Be the first to share your perspective",
  "What does this mean for your field?",
  "Start the discussion — what's your take?",
  "Have a question about this? Ask it here",
  "Share your experience with this topic",
];

function getPrompts(tier1) {
  return DISCUSSION_PROMPTS[tier1] || DISCUSSION_PROMPTS.default;
}
```

### Reply box UI

Show the reply box trigger (small, below the top comment) when not
already open. On click, expand to a full reply input:

```jsx
{/* Reply box trigger — collapsed state */}
{!showReplyBox && (
  <button
    onClick={() => setShowReplyBox(true)}
    style={{
      width: '100%', marginTop: 8,
      display: 'flex', alignItems: 'center', gap: 8,
      border: `1px solid ${T.bdr}`, borderRadius: 24,
      padding: '7px 12px', background: T.s2,
      cursor: 'pointer', fontFamily: 'inherit',
      textAlign: 'left',
    }}
  >
    <Av size={22} color={profile?.avatar_color}
      name={profile?.name} url={profile?.avatar_url || ''}/>
    <span style={{
      fontSize: 12.5, color: T.mu, flex: 1,
      overflow: 'hidden', textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}>
      {post.comment_count === 0
        ? ZERO_COMMENT_PROMPTS[promptIndex % ZERO_COMMENT_PROMPTS.length]
        : getPrompts(post.tier1)[promptIndex % getPrompts(post.tier1).length]
      }
    </span>
  </button>
)}

{/* Reply box — expanded state */}
{showReplyBox && (
  <div style={{
    marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start',
  }}>
    <Av size={28} color={profile?.avatar_color}
      name={profile?.name} url={profile?.avatar_url || ''}/>
    <div style={{flex: 1}}>
      <textarea
        autoFocus
        value={replyText}
        onChange={e => setReplyText(e.target.value)}
        placeholder={
          post.comment_count === 0
            ? ZERO_COMMENT_PROMPTS[promptIndex % ZERO_COMMENT_PROMPTS.length]
            : getPrompts(post.tier1)[promptIndex % getPrompts(post.tier1).length]
        }
        rows={2}
        style={{
          width: '100%', fontSize: 13, lineHeight: 1.5,
          padding: '8px 12px', borderRadius: 12,
          border: `1.5px solid ${T.v}`, outline: 'none',
          fontFamily: 'inherit', resize: 'none',
          background: T.w,
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitQuickReply();
          }
          if (e.key === 'Escape') {
            setShowReplyBox(false);
            setReplyText('');
          }
        }}
      />
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        gap: 6, marginTop: 5,
      }}>
        <Btn onClick={() => {
          setShowReplyBox(false);
          setReplyText('');
        }}>
          Cancel
        </Btn>
        <Btn variant="s"
          onClick={submitQuickReply}
          disabled={!replyText.trim()}>
          Reply
        </Btn>
      </div>
    </div>
  </div>
)}
```

### Submit quick reply

```javascript
const submitQuickReply = async () => {
  if (!replyText.trim() || !user) return;
  const text = replyText.trim();
  setReplyText('');
  setShowReplyBox(false);

  // Optimistic: increment comment count locally
  // (parent feed will refresh on next load)

  await supabase.from('comments').insert({
    post_id:  post.id,
    user_id:  user.id,
    content:  text,
  });

  // Refresh top comment
  const { data } = await supabase
    .from('comments')
    .select('id, content, created_at, profiles(name, avatar_url, avatar_color)')
    .eq('post_id', post.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (data) setTopComment(data);

  // Rotate to a different prompt for next time
  setPromptIndex(i => i + 1);
};
```

---

## Change 5 — "X researchers from your field are discussing this"

Show a personalised relevance hook when the post's taxonomy matches
the viewer's professional identity or interests.

This uses `post.tier1` (the post's discipline) and `post.tier2`
(specialities) compared against the current user's `profile.identity_tier1`,
`profile.identity_tier2`, and `profile.topic_interests`.

Add this hook between the post content and the action bar,
only when there is a taxonomy match AND `comment_count > 0`:

```javascript
// Compute relevance — outside JSX
const isRelevantToUser = () => {
  if (!profile || !post.comment_count) return false;
  if (post.tier1 && post.tier1 === profile.identity_tier1) return true;
  if (post.tier2?.includes(profile.identity_tier2)) return true;
  const interests = new Set(
    (profile.topic_interests || []).map(t => t.toLowerCase())
  );
  if ((post.tier2 || []).some(t => interests.has(t.toLowerCase()))) return true;
  return false;
};

// Count how many commenters share the user's field
// (approximate — use comment count as proxy, label by tier1)
const getRelevanceLabel = () => {
  const count = post.comment_count;
  const field  = post.tier2?.[0] || post.tier1 || 'your field';
  if (count === 1) return `1 researcher in ${field} is discussing this`;
  if (count <= 5)  return `${count} researchers in ${field} are discussing this`;
  return `${count} researchers in ${field} are discussing this`;
};
```

```jsx
{isRelevantToUser() && (
  <div style={{
    fontSize: 11.5, color: T.v, fontWeight: 600,
    marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 5,
  }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill={T.v}>
      <circle cx="12" cy="12" r="10"/>
    </svg>
    {getRelevanceLabel()}
  </div>
)}
```

Place this just above the action bar, below the taxonomy chips.

---

## Apply same changes to GroupPostCard

Apply changes 1, 2, 3, and 4 to `src/groups/GroupPostCard.jsx`
using `group_post_comments` instead of `comments`.

Change 5 (relevance hook) is less relevant in a group context since
all members are already in the same field — skip it for GroupPostCard.

---

## What NOT to change

- The full comment thread expansion logic — unchanged
- Feed fetch queries — unchanged
- Profile, groups, library, projects screens
- Run `npm run build` when done

---

## Testing checklist

- [ ] Paper post: abstract truncates to 1 line, "↓ Read abstract"
      expands it, "↑ Collapse" collapses it
- [ ] Post with comments: top comment shows below action bar with
      avatar, name, truncated text, "+N more" count
- [ ] Post with comments: stacked commenter avatars appear next to
      comment count (desktop only)
- [ ] Post with 0 comments: reply box shows "Be the first to share
      your perspective" (or rotating zero-comment prompt)
- [ ] Post with comments: reply box shows taxonomy-aware prompt
      matching post.tier1
- [ ] Typing in reply box and pressing Enter submits the comment
- [ ] After submitting: top comment updates to show the new comment
- [ ] Prompt rotates to a different one after submitting
- [ ] Relevance hook appears on posts where post.tier1 matches
      the viewer's identity_tier1
- [ ] Relevance hook does NOT appear on posts with 0 comments
- [ ] On mobile: commenter avatars hidden, abstract still truncates
