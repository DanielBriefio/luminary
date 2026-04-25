// Supabase Edge Function: send-welcome-email
// Triggered by a database webhook on `profiles` UPDATE.
// Sends the one-shot welcome email after the user has set their name
// (i.e. completed onboarding). The `welcome_email_sent` flag prevents
// duplicate sends across subsequent profile updates.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = 'Luminary Team <team@luminary.to>';
const APP_URL    = 'https://luminary.to';

serve(async (req) => {
  try {
    const payload = await req.json();
    const record  = payload.record;
    if (!record) return new Response('no record', { status: 200 });

    const { id: userId, name, profile_slug, welcome_email_sent } = record;

    if (welcome_email_sent === true) {
      return new Response('already sent', { status: 200 });
    }

    if (!name) return new Response('no name yet', { status: 200 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const recipientEmail = authUser?.user?.email;
    if (!recipientEmail) return new Response('no email', { status: 200 });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method:  'POST',
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
          name:         name || 'there',
          profile_url:  profile_slug ? `${APP_URL}/p/${profile_slug}` : APP_URL,
          settings_url: APP_URL,
        },
      }),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      console.error('Resend error:', err);
      return new Response('resend error', { status: 500 });
    }

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
