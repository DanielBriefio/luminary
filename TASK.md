# Task: PostHog Analytics Integration

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task integrates PostHog analytics into Luminary. Events are
consent-gated — PostHog initialises in opted-out state and only begins
capturing after the user has accepted terms (`marketing_consent_at` is
set on their profile). Users are identified by their Supabase UUID.
No session recording. US cloud (`app.posthog.com`).

Scope:

1. Install `posthog-js` package
2. `src/lib/analytics.js` — PostHog wrapper with init, identify,
   opt-in, opt-out, and capture helpers
3. `App.jsx` — initialise PostHog on app load, opt-in after auth +
   consent confirmed, identify user
4. `AuthScreen.jsx` — capture `signed_up` and `invite_code_used` events
5. Event capture across key screens and actions (see Step 5)
6. `src/admin/OverviewSection.jsx` — PostHog placeholder updated with
   real dashboard link

> ⚠️ Never hardcode the PostHog key. Always use
> `process.env.REACT_APP_POSTHOG_KEY`. If the env var is missing,
> analytics should fail silently — never block app functionality.

---

## Step 1 — Install PostHog

```bash
npm install posthog-js
```

Verify it appears in `package.json` dependencies before proceeding.

---

## Step 2 — analytics.js

Create `src/lib/analytics.js`:

```javascript
import posthog from 'posthog-js';

const KEY  = process.env.REACT_APP_POSTHOG_KEY;
const HOST = 'https://app.posthog.com';

let initialised = false;

/**
 * Initialise PostHog in opted-out state.
 * Called once on app load, before auth resolves.
 * Capturing only begins after optIn() is called.
 */
export function initAnalytics() {
  if (!KEY) return; // fail silently if key missing
  if (initialised) return;

  posthog.init(KEY, {
    api_host:                    HOST,
    opt_out_capturing_by_default: true,  // consent-gated
    capture_pageview:             false, // we control pageview manually
    capture_pageleave:            false,
    disable_session_recording:    true,  // events only
    persistence:                  'localStorage',
    autocapture:                  false, // explicit events only
  });

  initialised = true;
}

/**
 * Opt in and identify the user.
 * Called after login when marketing_consent_at is confirmed set.
 */
export function optInAndIdentify(userId, properties = {}) {
  if (!KEY || !initialised) return;
  posthog.opt_in_capturing();
  posthog.identify(userId, properties);
}

/**
 * Opt out and reset identity.
 * Called on sign out.
 */
export function optOutAndReset() {
  if (!KEY || !initialised) return;
  posthog.opt_out_capturing();
  posthog.reset();
}

/**
 * Capture a named event with optional properties.
 * Fails silently if PostHog is not initialised or opted out.
 */
export function capture(event, properties = {}) {
  if (!KEY || !initialised) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // never block app functionality
  }
}

/**
 * Capture a page view manually.
 * Call when the active screen changes.
 */
export function capturePageview(screenName, properties = {}) {
  capture('$pageview', { screen: screenName, ...properties });
}
```

---

## Step 3 — App.jsx — init, identify, opt-in, sign-out

Read App.jsx carefully before making any changes.

### Initialise on app load

Import and call `initAnalytics()` as early as possible — before auth
resolves. Add it at the top of the main App component body or in a
top-level effect with no dependencies:

```javascript
import { initAnalytics, optInAndIdentify, optOutAndReset, capturePageview } from './lib/analytics';

// In App component — runs once on mount:
useEffect(() => {
  initAnalytics();
}, []);
```

### Opt-in after auth + consent confirmed

Find the useEffect (or equivalent) that runs after `user` and `profile`
are loaded. Add opt-in logic:

```javascript
useEffect(() => {
  if (!user || !profile) return;

  if (profile.marketing_consent_at) {
    optInAndIdentify(user.id, {
      work_mode:   profile.work_mode   || null,
      has_orcid:   !!profile.orcid,
      is_admin:    !!profile.is_admin,
    });
  }
}, [user?.id, profile?.marketing_consent_at]);
```

Do NOT pass name, email, institution, or any PII as identify properties.
UUID + work_mode + boolean flags only.

### Capture screen changes (pageviews)

Find where `screen` state changes are set (the `setScreen()` calls or
equivalent). After the main screen state is set, capture a pageview:

```javascript
// Wrap or extend the existing setScreen / navigation logic:
const navigate = (newScreen) => {
  setScreen(newScreen);
  capturePageview(newScreen);
};
```

If App.jsx already has a navigate wrapper, add `capturePageview` there.
If screens are set directly with `setScreen()`, find the most common
call sites and add `capturePageview()` alongside them. Do not add it
to every single setScreen call — just the main navigation transitions.

### Sign-out

Find where sign-out is handled (likely a `supabase.auth.signOut()` call).
Add opt-out before or after:

```javascript
optOutAndReset();
await supabase.auth.signOut();
```

---

## Step 4 — AuthScreen.jsx — signup and invite events

Read AuthScreen.jsx carefully before modifying.

Find the point after a successful `supabase.auth.signUp()` call. Add:

```javascript
import { capture } from '../lib/analytics';

// After successful signup:
capture('signed_up', {
  method: signedUpWithOrcid ? 'orcid' : 'email',
});

// If an invite code was used, also capture:
if (inviteCode) {
  capture('invite_code_used', {
    code_type: codeRow?.is_multi_use ? 'event' : 'personal',
  });
}
```

Match whatever variable names AuthScreen uses for the ORCID flag and
invite code. Do not restructure the auth flow — surgical addition only.

---

## Step 5 — Event capture across the app

Add `capture()` calls at the following points. Import from
`'../lib/analytics'` (adjust path depth as needed per file).

For each file, read it carefully before modifying. Add capture calls
as close as possible to the success point of each action — after the
Supabase insert/update succeeds, not before.

### NewPostScreen.jsx
```javascript
// After successful post insert:
capture('post_created', {
  post_type: postType, // 'text' | 'paper' | 'link' | 'upload' | 'tip'
  has_tags:  tags.length > 0,
});

// If post_type is 'paper', also:
capture('paper_shared', { has_doi: !!doi });
```

### FeedScreen.jsx
```javascript
// After successful like insert (optimistic update confirm):
capture('post_liked');

// After successful comment insert:
capture('comment_posted');
```

### GroupsScreen (src/groups/GroupsScreen.jsx — NOT the legacy one):
```javascript
// After successful group creation:
capture('group_created', { is_public: isPublic });
```

### GroupScreen.jsx or GroupMembers.jsx:
```javascript
// After user successfully joins a group:
capture('group_joined', { group_id: groupId });
```

### ProfileScreen.jsx — PublicationsTab.jsx:
```javascript
// After successful publication insert:
capture('publication_added', {
  source: 'manual', // or 'orcid' | 'ai' | 'ris' depending on import path
});
```

### LibraryScreen.jsx:
```javascript
// After successful library_items insert:
capture('library_item_added', {
  source: 'epmc', // or 'doi' | 'upload' | 'ris' | 'trials'
});
```

### ProjectsScreen.jsx or CreateProjectModal.jsx:
```javascript
// After successful project creation:
capture('project_created', {
  template_type: templateType || 'blank',
});
```

### TemplateGallery.jsx:
```javascript
// When user clicks "Use template":
capture('template_used', {
  template_type: template.type || template.id,
  source: isCommunityTemplate ? 'community' : 'curated',
});
```

### SaveAsTemplateModal.jsx:
```javascript
// After successful community template submission:
capture('template_submitted');
```

### MessagesScreen.jsx:
```javascript
// After successful message insert:
capture('dm_sent');
```

### OnboardingScreen.jsx:
```javascript
// When onboarding is completed/dismissed:
capture('onboarding_completed');
```

### ProfileCompletionMeter.jsx:
```javascript
// When stage advances (existing stage tracking logic):
capture('profile_stage_reached', { stage: stageName });
// stageName: 'newcomer' | 'credible' | 'connected' | 'active' | 'visible'
```

### Admin — BulkNudgeModal.jsx:
```javascript
// After successful send_admin_nudge RPC:
capture('admin_nudge_sent', { recipient_count: targetUsers.length });
```

### Admin — ContentSection.jsx (PostsTab):
```javascript
// After featuring a post:
capture('post_featured', { duration_hours: hours || 'permanent' });
```

### Admin — TemplatesSection.jsx:
```javascript
// After approving a template:
capture('template_approved');
```

---

## Step 6 — Update PostHog placeholder in OverviewSection.jsx

Find the `PostHogCard` component in `src/admin/OverviewSection.jsx`.
Update the "Open PostHog →" link and add the project dashboard URL:

```jsx
function PostHogCard() {
  const dashboardUrl = `https://app.posthog.com`;

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6,
      }}>
        📊 PostHog Analytics
      </div>
      <div style={{
        fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: 12,
      }}>
        Event-based analytics. Funnels, retention, and feature adoption
        data live in PostHog. Capturing is consent-gated — only users
        who accepted terms are tracked.
      </div>
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Dashboard',  url: dashboardUrl },
          { label: 'Funnels',    url: `${dashboardUrl}/funnels` },
          { label: 'Insights',   url: `${dashboardUrl}/insights` },
        ].map(link => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${T.bdr}`, background: T.s2,
              color: T.v, fontSize: 12.5, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {link.label} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- Any existing Supabase auth logic — PostHog is additive only
- Any existing feed, profile, groups, projects, library screens
  beyond adding capture() calls
- The PostHog key must always come from
  `process.env.REACT_APP_POSTHOG_KEY` — never hardcoded
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Verify .env has the key:
#    REACT_APP_POSTHOG_KEY=phc_...
#    (Never commit .env to git)

# 2. Verify .env is in .gitignore before deploying

# 3. Add the env var to Vercel:
#    Vercel Dashboard → Project → Settings → Environment Variables
#    Name:  REACT_APP_POSTHOG_KEY
#    Value: phc_... (your key)
#    Environment: Production + Preview

# 4. Deploy:
git add . && git commit -m "PostHog analytics: consent-gated event tracking, user identification, key activation events" && git push
```

---

## Remind the user

**Vercel env var is required.** The `.env` file only works locally.
For production (luminary.to), you must add `REACT_APP_POSTHOG_KEY`
as an environment variable in the Vercel dashboard. Without this,
PostHog will be silently disabled in production.

**Testing PostHog locally:**
1. Open the app, log in as a user with `marketing_consent_at` set
2. Open browser DevTools → Network tab
3. Filter by `posthog` or `app.posthog.com`
4. Perform an action (create a post, like something)
5. You should see network requests to `app.posthog.com/capture`
6. In PostHog dashboard → Live Events — events appear within seconds

**Testing consent gate:**
1. Log in as a user WITHOUT `marketing_consent_at` set
2. Check Network tab — no PostHog requests should appear
3. Set `marketing_consent_at = now()` in Supabase for that user
4. Refresh — PostHog requests should now appear

**If no events appear in PostHog dashboard:**
- Check `REACT_APP_POSTHOG_KEY` is correct (no extra spaces)
- Check browser console for PostHog errors
- Check Network tab for failed requests to `app.posthog.com`
- Verify `marketing_consent_at` is set on the test user's profile
- Remember: PostHog free tier has a slight delay in the dashboard
  (Live Events is near-real-time; Insights may lag a few minutes)

---

## Testing checklist

**Installation:**
- [ ] `posthog-js` appears in `package.json` dependencies
- [ ] `src/lib/analytics.js` created
- [ ] `npm run build` succeeds

**Initialisation:**
- [ ] PostHog initialises on app load (check console — no errors)
- [ ] No network requests to PostHog before consent given
- [ ] After login with `marketing_consent_at` set → requests appear
- [ ] After login WITHOUT `marketing_consent_at` → no requests
- [ ] Sign-out resets PostHog identity (check via posthog.reset())

**User identification:**
- [ ] PostHog identifies user by Supabase UUID after opt-in
- [ ] `work_mode` and `is_admin` properties set on identify
- [ ] No PII (name, email, institution) in identify properties

**Key events fire correctly:**
- [ ] `signed_up` fires after new account creation
- [ ] `invite_code_used` fires when invite code used at signup
- [ ] `post_created` fires with correct post_type
- [ ] `post_liked` fires on like
- [ ] `comment_posted` fires on comment
- [ ] `group_created` fires after group creation
- [ ] `group_joined` fires after joining a group
- [ ] `publication_added` fires after adding a publication
- [ ] `library_item_added` fires with correct source
- [ ] `project_created` fires with template_type
- [ ] `template_used` fires with source (curated/community)
- [ ] `dm_sent` fires after sending a message
- [ ] `onboarding_completed` fires on onboarding finish
- [ ] `profile_stage_reached` fires when stage advances

**PostHog dashboard:**
- [ ] Events appear in PostHog Live Events within seconds
- [ ] User identity visible on events (UUID, not name)
- [ ] No duplicate events firing per action

**Vercel:**
- [ ] `REACT_APP_POSTHOG_KEY` added to Vercel environment variables
- [ ] Production deployment captures events correctly
- [ ] Key is NOT visible in any committed file in the repo
