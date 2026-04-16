# Task: Invite code brute-force protection + ORCID OAuth sign-up

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task covers two security improvements:

1. **Invite code attempts counter** — lock a code after 5 failed attempts
   to prevent brute-force guessing of valid codes.

2. **ORCID OAuth sign-up** — replace the current ORCID iD text input
   (which can be faked) with a true OAuth flow that verifies the user
   actually controls that ORCID account. Auto-populates profile and
   publications on account creation.

---

## IMPORTANT — Before starting

The ORCID OAuth requires credentials that the user must obtain manually:

- `ORCID_CLIENT_ID` — from orcid.org/developer-tools
- `ORCID_CLIENT_SECRET` — from orcid.org/developer-tools

**For development/testing**, use the ORCID Sandbox:
- Register at: https://sandbox.orcid.org/developer-tools
- Sandbox authorize URL: `https://sandbox.orcid.org/oauth/authorize`
- Sandbox token URL: `https://sandbox.orcid.org/oauth/token`
- Sandbox API: `https://pub.sandbox.orcid.org/v3.0`
- Test ORCID accounts can be created at sandbox.orcid.org

**For production**, use:
- Register at: https://orcid.org/developer-tools
- Production authorize URL: `https://orcid.org/oauth/authorize`
- Production token URL: `https://orcid.org/oauth/token`
- Production API: `https://pub.orcid.org/v3.0`

The redirect URI to register in both:
```
https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/orcid-callback
```

Once the user has their credentials, they must add them as Supabase secrets:
```bash
npx supabase secrets set ORCID_CLIENT_ID=your_client_id
npx supabase secrets set ORCID_CLIENT_SECRET=your_client_secret
npx supabase secrets set ORCID_REDIRECT_URI=https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/orcid-callback
npx supabase secrets set APP_URL=https://luminary.to
```

For sandbox testing, also set:
```bash
npx supabase secrets set ORCID_ENV=sandbox
```
For production:
```bash
npx supabase secrets set ORCID_ENV=production
```

Build the code so it works with sandbox credentials now and switches to
production by changing the ORCID_ENV secret — no code changes needed.

---

## Part 1 — Invite code attempts counter

### SQL migration

Create `migration_security.sql`:

```sql
-- Add attempts counter to invite codes
alter table invite_codes
  add column if not exists attempts    integer default 0,
  add column if not exists locked_at   timestamptz default null;

-- Max attempts before lockout
-- (enforced in application code, 5 attempts)
```

### Frontend changes

In `src/screens/AuthScreen.jsx`, find the `validateInviteCode` function.

Replace the current validation with a call to a new Edge Function
(see Part 1 Edge Function below) instead of querying the database
directly from the frontend:

```javascript
const validateInviteCode = async () => {
  setInviteChecking(true);
  setInviteError('');

  try {
    const { data, error } = await supabase.functions.invoke('validate-invite', {
      body: { code: inviteCode.trim().toUpperCase() }
    });

    if (error || !data?.valid) {
      setInviteValid(false);
      setInviteError(data?.reason || 'Code not found or already used.');
    } else {
      setInviteValid(true);
      setSignupPath('invite-details');
    }
  } catch(e) {
    setInviteValid(false);
    setInviteError('Validation failed. Please try again.');
  }

  setInviteChecking(false);
};
```

Show the lock message clearly when reason is 'locked':
```javascript
{inviteError && (
  <div style={{color: T.ro, fontSize:12.5, marginTop:6}}>
    {inviteError === 'locked'
      ? '🔒 This code has been locked after too many attempts. Contact the person who shared it with you.'
      : inviteError}
  </div>
)}
```

### Edge Function — validate-invite

Create `supabase/functions/validate-invite/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { code } = await req.json();
    if (!code) throw new Error("No code provided");

    // Use service role to bypass RLS for this server-side operation
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite, error } = await supabase
      .from("invite_codes")
      .select("id, claimed_by, attempts, locked_at")
      .eq("code", code.trim().toUpperCase())
      .single();

    // Code not found — increment attempt on a dummy record isn't possible
    // so just return invalid. Don't reveal whether code exists.
    if (error || !invite) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Code not found or already used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already claimed
    if (invite.claimed_by) {
      return new Response(
        JSON.stringify({ valid: false, reason: "This code has already been used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Locked
    if (invite.locked_at || invite.attempts >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ valid: false, reason: "locked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Valid — reset attempts on successful validation
    await supabase
      .from("invite_codes")
      .update({ attempts: 0 })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    // On any error, increment attempts for the provided code
    // (best-effort, ignore if it fails)
    try {
      const { code } = await req.clone().json();
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.rpc("increment_invite_attempts", { p_code: code });
    } catch(_) {}

    return new Response(
      JSON.stringify({ valid: false, reason: "Validation failed." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

Also add the increment function to `migration_security.sql`:

```sql
-- Function to safely increment attempts and lock if over threshold
create or replace function increment_invite_attempts(p_code text)
returns void language plpgsql as $$
begin
  update invite_codes
  set
    attempts  = attempts + 1,
    locked_at = case when attempts + 1 >= 5 then now() else locked_at end
  where code = upper(p_code) and claimed_by is null;
end;
$$;
```

The Edge Function needs to call `increment_invite_attempts` when
validation fails. Restructure the function so it increments attempts
on every failed validation attempt (code found but invalid state)
using the RPC call above.

Deploy: `npx supabase functions deploy validate-invite`

---

## Part 2 — ORCID OAuth

### Overview of the flow

```
1. User clicks "Sign up with ORCID" in AuthScreen
2. Browser redirects to orcid.org OAuth authorize URL
3. User logs into ORCID and approves Luminary's access request
4. ORCID redirects to our Edge Function callback with ?code=XXX
5. Edge Function exchanges code for access token (server-side — secret safe)
6. Edge Function fetches full ORCID record using access token
7. Edge Function creates Supabase auth user + populates profile
8. Edge Function redirects browser to app with a session token
9. App detects the session and shows the onboarding wizard
```

### Edge Function — orcid-callback

Create `supabase/functions/orcid-callback/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url    = new URL(req.url);
  const code   = url.searchParams.get("code");
  const state  = url.searchParams.get("state"); // 'signup' or 'link'
  const appUrl = Deno.env.get("APP_URL") || "https://luminary.to";

  const isProduction = Deno.env.get("ORCID_ENV") === "production";
  const orcidBase    = isProduction
    ? "https://orcid.org"
    : "https://sandbox.orcid.org";
  const orcidApiBase = isProduction
    ? "https://pub.orcid.org/v3.0"
    : "https://pub.sandbox.orcid.org/v3.0";

  const clientId     = Deno.env.get("ORCID_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ORCID_CLIENT_SECRET")!;
  const redirectUri  = Deno.env.get("ORCID_REDIRECT_URI")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const redirectError = (msg: string) =>
    Response.redirect(`${appUrl}?orcid_error=${encodeURIComponent(msg)}`, 302);

  try {
    if (!code) return redirectError("No authorisation code received from ORCID.");

    // ── Step 1: Exchange code for access token ───────────────────────────────
    const tokenResp = await fetch(`${orcidBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("Token exchange failed:", err);
      return redirectError("ORCID authentication failed. Please try again.");
    }

    const tokenData = await tokenResp.json();
    const orcidId   = tokenData.orcid;
    const accessToken = tokenData.access_token;

    if (!orcidId) return redirectError("Could not retrieve ORCID iD.");

    // ── Step 2: Fetch full ORCID record ──────────────────────────────────────
    const recordResp = await fetch(`${orcidApiBase}/${orcidId}/record`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const record = recordResp.ok ? await recordResp.json() : null;

    // Parse person info
    const person  = record?.person || {};
    const given   = person.name?.["given-names"]?.value || "";
    const family  = person.name?.["family-name"]?.value || "";
    const fullName = `${given} ${family}`.trim();
    const bio     = person.biography?.content || "";
    const keywords = (person.keywords?.keyword || [])
      .map((k: any) => k.content).filter(Boolean);

    // Parse employment
    const employments = (record?.["activities-summary"]?.employments
      ?.["affiliation-group"] || [])
      .flatMap((g: any) => g.summaries || [])
      .map((s: any) => s["employment-summary"] || s)
      .map((e: any) => ({
        title:    e["role-title"] || "",
        company:  e.organization?.name || "",
        location: [
          e.organization?.address?.city,
          e.organization?.address?.country,
        ].filter(Boolean).join(", "),
        start: e["start-date"]?.year?.value
          ? `${e["start-date"].year.value}-${String(e["start-date"].month?.value || 1).padStart(2,"0")}`
          : "",
        end: e["end-date"]?.year?.value
          ? `${e["end-date"].year.value}-${String(e["end-date"].month?.value || 1).padStart(2,"0")}`
          : "",
        description: "",
      }))
      .filter((e: any) => e.company || e.title);

    // Parse education
    const educations = (record?.["activities-summary"]?.educations
      ?.["affiliation-group"] || [])
      .flatMap((g: any) => g.summaries || [])
      .map((s: any) => s["education-summary"] || s)
      .map((e: any) => ({
        school: e.organization?.name || "",
        degree: e["role-title"] || "",
        field:  "",
        start:  e["start-date"]?.year?.value || "",
        end:    e["end-date"]?.year?.value   || "",
      }))
      .filter((e: any) => e.school);

    // Current institution (most recent employment)
    const currentInstitution = employments[0]?.company || "";
    const currentTitle       = employments[0]?.title   || "";

    // Parse publications
    const works = record?.["activities-summary"]?.works?.group || [];
    const publications = works.map((g: any) => {
      const ws  = g["work-summary"]?.[0];
      if (!ws) return null;
      const doi  = (ws["external-ids"]?.["external-id"] || [])
        .find((x: any) => x["external-id-type"] === "doi");
      const pmid = (ws["external-ids"]?.["external-id"] || [])
        .find((x: any) => x["external-id-type"] === "pmid");
      return {
        title:   ws.title?.title?.value || "",
        journal: ws["journal-title"]?.value || "",
        year:    ws["publication-date"]?.year?.value || "",
        doi:     doi?.["external-id-value"] || "",
        pmid:    pmid?.["external-id-value"] || "",
        source:  "orcid",
      };
    }).filter((p: any) => p && p.title);

    // ── Step 3: Check if ORCID already registered ────────────────────────────
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("orcid", orcidId)
      .single();

    if (existing) {
      // User already has an account — sign them in
      // Get their email to create a session
      const { data: authUser } = await supabase.auth.admin.getUserById(existing.id);
      if (!authUser?.user?.email) return redirectError("Account found but could not sign in. Please use email/password.");

      // Create a magic link they can use to sign in
      const { data: magicLink } = await supabase.auth.admin.generateLink({
        type:  "magiclink",
        email: authUser.user.email,
      });

      if (magicLink?.properties?.action_link) {
        return Response.redirect(magicLink.properties.action_link, 302);
      }
      return redirectError("Account found. Please sign in with your email and password.");
    }

    // ── Step 4: Store ORCID data in session for the sign-up form ────────────
    // We can't create the account yet — we need the user's email and password.
    // Store the ORCID data in a temporary table and pass back a token.

    const tempToken = crypto.randomUUID();
    await supabase.from("orcid_pending").insert({
      token:       tempToken,
      orcid_id:    orcidId,
      name:        fullName,
      bio,
      institution: currentInstitution,
      title:       currentTitle,
      work_history: JSON.stringify(employments),
      education:    JSON.stringify(educations),
      publications: JSON.stringify(publications),
      keywords:     JSON.stringify(keywords),
      expires_at:   new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    });

    // Redirect back to app with token
    return Response.redirect(
      `${appUrl}?orcid_token=${tempToken}&orcid_name=${encodeURIComponent(fullName)}`,
      302
    );

  } catch (err: any) {
    console.error("ORCID callback error:", err.message);
    return redirectError("Something went wrong. Please try again.");
  }
});
```

### Temporary storage for ORCID pending sign-ups

Add to `migration_security.sql`:

```sql
-- Temporary storage for ORCID data between OAuth callback and account creation
create table if not exists orcid_pending (
  id           uuid primary key default gen_random_uuid(),
  token        text unique not null,
  orcid_id     text not null,
  name         text default '',
  bio          text default '',
  institution  text default '',
  title        text default '',
  work_history text default '[]',  -- JSON string
  education    text default '[]',
  publications text default '[]',
  keywords     text default '[]',
  expires_at   timestamptz not null,
  created_at   timestamptz default now()
);

-- Clean up expired pending records automatically
create or replace function cleanup_orcid_pending()
returns void language sql as $$
  delete from orcid_pending where expires_at < now();
$$;

-- No RLS needed — accessed only via service role from Edge Function
```

### Deploy the callback

```bash
npx supabase functions deploy orcid-callback
```

**Important:** The callback Edge Function must have JWT verification **OFF**
because it's called by ORCID's servers, not by an authenticated user.
Go to Supabase → Edge Functions → orcid-callback → Verify JWT → OFF.

The validate-invite function should have JWT verification OFF too
(called during sign-up before the user has a session).

All other Edge Functions (auto-tag, extract-publications) keep JWT ON.

---

### Frontend — AuthScreen changes

In `src/screens/AuthScreen.jsx`:

**1. Add ORCID OAuth button**

Replace the current ORCID iD text input path with an OAuth button:

```jsx
// In the sign-up entry screen, replace the ORCID path card content:
<button onClick={handleOrcidOAuth} style={{
  width:'100%', padding:'16px', borderRadius:14, marginBottom:12,
  border:`2px solid ${T.bdr}`, background:T.w, cursor:'pointer',
  textAlign:'left', fontFamily:'inherit',
  display:'flex', alignItems:'center', gap:14,
}}>
  <span style={{fontSize:28}}>🔬</span>
  <div>
    <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>
      Sign up with ORCID
    </div>
    <div style={{fontSize:12, color:T.mu}}>
      Verified researcher identity — auto-fills your profile
    </div>
  </div>
  <span style={{marginLeft:'auto', color:T.mu}}>→</span>
</button>
```

**2. ORCID OAuth redirect function**

```javascript
const ORCID_BASE = 'https://sandbox.orcid.org'; // change to orcid.org for production
const ORCID_CLIENT_ID = 'YOUR_SANDBOX_CLIENT_ID'; // store in constants or env

const handleOrcidOAuth = () => {
  const params = new URLSearchParams({
    client_id:     ORCID_CLIENT_ID,
    response_type: 'code',
    scope:         '/authenticate /read-limited',
    redirect_uri:  'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/orcid-callback',
    state:         'signup',
  });
  window.location.href = `${ORCID_BASE}/oauth/authorize?${params}`;
};
```

Store `ORCID_CLIENT_ID` in `src/lib/constants.js` — it is not secret
(it's a public identifier, like the anon key).

**3. Handle the redirect back from ORCID**

In `App.jsx`, on mount check for ORCID callback parameters:

```javascript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const orcidToken = params.get('orcid_token');
  const orcidName  = params.get('orcid_name');
  const orcidError = params.get('orcid_error');

  if (orcidError) {
    // Show error on auth screen
    setOrcidAuthError(decodeURIComponent(orcidError));
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }

  if (orcidToken) {
    // ORCID OAuth succeeded — show email/password form with data pre-filled
    setOrcidPendingToken(orcidToken);
    setOrcidPendingName(decodeURIComponent(orcidName || ''));
    setShowOrcidEmailForm(true);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }
}, []);
```

State to add in App.jsx:
```javascript
const [orcidPendingToken,  setOrcidPendingToken]  = useState('');
const [orcidPendingName,   setOrcidPendingName]   = useState('');
const [showOrcidEmailForm, setShowOrcidEmailForm] = useState(false);
const [orcidAuthError,     setOrcidAuthError]     = useState('');
```

**4. ORCID email/password completion form**

When `showOrcidEmailForm` is true, show in AuthScreen:

```jsx
<div>
  {/* Success banner */}
  <div style={{
    background:T.gr2, border:`1px solid rgba(16,185,129,.2)`,
    borderRadius:12, padding:'14px 16px', marginBottom:20,
  }}>
    <div style={{fontSize:12, fontWeight:700, color:T.gr, marginBottom:4}}>
      ✓ ORCID verified
    </div>
    <div style={{fontSize:14, fontWeight:700}}>{orcidPendingName}</div>
    <div style={{fontSize:12, color:T.mu}}>
      Your profile, work history, and publications will be imported automatically.
    </div>
  </div>

  <div style={{fontSize:13, fontWeight:600, marginBottom:12}}>
    Set your login email and password:
  </div>

  <Inp label="Email address" type="email" value={signupEmail}
    onChange={e => setSignupEmail(e.target.value)}
    placeholder="your@email.com"/>
  <Inp label="Password" type="password" value={signupPassword}
    onChange={e => setSignupPassword(e.target.value)}
    placeholder="At least 8 characters"/>

  {signupError && (
    <div style={{color:T.ro, fontSize:12.5, marginTop:8}}>{signupError}</div>
  )}

  <Btn variant="s" onClick={handleOrcidSignupComplete}
    disabled={signupLoading || !signupEmail || !signupPassword}
    style={{width:'100%', marginTop:12, background:T.gr, borderColor:T.gr}}>
    {signupLoading ? 'Creating account...' : 'Create account →'}
  </Btn>
</div>
```

**5. Complete ORCID sign-up handler**

```javascript
const handleOrcidSignupComplete = async () => {
  setSignupLoading(true);
  setSignupError('');
  try {
    // 1. Fetch the pending ORCID data using the token
    const { data: pending } = await supabase
      .from('orcid_pending')
      .select('*')
      .eq('token', orcidPendingToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!pending) throw new Error('ORCID session expired. Please sign up again.');

    // 2. Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email:    signupEmail,
      password: signupPassword,
    });
    if (authError) throw authError;

    const userId = authData.user?.id;
    if (!userId) throw new Error('Account creation failed.');

    // 3. Populate profile with ORCID data
    await supabase.from('profiles').update({
      name:          pending.name,
      bio:           pending.bio,
      institution:   pending.institution,
      title:         pending.title,
      orcid:         pending.orcid_id,
      orcid_verified: true,
      signup_method: 'orcid',
      work_history:  JSON.parse(pending.work_history || '[]'),
      education:     JSON.parse(pending.education    || '[]'),
    }).eq('id', userId);

    // 4. Insert publications
    const pubs = JSON.parse(pending.publications || '[]');
    if (pubs.length) {
      await supabase.from('publications').insert(
        pubs.map((p: any) => ({
          user_id: userId,
          title:   p.title,
          journal: p.journal,
          year:    p.year,
          doi:     p.doi || '',
          pmid:    p.pmid || '',
          source:  'orcid',
        }))
      );
    }

    // 5. Generate 5 invite codes
    await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

    // 6. Clean up pending record
    await supabase.from('orcid_pending').delete().eq('token', orcidPendingToken);

    // Done — Supabase auth session is now active, app will re-render
  } catch(e: any) {
    setSignupError(e.message || 'Sign-up failed. Please try again.');
  }
  setSignupLoading(false);
};
```

---

## Deployment order

1. Run `migration_security.sql` in Supabase SQL Editor
2. Add Supabase secrets (ORCID credentials, APP_URL, ORCID_ENV)
3. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy validate-invite
   npx supabase functions deploy orcid-callback
   ```
4. Set JWT verification:
   - `validate-invite` → JWT **OFF** (called before user has session)
   - `orcid-callback`  → JWT **OFF** (called by ORCID servers)
   - `auto-tag`        → JWT **ON**  (unchanged)
   - `extract-publications` → JWT **ON** (unchanged)
5. Add `ORCID_CLIENT_ID` to `src/lib/constants.js`
6. Deploy frontend: `git add . && git commit -m "ORCID OAuth + invite protection" && git push`

---

## Testing checklist

### Invite code attempts
- [ ] Try an invalid code 5 times → verify it shows "locked" message
- [ ] Try a valid code → verify it works and resets attempts to 0
- [ ] Check Supabase table → verify attempts column increments correctly

### ORCID OAuth (sandbox first)
- [ ] Create a sandbox ORCID account at sandbox.orcid.org
- [ ] Click "Sign up with ORCID" → verify redirect to sandbox.orcid.org
- [ ] Approve access → verify redirect back to app with orcid_token param
- [ ] Complete email/password form → verify account created
- [ ] Check profiles table → verify name, institution, orcid populated
- [ ] Check publications table → verify ORCID works imported
- [ ] Try signing up again with same ORCID → verify "already registered" handling

---

## Remind the user

1. The ORCID_CLIENT_ID (public) goes in constants.js — safe to commit
2. The ORCID_CLIENT_SECRET goes in Supabase secrets only — never in code
3. Test everything with sandbox credentials before switching to production
4. To switch to production: change ORCID_ENV secret to "production" and
   update ORCID_CLIENT_ID in constants.js to the production client ID
5. The orcid_pending table auto-expires records after 30 minutes —
   run cleanup_orcid_pending() periodically or set up a Supabase cron job
