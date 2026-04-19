# Task: Smart auto-tagging — length gate, confidence filter, DOI cache

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

The auto-tag Edge Function currently runs on every post regardless of
content length or type, wasting API calls on short posts where tagging
produces noise. This task adds three optimisations:

1. **Length gate** — skip tagging for regular posts under 100 chars
2. **Confidence filter** — only save tags when Claude returns high/medium
   confidence; discard low-confidence results silently
3. **DOI cache** — reuse existing taxonomy for papers already tagged by DOI

Changes are needed in:
- `supabase/functions/auto-tag/index.ts` — add confidence to response
- `src/screens/NewPostScreen.jsx` — add all three gates before invoking
- `src/groups/GroupNewPost.jsx` — same gates applied identically

No SQL migration needed.

---

## Part 1 — Update auto-tag Edge Function

In `supabase/functions/auto-tag/index.ts`, update the Claude prompt
to also return a confidence score, and update the response parsing.

### Updated prompt

Replace the existing prompt string with:

```typescript
const prompt = `Classify this research content using the taxonomy below.

TAXONOMY:
${taxonomyStr}

CONTENT TO CLASSIFY:
${text}

Return ONLY valid JSON — no markdown, no explanation:
{
  "tier1": "exact Tier 1 name from the taxonomy",
  "tier2": ["exact Tier 2 name", "exact Tier 2 name"],
  "tags": ["specific_term1", "specific_term2", "specific_term3"],
  "confidence": "high"
}

Rules:
- tier1: exactly ONE value, must be an exact key from the taxonomy
- tier2: 1 to 3 values, must be exact names from that tier1's list
- tags: 3 to 5 hyper-specific terms — gene names, drug names, protein
  names, specific pathways, specific conditions — lowercase_with_underscores
- confidence: "high" if the content clearly belongs to one discipline,
  "medium" if reasonably clear but some ambiguity,
  "low" if the content is too short, too vague, or off-topic for
  the taxonomy (e.g. a test post, a greeting, a very short comment)
- If confidence is "low", still return your best guess for the other
  fields but the caller will discard the result`;
```

### Updated response parsing

```typescript
let result = { tier1: "", tier2: [], tags: [], confidence: "low" };
try {
  const parsed = JSON.parse(clean);

  result.confidence = ['high','medium','low'].includes(parsed.confidence)
    ? parsed.confidence : 'low';

  // Only populate taxonomy fields if confidence is not low
  if (result.confidence !== 'low') {
    result.tier1 = Object.keys(TAXONOMY).includes(parsed.tier1)
      ? parsed.tier1 : "";
    result.tier2 = Array.isArray(parsed.tier2)
      ? parsed.tier2.filter((t: string) =>
          !result.tier1 || TAXONOMY[result.tier1]?.includes(t)
        ).slice(0, 3)
      : [];
    result.tags = Array.isArray(parsed.tags)
      ? parsed.tags.slice(0, 5) : [];
  }
} catch(e) {
  console.error("Parse error:", clean.slice(0, 200));
}

console.log(`Tagged: confidence="${result.confidence}" tier1="${result.tier1}" tier2=[${result.tier2.join(", ")}]`);
```

The Edge Function now always returns a `confidence` field.
Deploy after editing: `npx supabase functions deploy auto-tag`

---

## Part 2 — DOI cache helper

Add a helper function that checks whether a paper DOI has already
been tagged in the database. If found, reuse the existing tags
without calling the Edge Function.

Add this to `src/lib/utils.js` (append, do not replace anything):

```javascript
/**
 * Check if a paper DOI has already been classified by the auto-tagger.
 * Returns {tier1, tier2, tags} if found, null if not.
 * Uses the publications table as the cache — if any user has published
 * this paper and it was tagged, reuse those tags.
 */
export async function getCachedTagsByDoi(doi, supabase) {
  if (!doi?.trim()) return null;
  const cleanDoi = doi.trim().toLowerCase();

  // Check posts table first (most recent tagging)
  const { data: post } = await supabase
    .from('posts')
    .select('tier1, tier2, tags')
    .eq('paper_doi', cleanDoi)
    .not('tier1', 'is', null)
    .neq('tier1', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (post?.tier1) {
    console.log(`Auto-tag cache hit for DOI: ${cleanDoi}`);
    return { tier1: post.tier1, tier2: post.tier2 || [], tags: post.tags || [] };
  }

  // Check publications table as fallback
  const { data: pub } = await supabase
    .from('publications')
    .select('tier1, tier2, tags')
    .eq('doi', cleanDoi)
    .not('tier1', 'is', null)
    .neq('tier1', '')
    .limit(1)
    .single();

  if (pub?.tier1) {
    console.log(`Auto-tag cache hit in publications for DOI: ${cleanDoi}`);
    return { tier1: pub.tier1, tier2: pub.tier2 || [], tags: pub.tags || [] };
  }

  return null;
}
```

---

## Part 3 — Update NewPostScreen

In `src/screens/NewPostScreen.jsx`, find the function that handles
auto-tagging after a post is published. This is typically called
after the post is inserted and has an ID.

Replace the existing auto-tag invocation with this smart version:

```javascript
import { getCachedTagsByDoi } from '../lib/utils';

/**
 * Smart auto-tagging with three gates:
 * 1. Length gate — skip regular posts under 100 chars
 * 2. DOI cache — reuse existing tags for known papers
 * 3. Confidence filter — discard low-confidence API results
 */
const smartAutoTag = async (postId, postType, content, paperDoi,
  paperTitle, paperAbstract, paperJournal) => {

  // ── Gate 1: Length check for regular posts ──────────────────────────
  if (postType !== 'paper') {
    const textContent = (content || '').replace(/<[^>]+>/g, '').trim();
    if (textContent.length < 100) {
      console.log('Auto-tag skipped: content too short');
      return; // skip entirely — no API call, no tags saved
    }
  }

  // ── Gate 2: DOI cache check for paper posts ─────────────────────────
  if (postType === 'paper' && paperDoi) {
    const cached = await getCachedTagsByDoi(paperDoi, supabase);
    if (cached) {
      // Reuse cached tags — no API call needed
      await supabase.from('posts').update({
        tier1: cached.tier1,
        tier2: cached.tier2,
        tags:  cached.tags,
      }).eq('id', postId);
      console.log('Auto-tag: used cached tags from DOI');
      return;
    }
  }

  // ── Gate 3: Call Edge Function + confidence filter ──────────────────
  try {
    const { data, error } = await supabase.functions.invoke('auto-tag', {
      body: {
        content,
        paperTitle,
        paperAbstract,
        paperJournal,
      },
    });

    if (error) {
      console.warn('Auto-tag edge function error:', error);
      return;
    }

    // Discard low-confidence results entirely
    if (!data || data.confidence === 'low') {
      console.log('Auto-tag skipped: low confidence result');
      return;
    }

    // Save medium/high confidence results
    if (data.tier1 || data.tags?.length) {
      await supabase.from('posts').update({
        tier1: data.tier1 || '',
        tier2: data.tier2 || [],
        tags:  data.tags  || [],
      }).eq('id', postId);
      console.log(`Auto-tag saved: confidence=${data.confidence}`);
    }
  } catch(e) {
    // Auto-tagging is best-effort — never block or throw
    console.warn('Auto-tag failed silently:', e.message);
  }
};
```

Replace the existing auto-tag call in the publish handler with:

```javascript
// Fire and forget — do not await, never blocks publish
smartAutoTag(
  newPostId,
  postType,
  content,
  paperDoi,
  paperTitle,
  paperAbstract,
  paperJournal,
).catch(console.warn);
```

---

## Part 4 — Update GroupNewPost

In `src/groups/GroupNewPost.jsx`, apply the exact same pattern.

The only difference is the table name — update to use `group_posts`
instead of `posts`:

```javascript
// Same smartAutoTag function, but final save uses group_posts:
await supabase.from('group_posts').update({
  tier1: data.tier1 || '',
  tier2: data.tier2 || [],
  tags:  data.tags  || [],
}).eq('id', postId);
```

You can either:
- Copy the function with the table name changed, or
- Accept a `tableName` parameter: `smartAutoTag(..., 'group_posts')`

Either approach is fine — choose whichever is cleaner after reading
the existing code.

---

## Part 5 — Add tier1/tier2 columns to publications table (for cache)

The DOI cache checks `publications.tier1` and `publications.tier2`
but these columns may not exist yet. Add them:

```sql
-- Run in Supabase SQL Editor:
alter table publications
  add column if not exists tier1 text    default '',
  add column if not exists tier2 text[]  default '{}',
  add column if not exists tags  text[]  default '{}';
```

When a paper post is published and tagged, also update the matching
publication record if it exists:

```javascript
// After saving tags to the post, update the matching publication:
if (postType === 'paper' && paperDoi && data?.tier1) {
  supabase.from('publications')
    .update({ tier1: data.tier1, tier2: data.tier2, tags: data.tags })
    .eq('user_id', user.id)
    .eq('doi', paperDoi.toLowerCase())
    .then(() => console.log('Publication tags updated'));
}
```

This means the next time anyone shares the same paper, the cache
will have a hit immediately.

---

## What NOT to change

- The auto-tag Edge Function's taxonomy definition — unchanged
- Post creation logic — tags are still best-effort, never blocking
- Feed ranking — still reads tier1/tier2/tags from posts, unchanged
- Run `npm run build` and deploy Edge Function when done

---

## Deployment order

1. Run the SQL for publications columns in Supabase SQL Editor
2. Deploy updated Edge Function:
   `npx supabase functions deploy auto-tag`
3. Deploy frontend:
   `git add . && git commit -m "Smart auto-tagging gates" && git push`

---

## Testing checklist

- [ ] Post a short message (< 100 chars) — verify no tags appear,
      no Edge Function call in Supabase logs
- [ ] Post a long text (≥ 100 chars) — verify tags appear if
      confidence is high/medium
- [ ] Share a paper with a known DOI — tags appear
- [ ] Share the same paper DOI again — check Supabase logs show
      "cache hit", no Edge Function call
- [ ] Verify a deliberately vague/short paper post returns
      confidence=low and no tags are saved
- [ ] Check Supabase Edge Function invocation count in dashboard
      decreases compared to before
