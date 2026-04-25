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

    const profileUrl = profile_slug ? `${APP_URL}/p/${profile_slug}` : APP_URL;
    const html = renderWelcomeHtml(name || 'there', profileUrl);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      recipientEmail,
        subject: 'Welcome to Luminary ✦',
        html,
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

const escape = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function renderWelcomeHtml(name: string, profileUrl: string): string {
  const safeName    = escape(name);
  const safeProfile = escape(profileUrl);
  const settingsUrl = APP_URL;
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f2f3fb;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1b1d36;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3fb;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5f5;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#1b1d36;">
          Lumi<span style="color:#6c63ff;">nary</span> ✦
        </td></tr>
        <tr><td style="padding:8px 28px 8px;font-family:'DM Serif Display',Georgia,serif;font-size:24px;color:#1b1d36;">
          Welcome to Luminary, ${safeName}.
        </td></tr>
        <tr><td style="padding:0 28px 20px;font-size:15px;line-height:1.65;color:#1b1d36;">
          <p style="margin:0 0 12px;">You're now part of a network built for researchers, clinicians, and industry scientists — where research meets practice and evidence becomes conversation.</p>
          <p style="margin:0 0 12px;"><strong>A few things to try first:</strong></p>
          <ul style="margin:0 0 12px;padding-left:20px;">
            <li style="margin-bottom:6px;">Complete your profile — add your work history, publications, and topics you're interested in.</li>
            <li style="margin-bottom:6px;">Follow a few researchers, papers, or groups in your field.</li>
            <li style="margin-bottom:6px;">Share a paper or post your first take on something you're reading.</li>
          </ul>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <a href="${safeProfile}" style="display:inline-block;background:#6c63ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">
            Complete your profile →
          </a>
        </td></tr>
        <tr><td style="padding:18px 28px 24px;border-top:1px solid #e3e5f5;font-size:12px;color:#7a7fa8;line-height:1.6;">
          You're receiving this email because you signed up to Luminary.
          <a href="${escape(settingsUrl)}" style="color:#6c63ff;">Manage preferences</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
