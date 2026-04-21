# Task: Phase C1 — Work Mode Foundation

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

Luminary is broadening to serve the full evidence circle: researchers who
create science, clinicians who apply it, and industry who translates it.
This task adds a work_mode system that adapts the platform experience
based on how the user describes their primary work.

Work mode adjusts emphasis and defaults — it never restricts access.
A clinician can still see research posts. Mode shapes the experience,
it does not wall anything off.

---

## Step 1 — SQL migration

Create `migration_workmode.sql` in the project root:

```sql
-- Work mode on profiles
alter table profiles
  add column if not exists work_mode text default 'researcher',
  -- 'researcher' | 'clinician' | 'both' | 'industry'

  -- Clinical-specific profile fields (all optional)
  add column if not exists subspeciality      text    default '',
  add column if not exists years_in_practice  integer default null,
  add column if not exists primary_hospital   text    default '',
  add column if not exists patient_population text    default '',
  -- e.g. "Adult cardiology, heart failure"

  add column if not exists additional_quals   text[]  default '{}',
  -- Zusatzqualifikationen — free text chips
  -- e.g. ["Traditional Chinese Medicine", "Endoscopy", "Palliative Care"]

  add column if not exists clinical_highlight_label text default '',
  -- e.g. "TAVI procedures", "Fellows trained", "Years in practice"
  add column if not exists clinical_highlight_value text default '',
  -- e.g. "500+", "12", "18"

  -- Work contact details (all users, shown on business card if toggled)
  add column if not exists work_phone   text    default '',
  add column if not exists work_address text    default '',
  -- e.g. "1-1 Marunouchi, Tokyo 100-0005, Japan"

  -- Business card visibility for work contact fields
  add column if not exists card_show_work_phone   boolean default false,
  add column if not exists card_show_work_address boolean default false;
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Work mode constants

In `src/lib/constants.js`, append:

```javascript
// ── WORK MODES ────────────────────────────────────────────────────────────────

export const WORK_MODES = [
  {
    id:          'researcher',
    label:       'Researcher',
    icon:        '🔬',
    description: 'Lab, clinical trials, publishing',
    statsConfig: ['followers', 'following', 'publications', 'citations'],
    // citations shows h-index as a sub-label
  },
  {
    id:          'clinician',
    label:       'Clinician',
    icon:        '🏥',
    description: 'I see patients, applying evidence',
    statsConfig: ['followers', 'following', 'experience', 'highlight'],
    // experience = years_in_practice, highlight = clinical_highlight
  },
  {
    id:          'both',
    label:       'Both',
    icon:        '⚕️',
    description: 'Research and clinical practice',
    statsConfig: ['followers', 'following', 'publications', 'highlight'],
  },
  {
    id:          'industry',
    label:       'Industry',
    icon:        '💊',
    description: 'Pharma, MedTech, Medical Affairs, HEOR',
    statsConfig: ['followers', 'following', 'publications', 'highlight'],
  },
];

export const WORK_MODE_MAP = Object.fromEntries(
  WORK_MODES.map(m => [m.id, m])
);

// Composer prompt suggestions per work_mode
export const COMPOSER_PROMPTS = {
  researcher: [
    "Share a paper you found interesting...",
    "What's the latest in your field?",
    "Share a finding from your research...",
  ],
  clinician: [
    "Share a clinical insight from your practice...",
    "What guideline update changed how you treat patients?",
    "Share a technique or approach that works for you...",
    "What does this paper mean for your patients?",
  ],
  both: [
    "Share what bridges your research and clinical work...",
    "What's the latest in your field?",
    "Share an insight from the bench or bedside...",
  ],
  industry: [
    "Share an insight from your field...",
    "What's the latest in Medical Affairs or HEOR?",
    "Share a perspective on translating evidence to practice...",
  ],
};
```

---

## Step 3 — Onboarding: add work mode as Step 0

In `src/screens/OnboardingScreen.jsx`, add a new step BEFORE the
current Step 1 (professional identity). Shift existing step numbers
up by one (Step 1 becomes Step 2, Step 2 becomes Step 3 etc.).

The new Step 0 asks for work mode. It is the very first thing shown
after the Welcome screen.

```jsx
import { WORK_MODES } from '../lib/constants';

// New state:
const [workMode, setWorkMode] = useState('researcher');

// Step 0 UI:
<div>
  <div style={{
    fontFamily: "'DM Serif Display', serif",
    fontSize: 20, marginBottom: 6,
  }}>
    What best describes your work?
  </div>
  <div style={{fontSize: 13, color: T.mu, marginBottom: 20}}>
    This helps Luminary show you the most relevant content and
    people. You can change this anytime in Settings.
  </div>

  <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
    {WORK_MODES.map(mode => (
      <button key={mode.id}
        onClick={() => setWorkMode(mode.id)}
        style={{
          padding: '14px 16px', borderRadius: 12,
          cursor: 'pointer', fontFamily: 'inherit',
          textAlign: 'left', display: 'flex',
          alignItems: 'center', gap: 14,
          border: `2px solid ${workMode === mode.id ? T.v : T.bdr}`,
          background: workMode === mode.id ? T.v2 : T.w,
          transition: 'all .12s',
        }}>
        <span style={{fontSize: 26, flexShrink: 0}}>{mode.icon}</span>
        <div>
          <div style={{
            fontSize: 14, fontWeight: 700, marginBottom: 2,
            color: workMode === mode.id ? T.v : T.text,
          }}>
            {mode.label}
          </div>
          <div style={{fontSize: 12.5, color: T.mu}}>
            {mode.description}
          </div>
        </div>
        {workMode === mode.id && (
          <div style={{marginLeft: 'auto', flexShrink: 0}}>
            <svg width="18" height="18" viewBox="0 0 24 24"
              fill={T.v}>
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
        )}
      </button>
    ))}
  </div>
</div>
```

Save work_mode when onboarding completes:
```javascript
await supabase.from('profiles').update({
  work_mode:        workMode,
  identity_tier1:   identityTier1,
  identity_tier2:   identityTier2,
  topic_interests:  selectedTopics,
  onboarding_completed: true,
}).eq('id', user.id);
```

**Clinician mode adjustment in Step 1 (professional identity):**
When `workMode === 'clinician'`, the Step 1 description changes:
```
Researcher: "What is your primary discipline?"
Clinician:  "What is your clinical speciality?"
```
The Tier 1 grid and Tier 2 dropdown remain the same — the taxonomy
already covers clinical specialities well.

---

## Step 4 — Work mode in Account Settings

In `src/screens/AccountSettingsScreen.jsx`, add a "Work mode" section
above the Security section:

```jsx
<SectionHead label="Your work mode"/>

<div style={{marginBottom: 16}}>
  <div style={{fontSize: 13, color: T.mu, marginBottom: 12,
    lineHeight: 1.6}}>
    This adjusts how Luminary presents itself to you — your feed
    defaults, profile emphasis, and post prompts. Your existing
    content and connections are never affected.
  </div>

  <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
    {WORK_MODES.map(mode => (
      <label key={mode.id} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
        border: `1.5px solid ${
          workModeValue === mode.id ? T.v : T.bdr}`,
        background: workModeValue === mode.id ? T.v2 : T.w,
      }}>
        <input type="radio"
          name="work_mode"
          value={mode.id}
          checked={workModeValue === mode.id}
          onChange={() => setWorkModeValue(mode.id)}
          style={{accentColor: T.v}}
        />
        <span style={{fontSize: 16}}>{mode.icon}</span>
        <div>
          <div style={{fontSize: 13, fontWeight: 600}}>
            {mode.label}
          </div>
          <div style={{fontSize: 12, color: T.mu}}>
            {mode.description}
          </div>
        </div>
      </label>
    ))}
  </div>

  <div style={{marginTop: 12}}>
    <Btn variant="s"
      onClick={saveWorkMode}
      disabled={workModeValue === profile?.work_mode || saving}>
      {saving ? 'Saving...' : 'Save'}
    </Btn>
  </div>
</div>
```

Save handler:
```javascript
const saveWorkMode = async () => {
  setSaving(true);
  const { data } = await supabase
    .from('profiles')
    .update({ work_mode: workModeValue })
    .eq('id', user.id)
    .select()
    .single();
  if (data) setProfile(data);
  setSaving(false);
};
```

---

## Step 5 — Profile: conditional sections for clinician mode

In `src/profile/ProfileScreen.jsx`, add a "Clinical Profile" section
to the About tab edit mode. Show it when
`profile.work_mode === 'clinician' || profile.work_mode === 'both'`.

Show it collapsed by default with an expand toggle — keeps the edit
form from feeling overwhelming.

```jsx
{(form.work_mode === 'clinician' || form.work_mode === 'both') && (
  <div style={{
    border: `1px solid ${T.bdr}`, borderRadius: 12,
    overflow: 'hidden', marginBottom: 16,
  }}>
    {/* Section header */}
    <button
      onClick={() => setShowClinicalFields(s => !s)}
      style={{
        width: '100%', padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: 'none', background: T.s2, cursor: 'pointer',
        fontFamily: 'inherit',
      }}>
      <div style={{fontSize: 13, fontWeight: 700}}>
        🏥 Clinical Profile
      </div>
      <span style={{
        fontSize: 12, color: T.mu,
        transform: showClinicalFields ? 'rotate(180deg)' : 'rotate(0)',
        transition: 'transform .2s', display: 'inline-block',
      }}>▾</span>
    </button>

    {showClinicalFields && (
      <div style={{padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 12}}>

        {/* Subspeciality */}
        <div>
          <label style={{...labelStyle}}>Subspeciality</label>
          <input value={form.subspeciality || ''}
            onChange={e => setForm(f => ({
              ...f, subspeciality: e.target.value
            }))}
            placeholder="e.g. Interventional Cardiology, Robotic Surgery"
            style={{...inputStyle}}/>
        </div>

        {/* Years in practice */}
        <div>
          <label style={{...labelStyle}}>Years in practice</label>
          <input type="number" min="0" max="60"
            value={form.years_in_practice || ''}
            onChange={e => setForm(f => ({
              ...f, years_in_practice: parseInt(e.target.value) || null
            }))}
            placeholder="e.g. 18"
            style={{...inputStyle, width: 100}}/>
        </div>

        {/* Primary hospital */}
        <div>
          <label style={{...labelStyle}}>Primary hospital / clinic</label>
          <input value={form.primary_hospital || ''}
            onChange={e => setForm(f => ({
              ...f, primary_hospital: e.target.value
            }))}
            placeholder="e.g. Tokyo University Hospital"
            style={{...inputStyle}}/>
        </div>

        {/* Patient population */}
        <div>
          <label style={{...labelStyle}}>Patient population</label>
          <input value={form.patient_population || ''}
            onChange={e => setForm(f => ({
              ...f, patient_population: e.target.value
            }))}
            placeholder="e.g. Adult cardiology, heart failure focus"
            style={{...inputStyle}}/>
        </div>

        {/* Additional qualifications — free text chip input */}
        <div>
          <label style={{...labelStyle}}>
            Additional qualifications
            <span style={{fontSize: 11, color: T.mu, fontWeight: 400,
              marginLeft: 6}}>
              (Zusatzqualifikationen, special certifications)
            </span>
          </label>
          <QualChipInput
            value={form.additional_quals || []}
            onChange={v => setForm(f => ({...f, additional_quals: v}))}
            placeholder="Type a qualification and press Enter..."
          />
        </div>

        {/* Clinical highlight */}
        <div>
          <label style={{...labelStyle}}>
            Profile highlight
            <span style={{fontSize: 11, color: T.mu, fontWeight: 400,
              marginLeft: 6}}>
              (shown in your stats row)
            </span>
          </label>
          <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
            <input value={form.clinical_highlight_value || ''}
              onChange={e => setForm(f => ({
                ...f, clinical_highlight_value: e.target.value
              }))}
              placeholder="500+"
              style={{...inputStyle, width: 80}}/>
            <input value={form.clinical_highlight_label || ''}
              onChange={e => setForm(f => ({
                ...f, clinical_highlight_label: e.target.value
              }))}
              placeholder="TAVI procedures, Fellows trained..."
              style={{...inputStyle, flex: 1}}/>
          </div>
          <div style={{fontSize: 11.5, color: T.mu, marginTop: 4}}>
            Examples: "500+ TAVI procedures" · "12 Fellows trained"
            · "25 yrs experience"
          </div>
        </div>

      </div>
    )}
  </div>
)}
```

### QualChipInput sub-component

```jsx
function QualChipInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (chip) => onChange(value.filter(v => v !== chip));

  return (
    <div>
      {/* Existing chips */}
      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap',
        marginBottom: value.length ? 8 : 0}}>
        {value.map(chip => (
          <span key={chip} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px 4px 12px', borderRadius: 20,
            background: T.v2, color: T.v,
            border: `1px solid rgba(108,99,255,.2)`,
            fontSize: 12.5, fontWeight: 600,
          }}>
            {chip}
            <button onClick={() => remove(chip)} style={{
              fontSize: 11, color: T.v, border: 'none',
              background: 'transparent', cursor: 'pointer',
              padding: 0, lineHeight: 1, opacity: 0.7,
            }}>✕</button>
          </span>
        ))}
      </div>

      {/* Input */}
      <div style={{display: 'flex', gap: 6}}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          placeholder={placeholder}
          style={{...inputStyle, flex: 1}}
        />
        <Btn onClick={add} disabled={!input.trim()}>Add</Btn>
      </div>
    </div>
  );
}
```

Include `additional_quals`, `subspeciality`, `years_in_practice`,
`primary_hospital`, `patient_population`, `clinical_highlight_label`,
`clinical_highlight_value` in the existing profile save handler.

---

## Step 6 — Work contact fields (all users)

In the existing contact/bio section of the profile edit form, add
two new fields for all users:

```jsx
{/* Work phone */}
<div>
  <label style={{...labelStyle}}>Work phone (optional)</label>
  <input value={form.work_phone || ''}
    onChange={e => setForm(f => ({...f, work_phone: e.target.value}))}
    placeholder="+81 3 1234 5678"
    style={{...inputStyle}}/>
</div>

{/* Work address */}
<div>
  <label style={{...labelStyle}}>Work address (optional)</label>
  <input value={form.work_address || ''}
    onChange={e => setForm(f => ({...f, work_address: e.target.value}))}
    placeholder="1-1 Marunouchi, Tokyo 100-0005, Japan"
    style={{...inputStyle}}/>
</div>
```

In the Business Card section of the profile, add visibility toggles
for the two new fields:

```jsx
<VisibilityToggle
  label="Show work phone on card"
  field="card_show_work_phone"
  value={form.card_show_work_phone}
  onChange={v => setForm(f => ({...f, card_show_work_phone: v}))}
/>
<VisibilityToggle
  label="Show work address on card"
  field="card_show_work_address"
  value={form.card_show_work_address}
  onChange={v => setForm(f => ({...f, card_show_work_address: v}))}
/>
```

In `BusinessCardView` (public profile card tab), add work phone and
work address to the contact rows if visibility is toggled on:

```jsx
{profile.card_show_work_phone && profile.work_phone && (
  <ContactRow icon="📞" label={profile.work_phone}
    href={`tel:${profile.work_phone}`}/>
)}
{profile.card_show_work_address && profile.work_address && (
  <ContactRow icon="📍" label={profile.work_address}/>
)}
```

Also update the vCard generator to include work phone and address:
```
TEL;TYPE=WORK:${profile.work_phone}
ADR;TYPE=WORK:;;${profile.work_address};;;;
```

---

## Step 7 — Stats row by work mode

In `src/profile/ProfileScreen.jsx`, make the stats row conditional
on `profile.work_mode`.

```javascript
const getStatsRow = (profile, userPosts, hIndex,
  totalCitations, coauthorCount) => {

  const base = [
    { value: followersCount, label: 'Followers' },
    { value: followingCount, label: 'Following' },
  ];

  if (profile.work_mode === 'clinician') {
    return [
      ...base,
      profile.years_in_practice
        ? { value: profile.years_in_practice, label: 'Yrs Practice' }
        : { value: profile.primary_hospital || '—', label: 'Hospital',
            isText: true },
      profile.clinical_highlight_value
        ? {
            value: profile.clinical_highlight_value,
            label: profile.clinical_highlight_label || 'Highlight',
          }
        : { value: userPosts.length, label: 'Posts' },
    ];
  }

  // Researcher, both, industry — existing stats
  return [
    ...base,
    { value: hIndex,          label: 'h-index'      },
    { value: totalCitations,  label: 'Citations'    },
    { value: userPosts.length, label: 'Posts'       },
  ];
};
```

For `isText: true` stat items (like hospital name), render as
smaller text instead of a large number:

```jsx
<div style={{fontSize: isText ? 11 : 19, fontWeight: 700,
  fontFamily: isText ? 'inherit' : "'DM Serif Display', serif",
  color: T.v, overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', maxWidth: 80}}>
  {stat.value}
</div>
```

---

## Step 8 — Work mode badge on profile and post cards

### On profile view (own profile and UserProfileScreen)

Show a small work mode badge below the name/identity badge:

```jsx
{profile.work_mode && profile.work_mode !== 'researcher' && (
  <span style={{
    fontSize: 11.5, fontWeight: 600,
    padding: '3px 10px', borderRadius: 20,
    background: profile.work_mode === 'clinician' ? '#e8f5e9'
      : profile.work_mode === 'industry' ? '#fff8e1' : T.v2,
    color: profile.work_mode === 'clinician' ? '#2e7d32'
      : profile.work_mode === 'industry' ? '#f57f17' : T.v,
    border: `1px solid ${
      profile.work_mode === 'clinician' ? 'rgba(46,125,50,.2)'
      : profile.work_mode === 'industry' ? 'rgba(245,127,23,.2)'
      : 'rgba(108,99,255,.2)'}`,
    marginBottom: 8, display: 'inline-block',
  }}>
    {WORK_MODE_MAP[profile.work_mode]?.icon}{' '}
    {WORK_MODE_MAP[profile.work_mode]?.label}
  </span>
)}
```

Researcher mode gets no badge (it's the default, no need to label it).

### On PostCard author line

Show a small work mode icon next to the author name (desktop only,
not on mobile to save space):

```jsx
{!isMobile && post.author_work_mode &&
  post.author_work_mode !== 'researcher' && (
  <span title={WORK_MODE_MAP[post.author_work_mode]?.label}
    style={{fontSize: 12, opacity: 0.7}}>
    {WORK_MODE_MAP[post.author_work_mode]?.icon}
  </span>
)}
```

To support this, update `posts_with_meta` view to include
`author_work_mode`:

```sql
-- Add to the posts_with_meta view definition:
pr.work_mode as author_work_mode,
```

Run as part of the migration.

---

## Step 9 — Composer prompt by work mode

In `src/screens/NewPostScreen.jsx`, update the text post placeholder
to use work_mode-aware prompts:

```javascript
import { COMPOSER_PROMPTS } from '../lib/constants';

// Pick a random prompt for the current work_mode on mount:
const [composerPrompt] = useState(() => {
  const prompts = COMPOSER_PROMPTS[profile?.work_mode || 'researcher'];
  return prompts[Math.floor(Math.random() * prompts.length)];
});
```

Pass `composerPrompt` as the `placeholder` to the RichTextEditor
for text posts.

---

## Step 10 — Completion meter: work mode aware CTA language

In `src/lib/profileMilestones.js`, add a `ctaLabel` map per
work_mode for milestones where the language should differ:

```javascript
// On relevant milestones, add:
{
  id: 'publication_added',
  label: 'Publication or presentation added',
  // Different CTA label per work mode:
  ctaLabels: {
    researcher: 'Add publication',
    clinician:  'Add a presentation or lecture',
    both:       'Add publication or presentation',
    industry:   'Add a publication or presentation',
  },
  cta: 'Add publication', // default fallback
  ...
}

{
  id: 'identity_badge_set',
  label: 'Professional identity set',
  ctaLabels: {
    researcher: 'Set your research field',
    clinician:  'Set your clinical speciality',
    both:       'Set your primary field',
    industry:   'Set your professional area',
  },
  ...
}
```

In `ProfileCompletionMeter.jsx`, use `m.ctaLabels?.[profile.work_mode] || m.cta`
when rendering the CTA button label.

---

## Step 11 — Group type tags update

In `src/groups/CreateGroupModal.jsx` and `src/groups/GroupProfile.jsx`,
update the group type options:

```javascript
// Remove 'Journal Club' from group types
// (it's a project template, not a group type)
export const GROUP_TYPES = [
  { value: 'research',  label: '🔬 Research Group'  },
  { value: 'clinical',  label: '🏥 Clinical Team'   },
  { value: 'department',label: '🏛️ Department'      },
  { value: 'industry',  label: '💊 Industry Team'   },
  { value: 'other',     label: '✏️ Other'            },
];
```

Update group subtitle in sidebar and discovery screens:
```
"Private space for research groups, clinical teams and departments"
```

Add optional clinical fields to group profile edit (admin only),
shown when group_type is 'clinical' or 'department':

```jsx
{(groupType === 'clinical' || groupType === 'department') && (
  <>
    <input placeholder="Department name (optional)"
      value={deptName} onChange={e => setDeptName(e.target.value)}
      style={{...inputStyle}}/>
    <input placeholder="Patient population (optional)"
      value={patientPop} onChange={e => setPatientPop(e.target.value)}
      placeholder="e.g. Adult cardiology, paediatric oncology"
      style={{...inputStyle}}/>
  </>
)}
```

Store in `groups.description` or add `department_name` and
`patient_population` columns to groups table:

```sql
alter table groups
  add column if not exists group_type         text default 'research',
  add column if not exists department_name    text default '',
  add column if not exists patient_population text default '';
```

Add to `migration_workmode.sql`.

---

## What NOT to change

- Feed mechanics, taxonomy scoring, follow system
- Publications tab structure — presentations already supported
- Library, projects, business card QR infrastructure
- PHI reminder — deferred
- Institutional email verification — not building
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_workmode.sql in Supabase SQL Editor
# 2. Deploy:
git add . && git commit -m "Phase C1: Work mode foundation" && git push
```

---

## Testing checklist

- [ ] Onboarding Step 0 shows four work mode cards, selection persists
- [ ] Selecting Clinician in onboarding changes Step 1 label to
      "clinical speciality"
- [ ] Account Settings shows work mode selector, changing it updates
      profile immediately
- [ ] Clinician mode profile shows "Clinical Profile" section in edit
- [ ] Additional qualifications chip input: type → Enter → chip appears,
      click ✕ removes it
- [ ] Clinical highlight: value + label appear in stats row
- [ ] Stats row shows years/hospital/highlight for clinician mode
- [ ] Stats row shows h-index/citations for researcher mode
- [ ] Work phone and work address appear in profile edit for all users
- [ ] Work phone shows on business card when toggled on
- [ ] Work address shows on business card and vCard when toggled on
- [ ] Work mode badge appears on clinician and industry profiles
      (not on researcher)
- [ ] Work mode icon appears next to author name on post cards (desktop)
- [ ] Composer placeholder rotates per work_mode on text posts
- [ ] Completion meter CTA labels adjust per work_mode
- [ ] Group creation shows 5 group type options (no Journal Club)
- [ ] Clinical team group type shows optional department and
      patient population fields
