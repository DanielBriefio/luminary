# Task: Invite-only + ORCID account creation

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

Currently anyone can sign up with email/password. This task replaces the
sign-up flow with an invite-only + ORCID gate:

- New accounts require either a valid invite code OR a valid ORCID iD
- Existing users get 5 invite codes each
- Admin-generated batch codes exist for conferences
- Sign-in (existing users) remains email + password only — no changes
- If ORCID is provided during sign-up, auto-populate profile data

---

## Step 1 — SQL migration

Create `migration_invites.sql` in the project root:

```sql
-- Invite codes table
create table if not exists invite_codes (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  created_by   uuid references profiles(id) on delete set null, -- null = admin
  claimed_by   uuid references profiles(id) on delete set null,
  claimed_at   timestamptz,
  batch_label  text default '',   -- e.g. 'AACR2026', 'personal'
  created_at   timestamptz default now()
);

-- Index for fast code lookup
create index if not exists idx_invite_codes_code
  on invite_codes(code);
create index if not exists idx_invite_codes_created_by
  on invite_codes(created_by);

-- RLS: users can only read their own codes
alter table invite_codes enable row level security;

create policy "invite_select_own" on invite_codes for select
  using (
    auth.uid() = created_by or
    auth.uid() = claimed_by
  );

-- Profiles: track ORCID uniqueness and sign-up method
alter table profiles
  add column if not exists signup_method text default 'invite', -- 'invite' | 'orcid'
  add column if not exists orcid_verified boolean default false;

-- Function to generate invite codes for a user (called after account creation)
create or replace function generate_user_invites(user_id uuid, count integer default 5)
returns void language plpgsql as $$
begin
  insert into invite_codes (code, created_by, batch_label)
  select
    'LM-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    user_id,
    'personal'
  from generate_series(1, count);
end;
$$;

-- Generate invites for all existing users who don't have any yet
do $$
declare r record;
begin
  for r in select id from profiles loop
    if (select count(*) from invite_codes where created_by = r.id) = 0 then
      perform generate_user_invites(r.id, 5);
    end if;
  end loop;
end;
$$;
```

Tell the user to run this in Supabase SQL Editor.

Also give the user this query to generate conference batch codes:
```sql
-- Run this to generate conference codes (replace label and count as needed)
insert into invite_codes (code, batch_label, created_by)
select
  'CONF-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  'AACR2026',   -- change this label
  null          -- null = admin-generated
from generate_series(1, 20);  -- change count as needed
```

---

## Step 2 — Redesign AuthScreen

The existing `AuthScreen` has sign-in and sign-up tabs. Keep the
sign-in tab exactly as it is (email + password). Redesign the sign-up
tab completely.

### Sign-up entry screen

Show two clear paths:

```jsx
// Sign-up entry — choose a path
<div>
  <div style={{
    fontFamily:"'DM Serif Display',serif",
    fontSize:24, textAlign:'center', marginBottom:8
  }}>
    Join Luminary
  </div>
  <div style={{fontSize:13, color:T.mu, textAlign:'center', marginBottom:28}}>
    Luminary is invite-only. Join with an invite code from a colleague,
    or verify you're a researcher with your ORCID iD.
  </div>

  <button onClick={() => setSignupPath('invite')} style={{
    width:'100%', padding:'16px', borderRadius:14, marginBottom:12,
    border:`2px solid ${T.bdr}`, background:T.w, cursor:'pointer',
    textAlign:'left', fontFamily:'inherit',
    display:'flex', alignItems:'center', gap:14,
  }}>
    <span style={{fontSize:28}}>🎟️</span>
    <div>
      <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>
        I have an invite code
      </div>
      <div style={{fontSize:12, color:T.mu}}>
        A colleague shared a code with you
      </div>
    </div>
    <span style={{marginLeft:'auto', color:T.mu}}>→</span>
  </button>

  <button onClick={() => setSignupPath('orcid')} style={{
    width:'100%', padding:'16px', borderRadius:14,
    border:`2px solid ${T.bdr}`, background:T.w, cursor:'pointer',
    textAlign:'left', fontFamily:'inherit',
    display:'flex', alignItems:'center', gap:14,
  }}>
    <span style={{fontSize:28}}>🔬</span>
    <div>
      <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>
        I have an ORCID iD
      </div>
      <div style={{fontSize:12, color:T.mu}}>
        Verify you're a researcher — your profile auto-fills
      </div>
    </div>
    <span style={{marginLeft:'auto', color:T.mu}}>→</span>
  </button>

  <div style={{textAlign:'center', marginTop:20, fontSize:13, color:T.mu}}>
    Already have an account?{' '}
    <button onClick={() => setMode('signin')} style={{
      color:T.v, fontWeight:700, border:'none',
      background:'transparent', cursor:'pointer', fontFamily:'inherit',
    }}>
      Sign in →
    </button>
  </div>
</div>
```

State to add:
```javascript
const [signupPath,    setSignupPath]    = useState(null); // null | 'invite' | 'orcid'
const [inviteCode,    setInviteCode]    = useState('');
const [inviteValid,   setInviteValid]   = useState(null); // null | true | false
const [inviteChecking,setInviteChecking]= useState(false);
const [orcidInput,    setOrcidInput]    = useState('');
const [orcidData,     setOrcidData]     = useState(null); // fetched ORCID profile
const [orcidChecking, setOrcidChecking] = useState(false);
const [orcidError,    setOrcidError]    = useState('');
const [signupEmail,   setSignupEmail]   = useState('');
const [signupPassword,setSignupPassword]= useState('');
const [signupName,    setSignupName]    = useState('');
const [signupError,   setSignupError]   = useState('');
const [signupLoading, setSignupLoading] = useState(false);
```

---

### Path A — Invite code flow

**Step A1 — Enter and validate code:**

```jsx
<div>
  <button onClick={() => setSignupPath(null)} style={{...backButtonStyle}}>
    ← Back
  </button>
  <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>Enter invite code</div>
  <div style={{fontSize:13, color:T.mu, marginBottom:20}}>
    Codes look like LM-XXXXXXXX or CONF-XXXXXX
  </div>

  <input
    value={inviteCode}
    onChange={e => {
      setInviteCode(e.target.value.toUpperCase().trim());
      setInviteValid(null);
    }}
    placeholder="LM-XXXXXXXX"
    style={{...inputStyle, fontFamily:'monospace', fontSize:16,
      letterSpacing:'.1em', textAlign:'center'}}
  />

  {inviteValid === false && (
    <div style={{color:T.ro, fontSize:12.5, marginTop:6}}>
      Code not found or already used. Check the code and try again.
    </div>
  )}
  {inviteValid === true && (
    <div style={{color:T.gr, fontSize:12.5, fontWeight:600, marginTop:6}}>
      ✓ Valid invite code
    </div>
  )}

  <Btn variant="s" onClick={validateInviteCode}
    disabled={inviteCode.length < 6 || inviteChecking}
    style={{width:'100%', marginTop:12}}>
    {inviteChecking ? 'Checking...' : 'Verify code →'}
  </Btn>
</div>
```

Validate code against database:
```javascript
const validateInviteCode = async () => {
  setInviteChecking(true);
  const { data } = await supabase
    .from('invite_codes')
    .select('id, claimed_by')
    .eq('code', inviteCode.trim().toUpperCase())
    .single();

  if (!data || data.claimed_by) {
    setInviteValid(false);
  } else {
    setInviteValid(true);
    setSignupPath('invite-details'); // move to next step
  }
  setInviteChecking(false);
};
```

**Step A2 — Account details + optional ORCID:**

```jsx
<div>
  <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>
    Create your account
  </div>
  <div style={{
    fontSize:12, color:T.gr, fontWeight:600,
    background:T.gr2, borderRadius:8, padding:'6px 12px',
    marginBottom:20, display:'inline-block'
  }}>
    ✓ Invite code accepted
  </div>

  {/* Name */}
  <Inp label="Full name" value={signupName}
    onChange={e => setSignupName(e.target.value)}
    placeholder="Dr. Jane Smith"/>

  {/* Email */}
  <Inp label="Email" type="email" value={signupEmail}
    onChange={e => setSignupEmail(e.target.value)}
    placeholder="jane@university.edu"/>

  {/* Password */}
  <Inp label="Password" type="password" value={signupPassword}
    onChange={e => setSignupPassword(e.target.value)}
    placeholder="At least 8 characters"/>

  {/* Optional ORCID */}
  <div style={{
    marginTop:16, padding:'14px 16px',
    background:T.v2, borderRadius:12,
    border:`1px solid rgba(108,99,255,.15)`
  }}>
    <div style={{fontSize:13, fontWeight:700, marginBottom:4}}>
      🔬 Add your ORCID iD (optional)
    </div>
    <div style={{fontSize:12, color:T.mu, marginBottom:10}}>
      Auto-fills your profile, institution, and publications — saves you
      10 minutes of manual entry.
    </div>
    <div style={{display:'flex', gap:8}}>
      <input value={orcidInput}
        onChange={e => setOrcidInput(e.target.value)}
        placeholder="0000-0002-1825-0097"
        style={{...inputStyle, flex:1, fontFamily:'monospace'}}/>
      <Btn onClick={fetchOrcidForSignup}
        disabled={orcidChecking || orcidInput.length < 16}>
        {orcidChecking ? '...' : 'Fetch'}
      </Btn>
    </div>
    {orcidData && (
      <div style={{
        marginTop:10, padding:'8px 12px',
        background:'white', borderRadius:8,
        fontSize:12.5, color:T.text,
      }}>
        ✓ Found: <strong>{orcidData.name}</strong>
        {orcidData.affiliation ? ` · ${orcidData.affiliation}` : ''}
      </div>
    )}
    {orcidError && (
      <div style={{color:T.ro, fontSize:12, marginTop:6}}>{orcidError}</div>
    )}
  </div>

  {signupError && (
    <div style={{color:T.ro, fontSize:12.5, marginTop:10}}>{signupError}</div>
  )}

  <Btn variant="s" onClick={handleInviteSignup}
    disabled={signupLoading || !signupEmail || !signupPassword || !signupName}
    style={{width:'100%', marginTop:16}}>
    {signupLoading ? 'Creating account...' : 'Create account →'}
  </Btn>
</div>
```

---

### Path B — ORCID flow

**Step B1 — Enter ORCID and verify:**

```jsx
<div>
  <button onClick={() => setSignupPath(null)} style={{...backButtonStyle}}>← Back</button>
  <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>
    Verify with ORCID
  </div>
  <div style={{fontSize:13, color:T.mu, marginBottom:20}}>
    Enter your ORCID iD to verify you're a researcher.
    Your profile will be auto-filled from ORCID.
  </div>

  <input value={orcidInput}
    onChange={e => setOrcidInput(e.target.value)}
    placeholder="0000-0002-1825-0097 or https://orcid.org/..."
    style={{...inputStyle, fontFamily:'monospace'}}/>

  <div style={{fontSize:11.5, color:T.mu, marginTop:5}}>
    Find yours at{' '}
    <a href="https://orcid.org" target="_blank" rel="noopener noreferrer"
      style={{color:T.v}}>orcid.org</a>
  </div>

  {orcidError && (
    <div style={{color:T.ro, fontSize:12.5, marginTop:8}}>{orcidError}</div>
  )}

  <Btn variant="s" onClick={fetchOrcidForSignup}
    disabled={orcidChecking || orcidInput.length < 16}
    style={{width:'100%', marginTop:12, background:T.gr, borderColor:T.gr}}>
    {orcidChecking ? 'Looking up ORCID...' : 'Verify researcher identity →'}
  </Btn>
</div>
```

**Step B2 — Confirm identity + set password:**

After ORCID fetch succeeds, show the profile preview and email/password fields:

```jsx
<div>
  {/* ORCID identity confirmation */}
  <div style={{
    background:T.gr2, border:`1px solid rgba(16,185,129,.2)`,
    borderRadius:12, padding:'16px', marginBottom:20,
  }}>
    <div style={{fontSize:12, fontWeight:700, color:T.gr, marginBottom:8}}>
      ✓ Researcher verified
    </div>
    <div style={{fontSize:14, fontWeight:700}}>{orcidData.name}</div>
    {orcidData.affiliation &&
      <div style={{fontSize:12.5, color:T.mu}}>{orcidData.affiliation}</div>}
    <div style={{fontSize:11.5, color:T.mu, marginTop:4}}>
      ORCID: {orcidInput.replace('https://orcid.org/', '')}
    </div>
  </div>

  <div style={{fontSize:13, fontWeight:600, marginBottom:4}}>Not you?</div>
  <button onClick={() => { setOrcidData(null); setOrcidInput(''); }}
    style={{fontSize:12, color:T.v, border:'none', background:'transparent',
      cursor:'pointer', fontFamily:'inherit', marginBottom:16}}>
    ← Try a different ORCID iD
  </button>

  <Inp label="Email address" type="email" value={signupEmail}
    onChange={e => setSignupEmail(e.target.value)}
    placeholder="jane@university.edu"/>
  <Inp label="Password" type="password" value={signupPassword}
    onChange={e => setSignupPassword(e.target.value)}
    placeholder="At least 8 characters"/>

  {signupError && (
    <div style={{color:T.ro, fontSize:12.5, marginTop:8}}>{signupError}</div>
  )}

  <Btn variant="s" onClick={handleOrcidSignup}
    disabled={signupLoading || !signupEmail || !signupPassword}
    style={{width:'100%', marginTop:12, background:T.gr, borderColor:T.gr}}>
    {signupLoading ? 'Creating account...' : 'Create account →'}
  </Btn>
</div>
```

---

## Step 3 — Sign-up handler functions

### ORCID fetch (shared by both paths)

```javascript
const fetchOrcidForSignup = async () => {
  setOrcidChecking(true);
  setOrcidError('');
  setOrcidData(null);
  try {
    const clean = orcidInput.replace('https://orcid.org/', '').trim();
    if (!clean.match(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)) {
      setOrcidError('Invalid format. Should be 0000-0000-0000-0000');
      setOrcidChecking(false);
      return;
    }
    const resp = await fetch(`https://pub.orcid.org/v3.0/${clean}/record`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error('ORCID not found');
    const data = await resp.json();
    const given  = data.person?.name?.['given-names']?.value || '';
    const family = data.person?.name?.['family-name']?.value || '';
    const name   = `${given} ${family}`.trim();
    const affil  = data['activities-summary']?.employments
      ?.['affiliation-group']?.[0]?.['summaries']?.[0]
      ?.['employment-summary']?.organization?.name || '';

    if (!name) throw new Error('Could not read name from ORCID record');

    setOrcidData({ name, affiliation: affil, orcidId: clean, rawData: data });
    if (signupPath === 'orcid') setSignupPath('orcid-details');
    if (!signupName) setSignupName(name); // pre-fill name field
  } catch(e) {
    setOrcidError(`ORCID not found. Check the iD and try again.`);
  }
  setOrcidChecking(false);
};
```

### Invite code sign-up

```javascript
const handleInviteSignup = async () => {
  setSignupLoading(true);
  setSignupError('');
  try {
    // 1. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
    });
    if (authError) throw authError;

    const userId = authData.user?.id;
    if (!userId) throw new Error('Account creation failed');

    // 2. Update profile with name and ORCID data
    const profileUpdate = {
      name:          signupName,
      signup_method: 'invite',
    };
    if (orcidData) {
      profileUpdate.orcid          = orcidData.orcidId;
      profileUpdate.orcid_verified = true;
      profileUpdate.institution    = orcidData.affiliation;
    }
    await supabase.from('profiles').update(profileUpdate).eq('id', userId);

    // 3. Mark invite code as claimed
    await supabase.from('invite_codes').update({
      claimed_by: userId,
      claimed_at: new Date().toISOString(),
    }).eq('code', inviteCode.trim().toUpperCase());

    // 4. Generate 5 invite codes for the new user
    await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

    // 5. If ORCID provided, import publications in background
    if (orcidData?.rawData) {
      importOrcidPublications(userId, orcidData.rawData); // fire and forget
    }

  } catch(e) {
    setSignupError(e.message || 'Sign-up failed. Please try again.');
  }
  setSignupLoading(false);
};
```

### ORCID sign-up

```javascript
const handleOrcidSignup = async () => {
  setSignupLoading(true);
  setSignupError('');
  try {
    // Check ORCID not already registered
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('orcid', orcidData.orcidId)
      .single();
    if (existing) {
      setSignupError('An account with this ORCID iD already exists. Try signing in.');
      setSignupLoading(false);
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
    });
    if (authError) throw authError;

    const userId = authData.user?.id;

    await supabase.from('profiles').update({
      name:          orcidData.name,
      institution:   orcidData.affiliation,
      orcid:         orcidData.orcidId,
      orcid_verified: true,
      signup_method: 'orcid',
    }).eq('id', userId);

    // Generate 5 invite codes
    await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

    // Import ORCID publications in background
    if (orcidData?.rawData) {
      importOrcidPublications(userId, orcidData.rawData);
    }

  } catch(e) {
    setSignupError(e.message || 'Sign-up failed. Please try again.');
  }
  setSignupLoading(false);
};
```

### Background ORCID publication import

```javascript
const importOrcidPublications = async (userId, orcidRawData) => {
  try {
    const works = orcidRawData['activities-summary']?.works?.group || [];
    const pubs  = works.map(g => {
      const ws  = g['work-summary']?.[0];
      if (!ws) return null;
      const doi  = (ws['external-ids']?.['external-id'] || [])
        .find(x => x['external-id-type'] === 'doi');
      const pmid = (ws['external-ids']?.['external-id'] || [])
        .find(x => x['external-id-type'] === 'pmid');
      return {
        user_id: userId,
        title:   ws.title?.title?.value || '',
        journal: ws['journal-title']?.value || '',
        year:    ws['publication-date']?.year?.value || '',
        doi:     doi?.['external-id-value'] || '',
        pmid:    pmid?.['external-id-value'] || '',
        source:  'orcid',
      };
    }).filter(p => p && p.title);

    if (pubs.length) {
      await supabase.from('publications').insert(pubs);
    }
  } catch(e) {
    console.warn('Background ORCID import failed:', e);
  }
};
```

---

## Step 4 — Invite management UI in sidebar

In `App.jsx` sidebar (below the user name/avatar card), add an
"Invite colleagues" button showing remaining invite count:

```jsx
{/* Invite button */}
<button onClick={() => setShowInvites(true)} style={{
  display:'flex', alignItems:'center', gap:8,
  width:'100%', padding:'8px 14px', marginTop:4,
  border:`1px dashed ${T.bdr}`, borderRadius:9,
  background:'transparent', cursor:'pointer',
  fontFamily:'inherit', color:T.mu,
}}>
  <span style={{fontSize:14}}>🎟️</span>
  <span style={{fontSize:12, fontWeight:600}}>Invite colleagues</span>
  {invitesRemaining > 0 && (
    <span style={{
      marginLeft:'auto', fontSize:10, fontWeight:700,
      background:T.v, color:'white',
      padding:'1px 6px', borderRadius:20,
    }}>
      {invitesRemaining}
    </span>
  )}
</button>
```

### Invite modal

```jsx
{showInvites && (
  <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000}}>
    <div style={{background:T.w, borderRadius:18, padding:28,
      maxWidth:480, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>

      <div style={{fontFamily:"'DM Serif Display',serif", fontSize:20, marginBottom:4}}>
        Your invite codes
      </div>
      <div style={{fontSize:13, color:T.mu, marginBottom:20}}>
        Share these with colleagues you'd like to invite to Luminary.
        Each code can only be used once.
      </div>

      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        {inviteCodes.map(code => (
          <div key={code.id} style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'10px 14px', borderRadius:10,
            background: code.claimed_by ? T.s2 : T.v2,
            border:`1px solid ${code.claimed_by ? T.bdr : 'rgba(108,99,255,.2)'}`,
          }}>
            <span style={{
              fontFamily:'monospace', fontSize:13, fontWeight:700,
              flex:1, letterSpacing:'.05em',
              color: code.claimed_by ? T.mu : T.v,
            }}>
              {code.code}
            </span>
            {code.claimed_by ? (
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11, fontWeight:700, color:T.gr}}>
                  ✓ Claimed
                </div>
                {code.claimed_name && (
                  <div style={{fontSize:10.5, color:T.mu}}>
                    by {code.claimed_name}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => {
                navigator.clipboard.writeText(code.code);
                // Brief "Copied!" toast
              }} style={{
                fontSize:11.5, fontWeight:600, color:T.v,
                border:`1px solid ${T.v}`, background:'white',
                borderRadius:8, padding:'4px 10px',
                cursor:'pointer', fontFamily:'inherit',
              }}>
                Copy
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={{
        marginTop:16, padding:'10px 14px',
        background:T.s2, borderRadius:10,
        fontSize:12, color:T.mu, lineHeight:1.6,
      }}>
        💡 Codes work like conference badges — whoever you give them to
        joins your Luminary network automatically as a connection.
      </div>

      <Btn onClick={() => setShowInvites(false)}
        style={{width:'100%', marginTop:16, justifyContent:'center'}}>
        Close
      </Btn>
    </div>
  </div>
)}
```

Fetch invite codes and claimed user names on app load:
```javascript
const [inviteCodes,      setInviteCodes]      = useState([]);
const [invitesRemaining, setInvitesRemaining] = useState(0);

useEffect(() => {
  if (!user) return;
  supabase
    .from('invite_codes')
    .select('id, code, claimed_by, claimed_at, batch_label')
    .eq('created_by', user.id)
    .order('created_at')
    .then(async ({ data }) => {
      if (!data) return;
      // Fetch names of claimed users
      const claimedIds = data.filter(c => c.claimed_by).map(c => c.claimed_by);
      let nameMap = {};
      if (claimedIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', claimedIds);
        (profiles || []).forEach(p => { nameMap[p.id] = p.name; });
      }
      const enriched = data.map(c => ({
        ...c,
        claimed_name: nameMap[c.claimed_by] || null,
      }));
      setInviteCodes(enriched);
      setInvitesRemaining(enriched.filter(c => !c.claimed_by).length);
    });
}, [user]);
```

---

## What NOT to change

- Sign-in flow — email + password, unchanged
- Onboarding wizard — still runs after successful sign-up
- All existing screens, profile, feed, etc.
- Run `npm run build` when done

---

## Remind the user

1. Run `migration_invites.sql` in Supabase SQL Editor first
2. The migration auto-generates 5 codes for all existing users
3. To generate conference batch codes, run the SQL snippet provided
   in the migration file (change the label and count)
4. To test the full flow: open an incognito window, go to sign-up,
   use one of your invite codes from the sidebar modal
5. ORCID sign-up requires a real, public ORCID record to validate
