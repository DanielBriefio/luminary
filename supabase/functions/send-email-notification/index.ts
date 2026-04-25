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

const EMAIL_TYPES: Record<string, string> = {
  new_follower:           'new-follower',
  new_message:            'new-direct-message',
  group_join_request:     'group-join-request',
  group_request_approved: 'group-join-request',
};

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

    const templateSlug = EMAIL_TYPES[notif_type];
    if (!templateSlug) return new Response('not an email type', { status: 200 });

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

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:        FROM_EMAIL,
        to:          recipientEmail,
        subject:     buildSubject(notif_type, actor.name ?? 'Someone', meta),
        template_id: templateSlug,
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
