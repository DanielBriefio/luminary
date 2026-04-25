// Supabase Edge Function: send-email-notification
// Triggered by a database webhook on `notifications` INSERT.
// Sends a transactional email via Resend for the supported notification
// types (new_follower, new_message, group_join_request, group_request_approved),
// gated on the recipient's master + granular email preferences.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'Luminary Team <team@luminary.to>';
const APP_URL    = 'https://luminary.to';

const EMAIL_TYPES = new Set([
  'new_follower',
  'new_message',
  'group_join_request',
  'group_request_approved',
]);

const PREF_COLUMN: Record<string, string> = {
  new_follower:           'email_notif_new_follower',
  new_message:            'email_notif_new_message',
  group_join_request:     'email_notif_group_request',
  group_request_approved: 'email_notif_group_request',
};

serve(async (req) => {
  try {
    const payload = await req.json();
    const record  = payload.record;
    if (!record) return new Response('no record', { status: 200 });

    const { notif_type, user_id, actor_id, target_id, meta } = record;

    if (!EMAIL_TYPES.has(notif_type)) {
      return new Response('not an email type', { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: recipient } = await supabase
      .from('profiles')
      .select(`
        id, name, profile_slug,
        email_notifications,
        email_notif_new_follower,
        email_notif_new_message,
        email_notif_group_request
      `)
      .eq('id', user_id)
      .single();

    if (!recipient) return new Response('recipient not found', { status: 200 });

    if (recipient.email_notifications === false) {
      return new Response('email notifications disabled', { status: 200 });
    }

    const prefCol = PREF_COLUMN[notif_type];
    if (prefCol && (recipient as Record<string, unknown>)[prefCol] === false) {
      return new Response('notification type disabled', { status: 200 });
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(user_id);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return new Response('no email', { status: 200 });

    const { data: actor } = await supabase
      .from('profiles')
      .select('id, name, profile_slug, title, institution')
      .eq('id', actor_id)
      .single();

    if (!actor) return new Response('actor not found', { status: 200 });

    let templateVariables: Record<string, string> = {
      name:         recipient.name || 'there',
      settings_url: APP_URL,
    };

    if (notif_type === 'new_follower') {
      templateVariables = {
        ...templateVariables,
        follower_name:        actor.name || 'A new follower',
        follower_profile_url: actor.profile_slug
          ? `${APP_URL}/p/${actor.profile_slug}`
          : APP_URL,
      };
    }

    if (notif_type === 'new_message') {
      const { data: message } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', target_id)
        .eq('sender_id', actor_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const raw = message?.content ?? '';
      const preview = raw
        ? (raw.length > 100 ? raw.slice(0, 100) + '…' : raw)
        : 'Sent you a message';

      templateVariables = {
        ...templateVariables,
        sender_name:      actor.name || 'A Luminary user',
        message_preview:  preview,
        conversation_url: APP_URL,
      };
    }

    if (notif_type === 'group_join_request') {
      templateVariables = {
        ...templateVariables,
        requester_name:        actor.name        || 'A researcher',
        requester_title:       actor.title       || '',
        requester_institution: actor.institution || '',
        group_name:            meta?.group_name  || 'your group',
        group_url:             APP_URL,
      };
    }

    if (notif_type === 'group_request_approved') {
      templateVariables = {
        ...templateVariables,
        group_name: meta?.group_name || 'the group',
        group_url:  APP_URL,
      };
    }

    const html = renderHtml(notif_type, templateVariables);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      recipientEmail,
        subject: buildSubject(notif_type, actor.name ?? 'Someone', meta),
        html,
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
  meta: Record<string, string> | null,
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

const escape = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function shell(bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  const settingsUrl = 'https://luminary.to/?settings=email';
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f3fb;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1b1d36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5f5;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#1b1d36;">
          Lumi<span style="color:#6c63ff;">nary</span> ✦
        </td></tr>
        <tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:#1b1d36;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <a href="${escape(ctaUrl)}" style="display:inline-block;background:#6c63ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
            ${escape(ctaLabel)}
          </a>
        </td></tr>
        <tr><td style="padding:18px 28px 24px;border-top:1px solid #e3e5f5;font-size:12px;color:#7a7fa8;line-height:1.6;">
          You are receiving this email because you have email notifications enabled.
          <a href="${escape(settingsUrl)}" style="color:#6c63ff;">Manage preferences</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function renderHtml(notifType: string, v: Record<string, string>): string {
  const name = escape(v.name);

  if (notifType === 'new_follower') {
    return shell(
      `<p style="margin:0 0 12px;">Hi ${name},</p>
       <p style="margin:0 0 12px;"><strong>${escape(v.follower_name)}</strong> just started following you on Luminary.</p>
       <p style="margin:0;">Take a look at their profile and follow back if their work looks interesting.</p>`,
      v.follower_profile_url,
      `View ${escape(v.follower_name)}'s profile →`,
    );
  }

  if (notifType === 'new_message') {
    return shell(
      `<p style="margin:0 0 12px;">Hi ${name},</p>
       <p style="margin:0 0 12px;"><strong>${escape(v.sender_name)}</strong> sent you a message on Luminary:</p>
       <p style="margin:0 0 12px;padding:12px 14px;background:#f7f8fe;border-left:3px solid #6c63ff;border-radius:0 8px 8px 0;font-style:italic;color:#1b1d36;">
         ${escape(v.message_preview)}
       </p>`,
      v.conversation_url,
      'Open conversation →',
    );
  }

  if (notifType === 'group_join_request') {
    const sub = [v.requester_title, v.requester_institution].filter(Boolean).join(' · ');
    return shell(
      `<p style="margin:0 0 12px;">Hi ${name},</p>
       <p style="margin:0 0 12px;"><strong>${escape(v.requester_name)}</strong>${sub ? ` (${escape(sub)})` : ''} has requested to join <strong>${escape(v.group_name)}</strong>.</p>
       <p style="margin:0;">Review their request and approve or decline from the group's members tab.</p>`,
      v.group_url,
      'Review request →',
    );
  }

  if (notifType === 'group_request_approved') {
    return shell(
      `<p style="margin:0 0 12px;">Hi ${name},</p>
       <p style="margin:0 0 12px;">Your request to join <strong>${escape(v.group_name)}</strong> on Luminary was approved.</p>
       <p style="margin:0;">Welcome to the group — head over to introduce yourself and catch up on recent posts.</p>`,
      v.group_url,
      'Open group →',
    );
  }

  return shell(`<p style="margin:0;">Hi ${name}, you have a new notification on Luminary.</p>`, 'https://luminary.to', 'Open Luminary →');
}
