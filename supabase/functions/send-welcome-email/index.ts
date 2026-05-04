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
  const settingsUrl = `${APP_URL}/?settings=email`;
  // Visual chrome (gradient strip, header padding, CTA, footer) is
  // mirrored from supabase/templates/confirm-signup.html so the two
  // emails feel like the same brand. Body copy is unchanged.
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Welcome to Luminary</title>
</head>
<body style="margin:0;padding:0;background:#f2f3fb;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1b1d36;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f3fb;padding:40px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5f5;border-radius:14px;overflow:hidden;">

        <!-- Brand accent strip -->
        <tr><td style="height:4px;background-color:#6c63ff;background-image:linear-gradient(90deg,#6c63ff 0%,#4285f4 100%);line-height:4px;font-size:4px;">&nbsp;</td></tr>

        <!-- Logo -->
        <tr><td style="padding:26px 32px 0;font-family:'DM Serif Display',Georgia,serif;font-size:22px;color:#1b1d36;line-height:1.2;">
          Lumi<span style="color:#6c63ff;">nary</span> ✦
        </td></tr>

        <!-- Headline -->
        <tr><td style="padding:22px 32px 6px;font-family:'DM Serif Display',Georgia,serif;font-size:26px;color:#1b1d36;line-height:1.3;">
          Welcome to Luminary, ${safeName}.
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:8px 32px 8px;font-size:15px;line-height:1.65;color:#1b1d36;">
          <p style="margin:0 0 12px;">My name is Daniel, and I built Luminary because I was missing a space where scientists can learn, discuss, and connect — without the noise. A platform for people who never stop being curious about science. Because innovation only happens when we share, collaborate, and learn from each other.</p>
          <p style="margin:0 0 12px;">We are still beginning! — and you're one of our <strong>founding members</strong>, and that means something real. Luminary grows through <strong>invitation only</strong> — so the people you invite shape the community we become. Invite the colleagues you'd genuinely love to discuss science with.</p>
          <p style="margin:0 0 12px;"><strong>A few things worth exploring first:</strong></p>
          <p style="margin:0 0 8px;">🤖 <strong>AI profile import</strong> — upload your CV as a PDF and our AI auto-fills your profile including publications. Or import directly from ORCID or LinkedIn.</p>
          <p style="margin:0 0 8px;">🌐 <strong>Your own scientific profile</strong> — shareable at <code style="background-color:#f2f3fb;color:#6c63ff;">${safeProfile}</code>, fully under your control.</p>
          <p style="margin:0 0 8px;">📱 <strong>QR business card</strong> — exchange your full profile instantly when you meet colleagues at conferences or events.</p>
          <p style="margin:0 0 8px;">📌 <strong>QR for posters and presentations</strong> — let your audience connect with you even after you've moved on.</p>
          <p style="margin:0 0 8px;">📄 <strong>Discuss papers</strong> — share papers from Europe PMC or by DOI, add your annotation, invite colleagues to comment.</p>
          <p style="margin:0 0 8px;">👥 <strong>Create your own Group</strong> — running a research group, a department, or a journal club? Create your private space on Luminary, invite your colleagues, and use it to discuss science, prepare for conferences, or coordinate your next paper review.</p>
          <p style="margin:0 0 12px;">… and much more to explore.</p>
          <p style="margin:0 0 12px;">Your first step: <strong>complete your profile</strong> and share your first paper. See you inside.</p>
          <p style="margin:0 0 16px;">By the way — why did you join Luminary? Reply to this email, I will always answer!</p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#6c63ff;border-radius:10px;">
              <a href="${safeProfile}"
                 style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;font-family:'DM Sans',Helvetica,Arial,sans-serif;line-height:1;">
                Open my profile&nbsp;→
              </a>
            </td></tr>
          </table>
        </td></tr>

        <!-- Privacy callout -->
        <tr><td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#f2f3fb;border:1px solid #e2e4f0;border-radius:10px;padding:16px 18px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6c63ff;">
                🔒 Your data, your science
              </p>
              <p style="margin:0 0 8px;font-size:13.5px;color:#1a1b2e;line-height:1.7;">
                Luminary was built without third-party tracking, retargeting pixels, or data brokers. We will never sell your data. If we ever introduce sponsored content, it will always be clearly labelled — and you'll always be able to opt out.
              </p>
              <p style="margin:0;font-size:13px;color:#8b8fa8;line-height:1.6;">
                ✦ Luminary is free — no credit card, no hidden fees, no premium tier blocking core features. Science should be accessible.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Sign-off -->
        <tr><td style="padding:0 32px 22px;font-size:15px;line-height:1.65;color:#1b1d36;">
          <p style="margin:0 0 4px;">Warm regards,</p>
          <p style="margin:0 0 4px;"><strong>Daniel</strong></p>
          <p style="margin:0;color:#7a7fa8;font-size:13.5px;">Science enthusiast and Creator of Luminary</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 32px 26px;border-top:1px solid #e3e5f5;font-size:12px;color:#7a7fa8;line-height:1.6;">
          You're receiving this email because you signed up to Luminary.
          <a href="${escape(settingsUrl)}" style="color:#6c63ff;">Manage preferences</a>.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}
