# Task: Email Notification System via Resend (Phase 7A)

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task builds the transactional email notification system using
Resend. Email templates are pre-built in the Resend dashboard and
referenced by slug. A Supabase Edge Function listens to database
webhooks and sends emails when relevant events occur.

Email notifications covered:
- **Welcome** — sent once at signup (triggered by profiles insert)
- **New follower** — when someone follows you
- **New message** — when you receive a DM
- **Group join request** — when someone requests to join your group
- **Group request approved** — when your join request is approved

Scope:

1. SQL migration — email preference columns + welcome_sent flag
2. Verify group join request meta is correctly populated
3. Edge Function `send-email-notification` — handles all notification types
4. Edge Function `send-welcome-email` — triggered by profile creation
5. Supabase webhook configuration (manual step for user)
6. Settings screen — four individual email preference toggles
7. NotifsScreen — verify group_join_request and group_request_approved display

> ⚠️ The Edge Functions use the Resend API key stored in Supabase
> Edge Function secrets as `RESEND_API_KEY`. Never hardcode this key.
> The Resend template slugs are: `welcome`, `new-follower`,
> `new-direct-message`, `group-join-request`.

---

## Prerequisites — manual steps (done by user before Claude Code runs)

- [x] Resend account created and domain verified
- [x] Four email templates created in Resend dashboard with slugs:
      `welcome`, `new-follower`, `new-direct-message`, `group-join-request`
- [x] `RESEND_API_KEY` added to Supabase Edge Function secrets
- [ ] Two database webhooks configured in Supabase (see Step 5)

---

## Step 1 — SQL migration

Create `migration_email_notifications.sql`:

```sql
-- Granular email notification preferences (replaces single boolean)
alter table profiles
  add column if not exists email_notif_new_follower   boolean default true,
  add column if not exists email_notif_new_message    boolean default true,
  add column if not exists email_notif_group_request  boolean default true,
  add column if not exists welcome_email_sent         boolean default false;

-- Backfill: existing users who had email_notifications = true
-- keep all granular preferences as true (already the default)
-- existing users who had email_notifications = false get all set to false
update profiles
set
  email_notif_new_follower  = coalesce(email_notifications, true),
  email_notif_new_message   = coalesce(email_notifications, true),
  email_notif_group_request = coalesce(email_notifications, true)
where email_notifications = false;

-- Mark existing users as already having received welcome email
-- (they signed up before this system existed)
update profiles
set welcome_email_sent = true
where created_at < now() - interval '1 hour';
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Verify group join request notification meta

Read the code that handles group join requests — likely in
`GroupMembers.jsx` or `GroupScreen.jsx`. Find where a join request
notification is inserted into the `notifications` table.

Verify the insert includes `meta` with `group_id` and `group_name`:

```javascript
await supabase.from('notifications').insert({
  user_id:     groupOwnerId,        // admin who receives the notification
  actor_id:    requestingUserId,    // person requesting to join
  notif_type:  'group_join_request',
  target_type: 'group',
  target_id:   groupId,
  meta: {
    group_id:   groupId,
    group_name: groupName,          // ← must be present for email
  },
  read: false,
});
```

If `meta` is missing `group_id` or `group_name`, add them. Do not
change any other logic — surgical addition only.

Also verify `group_request_approved` notification (inserted when admin
approves a join request) has the same meta structure. Fix if missing.

---

## Step 3 — Edge Function: send-email-notification

Create `supabase/functions/send-email-notification/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL     = 'Luminary Team <team@luminary.to>';
const APP_URL        = 'https://luminary.to';

// Notification types that trigger emails and their template slugs
const EMAIL_TYPES: Record<string, string> = {
  new_follower:          'new-follower',
  new_message:           'new-direct-message',
  group_join_request:    'group-join-request',
  group_request_approved: 'group-join-request', // reuse template, different copy
};

serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase webhook sends { type, table, record, old_record }
    const record = payload.record;
    if (!record) return new Response('no record', { status: 200 });

    const { notif_type, user_id, actor_id, target_id, meta } = record;

    // Only handle email-relevant notification types
    const templateSlug = EMAIL_TYPES[notif_type];
    if (!templateSlug) return new Response('not an email type', { status: 200 });

    // Create service-role Supabase client for DB lookups
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch recipient profile
    const { data: recipient } = await supabase
      .from('profiles')
      .select(`
        id, name, email:id, profile_slug,
        email_notif_new_follower,
        email_notif_new_message,
        email_notif_group_request
      `)
      .eq('id', user_id)
      .single();

    if (!recipient) return new Response('recipient not found', { status: 200 });

    // Fetch recipient email from auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return new Response('no email', { status: 200 });

    // Check master email_notifications preference
    const { data: prefCheck } = await supabase
      .from('profiles')
      .select('email_notifications')
      .eq('id', user_id)
      .single();

    if (prefCheck?.email_notifications === false) {
      return new Response('email notifications disabled', { status: 200 });
    }

    // Check granular preference per notification type
    const prefMap: Record<string, boolean> = {
      new_follower:          recipient.email_notif_new_follower,
      new_message:           recipient.email_notif_new_message,
      group_join_request:    recipient.email_notif_group_request,
      group_request_approved: recipient.email_notif_group_request,
    };

    if (prefMap[notif_type] === false) {
      return new Response('notification type disabled', { status: 200 });
    }

    // Fetch actor profile (the person who did the action)
    const { data: actor } = await supabase
      .from('profiles')
      .select('id, name, profile_slug, title, institution')
      .eq('id', actor_id)
      .single();

    if (!actor) return new Response('actor not found', { status: 200 });

    // Build template variables per notification type
    let templateVariables: Record<string, string> = {
      name:         recipient.name || 'there',
      settings_url: `${APP_URL}`,
    };

    if (notif_type === 'new_follower') {
      templateVariables = {
        ...templateVariables,
        follower_name:        actor.name,
        follower_profile_url: `${APP_URL}/p/${actor.profile_slug}`,
      };
    }

    if (notif_type === 'new_message') {
      // Fetch message content preview from messages table
      const { data: message } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', target_id)
        .eq('sender_id', actor_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const preview = message?.content
        ? message.content.length > 100
          ? message.content.slice(0, 100) + '…'
          : message.content
        : 'Sent you a message';

      templateVariables = {
        ...templateVariables,
        sender_name:      actor.name,
        message_preview:  preview,
        conversation_url: `${APP_URL}`,
      };
    }

    if (notif_type === 'group_join_request') {
      templateVariables = {
        ...templateVariables,
        requester_name:        actor.name,
        requester_title:       actor.title       || '',
        requester_institution: actor.institution || '',
        group_name:            meta?.group_name  || 'your group',
        group_url:             `${APP_URL}`,
      };
    }

    if (notif_type === 'group_request_approved') {
      templateVariables = {
        ...templateVariables,
        group_name: meta?.group_name || 'the group',
        group_url:  `${APP_URL}`,
      };
    }

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      recipientEmail,
        subject: buildSubject(notif_type, actor.name, meta),
        template_id: templateSlug,  // Resend template slug
        variables:   templateVariables,
      }),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      console.error('Resend error:', err);
      return new Response('resend error', { status: 500 });
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response('error', { status: 500 });
  }
});

function buildSubject(
  notifType: string,
  actorName: string,
  meta: Record<string, string> | null
): string {
  switch (notifType) {
    case 'new_follower':
      return `${actorName} is now following you on Luminary ✦`;
    case 'new_message':
      return `New message from ${actorName} on Luminary ✦`;
    case 'group_join_request':
      return `${actorName} wants to join ${meta?.group_name || 'your group'} on Luminary ✦`;
    case 'group_request_approved':
      return `Your request to join ${meta?.group_name || 'the group'} was approved ✦`;
    default:
      return 'New notification from Luminary ✦';
  }
}
```

> **Note on Resend template_id vs template slug:** Resend's API accepts
> either the UUID or the slug as `template_id`. The slugs (`new-follower`,
> `new-direct-message`, etc.) are confirmed to work. If Resend returns
> a template-not-found error, fall back to using the UUID from the
> dashboard URL instead.

---

## Step 4 — Edge Function: send-welcome-email

Create `supabase/functions/send-welcome-email/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL     = 'Luminary Team <team@luminary.to>';
const APP_URL        = 'https://luminary.to';

serve(async (req) => {
  try {
    const payload = await req.json();
    const record  = payload.record;
    if (!record) return new Response('no record', { status: 200 });

    const { id: userId, name, profile_slug, welcome_email_sent } = record;

    // Skip if welcome email already sent (backfilled users)
    if (welcome_email_sent === true) {
      return new Response('already sent', { status: 200 });
    }

    // Skip if profile is incomplete (name not yet set)
    // Welcome email fires after onboarding, not at bare auth creation
    if (!name) return new Response('no name yet', { status: 200 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch email from auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return new Response('no email', { status: 200 });

    // Send welcome email
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:        FROM_EMAIL,
        to:          recipientEmail,
        subject:     'Welcome to Luminary ✦',
        template_id: 'welcome',
        variables: {
          name:        name || 'there',
          profile_url: profile_slug
            ? `${APP_URL}/p/${profile_slug}`
            : APP_URL,
          settings_url: APP_URL,
        },
      }),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      console.error('Resend error:', err);
      return new Response('resend error', { status: 500 });
    }

    // Mark welcome email as sent to prevent duplicates
    await supabase
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('id', userId);

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response('error', { status: 500 });
  }
});
```

> **Important:** The welcome email trigger fires on ANY profiles update
> (because profile_slug and name are set after signup, not at row
> creation). The `welcome_email_sent` flag prevents duplicate sends.
> The check `if (!name)` prevents sending before the user completes
> onboarding.

---

## Step 5 — Supabase webhook configuration (manual)

Tell the user to configure two database webhooks in the Supabase
dashboard:

**Webhook 1 — Notification emails:**
- Supabase Dashboard → Database → Webhooks → Create webhook
- Name: `email-notification`
- Table: `notifications`
- Events: `INSERT`
- URL: `https://[your-project-ref].supabase.co/functions/v1/send-email-notification`
- HTTP Headers: `Authorization: Bearer [your-anon-key]`

**Webhook 2 — Welcome email:**
- Name: `welcome-email`
- Table: `profiles`
- Events: `UPDATE` (not INSERT — name and profile_slug are set after initial row creation)
- Filter: `welcome_email_sent=eq.false` (only fire when not yet sent)
- URL: `https://[your-project-ref].supabase.co/functions/v1/send-welcome-email`
- HTTP Headers: `Authorization: Bearer [your-anon-key]`

The project ref is visible in Supabase Dashboard → Settings → API.

---

## Step 6 — Settings screen: email preference toggles

Read the existing Settings or Profile settings screen to understand
how preferences are currently displayed. Find where `email_notifications`
master toggle lives.

Add four individual toggles in a new "Email notifications" subsection,
below the existing master toggle:

```jsx
{/* Email notifications section */}
<div style={{ marginBottom: 24 }}>
  <div style={{
    fontSize: 13, fontWeight: 700, color: T.text,
    marginBottom: 4,
  }}>
    Email notifications
  </div>
  <div style={{
    fontSize: 12, color: T.mu, marginBottom: 14,
  }}>
    Choose which activity sends you an email.
    All emails are sent from team@luminary.to.
  </div>

  {/* Master toggle — existing, keep as-is */}
  <ToggleRow
    label="Email notifications"
    sublabel="Master switch — turns all emails on or off"
    value={profile.email_notifications}
    onChange={v => updateProfile({ email_notifications: v })}
  />

  {/* Individual toggles — new, only shown when master is on */}
  {profile.email_notifications && (
    <div style={{
      marginLeft: 16,
      paddingLeft: 16,
      borderLeft: `2px solid ${T.bdr}`,
      marginTop: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <ToggleRow
        label="New follower"
        sublabel="When someone follows you"
        value={profile.email_notif_new_follower ?? true}
        onChange={v => updateProfile({ email_notif_new_follower: v })}
      />
      <ToggleRow
        label="New message"
        sublabel="When you receive a direct message"
        value={profile.email_notif_new_message ?? true}
        onChange={v => updateProfile({ email_notif_new_message: v })}
      />
      <ToggleRow
        label="Group join requests"
        sublabel="When someone requests to join your group"
        value={profile.email_notif_group_request ?? true}
        onChange={v => updateProfile({ email_notif_group_request: v })}
      />
    </div>
  )}
</div>
```

Match the existing toggle component style exactly — use whatever
`ToggleRow` or equivalent component already exists in the settings
screen. If no reusable toggle component exists, extract one from the
existing toggle markup.

The `updateProfile` function should debounce and save to Supabase:
```javascript
const updateProfile = async (updates) => {
  setProfile(prev => ({ ...prev, ...updates }));
  await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);
};
```

---

## Step 7 — NotifsScreen: verify display of group types

Read `NotifsScreen.jsx` and verify:

1. `group_join_request` renders correctly — shows actor name +
   "requested to join [group_name]" + clicking navigates to the group
2. `group_request_approved` renders correctly — shows actor name +
   "approved your request to join [group_name]" + clicking navigates
   to the group

If either type is missing from the `NOTIF_CONFIG` map or renders as
a generic fallback, add the correct config entry. Match the existing
pattern exactly.

Also verify that the unread notification count in the bell icon
includes `group_join_request` and `group_request_approved` types.
If the count query filters by specific types and excludes these, add
them to the filter.

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- `groups.owner_id`, `groups.is_private` (legacy fields)
- Existing notification insert calls beyond adding missing `meta` fields
- Existing Resend template content — templates are managed in
  Resend dashboard, not in code
- Any existing feed, profile, groups, projects screens
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_email_notifications.sql in Supabase SQL Editor

# 2. Deploy Edge Functions:
supabase functions deploy send-email-notification
supabase functions deploy send-welcome-email

# 3. Configure the two database webhooks in Supabase Dashboard
#    (see Step 5 above)

# 4. Deploy app changes:
git add . && git commit -m "Phase 7A: Email notifications via Resend — follower, message, group request, welcome" && git push

# 5. Test (see Remind the user section)
```

---

## Remind the user

**Testing the notification emails:**

Each email type can be tested by triggering the action in the app
and watching for the email to arrive:

1. **New follower** — log in as User B, follow User A. Check User A's
   inbox for the follower notification email.

2. **New message** — send a DM from User B to User A. Check User A's
   inbox for the message notification email.

3. **Group join request** — as User B, request to join a closed group
   owned by User A. Check User A's inbox for the join request email.

4. **Group request approved** — as User A (group admin), approve User
   B's join request. Check User B's inbox for the approval email.

5. **Welcome email** — create a fresh test account, complete
   onboarding. Check the new account's inbox for the welcome email.

**If emails are not arriving:**
- Check Supabase Dashboard → Edge Functions → Logs for errors
- Check Resend Dashboard → Logs to see if API calls are reaching Resend
- Verify the webhook is configured and firing (Supabase → Webhooks →
  check "Last triggered" timestamp)
- Verify `RESEND_API_KEY` is set in Edge Function secrets
- Check spam folder

**Testing email preferences:**
1. Go to Settings → Email notifications
2. Toggle "New follower" off
3. Follow yourself from another account
4. Verify no email arrives
5. Toggle back on, verify email arrives on next follow action

---

## Testing checklist

**Migration:**
- [ ] `profiles.email_notif_new_follower` column exists, defaults true
- [ ] `profiles.email_notif_new_message` column exists, defaults true
- [ ] `profiles.email_notif_group_request` column exists, defaults true
- [ ] `profiles.welcome_email_sent` column exists, defaults false
- [ ] Existing users with `email_notifications = false` have granular
      prefs set to false
- [ ] Existing users have `welcome_email_sent = true` (backfilled)

**Group join request meta (Step 2):**
- [ ] When a user requests to join a closed group, the notification
      insert includes `meta.group_id` and `meta.group_name`
- [ ] When admin approves a request, the notification insert includes
      `meta.group_id` and `meta.group_name`

**Edge Functions:**
- [ ] `send-email-notification` deploys without errors
- [ ] `send-welcome-email` deploys without errors
- [ ] Both functions appear in Supabase Dashboard → Edge Functions

**Webhooks:**
- [ ] `email-notification` webhook configured on `notifications` INSERT
- [ ] `welcome-email` webhook configured on `profiles` UPDATE
- [ ] Both webhooks show correct Edge Function URLs

**Email delivery:**
- [ ] New follower → email received with correct follower name
- [ ] New message → email received with correct sender name and preview
- [ ] Group join request → email received with requester name,
      title, institution, and group name
- [ ] Group request approved → email received with group name
- [ ] Welcome email → received after completing onboarding
- [ ] No duplicate welcome emails on subsequent profile updates
- [ ] Emails arrive from `team@luminary.to`
- [ ] All emails use correct Resend template styling

**Email preferences (Settings screen):**
- [ ] Four toggles visible under Email notifications section
- [ ] Individual toggles only shown when master toggle is on
- [ ] Toggling "New follower" off → no email on next follow action
- [ ] Toggling "New message" off → no email on next DM received
- [ ] Toggling "Group join requests" off → no email on next request
- [ ] Preferences persist after page refresh
- [ ] Master toggle off → no emails regardless of individual settings

**NotifsScreen:**
- [ ] `group_join_request` shows correctly in notification bell
- [ ] `group_request_approved` shows correctly in notification bell
- [ ] Both types included in unread count
- [ ] Clicking group notification navigates to the correct group

**Build:**
- [ ] `npm run build` succeeds with no new warnings
