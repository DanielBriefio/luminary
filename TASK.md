# Task: Hybrid Taxonomy System — Full Implementation

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task upgrades the entire tagging and topic system from flat
hyper-specific tags to a two-tier taxonomy. It covers:

1. Taxonomy definition in constants.js
2. SQL migration for new columns
3. Auto-tag Edge Function upgrade
4. Post card UI with visual hierarchy
5. Professional identity badge on profiles
6. Onboarding wizard update
7. Feed filtering by taxonomy
8. Explore — replace hardcoded chips with taxonomy
9. TopicInterestsPicker — replace hardcoded fallback with Tier 2 list
10. Profile research interests — grouped display

---

## Step 1 — SQL migration

Create `migration_taxonomy.sql` in the project root:

```sql
-- Add taxonomy fields to posts
alter table posts
  add column if not exists tier1 text    default '',
  add column if not exists tier2 text[]  default '{}';

-- Add professional identity to profiles
alter table profiles
  add column if not exists identity_tier1 text default '',
  add column if not exists identity_tier2 text default '';

-- Refresh posts_with_meta view to include new fields
drop view if exists posts_with_meta;
create view posts_with_meta as
select
  p.*,
  pr.name               as author_name,
  pr.title              as author_title,
  pr.institution        as author_institution,
  pr.avatar_color       as author_avatar,
  pr.avatar_url         as author_avatar_url,
  pr.identity_tier1     as author_identity_tier1,
  pr.identity_tier2     as author_identity_tier2,
  (select count(*) from likes    l where l.post_id = p.id) as like_count,
  (select count(*) from comments c where c.post_id = p.id) as comment_count,
  (select count(*) from reposts  r where r.post_id = p.id) as repost_count
from posts p
join profiles pr on pr.id = p.user_id;

grant select on posts_with_meta to anon, authenticated;

-- Indexes for taxonomy filtering
create index if not exists idx_posts_tier1 on posts(tier1);
create index if not exists idx_posts_tier2 on posts using gin(tier2);
```

Tell the user to run this in Supabase SQL Editor before testing.

---

## Step 2 — Add TAXONOMY to src/lib/constants.js

Append to the existing constants file — do not replace anything:

```javascript
// ── TAXONOMY ──────────────────────────────────────────────────────────────────

export const TAXONOMY = {
  "Clinical Medicine": [
    "Cardiology & Cardiovascular Medicine",
    "Oncology & Hematology",
    "Neurology & Neuroscience",
    "Endocrinology & Metabolism",
    "Infectious Disease & Microbiology",
    "Gastroenterology & Hepatology",
    "Rheumatology & Immunology",
    "Pulmonology & Critical Care",
    "Nephrology & Urology",
    "Dermatology",
    "Ophthalmology",
    "Psychiatry & Mental Health",
    "Pediatrics & Neonatology",
    "Obstetrics & Gynecology",
    "Geriatrics & Palliative Care",
    "Emergency & Trauma Medicine",
    "Anesthesiology & Pain Medicine",
    "Radiology & Medical Imaging",
    "Rehabilitation & Sports Medicine",
    "Cardiac & Thoracic Surgery",
    "Neurosurgery",
    "Orthopaedic & Trauma Surgery",
    "General & Gastrointestinal Surgery",
    "Vascular Surgery",
    "Transplant Surgery",
    "Plastic & Reconstructive Surgery",
    "Minimally Invasive & Robotic Surgery"
  ],
  "Basic Life Sciences": [
    "Molecular Biology & Genetics",
    "Cell Biology",
    "Biochemistry & Structural Biology",
    "Immunology & Inflammation",
    "Neurobiology",
    "Microbiology & Virology",
    "Cancer Biology",
    "Developmental Biology & Stem Cells",
    "Physiology",
    "Epigenetics & Gene Regulation",
    "Proteomics & Metabolomics",
    "Genomics & Sequencing",
    "Chemical Biology",
    "Plant & Environmental Biology"
  ],
  "Pharmacology & Therapeutics": [
    "Drug Discovery & Medicinal Chemistry",
    "Pharmacokinetics & Pharmacodynamics",
    "Toxicology & Safety",
    "Clinical Pharmacology",
    "Biologics & Antibody Engineering",
    "Gene & Cell Therapy",
    "Small Molecule Drug Development",
    "Vaccines & Immunotherapeutics",
    "Precision Medicine & Biomarkers",
    "Formulation & Drug Delivery",
    "Pharmacogenomics",
    "Rare Disease & Orphan Drugs"
  ],
  "Public Health & Epidemiology": [
    "Epidemiology & Disease Surveillance",
    "Biostatistics & Research Methods",
    "Global Health & Tropical Medicine",
    "Health Policy & Systems",
    "Environmental & Occupational Health",
    "Nutritional Science & Dietetics",
    "Mental Health & Behavioural Science",
    "Infectious Disease Epidemiology",
    "Cancer Epidemiology",
    "Chronic Disease Prevention",
    "Health Economics & Outcomes",
    "Social Determinants of Health"
  ],
  "Bioengineering & Informatics": [
    "Bioinformatics & Computational Biology",
    "Artificial Intelligence & Machine Learning in Health",
    "Biomedical Engineering",
    "Imaging & Signal Processing",
    "Genomics & Sequencing Technology",
    "Synthetic Biology",
    "Robotics & Surgical Technology Research",
    "Health Data Science",
    "Nanotechnology & Biomaterials",
    "Digital Therapeutics Research"
  ],
  "Pharmaceutical & Biotech Industry": [
    "Medical Affairs",
    "Health Economics & Outcomes Research (HEOR)",
    "Real-World Evidence & Data Science",
    "Regulatory Affairs & Drug Approval",
    "Market Access & Pricing",
    "Pharmacovigilance & Drug Safety",
    "Medical Communications & Publishing",
    "Clinical Operations & Trial Management",
    "Translational Medicine",
    "Business Development & Licensing",
    "Medical Information",
    "Patient Advocacy & Engagement"
  ],
  "Medical Devices & Diagnostics Industry": [
    "Device Design & Engineering",
    "In Vitro Diagnostics (IVD)",
    "Medical Imaging Systems",
    "Surgical & Interventional Devices",
    "Digital Health Products & Software as Medical Device (SaMD)",
    "Wearables & Remote Patient Monitoring",
    "Regulatory Affairs for Devices (MDR / FDA 510k / PMA)",
    "Clinical Evidence & Post-Market Surveillance",
    "Artificial Intelligence in Diagnostics",
    "Point-of-Care & Rapid Testing",
    "Cardiovascular Devices",
    "Orthopaedic & Implantable Devices"
  ],
  "Medical Education & Research Methods": [
    "Medical & Science Education",
    "Systematic Review & Meta-Analysis",
    "Clinical Research Methodology",
    "Evidence-Based Medicine",
    "Scientific Writing & Publishing",
    "Bioethics & Research Integrity",
    "Simulation & Training Technology",
    "Continuing Medical Education",
    "Peer Review & Journal Editing",
    "Open Science & Data Sharing"
  ]
};

export const TIER1_LIST = Object.keys(TAXONOMY);

// All Tier 2 specialities as a flat array — used as suggestion pool
export const ALL_TIER2 = Object.values(TAXONOMY).flat();

// Get Tier 2 options for a given Tier 1
export const getTier2 = (tier1) => TAXONOMY[tier1] || [];

// Find which Tier 1 a Tier 2 belongs to
export const getTier1ForTier2 = (tier2) =>
  TIER1_LIST.find(t1 => TAXONOMY[t1].includes(tier2)) || null;
```

---

## Step 3 — Upgrade auto-tag Edge Function

Replace `supabase/functions/auto-tag/index.ts` entirely:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAXONOMY: Record<string, string[]> = {
  "Clinical Medicine": ["Cardiology & Cardiovascular Medicine","Oncology & Hematology","Neurology & Neuroscience","Endocrinology & Metabolism","Infectious Disease & Microbiology","Gastroenterology & Hepatology","Rheumatology & Immunology","Pulmonology & Critical Care","Nephrology & Urology","Dermatology","Ophthalmology","Psychiatry & Mental Health","Pediatrics & Neonatology","Obstetrics & Gynecology","Geriatrics & Palliative Care","Emergency & Trauma Medicine","Anesthesiology & Pain Medicine","Radiology & Medical Imaging","Rehabilitation & Sports Medicine","Cardiac & Thoracic Surgery","Neurosurgery","Orthopaedic & Trauma Surgery","General & Gastrointestinal Surgery","Vascular Surgery","Transplant Surgery","Plastic & Reconstructive Surgery","Minimally Invasive & Robotic Surgery"],
  "Basic Life Sciences": ["Molecular Biology & Genetics","Cell Biology","Biochemistry & Structural Biology","Immunology & Inflammation","Neurobiology","Microbiology & Virology","Cancer Biology","Developmental Biology & Stem Cells","Physiology","Epigenetics & Gene Regulation","Proteomics & Metabolomics","Genomics & Sequencing","Chemical Biology","Plant & Environmental Biology"],
  "Pharmacology & Therapeutics": ["Drug Discovery & Medicinal Chemistry","Pharmacokinetics & Pharmacodynamics","Toxicology & Safety","Clinical Pharmacology","Biologics & Antibody Engineering","Gene & Cell Therapy","Small Molecule Drug Development","Vaccines & Immunotherapeutics","Precision Medicine & Biomarkers","Formulation & Drug Delivery","Pharmacogenomics","Rare Disease & Orphan Drugs"],
  "Public Health & Epidemiology": ["Epidemiology & Disease Surveillance","Biostatistics & Research Methods","Global Health & Tropical Medicine","Health Policy & Systems","Environmental & Occupational Health","Nutritional Science & Dietetics","Mental Health & Behavioural Science","Infectious Disease Epidemiology","Cancer Epidemiology","Chronic Disease Prevention","Health Economics & Outcomes","Social Determinants of Health"],
  "Bioengineering & Informatics": ["Bioinformatics & Computational Biology","Artificial Intelligence & Machine Learning in Health","Biomedical Engineering","Imaging & Signal Processing","Genomics & Sequencing Technology","Synthetic Biology","Robotics & Surgical Technology Research","Health Data Science","Nanotechnology & Biomaterials","Digital Therapeutics Research"],
  "Pharmaceutical & Biotech Industry": ["Medical Affairs","Health Economics & Outcomes Research (HEOR)","Real-World Evidence & Data Science","Regulatory Affairs & Drug Approval","Market Access & Pricing","Pharmacovigilance & Drug Safety","Medical Communications & Publishing","Clinical Operations & Trial Management","Translational Medicine","Business Development & Licensing","Medical Information","Patient Advocacy & Engagement"],
  "Medical Devices & Diagnostics Industry": ["Device Design & Engineering","In Vitro Diagnostics (IVD)","Medical Imaging Systems","Surgical & Interventional Devices","Digital Health Products & Software as Medical Device (SaMD)","Wearables & Remote Patient Monitoring","Regulatory Affairs for Devices (MDR / FDA 510k / PMA)","Clinical Evidence & Post-Market Surveillance","Artificial Intelligence in Diagnostics","Point-of-Care & Rapid Testing","Cardiovascular Devices","Orthopaedic & Implantable Devices"],
  "Medical Education & Research Methods": ["Medical & Science Education","Systematic Review & Meta-Analysis","Clinical Research Methodology","Evidence-Based Medicine","Scientific Writing & Publishing","Bioethics & Research Integrity","Simulation & Training Technology","Continuing Medical Education","Peer Review & Journal Editing","Open Science & Data Sharing"]
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { content, paperTitle, paperAbstract, paperJournal } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const text = [
      paperTitle    && `Title: ${paperTitle}`,
      paperJournal  && `Journal: ${paperJournal}`,
      paperAbstract && `Abstract: ${paperAbstract}`,
      content       && `Post: ${content}`,
    ].filter(Boolean).join("\n").slice(0, 2000);

    const taxonomyStr = Object.entries(TAXONOMY)
      .map(([t1, t2s]) => `${t1}:\n  ${t2s.join("\n  ")}`)
      .join("\n\n");

    const prompt = `Classify this research content using the taxonomy below.

TAXONOMY:
${taxonomyStr}

CONTENT TO CLASSIFY:
${text}

Return ONLY valid JSON — no markdown, no explanation:
{
  "tier1": "exact Tier 1 name from the taxonomy",
  "tier2": ["exact Tier 2 name", "exact Tier 2 name"],
  "tags": ["specific_term1", "specific_term2", "specific_term3"]
}

Rules:
- tier1: exactly ONE value, must be an exact key from the taxonomy
- tier2: 1 to 3 values, must be exact names from that tier1's list
- tags: 3 to 5 hyper-specific terms — gene names, drug names, protein names,
  specific pathways, specific conditions — lowercase_with_underscores, no # prefix
- These granular tags are for specialist discovery, so be specific
- If content is ambiguous, make your best guess`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API ${response.status}`);

    const data  = await response.json();
    const raw   = data.content?.[0]?.text?.trim() || "{}";
    const clean = raw.replace(/```json?/g, "").replace(/```/g, "").trim();

    let result = { tier1: "", tier2: [], tags: [] };
    try {
      const parsed = JSON.parse(clean);
      // Validate tier1 is a real taxonomy key
      result.tier1 = Object.keys(TAXONOMY).includes(parsed.tier1) ? parsed.tier1 : "";
      // Validate tier2 values belong to the selected tier1
      result.tier2 = Array.isArray(parsed.tier2)
        ? parsed.tier2.filter((t: string) => !result.tier1 || TAXONOMY[result.tier1]?.includes(t)).slice(0, 3)
        : [];
      result.tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
    } catch(e) {
      console.error("Parse error:", clean.slice(0, 200));
    }

    console.log(`Tagged: tier1="${result.tier1}" tier2=[${result.tier2.join(", ")}] tags=[${result.tags.join(", ")}]`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("auto-tag error:", err.message);
    return new Response(
      JSON.stringify({ tier1: "", tier2: [], tags: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

---

## Step 4 — Save tier1/tier2 in NewPostScreen

In `src/screens/NewPostScreen.jsx`, find where the auto-tag result is
handled after publish. Update to save tier1 and tier2:

```javascript
// After receiving tag result from Edge Function:
const { tier1 = '', tier2 = [], tags: autoTags = [] } = tagResult;
const allTags = [...new Set([...manualTags, ...autoTags])].slice(0, 10);

await supabase.from('posts').update({
  tags:  allTags,
  tier1: tier1,
  tier2: tier2,
}).eq('id', newPostId);
```

---

## Step 5 — Post card visual hierarchy

In `src/feed/PostCard.jsx`, update the tag display section to show
three visual layers. Replace the existing flat tag chip rendering:

```jsx
import { T } from '../lib/constants';

{/* Layer 1 — Tier 1 discipline badge */}
{post.tier1 && (
  <span style={{
    fontSize:10.5, fontWeight:600,
    padding:'2px 9px', borderRadius:20,
    background:'#f1f0ff', color:'#5b52cc',
    border:'1px solid rgba(108,99,255,.15)',
    display:'inline-block', marginBottom:5,
  }}>
    {post.tier1}
  </span>
)}

{/* Layer 2 — Tier 2 speciality chips */}
{post.tier2?.length > 0 && (
  <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:5}}>
    {post.tier2.map(t => (
      <span key={t}
        onClick={() => onTagClick && onTagClick(t)}
        style={{
          fontSize:11.5, fontWeight:600,
          padding:'3px 10px', borderRadius:20,
          background:T.v2, color:T.v,
          border:`1px solid rgba(108,99,255,.2)`,
          cursor:'pointer',
        }}>
        {t}
      </span>
    ))}
  </div>
)}

{/* Layer 3 — granular tags (keep visible, smaller/muted) */}
{post.tags?.length > 0 && (
  <div style={{display:'flex', gap:5, flexWrap:'wrap'}}>
    {post.tags.map(tag => (
      <span key={tag}
        onClick={() => onTagClick && onTagClick(tag)}
        style={{
          fontSize:11, color:T.mu,
          padding:'2px 8px', borderRadius:20,
          background:T.s2, border:`1px solid ${T.bdr}`,
          cursor:'pointer',
        }}>
        #{tag}
      </span>
    ))}
  </div>
)}
```

---

## Step 6 — Professional identity on profiles

### ProfileScreen edit mode

In `src/profile/ProfileScreen.jsx`, add identity fields to the edit form.
Import `TAXONOMY, TIER1_LIST, getTier2` from `../lib/constants`.

Add these fields to the edit section, above the bio field:

```jsx
{/* Tier 1 */}
<div style={{marginBottom:12}}>
  <label style={{display:'block', fontSize:12, fontWeight:600,
    color:T.text, marginBottom:4}}>
    Primary discipline
  </label>
  <select value={form.identity_tier1 || ''}
    onChange={e => setForm(f => ({
      ...f, identity_tier1: e.target.value, identity_tier2: ''
    }))}
    style={{width:'100%', background:T.s2, border:`1.5px solid ${T.bdr}`,
      borderRadius:9, padding:'8px 13px', fontSize:13,
      fontFamily:'inherit', outline:'none', color:T.text}}>
    <option value="">Select your field...</option>
    {TIER1_LIST.map(t1 => <option key={t1} value={t1}>{t1}</option>)}
  </select>
</div>

{/* Tier 2 — only shown when Tier 1 is selected */}
{form.identity_tier1 && (
  <div style={{marginBottom:12}}>
    <label style={{display:'block', fontSize:12, fontWeight:600,
      color:T.text, marginBottom:4}}>
      Speciality
    </label>
    <select value={form.identity_tier2 || ''}
      onChange={e => setForm(f => ({...f, identity_tier2: e.target.value}))}
      style={{width:'100%', background:T.s2, border:`1.5px solid ${T.bdr}`,
        borderRadius:9, padding:'8px 13px', fontSize:13,
        fontFamily:'inherit', outline:'none', color:T.text}}>
      <option value="">Select speciality...</option>
      {getTier2(form.identity_tier1).map(t2 =>
        <option key={t2} value={t2}>{t2}</option>
      )}
    </select>
  </div>
)}
```

Include `identity_tier1` and `identity_tier2` in the save handler.

### Identity badge in profile view mode

Show below the name/title, before the bio:

```jsx
{(profile.identity_tier1 || profile.identity_tier2) && (
  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:10}}>
    {profile.identity_tier1 && (
      <span style={{
        fontSize:11.5, fontWeight:700,
        padding:'4px 12px', borderRadius:20,
        background:'#f1f0ff', color:'#5b52cc',
        border:'1px solid rgba(108,99,255,.2)',
      }}>
        {profile.identity_tier1}
      </span>
    )}
    {profile.identity_tier2 && (
      <span style={{
        fontSize:11.5, fontWeight:600,
        padding:'4px 12px', borderRadius:20,
        background:T.v2, color:T.v,
        border:`1px solid rgba(108,99,255,.25)`,
      }}>
        {profile.identity_tier2}
      </span>
    )}
  </div>
)}
```

Also show this badge on:
- The public profile page (`/p/:slug`)
- UserProfileScreen (viewing another user's profile)
- PostCard author line (use `post.author_identity_tier2` from the view)

---

## Step 7 — Onboarding wizard update

In `src/screens/OnboardingScreen.jsx`, update Step 1 to collect
professional identity (Tier 1 + Tier 2) before research interests.

### New Step 1 — Professional identity

```jsx
import { TAXONOMY, TIER1_LIST, getTier2 } from '../lib/constants';

const [identityTier1, setIdentityTier1] = useState('');
const [identityTier2, setIdentityTier2] = useState('');

// Step 1 UI:
<div>
  <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>
    What is your primary field?
  </div>
  <div style={{fontSize:13, color:T.mu, marginBottom:20}}>
    This appears as a badge on your profile. Pick your main discipline.
  </div>

  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16}}>
    {TIER1_LIST.map(t1 => (
      <button key={t1}
        onClick={() => { setIdentityTier1(t1); setIdentityTier2(''); }}
        style={{
          padding:'10px 12px', borderRadius:10, cursor:'pointer',
          fontFamily:'inherit', textAlign:'left', fontSize:12,
          fontWeight: identityTier1===t1 ? 700 : 500,
          border:`2px solid ${identityTier1===t1 ? T.v : T.bdr}`,
          background: identityTier1===t1 ? T.v2 : T.w,
          color: identityTier1===t1 ? T.v : T.text,
          lineHeight:1.3,
        }}>
        {t1}
      </button>
    ))}
  </div>

  {identityTier1 && (
    <div>
      <label style={{display:'block', fontSize:12.5, fontWeight:600,
        marginBottom:6}}>
        Speciality within {identityTier1}:
      </label>
      <select value={identityTier2}
        onChange={e => setIdentityTier2(e.target.value)}
        style={{width:'100%', background:T.s2, border:`1.5px solid ${T.bdr}`,
          borderRadius:9, padding:'10px 13px', fontSize:13,
          fontFamily:'inherit', outline:'none'}}>
        <option value="">Select your speciality...</option>
        {getTier2(identityTier1).map(t2 =>
          <option key={t2} value={t2}>{t2}</option>
        )}
      </select>
    </div>
  )}
</div>
```

Next button enabled when BOTH identityTier1 AND identityTier2 are set.

### Step 2 — Research interests (unchanged UI, updated intro text)

```
What topics do you want to follow?
Your identity says who you are. Your interests shape your feed.
Browse by discipline or add your own specific topics.
```

### Save identity on completion

```javascript
await supabase.from('profiles').update({
  identity_tier1:      identityTier1,
  identity_tier2:      identityTier2,
  topic_interests:     selectedTopics,
  onboarding_completed: true,
}).eq('id', user.id);
```

---

## Step 8 — Feed filtering with taxonomy scoring

In `src/feed/FeedScreen.jsx`, update the For You personalisation sort:

```javascript
if (feedMode === 'personalised') {
  const userTier1     = profile?.identity_tier1 || '';
  const userTier2     = profile?.identity_tier2 || '';
  const userInterests = new Set(
    (profile?.topic_interests || []).map(t => t.toLowerCase())
  );

  data.sort((a, b) => {
    const score = (post) => {
      let s = 0;
      if (post.tier1 === userTier1)            s += 3; // discipline match
      if (post.tier2?.includes(userTier2))     s += 5; // speciality match (strongest)
      const topics = [...(post.tags||[]), ...(post.tier2||[])].map(t=>t.toLowerCase());
      if (topics.some(t => userInterests.has(t))) s += 2; // interest match
      return s;
    };
    return score(b) - score(a);
  });
}
```

---

## Step 9 — Explore: replace hardcoded chips with taxonomy

In `src/screens/ExploreScreen.jsx` (Posts tab):

Remove all hardcoded topic chip arrays entirely.

Replace with two-level taxonomy navigation:

```jsx
import { TAXONOMY, TIER1_LIST } from '../lib/constants';

const [tier1Filter, setTier1Filter] = useState('');

{/* Tier 1 discipline filter */}
<div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:10}}>
  {TIER1_LIST.map(t1 => (
    <button key={t1}
      onClick={() => setTier1Filter(tier1Filter === t1 ? '' : t1)}
      style={{
        padding:'5px 13px', borderRadius:20, cursor:'pointer',
        fontSize:12, fontWeight:600, fontFamily:'inherit',
        border:`1.5px solid ${tier1Filter===t1 ? T.v : T.bdr}`,
        background: tier1Filter===t1 ? T.v2 : T.w,
        color: tier1Filter===t1 ? T.v : T.mu,
        transition:'all .12s',
      }}>
      {t1}
    </button>
  ))}
  {tier1Filter && (
    <button onClick={() => setTier1Filter('')}
      style={{padding:'5px 10px', borderRadius:20, fontSize:11.5,
        fontWeight:600, fontFamily:'inherit', cursor:'pointer',
        border:`1px solid ${T.bdr}`, background:T.s2, color:T.mu}}>
      ✕ Clear
    </button>
  )}
</div>

{/* Tier 2 chips */}
{!tier1Filter ? (
  // All groups shown collapsed — click Tier 1 above to expand
  <div style={{fontSize:12, color:T.mu, padding:'8px 0'}}>
    Select a discipline above to browse specialities, or search below.
  </div>
) : (
  <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:12}}>
    {TAXONOMY[tier1Filter].map(t2 => (
      <button key={t2}
        onClick={() => { setSearchQuery(t2); /* trigger search */ }}
        style={{
          padding:'4px 11px', borderRadius:20, cursor:'pointer',
          fontSize:11.5, fontFamily:'inherit', fontWeight:500,
          border:`1px solid rgba(108,99,255,.2)`,
          background:T.v2, color:T.v,
        }}>
        {t2}
      </button>
    ))}
  </div>
)}
```

When tier1Filter is active, add `.eq('tier1', tier1Filter)` to the
Supabase post search query.

Clicking a Tier 2 chip pre-fills the search input and triggers a search.

---

## Step 10 — Replace hardcoded fallback in TopicInterestsPicker

In `src/components/TopicInterestsPicker.jsx` (or `src/lib/useSuggestedTopics.js`),
find the hardcoded fallback array and replace it with ALL_TIER2:

```javascript
// REMOVE this hardcoded array:
// ['GLP1','CRISPR','CryoEM','OpenScience', ...etc]

// REPLACE with:
import { ALL_TIER2 } from '../lib/constants';

// In the fallback:
setSuggested(ALL_TIER2.filter(t => !currentInterests.includes(t)));
```

This means:
- When post tags exist in the DB → suggest most-used post tags (existing behaviour)
- When no post tags yet → suggest all 109 Tier 2 specialities as options
- Either way, no hardcoded list anywhere

---

## Step 11 — Profile research interests grouped display

In `src/profile/ProfileScreen.jsx`, update the collapsed (read-only)
Research Interests view to group interests by their parent Tier 1:

```javascript
import { TAXONOMY, TIER1_LIST, getTier1ForTier2 } from '../lib/constants';

// Group interests by tier1
const groupedInterests = (interests = []) => {
  const groups = {};
  const custom = []; // free-text interests not in taxonomy
  interests.forEach(interest => {
    const tier1 = getTier1ForTier2(interest);
    if (tier1) {
      if (!groups[tier1]) groups[tier1] = [];
      groups[tier1].push(interest);
    } else {
      custom.push(interest);
    }
  });
  return { groups, custom };
};

const { groups, custom } = groupedInterests(profile?.topic_interests || []);

// Render:
{Object.entries(groups).map(([t1, interests]) => (
  <div key={t1} style={{marginBottom:10}}>
    <div style={{fontSize:10.5, fontWeight:700, color:T.mu,
      textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5}}>
      {t1}
    </div>
    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
      {interests.map(t => (
        <span key={t} style={{
          padding:'4px 12px', borderRadius:20, fontSize:12.5,
          background:T.v2, color:T.v,
          border:`1px solid rgba(108,99,255,.2)`, fontWeight:600,
        }}>
          {t}
        </span>
      ))}
    </div>
  </div>
))}

{/* Free-text custom interests that aren't in the taxonomy */}
{custom.length > 0 && (
  <div>
    <div style={{fontSize:10.5, fontWeight:700, color:T.mu,
      textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5}}>
      Other interests
    </div>
    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
      {custom.map(t => (
        <span key={t} style={{
          padding:'4px 12px', borderRadius:20, fontSize:12.5,
          background:T.s2, color:T.mu,
          border:`1px solid ${T.bdr}`, fontWeight:500,
        }}>
          #{t}
        </span>
      ))}
    </div>
  </div>
)}
```

---

## Deployment order

1. Run `migration_taxonomy.sql` in Supabase SQL Editor
2. Deploy Edge Function: `npx supabase functions deploy auto-tag`
3. Deploy frontend: `git add . && git commit -m "Hybrid taxonomy system" && git push`

---

## What NOT to change

- Granular tags (#gene_name etc) — keep visible on post cards
- Manual hashtag input on new posts — user can still add their own
- Messages, groups, notifications, invite system
- Run `npm run build` before deploying

---

## Testing checklist

- [ ] Create a cardiology post → verify tier1="Clinical Medicine",
      tier2 contains "Cardiology & Cardiovascular Medicine"
- [ ] Create a medical affairs post → verify tier1="Pharmaceutical &
      Biotech Industry", tier2 contains "Medical Affairs"
- [ ] Edit profile → set identity, verify badge shows on profile view
- [ ] Complete onboarding on a new account → Step 1 shows Tier 1 grid
- [ ] Explore → select "Clinical Medicine" → see only clinical Tier 2 chips
- [ ] TopicInterestsPicker → with no posts in DB, verify 109 taxonomy
      options appear as suggestions (not the old hardcoded list)
