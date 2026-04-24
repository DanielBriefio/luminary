# Luminary — Privacy Policy

_Last updated: April 24, 2026_
_Effective date: April 24, 2026_

---

> **Important notice:** This document is a draft prepared for legal
> review. It should be reviewed by a qualified lawyer before publication,
> particularly with respect to GDPR, UK GDPR, Japanese Act on the
> Protection of Personal Information (APPI), and any other applicable
> data protection laws in your target jurisdictions. This draft does not
> constitute legal advice.

---

## 1. Introduction

Qurio LLC ("Qurio", "we", "us", "our") operates the Luminary
platform at luminary.to ("the Platform"). We are committed to protecting
your personal data and respecting your privacy.

This Privacy Policy explains:
- What personal data we collect and why
- How we use, store, and protect your data
- Who we share it with
- Your rights regarding your data
- How to contact us with privacy questions

This Privacy Policy applies to all users of the Platform and to visitors
to luminary.to. It should be read alongside our Terms of Use.

**Data controller:**
Qurio LLC
Yakumo 2-20-2, Meguro-ku, Tokyo 152-0023, Japan
0110-03-021185
team@luminary.to

---

## 2. Data We Collect

### 2.1 Data you provide directly

**Account registration:**
- Full name
- Email address
- Password (stored as a cryptographic hash — we never see your password)
- Invitation code used at signup

**Professional profile:**
- Job title and current institution
- Work history and education
- Location (city, country)
- Biography
- ORCID identifier (if you connect your ORCID account)
- Twitter/X handle (if provided)
- Skills, languages, honours, organisations, patents, grants
- Publications list

**Content you create:**
- Posts, comments, likes, and reposts
- Papers shared and library items saved
- Direct messages
- Group memberships and content posted in groups
- Projects and project posts
- Community templates you submit

**Files you upload:**
- Profile avatar
- CV or resume (for profile import — processed and then discarded)
- Documents, images, videos, PDFs, audio files, and data files
  uploaded as post attachments or library items

**Communication preferences:**
- Email notification preferences
- Marketing and product update preferences
- Analytics consent (whether you have accepted usage tracking)

### 2.2 Data collected automatically

**Technical data:**
- IP address (used for security and rate limiting; not stored
  permanently in user-identifiable form)
- Browser type and version
- Operating system
- Device type
- Referring URL

**Usage data (analytics):**
If you have given consent, we collect anonymised event data about
how you use the Platform, including which features you use, which
screens you visit, and key actions such as creating posts, joining
groups, and adding library items. This data is collected via PostHog
(see Section 4.3) and is tied to a pseudonymous identifier (your
account UUID), not your name or email address.

**Cookies and local storage:**
We use browser localStorage to store your session preferences and
certain UI state (such as dismissed notifications or feed preferences).
We do not use third-party advertising cookies.

### 2.3 Data collected from third parties

**ORCID:**
If you authenticate via ORCID or import your ORCID profile, we receive
the data you have made available through the ORCID `/authenticate` scope
and any public ORCID profile data you choose to import, including your
name, ORCID iD, and publications. We do not receive your ORCID password.

**CrossRef and Europe PubMed Central:**
When you share a paper by DOI, we retrieve publicly available metadata
(title, authors, abstract, journal, year) from CrossRef and/or Europe
PubMed Central. This data is stored as part of the post.

**ClinicalTrials.gov:**
When you search for clinical trials in the Library, we query the
ClinicalTrials.gov API and may store retrieved trial metadata in your
library. This data is publicly available.

**LinkedIn (indirect):**
If you import your LinkedIn profile, you provide us with an exported
data file from LinkedIn. We do not connect to LinkedIn directly or
access your LinkedIn account. The data you provide is processed to
populate your profile and the original file is discarded after import.

---

## 3. How We Use Your Data

We use your personal data for the following purposes and on the
following legal bases:

| Purpose | Data used | Legal basis |
|---|---|---|
| Creating and managing your account | Name, email, password hash | Contract performance |
| Displaying your professional profile | Profile fields you provide | Contract performance |
| Enabling platform features | All usage data | Contract performance |
| Sending transactional notifications | Email address, notification preferences | Contract performance |
| Sending product updates and news | Email address, marketing preference | Consent |
| Anonymised usage analytics | Pseudonymous event data | Consent |
| Security and fraud prevention | IP address, login data | Legitimate interest |
| Improving the Platform | Anonymised usage patterns | Legitimate interest |
| Complying with legal obligations | As required | Legal obligation |
| Enforcing our Terms of Use | Usage and content data | Legitimate interest |

We will not use your data for purposes incompatible with those listed
above without obtaining your consent or having another lawful basis
to do so.

---

## 4. Data Sharing and Third Parties

### 4.1 We do not sell your data

We do not sell, rent, or trade your personal data to third parties for
marketing or commercial purposes. Full stop.

### 4.2 Service providers (data processors)

We share data with the following service providers who process it on
our behalf and under our instructions:

**Supabase (database and authentication)**
- Purpose: Hosting our database, user authentication, and file storage
- Data: All platform data
- Location: [Supabase data region — e.g. EU (Frankfurt) / US]
- Safeguards: [DPA in place / Standard Contractual Clauses]
- Privacy policy: supabase.com/privacy

**Vercel (web hosting)**
- Purpose: Hosting and serving the Platform
- Data: Request logs including IP addresses
- Location: Global CDN with primary compute in [region]
- Safeguards: [DPA in place / Standard Contractual Clauses]
- Privacy policy: vercel.com/legal/privacy-policy

**PostHog (analytics)**
- Purpose: Anonymised usage analytics
- Data: Pseudonymous event data (account UUID + actions taken)
  — only for users who have given consent
- Location: United States (app.posthog.com)
- Safeguards: [DPA in place / Standard Contractual Clauses]
- Privacy policy: posthog.com/privacy

**[Resend / SendGrid] (transactional email)**
- Purpose: Sending transactional notifications and system emails
- Data: Email address, notification content
- Location: [US / EU]
- Safeguards: [DPA in place / Standard Contractual Clauses]
- Privacy policy: [link]

### 4.3 Analytics in detail — PostHog

We use PostHog for usage analytics. PostHog is only activated after you
have explicitly provided consent during account registration or via your
account settings. If you have not consented, no analytics data about
your activity is sent to PostHog.

When PostHog is active, we capture named events such as "post created",
"group joined", and "library item added". Each event is associated with
your pseudonymous account UUID — not your name, email address, or
institution. We do not enable session recording. You can opt out of
analytics at any time via your account settings.

### 4.4 Public data

Content you mark as publicly visible — including your public profile,
public posts, and your business card page — is accessible to anyone on
the internet, including search engines. By making content public, you
consent to this. You can change the visibility of your content at any
time through your account settings.

### 4.5 Other users

Other registered users of the Platform can see content you post based
on your visibility settings. Direct messages are visible only to you
and the recipient(s). Closed group content is visible only to group
members.

### 4.6 Legal disclosure

We may disclose your personal data if required to do so by law, court
order, or government authority, or if we reasonably believe that
disclosure is necessary to:

- Comply with a legal obligation
- Protect the rights, property, or safety of Luminary, our users,
  or the public
- Detect, prevent, or address fraud, security, or technical issues

We will notify you of such disclosure where legally permitted to do so.

### 4.7 Business transfers

If Luminary is involved in a merger, acquisition, or sale of all or
part of its assets, your personal data may be transferred as part of
that transaction. We will notify you before your data is transferred
and becomes subject to a different privacy policy.

---

## 5. Data Retention

We retain your personal data for as long as your account is active or
as needed to provide the Platform. Specifically:

| Data type | Retention period |
|---|---|
| Account and profile data | Duration of account + 90 days after deletion |
| Posts and content | Duration of account + 90 days after deletion |
| Direct messages | Duration of account + 90 days after deletion |
| Uploaded files | Deleted within 0 days of post/library item deletion |
| Analytics event data | 12 months from event date (PostHog) |
| Technical logs | 90 days |
| Backup copies | Up to 90 days after original deletion |
| Anonymised/aggregated data | Indefinitely (cannot be attributed to you) |

After your account is deleted, we may retain certain anonymised or
aggregated data that cannot identify you for platform analytics and
improvement purposes.

We may retain data for longer periods where required by applicable law
or for the establishment, exercise, or defence of legal claims.

---

## 6. Data Security

We implement appropriate technical and organisational measures to
protect your personal data against unauthorised access, disclosure,
alteration, or destruction. These measures include:

- Encryption of data in transit (TLS)
- Encryption of data at rest (Supabase storage encryption)
- Row-level security policies restricting data access by user
- Password hashing (we never store passwords in plain text)
- Access controls limiting who within our organisation can access
  personal data

No method of transmission over the internet or electronic storage is
completely secure. While we strive to use commercially acceptable means
to protect your data, we cannot guarantee absolute security.

In the event of a personal data breach that is likely to result in a
risk to your rights and freedoms, we will notify you and any applicable
supervisory authority as required by law.

---

## 7. International Data Transfers

Our infrastructure is operated through Supabase and Vercel, which may
process data in locations outside your country of residence, including
the United States and the European Union.

Where we transfer personal data from the European Economic Area (EEA),
United Kingdom, or other regions with data transfer restrictions to
countries not recognised as providing adequate protection, we rely on
appropriate safeguards, including:

- Standard Contractual Clauses (SCCs) approved by the European Commission
- UK International Data Transfer Agreements (IDTAs) where applicable
- Other transfer mechanisms as required by applicable law

You can request details of the specific transfer mechanisms we rely
on by contacting us at [CONTACT EMAIL].

---

## 8. Your Rights

Depending on your location, you may have the following rights regarding
your personal data:

### 8.1 Right of access
You have the right to request a copy of the personal data we hold about
you. We will respond within 30 days.

### 8.2 Right to rectification
You have the right to correct inaccurate or incomplete personal data.
Most profile data can be corrected directly in your account settings.

### 8.3 Right to erasure
You have the right to request deletion of your personal data where it
is no longer necessary for the purposes for which it was collected,
where you have withdrawn consent, or where applicable law requires it.
Some data may be retained where we have a legitimate interest or legal
obligation to do so.

### 8.4 Right to restriction
You have the right to request that we restrict processing of your data
in certain circumstances, such as while you contest the accuracy of
the data.

### 8.5 Right to data portability
You have the right to receive your personal data in a structured,
commonly used, machine-readable format, and to transmit it to another
controller. This applies to data you have provided to us where
processing is based on consent or contract.

### 8.6 Right to object
You have the right to object to processing of your personal data where
we rely on legitimate interests as the legal basis, including for
direct marketing.

### 8.7 Right to withdraw consent
Where processing is based on consent (such as analytics or marketing
emails), you may withdraw consent at any time without affecting the
lawfulness of processing prior to withdrawal. You can do this in your
account settings or by contacting us.

### 8.8 Right to lodge a complaint
You have the right to lodge a complaint with your local data protection
supervisory authority. In the EU, this is the supervisory authority in
your country of residence. In the UK, this is the Information
Commissioner's Office (ICO). In Japan, this is the Personal Information
Protection Commission (PPC).

### 8.9 How to exercise your rights
To exercise any of these rights, contact us at [CONTACT EMAIL]. We may
need to verify your identity before processing your request. We will
respond within 30 days, and may extend this period by a further two
months for complex or multiple requests, with notice.

We do not charge a fee for exercising your rights unless requests are
manifestly unfounded or excessive.

---

## 9. Children's Privacy

Luminary is not directed at children under the age of 18. We do not
knowingly collect personal data from anyone under 18. If we become
aware that we have collected personal data from a person under 18
without parental consent, we will take steps to delete that data as
quickly as possible. If you believe we may have collected data from a
minor, please contact us at legal@luminary.to.

---

## 10. Cookies and Local Storage

### 10.1 What we use
Luminary uses browser localStorage (not traditional cookies) to store
certain session preferences and UI state, including:

- Authentication session tokens (managed by Supabase Auth)
- Feed and UI preferences (e.g. dismissed tips, filter settings)
- Temporary data to support app functionality

### 10.2 Analytics (PostHog)
If you have given consent, PostHog stores a pseudonymous identifier in
localStorage to associate events with your session. This is not used
for advertising or shared with third parties.

### 10.3 No advertising cookies
We do not use advertising cookies, tracking pixels, or retargeting
technologies. We do not share data with advertising networks.

### 10.4 Managing storage
You can clear localStorage at any time through your browser settings.
Note that doing so will log you out and reset your UI preferences.

---

## 11. ORCID and Third-Party Integrations

### 11.1 ORCID
When you use ORCID to log in or import your profile, ORCID's own
Privacy Policy (orcid.org/privacy-policy) applies to the data held
by ORCID. We access only the data made available through the
`/authenticate` scope, which includes your ORCID iD and public
profile information you have made available. We do not access your
ORCID password or private profile data without your explicit permission
through the appropriate ORCID scope.

### 11.2 CrossRef, Europe PubMed Central, ClinicalTrials.gov
These services are used to retrieve publicly available scientific
metadata. Your queries to these services may be subject to their
respective terms of service and privacy policies.

### 11.3 LinkedIn
Profile imports from LinkedIn use an exported data file that you
provide directly to us. We do not connect to LinkedIn's API or access
your LinkedIn account. The exported file is processed to populate your
profile and discarded after import.

---

## 12. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes
in our practices, technology, legal requirements, or other factors. We
will notify you of material changes by email or by a prominent notice
on the Platform at least [14/30] days before the changes take effect.

The "Last updated" date at the top of this policy indicates when the
most recent changes were made. Your continued use of the Platform after
the effective date of any changes constitutes acceptance of the updated
policy. If you do not accept the changes, you should stop using the
Platform and may close your account.

---

## 13. Contact Us

For questions about this Privacy Policy, to exercise your data
protection rights, or to report a privacy concern:

**Email:** legal@luminary.to
**Address:** Qurio LLC, Yakumo 2-20-2, Meguro-ku, Tokyo 152-0023, Japan


We aim to respond to all privacy-related enquiries within 30 days.

---

## Appendix A — Data we collect at a glance

| Category | Examples | Collected |
|---|---|---|
| Identity | Name, email | Yes — required |
| Professional | Title, institution, publications | Yes — provided by you |
| Content | Posts, comments, messages | Yes — created by you |
| Files | Images, PDFs, videos | Yes — uploaded by you |
| Usage analytics | Events, screen views | Only with consent |
| Technical | IP address (temporary) | Yes — automatic |
| ORCID data | ORCID iD, public publications | Only if connected |
| Patient data | Any patient-identifiable information | **Never — strictly prohibited** |

---

## Appendix B — Legal bases summary (GDPR)

| Processing activity | Legal basis |
|---|---|
| Account creation and management | Article 6(1)(b) — contract |
| Providing platform features | Article 6(1)(b) — contract |
| Transactional email notifications | Article 6(1)(b) — contract |
| Marketing emails and product updates | Article 6(1)(a) — consent |
| Usage analytics (PostHog) | Article 6(1)(a) — consent |
| Security and fraud prevention | Article 6(1)(f) — legitimate interest |
| Platform improvement | Article 6(1)(f) — legitimate interest |
| Legal compliance | Article 6(1)(c) — legal obligation |

---

_Qurio LLC · Yakumo 2-20-2, Meguro-ku, Tokyo 152-0023, Japan · 0110-03-021185_
_Privacy enquiries: legal@luminary.to_
