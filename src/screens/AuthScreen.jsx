import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, ORCID_CLIENT_ID, ORCID_AUTHORIZE_URL, ORCID_REDIRECT_URI } from '../lib/constants';
import Inp from '../components/Inp';
import Btn from '../components/Btn';
import Footer from '../components/Footer';

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 10, padding: '9px 14px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', color: T.text,
  boxSizing: 'border-box',
};

const backBtn = {
  fontSize: 12, color: T.v, fontWeight: 600,
  border: 'none', background: 'transparent',
  cursor: 'pointer', fontFamily: 'inherit',
  padding: '0 0 14px 0', display: 'block',
};

export default function AuthScreen({ onAuth, orcidPendingToken, orcidPendingName, showOrcidEmailForm, orcidAuthError }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'

  // Sign-in / forgot
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // Sign-up shared
  // signupPath: null | 'invite' | 'invite-details'
  const [signupPath,     setSignupPath]     = useState(null);
  const [signupEmail,    setSignupEmail]    = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName,     setSignupName]     = useState('');
  const [signupError,    setSignupError]    = useState('');
  const [signupLoading,  setSignupLoading]  = useState(false);

  // Invite path
  const [inviteCode,        setInviteCode]        = useState('');
  const [inviteValid,       setInviteValid]       = useState(null); // null | true | false
  const [inviteChecking,    setInviteChecking]    = useState(false);
  const [inviteError,       setInviteError]       = useState('');
  const [inviteRateLimited, setInviteRateLimited] = useState(false);
  const codeRowRef = useRef(null);

  // Consent (both signup paths)
  const [consentTerms,         setConsentTerms]         = useState(false);
  const [consentNotifications, setConsentNotifications] = useState(true);
  const [consentMarketing,     setConsentMarketing]     = useState(false);
  const [consentAnalytics,     setConsentAnalytics]     = useState(false);

  // Waitlist path
  const [waitlistName,        setWaitlistName]        = useState('');
  const [waitlistEmail,       setWaitlistEmail]       = useState('');
  const [waitlistInstitution, setWaitlistInstitution] = useState('');
  const [waitlistRole,        setWaitlistRole]        = useState('');
  const [waitlistReferral,    setWaitlistReferral]    = useState('');
  const [waitlistSubmitted,   setWaitlistSubmitted]   = useState(false);

  // Pre-fill invite code handoff from LandingScreen
  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_invite_code');
    if (prefill) {
      sessionStorage.removeItem('prefill_invite_code');
      setMode('signup');
      setSignupPath('invite');
      setInviteCode(prefill);
    }
  }, []);

  const goToMode = (m) => {
    setMode(m); setError(''); setSuccess('');
    setSignupPath(null);
    setInviteCode(''); setInviteValid(null); setInviteError(''); setInviteRateLimited(false);
    setConsentTerms(false); setConsentNotifications(true); setConsentMarketing(false); setConsentAnalytics(false);
    setSignupEmail(''); setSignupPassword(''); setSignupName(''); setSignupError('');
    setWaitlistName(''); setWaitlistEmail(''); setWaitlistInstitution('');
    setWaitlistRole(''); setWaitlistReferral(''); setWaitlistSubmitted(false);
  };

  const isAcademicEmail = email => {
    const domain = (email.split('@')[1] || '').toLowerCase();
    return /\.(edu|ac\.[a-z]{2,}|edu\.[a-z]{2,})$/.test(domain);
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

  // ── Invite code validation ────────────────────────────────────────────────
  const validateInviteCode = async () => {
    if (inviteRateLimited) return;
    setInviteChecking(true);
    setInviteError('');

    try {
      const { data: codeRow, error: codeError } = await supabase
        .from('invite_codes')
        .select('id, code, is_multi_use, max_uses, uses_count, expires_at, locked_at, claimed_by, created_by')
        .eq('code', inviteCode.trim().toUpperCase())
        .single();

      if (codeError || !codeRow) {
        setInviteValid(false);
        setInviteError('Code not found or already used.');
        return;
      }

      if (codeRow.locked_at) {
        setInviteValid(false);
        setInviteError('locked');
        setInviteRateLimited(true);
        return;
      }

      if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
        setInviteValid(false);
        setInviteError('This invite code has expired.');
        return;
      }

      if (codeRow.is_multi_use) {
        if (codeRow.max_uses != null && codeRow.uses_count >= codeRow.max_uses) {
          setInviteValid(false);
          setInviteError('This invite code is no longer available.');
          return;
        }
      } else if (codeRow.claimed_by) {
        setInviteValid(false);
        setInviteError('This invite code has already been used.');
        return;
      }

      codeRowRef.current = codeRow;
      setInviteValid(true);
      setSignupPath('invite-details');
    } catch (e) {
      setInviteValid(false);
      setInviteError('Validation failed. Please try again.');
    } finally {
      setInviteChecking(false);
    }
  };

  // ── Waitlist submission ───────────────────────────────────────────────────
  const handleWaitlistSubmit = async () => {
    setSignupLoading(true); setSignupError('');
    try {
      const hasOptional = !!(waitlistInstitution.trim() || waitlistRole.trim() || waitlistReferral.trim());
      const { error } = await supabase.from('waitlist').insert({
        full_name:       waitlistName.trim(),
        email:           waitlistEmail.trim().toLowerCase(),
        institution:     waitlistInstitution.trim() || null,
        role_title:      waitlistRole.trim()        || null,
        referral_source: waitlistReferral.trim()    || null,
        is_priority:     hasOptional || isAcademicEmail(waitlistEmail),
      });
      if (error) throw error;
      setWaitlistSubmitted(true);
    } catch (e) {
      setSignupError(e.message || 'Something went wrong. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── ORCID OAuth redirect ──────────────────────────────────────────────────
  const handleOrcidOAuth = () => {
    const params = new URLSearchParams({
      client_id:     ORCID_CLIENT_ID,
      response_type: 'code',
      scope:         '/authenticate',
      redirect_uri:  ORCID_REDIRECT_URI,
      state:         'signup',
    });
    window.location.href = `${ORCID_AUTHORIZE_URL}?${params}`;
  };

  // ── ORCID sign-up completion (after OAuth callback) ───────────────────────
  const handleOrcidSignupComplete = async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      // 1. Fetch the pending ORCID data using the token
      const { data: pending } = await supabase
        .from('orcid_pending')
        .select('*')
        .eq('token', orcidPendingToken)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (!pending) throw new Error('ORCID session expired. Please sign up again.');

      // 2. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email:    signupEmail,
        password: signupPassword,
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed.');

      // 3. Populate profile with ORCID data
      await supabase.from('profiles').update({
        name:                 pending.name,
        bio:                  pending.bio,
        institution:          pending.institution,
        title:                pending.title,
        orcid:                pending.orcid_id,
        orcid_verified:       true,
        signup_method:        'orcid',
        work_history:         JSON.parse(pending.work_history || '[]'),
        education:            JSON.parse(pending.education    || '[]'),
        email_notifications:    consentNotifications,
        email_marketing:        consentMarketing,
        marketing_consent_at:   consentMarketing  ? new Date().toISOString() : null,
        analytics_consent_at:   consentAnalytics  ? new Date().toISOString() : null,
        terms_accepted_at:      new Date().toISOString(),
        privacy_accepted_at:    new Date().toISOString(),
      }).eq('id', userId);

      // 4. Insert publications
      const pubs = JSON.parse(pending.publications || '[]');
      if (pubs.length) {
        await supabase.from('publications').insert(
          pubs.map(p => ({
            user_id: userId,
            title:   p.title,
            journal: p.journal,
            year:    p.year,
            doi:     p.doi  || '',
            pmid:    p.pmid || '',
            source:  'orcid',
          }))
        );
      }

      // 5. Generate invite codes
      await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

      // 6. Clean up pending record
      await supabase.from('orcid_pending').delete().eq('token', orcidPendingToken);

      // Done — Supabase auth session is now active, app will re-render
      capture('signed_up', { method: 'orcid' });
      if (authData.session) {
        onAuth();
      } else {
        goToMode('login');
        setSuccess('Account created! Check your email to confirm, then sign in.');
      }
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── Invite-code sign-up ───────────────────────────────────────────────────
  const handleInviteSignup = async () => {
    setSignupLoading(true); setSignupError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { name: signupName } },
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed');

      const codeRow = codeRowRef.current;
      if (codeRow?.is_multi_use) {
        await supabase.from('invite_code_uses').insert({
          code_id:    codeRow.id,
          user_id:    userId,
          claimed_at: new Date().toISOString(),
        });
        await supabase
          .from('invite_codes')
          .update({ uses_count: (codeRow.uses_count || 0) + 1 })
          .eq('id', codeRow.id);
      } else {
        await supabase.rpc('claim_invite_code', {
          p_code:    inviteCode.trim().toUpperCase(),
          p_user_id: userId,
        });
      }

      await supabase.from('profiles').upsert({
        id:                   userId,
        name:                 signupName,
        signup_method:        'invite',
        card_email:           signupEmail,
        email_notifications:  consentNotifications,
        email_marketing:      consentMarketing,
        marketing_consent_at: consentMarketing ? new Date().toISOString() : null,
        analytics_consent_at: consentAnalytics  ? new Date().toISOString() : null,
        terms_accepted_at:    new Date().toISOString(),
        privacy_accepted_at:  new Date().toISOString(),
      });

      capture('signed_up', { method: 'email' });
      capture('invite_code_used', { code_type: codeRow?.is_multi_use ? 'event' : 'personal' });

      // Notify the inviter that someone redeemed their code
      if (codeRow?.created_by && codeRow.created_by !== userId) {
        await supabase.from('notifications').insert({
          user_id:    codeRow.created_by,
          actor_id:   userId,
          notif_type: 'invite_redeemed',
          meta:       { code: codeRow.code },
          read:       false,
        });
      }

      if (authData.session) {
        onAuth();
      } else {
        goToMode('login');
        setSuccess('Account created! Check your email to confirm, then sign in.');
      }
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── Render sign-up steps ──────────────────────────────────────────────────
  const renderSignup = () => {
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
          disabled={signupLoading || !signupEmail || !signupPassword || !consentTerms}
          style={{ width: '100%', marginTop: 12, background: T.gr, borderColor: T.gr }}>
          {signupLoading ? 'Creating account...' : 'Create account →'}
        </Btn>
      </div>
    );

    if (signupPath === 'waitlist') {
      const hasOptional = !!(waitlistInstitution || waitlistRole || waitlistReferral);
      const academic    = waitlistEmail.includes('@') && isAcademicEmail(waitlistEmail);

      if (waitlistSubmitted) return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>You're on the list!</div>
          <div style={{ fontSize: 14, color: T.mu, lineHeight: 1.65 }}>
            We'll be in touch at <strong style={{ color: T.text }}>{waitlistEmail}</strong> when your spot opens up.
            {academic && <>{' '}Academic email detected — you'll get priority access.</>}
          </div>
          <Btn variant="s" onClick={() => goToMode('login')} style={{ width: '100%', marginTop: 28 }}>
            Back to Sign In →
          </Btn>
        </div>
      );

      return (
        <div>
          <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Join the Luminary waitlist</div>
          <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
            We're growing carefully. Drop your details and we'll let you know when your spot opens.
          </div>

          <Inp label="Full name" value={waitlistName} onChange={setWaitlistName} placeholder="Dr. Jane Smith" />

          <Inp label="Email address" type="email" value={waitlistEmail} onChange={setWaitlistEmail} placeholder="you@university.edu" />
          {academic && (
            <div style={{ fontSize: 11.5, color: T.gr, fontWeight: 700, marginTop: -12, marginBottom: 12 }}>
              ✓ Academic email — priority access
            </div>
          )}

          <div style={{
            margin: '20px 0 16px', padding: '12px 14px',
            background: T.v2, borderRadius: 10, borderLeft: `3px solid ${T.v}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.v }}>
              Tell us a little bit about you to get priority access.
            </div>
          </div>

          <Inp label="Institution (optional)" value={waitlistInstitution} onChange={setWaitlistInstitution} placeholder="University of…" />
          <Inp label="Role / Title (optional)" value={waitlistRole} onChange={setWaitlistRole} placeholder="Research Fellow, MD, PhD student…" />
          <Inp label="Where did you hear about us? (optional)" value={waitlistReferral} onChange={setWaitlistReferral} placeholder="Colleague, conference, Twitter…" />

          {signupError && (
            <div style={{ color: T.ro, fontSize: 12.5, marginTop: 8 }}>{signupError}</div>
          )}

          <Btn variant="s" onClick={handleWaitlistSubmit}
            disabled={signupLoading || !waitlistName.trim() || !waitlistEmail.trim()}
            style={{ width: '100%', marginTop: 16 }}>
            {signupLoading ? 'Submitting…' : hasOptional ? 'Request priority access →' : 'Join the waiting list →'}
          </Btn>
        </div>
      );
    }

    if (!signupPath) return (
      <div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, textAlign: 'center', marginBottom: 8 }}>
          Join Luminary
        </div>
        <div style={{ fontSize: 13, color: T.mu, textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
          Luminary is invite-only. Join with an invite code from a colleague,
          or verify you're a researcher with your ORCID iD.
        </div>

        {orcidAuthError && (
          <div style={{
            background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9,
            padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.ro, fontWeight: 600,
          }}>
            ⚠️ {orcidAuthError}
          </div>
        )}

        <button onClick={() => setSignupPath('invite')} style={{
          width: '100%', padding: '16px', borderRadius: 14, marginBottom: 12,
          border: `2px solid ${T.bdr}`, background: T.w, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>🎟️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>I have an invite code</div>
            <div style={{ fontSize: 12, color: T.mu }}>A colleague shared a code with you</div>
          </div>
          <span style={{ marginLeft: 'auto', color: T.mu }}>→</span>
        </button>

        <button onClick={handleOrcidOAuth} style={{
          width: '100%', padding: '16px', borderRadius: 14, marginBottom: 12,
          border: `2px solid ${T.bdr}`, background: T.w, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>🔬</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
              Sign up with ORCID
            </div>
            <div style={{ fontSize: 12, color: T.mu }}>
              Verified researcher identity — auto-fills your profile
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: T.mu }}>→</span>
        </button>

        <button onClick={() => setSignupPath('waitlist')} style={{
          width: '100%', padding: '16px', borderRadius: 14,
          border: `2px dashed ${T.bdr}`, background: T.s2, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>📋</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Join the waiting list</div>
            <div style={{ fontSize: 12, color: T.mu }}>No invite yet? We'll notify you when a spot opens</div>
          </div>
          <span style={{ marginLeft: 'auto', color: T.mu }}>→</span>
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: T.mu }}>
          Already have an account?{' '}
          <button onClick={() => goToMode('login')} style={{
            color: T.v, fontWeight: 700, border: 'none',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}>Sign in →</button>
        </div>
      </div>
    );

    // A1 — Enter invite code
    if (signupPath === 'invite') return (
      <div>
        <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Enter invite code</div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 20 }}>
          Codes look like <span style={{ fontFamily: 'monospace' }}>LM-XXXXXXXX</span> or <span style={{ fontFamily: 'monospace' }}>CONF-XXXXXX</span>
        </div>

        <input
          value={inviteCode}
          onChange={e => { if (inviteRateLimited) return; setInviteCode(e.target.value.toUpperCase().trim()); setInviteValid(null); setInviteError(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && inviteCode.length >= 6) validateInviteCode(); }}
          placeholder="LM-XXXXXXXX"
          disabled={inviteRateLimited}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: '.1em', textAlign: 'center', opacity: inviteRateLimited ? 0.5 : 1 }}
        />
        {inviteError && (
          <div style={{ color: T.ro, fontSize: 12.5, marginTop: 6 }}>
            {inviteError === 'locked'
              ? '🔒 This code has been locked after too many attempts. Contact the person who shared it with you.'
              : inviteError}
          </div>
        )}
        {inviteValid === true && (
          <div style={{ color: T.gr, fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>✓ Valid invite code</div>
        )}
        <Btn variant="s" onClick={validateInviteCode}
          disabled={inviteCode.length < 6 || inviteChecking || inviteRateLimited}
          style={{ width: '100%', marginTop: 12 }}>
          {inviteChecking ? 'Checking…' : 'Verify code →'}
        </Btn>
      </div>
    );

    // A2 — Account details
    if (signupPath === 'invite-details') return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Create your account</div>
        <div style={{
          fontSize: 12, color: T.gr, fontWeight: 600,
          background: T.gr2, borderRadius: 8, padding: '6px 12px',
          marginBottom: 20, display: 'inline-block',
        }}>✓ Invite code accepted</div>

        <Inp label="Full name" value={signupName} onChange={setSignupName} placeholder="Dr. Jane Smith" required />
        <Inp label="Email" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />

        <div style={{ fontSize: 12, color: T.mu, marginBottom: 16, lineHeight: 1.6, padding: '10px 12px', background: T.v2, borderRadius: 10 }}>
          🔬 Once signed in, you can import your full ORCID profile — including work history and publications — from <strong>My Profile → Import → ORCID</strong>.
        </div>

        <ConsentBlock
          consentTerms={consentTerms} setConsentTerms={setConsentTerms}
          consentNotifications={consentNotifications} setConsentNotifications={setConsentNotifications}
          consentMarketing={consentMarketing} setConsentMarketing={setConsentMarketing}
          consentAnalytics={consentAnalytics} setConsentAnalytics={setConsentAnalytics}
        />

        {signupError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 4, marginBottom: 8 }}>{signupError}</div>}

        <Btn variant="s" onClick={handleInviteSignup}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupName || !consentTerms}
          style={{ width: '100%' }}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    return null;
  };

  // ── Shared consent block (used in both signup paths) ─────────────────────
  const ConsentBlock = ({ consentTerms, setConsentTerms, consentNotifications, setConsentNotifications, consentMarketing, setConsentMarketing, consentAnalytics, setConsentAnalytics }) => (
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
              <span style={{ fontSize: 22 }}>🔬</span>
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
