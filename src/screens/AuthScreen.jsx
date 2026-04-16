import { useState } from 'react';
import { supabase } from '../supabase';
import { T, ORCID_CLIENT_ID, ORCID_AUTHORIZE_URL, ORCID_REDIRECT_URI } from '../lib/constants';
import Inp from '../components/Inp';
import Btn from '../components/Btn';

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
  const [inviteCode,     setInviteCode]     = useState('');
  const [inviteValid,    setInviteValid]    = useState(null); // null | true | false
  const [inviteChecking, setInviteChecking] = useState(false);
  const [inviteError,    setInviteError]    = useState('');

  const goToMode = (m) => {
    setMode(m); setError(''); setSuccess('');
    setSignupPath(null);
    setInviteCode(''); setInviteValid(null); setInviteError('');
    setSignupEmail(''); setSignupPassword(''); setSignupName(''); setSignupError('');
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

  // ── Invite code validation (via Edge Function — brute-force protected) ────
  const validateInviteCode = async () => {
    setInviteChecking(true);
    setInviteError('');

    try {
      const { data, error } = await supabase.functions.invoke('validate-invite', {
        body: { code: inviteCode.trim().toUpperCase() }
      });

      if (error || !data?.valid) {
        setInviteValid(false);
        setInviteError(data?.reason || 'Code not found or already used.');
      } else {
        setInviteValid(true);
        setSignupPath('invite-details');
      }
    } catch (e) {
      setInviteValid(false);
      setInviteError('Validation failed. Please try again.');
    }

    setInviteChecking(false);
  };

  // ── ORCID OAuth redirect ──────────────────────────────────────────────────
  const handleOrcidOAuth = () => {
    const params = new URLSearchParams({
      client_id:     ORCID_CLIENT_ID,
      response_type: 'code',
      scope:         '/authenticate /read-limited',
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
        name:           pending.name,
        bio:            pending.bio,
        institution:    pending.institution,
        title:          pending.title,
        orcid:          pending.orcid_id,
        orcid_verified: true,
        signup_method:  'orcid',
        work_history:   JSON.parse(pending.work_history || '[]'),
        education:      JSON.parse(pending.education    || '[]'),
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

      await supabase.rpc('claim_invite_code', {
        p_code:    inviteCode.trim().toUpperCase(),
        p_user_id: userId,
      });

      await supabase.from('profiles').upsert({
        id:            userId,
        name:          signupName,
        signup_method: 'invite',
        card_email:    signupEmail,
      });

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

        <Btn variant="s" onClick={handleOrcidSignupComplete}
          disabled={signupLoading || !signupEmail || !signupPassword}
          style={{ width: '100%', marginTop: 12, background: T.gr, borderColor: T.gr }}>
          {signupLoading ? 'Creating account...' : 'Create account →'}
        </Btn>
      </div>
    );

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
          width: '100%', padding: '16px', borderRadius: 14,
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
          onChange={e => { setInviteCode(e.target.value.toUpperCase().trim()); setInviteValid(null); setInviteError(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && inviteCode.length >= 6) validateInviteCode(); }}
          placeholder="LM-XXXXXXXX"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: '.1em', textAlign: 'center' }}
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
          disabled={inviteCode.length < 6 || inviteChecking}
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

        {signupError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 4, marginBottom: 8 }}>{signupError}</div>}

        <Btn variant="s" onClick={handleInviteSignup}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupName}
          style={{ width: '100%' }}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    return null;
  };

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
      </div>
    </div>
  );
}
