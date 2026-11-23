import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, WORK_MODES } from '../lib/constants';
import { startOrcidOAuth } from '../lib/orcidAuth';
import Inp from '../components/Inp';
import Btn from '../components/Btn';
import Footer from '../components/Footer';
import OrcidIcon from '../components/OrcidIcon';

// Work-mode picker shown on both signup paths (email + ORCID completion).
// Required: work_mode drives the "My Field" feed filter and profile layout.
function WorkModePicker({ value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>
        I mainly work in<span style={{ color: T.ro }}> *</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {WORK_MODES.map(m => {
          const active = value === m.id;
          return (
            <button key={m.id} type="button" onClick={() => onChange(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${active ? T.v : T.bdr}`,
              background: active ? T.v2 : T.w,
              color: active ? T.v3 : T.text,
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, textAlign: 'left',
            }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AuthScreen({ onAuth, initialMode = 'login', orcidPendingToken, orcidPendingName, showOrcidEmailForm, orcidAuthError }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'signup' | 'forgot'

  // Sign-in / forgot
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // Sign-up shared (signup is open — no invite gate)
  const [signupEmail,    setSignupEmail]    = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName,     setSignupName]     = useState('');
  const [signupWorkMode, setSignupWorkMode] = useState('');
  const [signupError,    setSignupError]    = useState('');
  const [signupLoading,  setSignupLoading]  = useState(false);

  // Email-confirmation-pending state (set when signUp returns no
  // session because Supabase Auth's "Confirm email" gate is on).
  // The post-signup writes were stashed server-side in signup_pending;
  // App.jsx applies them on the first authenticated session after
  // the user clicks the confirmation link.
  const [awaitingConfirmEmail,    setAwaitingConfirmEmail]    = useState('');
  const [awaitingConfirmRedirect, setAwaitingConfirmRedirect] = useState('');
  const [resendingConfirm,     setResendingConfirm]     = useState(false);
  const [resendNotice,         setResendNotice]         = useState('');

  // Referral tracking. Invite codes no longer gate signup, but a code
  // arriving via ?code= (event links, QR business cards, personal invite
  // links) is still attached to the signup so apply_signup_intent records
  // the use + notifies the inviter. Invalid / exhausted codes are dropped
  // silently — they must never block someone from joining.
  const [referralCode, setReferralCode] = useState('');

  // Consent (both signup paths)
  const [consentTerms,         setConsentTerms]         = useState(false);
  const [consentNotifications, setConsentNotifications] = useState(true);
  const [consentMarketing,     setConsentMarketing]     = useState(false);
  const [consentAnalytics,     setConsentAnalytics]     = useState(false);

  // Pick up a referral code from the URL param or sessionStorage handoff.
  // IMPORTANT: read ?code= directly from the URL because this effect runs
  // as a child-component effect, which React executes BEFORE App.jsx's
  // parent effects — so App.jsx's ?code= handler hasn't stored the code
  // in sessionStorage yet when this runs.
  useEffect(() => {
    const urlCode = new URLSearchParams(window.location.search).get('code');
    const stored  = sessionStorage.getItem('prefill_invite_code');
    const raw     = (urlCode || stored || '').trim();
    if (!raw) return;
    if (stored) sessionStorage.removeItem('prefill_invite_code');
    setMode('signup');
    // QR codes keep their case (QR-<slug>); all other codes are uppercase.
    const code = raw.startsWith('QR-') ? raw : raw.toUpperCase();
    if (code.startsWith('QR-')) { setReferralCode(code); return; }
    supabase.from('invite_codes')
      .select('code, is_multi_use, max_uses, uses_count, expires_at, locked_at, claimed_by')
      .eq('code', code).maybeSingle()
      .then(({ data: row }) => {
        if (!row || row.locked_at) return;
        if (row.expires_at && new Date(row.expires_at) < new Date()) return;
        if (row.is_multi_use ? (row.max_uses != null && row.uses_count >= row.max_uses) : row.claimed_by) return;
        setReferralCode(row.code);
      }, () => {});
  }, []);

  const goToMode = (m) => {
    setMode(m); setError(''); setSuccess('');
    setConsentTerms(false); setConsentNotifications(true); setConsentMarketing(false); setConsentAnalytics(false);
    setSignupEmail(''); setSignupPassword(''); setSignupName(''); setSignupWorkMode(''); setSignupError('');
    setAwaitingConfirmEmail(''); setResendNotice('');
  };

  // Confirmation-link target: Supabase appends ?access_token=… etc.
  // App.jsx picks the new session up via onAuthStateChange and runs
  // apply_signup_intent on first authenticated render.
  const confirmRedirectTo = `${window.location.origin}/?confirmed=1`;

  const resendConfirmationEmail = async () => {
    if (!awaitingConfirmEmail || resendingConfirm) return;
    setResendingConfirm(true); setResendNotice('');
    try {
      const { error: rerr } = await supabase.auth.resend({
        type:    'signup',
        email:   awaitingConfirmEmail,
        options: { emailRedirectTo: awaitingConfirmRedirect || confirmRedirectTo },
      });
      if (rerr) throw rerr;
      setResendNotice('Sent. Check your inbox (and spam folder).');
    } catch (e) {
      setResendNotice(e.message || 'Could not resend right now. Try again in a minute.');
    }
    setResendingConfirm(false);
  };

  // ── Sign-in / forgot ──────────────────────────────────────────────────────
  const submitLogin = async e => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setSuccess('Password reset email sent. Check your inbox.');
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // ── ORCID OAuth redirect ──────────────────────────────────────────────────
  // Random `state` round-trips through ORCID and is verified in App.jsx
  // before consuming the orcid_token — see src/lib/orcidAuth.js.
  const handleOrcidOAuth = () => startOrcidOAuth();

  // ── ORCID sign-up completion (after OAuth callback) ───────────────────────
  // Stash → signUp → branch on session. With email confirmation enabled,
  // signUp returns no session; the post-signup writes (profile fields,
  // ORCID enrichment, publications import, invite generation) all need
  // a session to satisfy RLS. apply_signup_intent does them server-side
  // on first authenticated session — see migration_signup_confirmation.sql.
  const handleOrcidSignupComplete = async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      // 1. Fetch the pending ORCID data and snapshot it into stash payload.
      const { data: pending } = await supabase
        .from('orcid_pending')
        .select('*')
        .eq('token', orcidPendingToken)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (!pending) throw new Error('ORCID session expired. Please sign up again.');

      const nowIso = new Date().toISOString();
      const stashPayload = {
        name:                 pending.name,
        signup_method:        'orcid',
        card_email:           signupEmail,
        email_notifications:  consentNotifications,
        email_marketing:      consentMarketing,
        marketing_consent_at: consentMarketing ? nowIso : null,
        analytics_consent_at: consentAnalytics ? nowIso : null,
        terms_accepted_at:    nowIso,
        privacy_accepted_at:  nowIso,
        invite_code:          referralCode || null,
        orcid_data: {
          orcid_id:     pending.orcid_id,
          bio:          pending.bio,
          institution:  pending.institution,
          title:        pending.title,
          work_history: JSON.parse(pending.work_history || '[]'),
          education:    JSON.parse(pending.education    || '[]'),
          publications: JSON.parse(pending.publications || '[]'),
        },
      };

      // 2. Stash intent server-side BEFORE signUp. Anon-callable RPC.
      const { error: stashErr } = await supabase.rpc('stash_signup_intent', {
        p_email: signupEmail,
        p_data:  stashPayload,
      });
      if (stashErr) throw stashErr;

      // 3. Create Supabase auth user. If email confirmation is on, no
      //    session is returned — user needs to click the email link.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email:    signupEmail,
        password: signupPassword,
        // work_mode rides on user_metadata (signup_pending has no column
        // for it); App.jsx copies it onto profiles after apply_signup_intent.
        options:  { data: { name: pending.name, work_mode: signupWorkMode }, emailRedirectTo: confirmRedirectTo },
      });
      if (authError) throw authError;

      // 4. Drop the orcid_pending row — it's been snapshotted into the stash.
      await supabase.from('orcid_pending').delete().eq('token', orcidPendingToken);

      capture('signed_up', { method: 'orcid' });
      if (referralCode) capture('invite_code_used', { code_type: referralCode.startsWith('QR-') ? 'qr' : 'referral' });

      if (authData.session) {
        // Confirmation off — App.jsx's apply effect picks up the new
        // session, applies the stash and lands the user on their profile.
        onAuth('profile');
      } else {
        // Confirmation on — render the "check your email" panel.
        setAwaitingConfirmEmail(signupEmail);
      }
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── Email sign-up ─────────────────────────────────────────────────────────
  // Stash → signUp → branch on session. Profile fields, the optional
  // referral-code use and the inviter notification all happen server-side
  // via apply_signup_intent on first authenticated session — see
  // migration_signup_confirmation.sql. signup_method stays 'invite' for
  // email signups because signup_pending's CHECK only allows
  // 'invite' | 'orcid' (read it as "email").
  const handleEmailSignup = async () => {
    setSignupLoading(true); setSignupError('');
    try {
      const nowIso = new Date().toISOString();

      // 1. Stash intent (anon-callable RPC).
      const { error: stashErr } = await supabase.rpc('stash_signup_intent', {
        p_email: signupEmail,
        p_data: {
          name:                 signupName.trim(),
          signup_method:        'invite',
          card_email:           signupEmail,
          email_notifications:  consentNotifications,
          email_marketing:      consentMarketing,
          marketing_consent_at: consentMarketing ? nowIso : null,
          analytics_consent_at: consentAnalytics ? nowIso : null,
          terms_accepted_at:    nowIso,
          privacy_accepted_at:  nowIso,
          invite_code:          referralCode || null,
        },
      });
      if (stashErr) throw stashErr;

      // 2. Create Supabase auth user.
      // For QR signups, embed the card owner's slug in the redirect URL so
      // it survives cross-browser email confirmation (localStorage doesn't
      // cross browser boundaries on the same device).
      const qrSlug = referralCode.startsWith('QR-') ? referralCode.slice(3) : null;
      const redirectTo = qrSlug
        ? `${window.location.origin}/?confirmed=1&qr_ref=${qrSlug}`
        : confirmRedirectTo;
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email:    signupEmail,
        password: signupPassword,
        options:  {
          data: { name: signupName.trim(), work_mode: signupWorkMode },
          emailRedirectTo: redirectTo,
        },
      });
      if (authError) throw authError;

      capture('signed_up', { method: 'email' });
      if (referralCode) capture('invite_code_used', { code_type: qrSlug ? 'qr' : 'referral' });

      if (authData.session) {
        // Confirmation off — App.jsx applies the stash and opens the profile.
        onAuth('profile');
      } else {
        // Confirmation on — render the "check your email" panel.
        // Store the redirect URL so the resend button uses the same one
        // (preserving ?qr_ref= for QR signups).
        setAwaitingConfirmEmail(signupEmail);
        setAwaitingConfirmRedirect(redirectTo);
      }
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── Render sign-up steps ──────────────────────────────────────────────────
  const renderSignup = () => {
    // Awaiting email confirmation — takes precedence over every other
    // signup view because the user shouldn't see the form they just
    // submitted. They land here after signUp returns no session.
    if (awaitingConfirmEmail) return (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>📧</div>
        <div style={{
          fontFamily: "'DM Serif Display',serif",
          fontSize: 22, marginBottom: 8,
        }}>
          Check your email
        </div>
        <div style={{ fontSize: 14, color: T.mu, lineHeight: 1.65, marginBottom: 22 }}>
          We sent a confirmation link to{' '}
          <strong style={{ color: T.text }}>{awaitingConfirmEmail}</strong>.
          Click the link to finish setting up your account — you'll land
          straight on your new profile.
        </div>

        <Btn variant="s" onClick={resendConfirmationEmail} disabled={resendingConfirm}
          style={{ width: '100%', marginBottom: 10 }}>
          {resendingConfirm ? 'Sending…' : 'Resend confirmation email'}
        </Btn>

        {resendNotice && (
          <div style={{ fontSize: 12, color: T.mu, marginBottom: 12 }}>{resendNotice}</div>
        )}

        <button
          onClick={() => goToMode('login')}
          style={{
            background: 'transparent', border: 'none',
            color: T.v, fontWeight: 600, fontSize: 13,
            fontFamily: 'inherit', cursor: 'pointer',
            padding: '6px 0',
          }}
        >
          Already confirmed? Sign in →
        </button>

        <div style={{ fontSize: 11.5, color: T.mu, marginTop: 14, lineHeight: 1.55 }}>
          Wrong email?{' '}
          <button
            onClick={() => { setAwaitingConfirmEmail(''); setResendNotice(''); }}
            style={{ color: T.v, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >Start over</button>
        </div>
      </div>
    );

    // ORCID OAuth completion form — shown after returning from ORCID
    if (showOrcidEmailForm) return (
      <div>
        <div style={{
          background: T.gr2, border: `1px solid rgba(16,185,129,.2)`,
          borderRadius: 12, padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.gr, marginBottom: 4 }}>
            ✓ ORCID verified
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{orcidPendingName}</div>
          <div style={{ fontSize: 12, color: T.mu }}>
            Your profile, work history, and publications will be imported automatically.
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          Set your login email and password:
        </div>

        <Inp label="Email address" type="email" value={signupEmail}
          onChange={setSignupEmail}
          placeholder="your@email.com"/>
        <Inp label="Password" type="password" value={signupPassword}
          onChange={setSignupPassword}
          placeholder="At least 8 characters"/>

        <WorkModePicker value={signupWorkMode} onChange={setSignupWorkMode}/>

        {signupError && (
          <div style={{ color: T.ro, fontSize: 12.5, marginTop: 8 }}>{signupError}</div>
        )}

        <ConsentBlock
          consentTerms={consentTerms} setConsentTerms={setConsentTerms}
          consentNotifications={consentNotifications} setConsentNotifications={setConsentNotifications}
          consentMarketing={consentMarketing} setConsentMarketing={setConsentMarketing}
          consentAnalytics={consentAnalytics} setConsentAnalytics={setConsentAnalytics}
        />

        <Btn variant="s" onClick={handleOrcidSignupComplete}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupWorkMode || !consentTerms}
          style={{ width: '100%', marginTop: 12, background: T.gr, borderColor: T.gr }}>
          {signupLoading ? 'Creating account...' : 'Create account →'}
        </Btn>
      </div>
    );

    // Open sign-up: ORCID shortcut on top, email form below.
    return (
      <div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, textAlign: 'center', marginBottom: 6 }}>
          Join Luminary
        </div>
        <div style={{ fontSize: 13, color: T.mu, textAlign: 'center', marginBottom: 20, lineHeight: 1.6 }}>
          Free for researchers, clinicians and industry scientists.
        </div>

        {orcidAuthError && (
          <div style={{
            background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9,
            padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.ro, fontWeight: 600,
          }}>
            ⚠️ {orcidAuthError}
          </div>
        )}

        <button onClick={handleOrcidOAuth} style={{
          width: '100%', padding: '14px 16px', borderRadius: 14,
          border: `2px solid ${T.bdr}`, background: T.w, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <OrcidIcon size={26}/>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Sign up with ORCID</div>
            <div style={{ fontSize: 12, color: T.mu }}>Verified iD badge + imports your publications</div>
          </div>
          <span style={{ marginLeft: 'auto', color: T.mu }}>→</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
          <div style={{ flex: 1, height: 1, background: T.bdr }} />
          <span style={{ fontSize: 11.5, color: T.mu, whiteSpace: 'nowrap' }}>or sign up with email</span>
          <div style={{ flex: 1, height: 1, background: T.bdr }} />
        </div>

        <Inp label="Full name" value={signupName} onChange={setSignupName} placeholder="Dr. Jane Smith" required />
        <Inp label="Email" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />
        <WorkModePicker value={signupWorkMode} onChange={setSignupWorkMode}/>

        <ConsentBlock
          consentTerms={consentTerms} setConsentTerms={setConsentTerms}
          consentNotifications={consentNotifications} setConsentNotifications={setConsentNotifications}
          consentMarketing={consentMarketing} setConsentMarketing={setConsentMarketing}
          consentAnalytics={consentAnalytics} setConsentAnalytics={setConsentAnalytics}
        />

        {signupError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 10 }}>{signupError}</div>}

        <Btn variant="s" onClick={handleEmailSignup}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupName.trim() || !signupWorkMode || !consentTerms}
          style={{ width: '100%', marginTop: 14 }}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: T.mu }}>
          Already have an account?{' '}
          <button onClick={() => goToMode('login')} style={{
            color: T.v, fontWeight: 700, border: 'none',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}>Sign in →</button>
        </div>
      </div>
    );
  };


  // ── Shared consent block (used in both signup paths) ─────────────────────
  const ConsentBlock = ({ consentTerms, setConsentTerms, consentNotifications, setConsentNotifications, consentMarketing, setConsentMarketing, consentAnalytics, setConsentAnalytics }) => (
    <>
      {/* Privacy context box — sits above the consent toggles */}
      <div style={{
        marginTop: 16,
        background: T.v2,
        border: `1px solid ${T.v}30`,
        borderRadius: 12,
        padding: '16px 18px',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.v3, marginBottom: 8 }}>
          🔒 A note on privacy
        </div>
        <p style={{ fontSize: 13.5, color: T.text, lineHeight: 1.7, margin: '0 0 10px' }}>
          Luminary doesn't share your data with third parties, run
          retargeting pixels, or sell your information to advertisers.
          The only analytics we collect are anonymised usage events —
          and only with your consent below.
        </p>
        <p style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, margin: 0 }}>
          If we ever introduce sponsored content in the future, it will
          always be clearly labelled and you'll always be able to opt out.
          Your science, your connections, and your data stay yours.
        </p>
      </div>

    <div style={{ marginTop: 16, padding: '14px 16px', background: T.s2, borderRadius: 12, border: `1px solid ${T.bdr}` }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={consentTerms} onChange={e => setConsentTerms(e.target.checked)}
          style={{ marginTop: 2, accentColor: T.v, flexShrink: 0 }}/>
        <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: T.v, fontWeight: 600 }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: T.v, fontWeight: 600 }}>Privacy Policy</a>
          <span style={{ color: T.ro }}> *</span>
        </span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={consentNotifications} onChange={e => setConsentNotifications(e.target.checked)}
          style={{ marginTop: 2, accentColor: T.v, flexShrink: 0 }}/>
        <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
          Send me email notifications for likes, comments, and new followers
          <span style={{ color: T.mu, fontSize: 11 }}> (you can change this anytime)</span>
        </span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
        <input type="checkbox" checked={consentMarketing} onChange={e => setConsentMarketing(e.target.checked)}
          style={{ marginTop: 2, accentColor: T.v, flexShrink: 0 }}/>
        <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
          Keep me updated on new Luminary features and research community news
          <span style={{ color: T.mu, fontSize: 11 }}> (max 2 emails per month)</span>
        </span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={consentAnalytics} onChange={e => setConsentAnalytics(e.target.checked)}
          style={{ marginTop: 2, accentColor: T.v, flexShrink: 0 }}/>
        <span style={{ fontSize: 12.5, color: T.text, lineHeight: 1.55 }}>
          Help improve Luminary by sharing anonymous usage analytics
          <span style={{ color: T.mu, fontSize: 11 }}> (no personal data, you can change this anytime)</span>
        </span>
      </label>
    </div>
    </>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg,${T.v2},${T.bl2},#fff)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{
        width: 420, background: T.w, borderRadius: 20, padding: 36,
        boxShadow: '0 8px 40px rgba(108,99,255,.15)', border: `1px solid ${T.bdr}`,
        maxHeight: '95vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, color: T.text, marginBottom: 4 }}>
            Lumi<span style={{ color: T.v }}>nary</span>
          </div>
          <div style={{ fontSize: 13, color: T.mu }}>The scientific community network</div>
        </div>

        {/* Tab bar — sign-in / sign-up toggle */}
        {mode !== 'signup' && !showOrcidEmailForm && (
          <div style={{ display: 'flex', background: T.s2, borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {[['login', 'Sign In'], ['signup', 'Create Account']].map(([m, l]) => (
              <div key={m} onClick={() => goToMode(m)} style={{
                flex: 1, padding: '8px', borderRadius: 8, textAlign: 'center',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: mode === m ? T.w : 'transparent',
                color: mode === m ? T.v : T.mu,
                boxShadow: mode === m ? '0 1px 8px rgba(108,99,255,.12)' : 'none',
              }}>{l}</div>
            ))}
          </div>
        )}

        {/* Sign-in */}
        {mode === 'login' && !showOrcidEmailForm && (
          <>
            {error   && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.ro, fontWeight: 600 }}>⚠️ {error}</div>}
            {success && <div style={{ background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.gr, fontWeight: 600 }}>✅ {success}</div>}
            <form onSubmit={submitLogin}>
              <Inp label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@university.edu" required />
              <Inp label="Password" type="password" value={password} onChange={setPassword} required />
              <Btn variant="s" type="submit" disabled={loading} style={{ width: '100%', padding: '11px', fontSize: 14, marginBottom: 14 }}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </Btn>
            </form>
            <div style={{ textAlign: 'center', fontSize: 12, color: T.mu }}>
              <span style={{ cursor: 'pointer', color: T.v, fontWeight: 600 }}
                onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}>
                Forgot password?
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: T.bdr }} />
              <span style={{ fontSize: 11.5, color: T.mu, whiteSpace: 'nowrap' }}>or sign in with</span>
              <div style={{ flex: 1, height: 1, background: T.bdr }} />
            </div>

            <button onClick={handleOrcidOAuth} style={{
              width: '100%', padding: '13px 16px', borderRadius: 12,
              border: `2px solid ${T.bdr}`, background: T.w, cursor: 'pointer',
              textAlign: 'left', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <OrcidIcon size={22}/>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>Sign in with ORCID</div>
                <div style={{ fontSize: 11.5, color: T.mu }}>Use your researcher identity</div>
              </div>
              <span style={{ marginLeft: 'auto', color: T.mu, fontSize: 13 }}>→</span>
            </button>
          </>
        )}

        {/* Forgot password */}
        {mode === 'forgot' && (
          <>
            {error   && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.ro, fontWeight: 600 }}>⚠️ {error}</div>}
            {success && <div style={{ background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.gr, fontWeight: 600 }}>✅ {success}</div>}
            <form onSubmit={submitLogin}>
              <Inp label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@university.edu" required />
              <Btn variant="s" type="submit" disabled={loading} style={{ width: '100%', padding: '11px', fontSize: 14, marginBottom: 14 }}>
                {loading ? 'Sending…' : 'Send Reset Email →'}
              </Btn>
            </form>
            <div style={{ textAlign: 'center', fontSize: 12, color: T.mu }}>
              <span style={{ cursor: 'pointer', color: T.v, fontWeight: 600 }}
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
                ← Back to sign in
              </span>
            </div>
          </>
        )}

        {/* Sign-up flow (including ORCID completion) */}
        {(mode === 'signup' || showOrcidEmailForm) && renderSignup()}

        <Footer minimal/>
      </div>
    </div>
  );
}
