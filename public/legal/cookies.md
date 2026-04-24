# Luminary — Cookie Policy

_Last updated: April 24, 2026_
_Effective date: April 24, 2026_


---

## 1. Introduction

This Cookie Policy explains how Luminary ("we", "us", "our"), operated
by Qurio LLC, uses cookies and similar technologies on our Platform
at luminary.to.

We believe in being straightforward about this: **Luminary uses
significantly fewer tracking technologies than most platforms.** We do
not use advertising cookies, retargeting pixels, or third-party tracking
networks. This policy explains what we do use and why.

---

## 2. What are cookies?

Cookies are small text files placed on your device by a website. They
are widely used to make websites work properly, remember your
preferences, and — on many platforms — track your behaviour for
advertising purposes.

Luminary uses **localStorage** and **sessionStorage** (browser-based
storage mechanisms) rather than traditional cookies for most purposes.
These work similarly to cookies — they store small pieces of data in
your browser — but they are not transmitted with every HTTP request and
are limited to our domain only.

The practical difference for you: the same rights and controls apply,
and you can clear them at any time through your browser settings.

---

## 3. What we use and why

### 3.1 Essential storage (always active)

These are strictly necessary for the Platform to function. They cannot
be disabled without breaking core features. No consent is required for
these under applicable law.

| Name / Key | Type | Purpose | Duration |
|---|---|---|---|
| `sb-[project]-auth-token` | localStorage | Supabase authentication session token — keeps you logged in | Until you log out or token expires |
| `sb-[project]-auth-token-code-verifier` | localStorage | PKCE verification for secure OAuth login flows (ORCID) | Session — deleted after login completes |
| Screen state / navigation | localStorage | Remembers which screen you were viewing | Session |
| Feed preferences | localStorage | Remembers your For You / Following tab preference | Until cleared |
| Dismissed UI elements | localStorage | Remembers which tips, banners, or prompts you have dismissed | Until cleared |
| `prefill_invite_code` | sessionStorage | Temporarily stores your invite code during the signup flow | Session — deleted immediately after use |
| `open_conversation` | sessionStorage | Temporarily stores a conversation target when navigating to messages from a user profile | Session — deleted immediately after use |

**Operated by:** Luminary / Supabase
**Third-party access:** None for essential storage items

---

### 3.2 Analytics storage (consent required)

These are only activated after you have explicitly accepted analytics
tracking during registration or via your account settings. If you have
not consented, none of these are set.

| Name / Key | Type | Purpose | Duration |
|---|---|---|---|
| `ph_[project_key]_posthog` | localStorage | PostHog analytics — stores your pseudonymous analytics identifier and session data | Up to 1 year |
| `ph_[project_key]_window_id` | localStorage | PostHog session window tracking | Session |
| `ph_opt_in_site_apps` | localStorage | Records your PostHog opt-in status | Persistent |

**What PostHog collects when active:**
Named events describing how you use the Platform (e.g. "post created",
"group joined"). Events are associated with a pseudonymous UUID — not
your name, email address, or institution. Session recording is
disabled. No advertising or cross-site tracking.

**Operated by:** PostHog, Inc.
**PostHog Privacy Policy:** posthog.com/privacy
**Data location:** United States (app.posthog.com)

**To opt out:** Go to Settings → Privacy → Usage analytics → Off.
This removes your PostHog identifier and stops all event tracking.

---

### 3.3 What we do NOT use

To be explicit about what is absent from Luminary:

| Technology | Used? |
|---|---|
| Advertising cookies | ❌ No |
| Retargeting pixels (Meta, Google Ads, etc.) | ❌ No |
| Third-party analytics beyond PostHog | ❌ No |
| Cross-site tracking | ❌ No |
| Social media tracking buttons | ❌ No |
| Fingerprinting | ❌ No |
| Heatmap or session recording tools | ❌ No |
| A/B testing platforms | ❌ No |

---

## 4. Third-party services and their storage

When you use certain features, third-party services may set their own
cookies or storage. These are outside our control and subject to the
third party's own privacy and cookie policies.

| Service | When triggered | Their privacy policy |
|---|---|---|
| **ORCID** | When you log in via ORCID or import your ORCID profile | orcid.org/privacy-policy |
| **CrossRef** | When you look up a paper by DOI | crossref.org/privacy |
| **Europe PubMed Central** | When you search papers via EPMC | europepmc.org/Privacy |
| **ClinicalTrials.gov** | When you search clinical trials | clinicaltrials.gov/ct2/about-site/privacy |

These services are queried directly by your browser or by our server,
and their own cookie/storage policies apply to any direct browser
interactions. Luminary does not control or have access to storage set
by these third parties.

---

## 5. Your choices and controls

### 5.1 Analytics opt-out

You can opt out of PostHog analytics at any time:
- Go to **Settings → Privacy → Usage analytics** and toggle it off
- This immediately stops event tracking and removes your PostHog
  identifier from localStorage

### 5.2 Browser controls

You can view, manage, and delete localStorage and sessionStorage
through your browser's developer tools:

**Chrome / Edge:**
Developer Tools (F12) → Application → Storage → Local Storage / Session Storage

**Firefox:**
Developer Tools (F12) → Storage → Local Storage / Session Storage

**Safari:**
Develop menu → Show Web Inspector → Storage

**Clearing all browser storage:**
Most browsers allow you to clear all site data (cookies, localStorage,
sessionStorage) through Settings → Privacy / History → Clear browsing
data. Note that this will log you out of Luminary and reset all
preferences.

### 5.3 Effect of disabling storage

If you disable or clear essential storage, you will need to log in
again and your UI preferences (tab settings, dismissed tips, etc.)
will be reset. The Platform will continue to function but may feel
less personalised.

If you opt out of analytics, no usage data is collected. All Platform
features remain fully available — opting out has no effect on your
access or experience.

---

## 6. Do Not Track

Some browsers offer a "Do Not Track" (DNT) signal. Luminary does not
currently respond to DNT signals in a standardised way, as there is no
universal standard for how DNT should be implemented. Instead, we rely
on your explicit consent for analytics tracking (Section 3.2) as the
primary privacy control.

---

## 7. Changes to this Cookie Policy

We may update this Cookie Policy when we add new features or third-party
integrations that involve new storage. We will update the "Last updated"
date and, for material changes, notify you via the Platform or email.

---

## 8. Contact

For questions about this Cookie Policy or our use of tracking
technologies:

**Email:** legal@luminary.to
**Address:** Qurio LLC, Yakumo 2-20-2, Meguro-ku, Tokyo 152-0023, Japan

---

## Appendix — Quick reference summary

| Storage type | Consent needed? | Can be disabled? | Effect of disabling |
|---|---|---|---|
| Authentication token | No — essential | Yes (clear browser storage) | Logged out |
| UI preferences | No — essential | Yes (clear browser storage) | Preferences reset |
| PostHog analytics | Yes — consent required | Yes (in Settings or browser) | No analytics collected; full access retained |

---

_Qurio LLC · Yakumo 2-20-2, Meguro-ku, Tokyo 152-0023, Japan_
_Privacy enquiries: legal@luminary.to_
