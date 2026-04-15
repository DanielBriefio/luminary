import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
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

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'

  // Sign-in / forgot
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // Sign-up shared
  // signupPath: null | 'invite' | 'invite-details' | 'orcid' | 'orcid-details'
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

  // ORCID path
  const [orcidInput,    setOrcidInput]    = useState('');
  const [orcidData,     setOrcidData]     = useState(null); // { name, affiliation, orcidId }
  const [orcidChecking, setOrcidChecking] = useState(false);
  const [orcidError,    setOrcidError]    = useState('');

  const goToMode = (m) => {
    setMode(m); setError(''); setSuccess('');
    setSignupPath(null);
    setInviteCode(''); setInviteValid(null);
    setOrcidInput(''); setOrcidData(null); setOrcidError('');
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

  // ── Invite code validation ────────────────────────────────────────────────
  const validateInviteCode = async () => {
    setInviteChecking(true);
    const { data } = await supabase
      .from('invite_codes')
      .select('id, claimed_by')
      .eq('code', inviteCode.trim().toUpperCase())
      .single();
    if (!data || data.claimed_by) {
      setInviteValid(false);
    } else {
      setInviteValid(true);
      setSignupPath('invite-details');
    }
    setInviteChecking(false);
  };

  // ── ORCID identity verification (no import — just check who they are) ─────
  const verifyOrcid = async () => {
    setOrcidChecking(true); setOrcidError(''); setOrcidData(null);
    try {
      const clean = orcidInput.replace('https://orcid.org/', '').trim();
      if (!clean.match(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)) {
        setOrcidError('Invalid format. Should be 0000-0000-0000-0000');
        setOrcidChecking(false); return;
      }
      const resp = await fetch(`https://pub.orcid.org/v3.0/${clean}/record`, {
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) throw new Error('ORCID not found');
      const data = await resp.json();
      const given  = data.person?.name?.['given-names']?.value || '';
      const family = data.person?.name?.['family-name']?.value || '';
      const name   = `${given} ${family}`.trim();
      const affil  = data['activities-summary']?.employments
        ?.['affiliation-group']?.[0]?.['summaries']?.[0]
        ?.['employment-summary']?.organization?.name || '';
      if (!name) throw new Error('Could not read name from ORCID record');
      setOrcidData({ name, affiliation: affil, orcidId: clean });
      setSignupPath('orcid-details');
    } catch (e) {
      setOrcidError('ORCID not found. Check the iD and try again.');
    }
    setOrcidChecking(false);
  };

  // ── Invite-code sign-up ───────────────────────────────────────────────────
  const handleInviteSignup = async () => {
    setSignupLoading(true); setSignupError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { name: signupName } }, // auth trigger picks up name immediately
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed');

      // Claim the invite code via SECURITY DEFINER function (works even without
      // a confirmed session — bypasses RLS entirely)
      await supabase.rpc('claim_invite_code', {
        p_code:    inviteCode.trim().toUpperCase(),
        p_user_id: userId,
      });

      // Invite code generation is handled by DB trigger on profiles insert.
      // Profile fields: upsert in case the auth trigger hasn't fired yet.
      await supabase.from('profiles').upsert({
        id:            userId,
        name:          signupName,
        signup_method: 'invite',
        card_email:    signupEmail,
      });

      if (authData.session) {
        // Email confirmation not required — go straight in
        onAuth();
      } else {
        // Email confirmation required — ask user to check inbox
        goToMode('login');
        setSuccess('Account created! Check your email to confirm, then sign in.');
      }
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── ORCID sign-up ─────────────────────────────────────────────────────────
  const handleOrcidSignup = async () => {
    setSignupLoading(true); setSignupError('');
    try {
      // Prevent duplicate ORCID accounts
      const { data: existing } = await supabase
        .from('profiles').select('id').eq('orcid', orcidData.orcidId).single();
      if (existing) {
        setSignupError('An account with this ORCID iD already exists. Try signing in.');
        setSignupLoading(false); return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { name: orcidData.name } },
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed');

      // Set ORCID fields on profile. Full ORCID import (work history, publications)
      // is done from My Profile → Import → ORCID after sign-in.
      await supabase.from('profiles').upsert({
        id:             userId,
        name:           orcidData.name,
        institution:    orcidData.affiliation,
        orcid:          orcidData.orcidId,
        orcid_verified: true,
        signup_method:  'orcid',
        card_email:     signupEmail,
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
    if (!signupPath) return (
      <div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, textAlign:'center', marginBottom:8 }}>
          Join Luminary
        </div>
        <div style={{ fontSize:13, color:T.mu, textAlign:'center', marginBottom:28, lineHeight:1.6 }}>
          Luminary is invite-only. Join with an invite code from a colleague,
          or verify you're a researcher with your ORCID iD.
        </div>

        <button onClick={() => setSignupPath('invite')} style={{
          width:'100%', padding:'16px', borderRadius:14, marginBottom:12,
          border:`2px solid ${T.bdr}`, background:T.w, cursor:'pointer',
          textAlign:'left', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:14,
        }}>
          <span style={{fontSize:28}}>🎟️</span>
          <div>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>I have an invite code</div>
            <div style={{fontSize:12, color:T.mu}}>A colleague shared a code with you</div>
          </div>
          <span style={{marginLeft:'auto', color:T.mu}}>→</span>
        </button>

        <button onClick={() => setSignupPath('orcid')} style={{
          width:'100%', padding:'16px', borderRadius:14,
          border:`2px solid ${T.bdr}`, background:T.w, cursor:'pointer',
          textAlign:'left', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:14,
        }}>
          <span style={{fontSize:28}}>🔬</span>
          <div>
            <div style={{fontSize:14, fontWeight:700, marginBottom:2}}>I have an ORCID iD</div>
            <div style={{fontSize:12, color:T.mu}}>Verify you're a researcher — your profile auto-fills</div>
          </div>
          <span style={{marginLeft:'auto', color:T.mu}}>→</span>
        </button>

        <div style={{textAlign:'center', marginTop:20, fontSize:13, color:T.mu}}>
          Already have an account?{' '}
          <button onClick={() => goToMode('login')} style={{
            color:T.v, fontWeight:700, border:'none',
            background:'transparent', cursor:'pointer', fontFamily:'inherit',
          }}>Sign in →</button>
        </div>
      </div>
    );

    // A1 — Enter invite code
    if (signupPath === 'invite') return (
      <div>
        <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
        <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>Enter invite code</div>
        <div style={{fontSize:13, color:T.mu, marginBottom:20}}>
          Codes look like <span style={{fontFamily:'monospace'}}>LM-XXXXXXXX</span> or <span style={{fontFamily:'monospace'}}>CONF-XXXXXX</span>
        </div>

        <input
          value={inviteCode}
          onChange={e => { setInviteCode(e.target.value.toUpperCase().trim()); setInviteValid(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && inviteCode.length >= 6) validateInviteCode(); }}
          placeholder="LM-XXXXXXXX"
          style={{...inputStyle, fontFamily:'monospace', fontSize:16, letterSpacing:'.1em', textAlign:'center'}}
        />
        {inviteValid === false && (
          <div style={{color:T.ro, fontSize:12.5, marginTop:6}}>
            Code not found or already used. Check the code and try again.
          </div>
        )}
        {inviteValid === true && (
          <div style={{color:T.gr, fontSize:12.5, fontWeight:600, marginTop:6}}>✓ Valid invite code</div>
        )}
        <Btn variant="s" onClick={validateInviteCode}
          disabled={inviteCode.length < 6 || inviteChecking}
          style={{width:'100%', marginTop:12}}>
          {inviteChecking ? 'Checking…' : 'Verify code →'}
        </Btn>
      </div>
    );

    // A2 — Account details
    if (signupPath === 'invite-details') return (
      <div>
        <div style={{fontSize:18, fontWeight:700, marginBottom:8}}>Create your account</div>
        <div style={{
          fontSize:12, color:T.gr, fontWeight:600,
          background:T.gr2, borderRadius:8, padding:'6px 12px',
          marginBottom:20, display:'inline-block',
        }}>✓ Invite code accepted</div>

        <Inp label="Full name" value={signupName} onChange={setSignupName} placeholder="Dr. Jane Smith" required />
        <Inp label="Email" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />

        <div style={{fontSize:12, color:T.mu, marginBottom:16, lineHeight:1.6, padding:'10px 12px', background:T.v2, borderRadius:10}}>
          🔬 Once signed in, you can import your full ORCID profile — including work history and publications — from <strong>My Profile → Import → ORCID</strong>.
        </div>

        {signupError && <div style={{color:T.ro, fontSize:12.5, marginTop:4, marginBottom:8}}>{signupError}</div>}

        <Btn variant="s" onClick={handleInviteSignup}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupName}
          style={{width:'100%'}}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    // B1 — Enter ORCID iD
    if (signupPath === 'orcid') return (
      <div>
        <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
        <div style={{fontSize:18, fontWeight:700, marginBottom:4}}>Verify with ORCID</div>
        <div style={{fontSize:13, color:T.mu, marginBottom:20, lineHeight:1.6}}>
          Enter your ORCID iD to verify you're a researcher.
          Your name and institution will be pre-filled.
        </div>

        <input
          value={orcidInput}
          onChange={e => setOrcidInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && orcidInput.length >= 16) verifyOrcid(); }}
          placeholder="0000-0002-1825-0097 or https://orcid.org/…"
          style={{...inputStyle, fontFamily:'monospace'}}
        />
        <div style={{fontSize:11.5, color:T.mu, marginTop:5}}>
          Find yours at{' '}
          <a href="https://orcid.org" target="_blank" rel="noopener noreferrer" style={{color:T.v}}>orcid.org</a>
        </div>

        {orcidError && <div style={{color:T.ro, fontSize:12.5, marginTop:8}}>{orcidError}</div>}

        <Btn variant="s" onClick={verifyOrcid}
          disabled={orcidChecking || orcidInput.length < 16}
          style={{width:'100%', marginTop:12, background:T.gr, borderColor:T.gr}}>
          {orcidChecking ? 'Looking up ORCID…' : 'Verify researcher identity →'}
        </Btn>
      </div>
    );

    // B2 — Confirmed identity, set email + password
    if (signupPath === 'orcid-details') return (
      <div>
        <div style={{
          background:T.gr2, border:`1px solid rgba(16,185,129,.2)`,
          borderRadius:12, padding:'16px', marginBottom:20,
        }}>
          <div style={{fontSize:12, fontWeight:700, color:T.gr, marginBottom:8}}>✓ Researcher verified</div>
          <div style={{fontSize:14, fontWeight:700}}>{orcidData.name}</div>
          {orcidData.affiliation && <div style={{fontSize:12.5, color:T.mu}}>{orcidData.affiliation}</div>}
          <div style={{fontSize:11.5, color:T.mu, marginTop:4}}>
            ORCID: {orcidInput.replace('https://orcid.org/', '')}
          </div>
        </div>

        <button onClick={() => { setOrcidData(null); setOrcidInput(''); setSignupPath('orcid'); }}
          style={{fontSize:12, color:T.v, border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', marginBottom:16}}>
          ← Try a different ORCID iD
        </button>

        <Inp label="Email address" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />

        <div style={{fontSize:12, color:T.mu, marginBottom:16, lineHeight:1.6, padding:'10px 12px', background:T.gr2, borderRadius:10}}>
          🔬 After signing in, import your full ORCID profile (work history, publications) from <strong>My Profile → Import → ORCID</strong>.
        </div>

        {signupError && <div style={{color:T.ro, fontSize:12.5, marginTop:4, marginBottom:8}}>{signupError}</div>}

        <Btn variant="s" onClick={handleOrcidSignup}
          disabled={signupLoading || !signupEmail || !signupPassword}
          style={{width:'100%', background:T.gr, borderColor:T.gr}}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    return null;
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:'100vh',
      background:`linear-gradient(135deg,${T.v2},${T.bl2},#fff)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'DM Sans',sans-serif",
    }}>
      <div style={{
        width:420, background:T.w, borderRadius:20, padding:36,
        boxShadow:'0 8px 40px rgba(108,99,255,.15)', border:`1px solid ${T.bdr}`,
        maxHeight:'95vh', overflowY:'auto',
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:24}}>
          <div style={{fontFamily:"'DM Serif Display',serif", fontSize:34, color:T.text, marginBottom:4}}>
            Lumi<span style={{color:T.v}}>nary</span>
          </div>
          <div style={{fontSize:13, color:T.mu}}>The scientific community network</div>
        </div>

        {/* Tab bar — sign-in / sign-up toggle */}
        {mode !== 'signup' && (
          <div style={{display:'flex', background:T.s2, borderRadius:10, padding:3, marginBottom:24}}>
            {[['login','Sign In'],['signup','Create Account']].map(([m,l]) => (
              <div key={m} onClick={() => goToMode(m)} style={{
                flex:1, padding:'8px', borderRadius:8, textAlign:'center',
                cursor:'pointer', fontSize:13, fontWeight:700,
                background: mode===m ? T.w : 'transparent',
                color: mode===m ? T.v : T.mu,
                boxShadow: mode===m ? '0 1px 8px rgba(108,99,255,.12)' : 'none',
              }}>{l}</div>
            ))}
          </div>
        )}

        {/* Sign-in */}
        {mode === 'login' && (
          <>
            {error   && <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.ro,fontWeight:600}}>⚠️ {error}</div>}
            {success && <div style={{background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.gr,fontWeight:600}}>✅ {success}</div>}
            <form onSubmit={submitLogin}>
              <Inp label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@university.edu" required />
              <Inp label="Password" type="password" value={password} onChange={setPassword} required />
              <Btn variant="s" type="submit" disabled={loading} style={{width:'100%',padding:'11px',fontSize:14,marginBottom:14}}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </Btn>
            </form>
            <div style={{textAlign:'center', fontSize:12, color:T.mu}}>
              <span style={{cursor:'pointer',color:T.v,fontWeight:600}}
                onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}>
                Forgot password?
              </span>
            </div>
          </>
        )}

        {/* Forgot password */}
        {mode === 'forgot' && (
          <>
            {error   && <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.ro,fontWeight:600}}>⚠️ {error}</div>}
            {success && <div style={{background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.gr,fontWeight:600}}>✅ {success}</div>}
            <form onSubmit={submitLogin}>
              <Inp label="Email address" type="email" value={email} onChange={setEmail} placeholder="you@university.edu" required />
              <Btn variant="s" type="submit" disabled={loading} style={{width:'100%',padding:'11px',fontSize:14,marginBottom:14}}>
                {loading ? 'Sending…' : 'Send Reset Email →'}
              </Btn>
            </form>
            <div style={{textAlign:'center', fontSize:12, color:T.mu}}>
              <span style={{cursor:'pointer',color:T.v,fontWeight:600}}
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>
                ← Back to sign in
              </span>
            </div>
          </>
        )}

        {/* Sign-up flow */}
        {mode === 'signup' && renderSignup()}
      </div>
    </div>
  );
}
