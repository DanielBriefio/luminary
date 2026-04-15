import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Inp from '../components/Inp';
import Btn from '../components/Btn';

// ─── shared input style for raw <input> elements ───────────────────────────
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
  // ── top-level mode ──────────────────────────────────────────────────────
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'

  // ── sign-in state ───────────────────────────────────────────────────────
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // ── sign-up state ────────────────────────────────────────────────────────
  // signupPath: null | 'invite' | 'invite-details' | 'orcid' | 'orcid-details'
  const [signupPath,     setSignupPath]     = useState(null);
  const [inviteCode,     setInviteCode]     = useState('');
  const [inviteValid,    setInviteValid]    = useState(null); // null | true | false
  const [inviteChecking, setInviteChecking] = useState(false);
  const [orcidInput,     setOrcidInput]     = useState('');
  const [orcidData,      setOrcidData]      = useState(null);
  const [orcidChecking,  setOrcidChecking]  = useState(false);
  const [orcidError,     setOrcidError]     = useState('');
  const [signupEmail,    setSignupEmail]    = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupName,     setSignupName]     = useState('');
  const [signupError,    setSignupError]    = useState('');
  const [signupLoading,  setSignupLoading]  = useState(false);

  // ── reset state helpers ──────────────────────────────────────────────────
  const goToMode = (m) => {
    setMode(m);
    setError(''); setSuccess('');
    setSignupPath(null);
    setInviteCode(''); setInviteValid(null);
    setOrcidInput(''); setOrcidData(null); setOrcidError('');
    setSignupEmail(''); setSignupPassword(''); setSignupName('');
    setSignupError('');
  };

  // ── sign-in / forgot ─────────────────────────────────────────────────────
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

  // ── invite code validation ────────────────────────────────────────────────
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

  // ── ORCID fetch (shared) ──────────────────────────────────────────────────
  const fetchOrcidForSignup = async () => {
    setOrcidChecking(true);
    setOrcidError('');
    setOrcidData(null);
    try {
      const clean = orcidInput.replace('https://orcid.org/', '').trim();
      if (!clean.match(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)) {
        setOrcidError('Invalid format. Should be 0000-0000-0000-0000');
        setOrcidChecking(false);
        return;
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

      setOrcidData({ name, affiliation: affil, orcidId: clean, rawData: data });
      if (signupPath === 'orcid') setSignupPath('orcid-details');
      if (!signupName) setSignupName(name);
    } catch (e) {
      setOrcidError('ORCID not found. Check the iD and try again.');
    }
    setOrcidChecking(false);
  };

  // ── parse full ORCID data into profile fields + publications ────────────
  const parseOrcidForProfile = (rawData) => {
    const typeMap = { 'journal-article':'journal', 'conference-paper':'conference',
      'conference-poster':'poster', 'lecture-speech':'lecture', 'book-chapter':'book',
      'review-article':'review', 'preprint':'preprint' };

    const works = (rawData['activities-summary']?.works?.group || []).map(g => {
      const ws = g['work-summary']?.[0];
      if (!ws) return null;
      const doi  = (ws['external-ids']?.['external-id'] || []).find(x => x['external-id-type'] === 'doi');
      const pmid = (ws['external-ids']?.['external-id'] || []).find(x => x['external-id-type'] === 'pmid');
      return {
        title:    ws.title?.title?.value || '',
        journal:  ws['journal-title']?.value || '',
        year:     ws['publication-date']?.year?.value || '',
        doi:      doi?.['external-id-value'] || '',
        pmid:     pmid?.['external-id-value'] || '',
        pub_type: typeMap[ws.type] || 'other',
        source:   'orcid',
      };
    }).filter(p => p && p.title);

    const prGroups = rawData['activities-summary']?.['peer-reviews']?.group || [];
    const peerReviews = prGroups.flatMap(g =>
      (g['peer-review-group'] || []).flatMap(prg =>
        (prg['peer-review-summary'] || []).map(pr => {
          const year = pr['completion-date']?.year?.value || '';
          const org  = pr['convening-organization']?.name || '';
          if (!org && !year) return null;
          return { title: `Peer Review${org ? ` — ${org}` : ''}`, journal: org, year, doi:'', pmid:'', pub_type:'peer_review', source:'orcid' };
        })
      )
    ).filter(Boolean);

    const employments = (rawData['activities-summary']?.employments?.['affiliation-group'] || [])
      .flatMap(g => g['summaries'] || [])
      .map(s => s['employment-summary'] || s)
      .map(e => ({
        title:       e['role-title'] || '',
        company:     e.organization?.name || '',
        location:    [e.organization?.address?.city, e.organization?.address?.country].filter(Boolean).join(', '),
        start:       e['start-date'] ? `${e['start-date'].year?.value||''}-${String(e['start-date'].month?.value||1).padStart(2,'0')}` : '',
        end:         e['end-date']   ? `${e['end-date'].year?.value||''}-${String(e['end-date'].month?.value||1).padStart(2,'0')}` : '',
        description: '',
        _source:     'orcid',
      }))
      .filter(e => e.company || e.title);

    const educations = (rawData['activities-summary']?.educations?.['affiliation-group'] || [])
      .flatMap(g => g['summaries'] || [])
      .map(s => s['education-summary'] || s)
      .map(e => ({
        school:  e.organization?.name || '',
        degree:  e['role-title'] || '',
        field:   '',
        start:   e['start-date'] ? `${e['start-date'].year?.value||''}-${String(e['start-date'].month?.value||1).padStart(2,'0')}` : '',
        end:     e['end-date']   ? `${e['end-date'].year?.value||''}-${String(e['end-date'].month?.value||1).padStart(2,'0')}` : '',
        _source: 'orcid',
      }))
      .filter(e => e.school);

    return { publications: [...works, ...peerReviews], employments, educations };
  };

  // ── background ORCID publication import ──────────────────────────────────
  const importOrcidPublications = async (userId, rawData) => {
    try {
      const { publications } = parseOrcidForProfile(rawData);
      if (publications.length) {
        await supabase.from('publications').insert(
          publications.map(p => ({ user_id: userId, ...p }))
        );
      }
    } catch (e) {
      console.warn('Background ORCID import failed:', e);
    }
  };

  // ── invite-code sign-up ───────────────────────────────────────────────────
  const handleInviteSignup = async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { name: signupName } }, // auth trigger writes name immediately
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed');

      // Brief wait for the auth trigger to create the profile row
      await new Promise(r => setTimeout(r, 800));

      const profileUpdate = { name: signupName, signup_method: 'invite', card_email: signupEmail };
      if (orcidData) {
        profileUpdate.orcid          = orcidData.orcidId;
        profileUpdate.orcid_verified = true;
        profileUpdate.institution    = orcidData.affiliation;
        if (orcidData.rawData) {
          const { employments, educations } = parseOrcidForProfile(orcidData.rawData);
          if (employments.length) profileUpdate.work_history = employments.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
          if (educations.length)  profileUpdate.education    = educations.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
        }
      }
      // Upsert handles the case where the trigger hasn't fired yet
      await supabase.from('profiles').upsert({ id: userId, ...profileUpdate });

      await supabase.from('invite_codes').update({
        claimed_by: userId,
        claimed_at: new Date().toISOString(),
      }).eq('code', inviteCode.trim().toUpperCase());

      await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

      if (orcidData?.rawData) {
        importOrcidPublications(userId, orcidData.rawData);
      }

      onAuth();
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── ORCID sign-up ────────────────────────────────────────────────────────
  const handleOrcidSignup = async () => {
    setSignupLoading(true);
    setSignupError('');
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('orcid', orcidData.orcidId)
        .single();
      if (existing) {
        setSignupError('An account with this ORCID iD already exists. Try signing in.');
        setSignupLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: { data: { name: orcidData.name } }, // auth trigger writes name immediately
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('Account creation failed');

      // Brief wait for the auth trigger to create the profile row
      await new Promise(r => setTimeout(r, 800));

      const { employments, educations } = orcidData.rawData ? parseOrcidForProfile(orcidData.rawData) : { employments:[], educations:[] };
      const profileUpdate = {
        id:             userId,
        name:           orcidData.name,
        institution:    orcidData.affiliation,
        orcid:          orcidData.orcidId,
        orcid_verified: true,
        signup_method:  'orcid',
        card_email:     signupEmail,
      };
      if (employments.length) profileUpdate.work_history = employments.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
      if (educations.length)  profileUpdate.education    = educations.sort((a,b)=>(b.start||'').localeCompare(a.start||''));

      await supabase.from('profiles').upsert(profileUpdate);

      await supabase.rpc('generate_user_invites', { user_id: userId, count: 5 });

      if (orcidData?.rawData) {
        importOrcidPublications(userId, orcidData.rawData);
      }

      onAuth();
    } catch (e) {
      setSignupError(e.message || 'Sign-up failed. Please try again.');
    }
    setSignupLoading(false);
  };

  // ── render ────────────────────────────────────────────────────────────────
  const renderSignup = () => {
    // Entry: choose path
    if (!signupPath) return (
      <div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize: 24, textAlign: 'center', marginBottom: 8 }}>
          Join Luminary
        </div>
        <div style={{ fontSize: 13, color: T.mu, textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
          Luminary is invite-only. Join with an invite code from a colleague,
          or verify you're a researcher with your ORCID iD.
        </div>

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

        <button onClick={() => setSignupPath('orcid')} style={{
          width: '100%', padding: '16px', borderRadius: 14,
          border: `2px solid ${T.bdr}`, background: T.w, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 28 }}>🔬</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>I have an ORCID iD</div>
            <div style={{ fontSize: 12, color: T.mu }}>Verify you're a researcher — your profile auto-fills</div>
          </div>
          <span style={{ marginLeft: 'auto', color: T.mu }}>→</span>
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: T.mu }}>
          Already have an account?{' '}
          <button onClick={() => goToMode('login')} style={{
            color: T.v, fontWeight: 700, border: 'none',
            background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Sign in →
          </button>
        </div>
      </div>
    );

    // Path A1 — Enter invite code
    if (signupPath === 'invite') return (
      <div>
        <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Enter invite code</div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 20 }}>
          Codes look like <span style={{ fontFamily: 'monospace' }}>LM-XXXXXXXX</span> or <span style={{ fontFamily: 'monospace' }}>CONF-XXXXXX</span>
        </div>

        <input
          value={inviteCode}
          onChange={e => { setInviteCode(e.target.value.toUpperCase().trim()); setInviteValid(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && inviteCode.length >= 6) validateInviteCode(); }}
          placeholder="LM-XXXXXXXX"
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 16, letterSpacing: '.1em', textAlign: 'center' }}
        />

        {inviteValid === false && (
          <div style={{ color: T.ro, fontSize: 12.5, marginTop: 6 }}>
            Code not found or already used. Check the code and try again.
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

    // Path A2 — Account details (invite accepted)
    if (signupPath === 'invite-details') return (
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Create your account</div>
        <div style={{
          fontSize: 12, color: T.gr, fontWeight: 600,
          background: T.gr2, borderRadius: 8, padding: '6px 12px',
          marginBottom: 20, display: 'inline-block',
        }}>
          ✓ Invite code accepted
        </div>

        <Inp label="Full name" value={signupName} onChange={setSignupName} placeholder="Dr. Jane Smith" required />
        <Inp label="Email" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />

        {/* Optional ORCID */}
        <div style={{
          marginTop: 4, padding: '14px 16px',
          background: T.v2, borderRadius: 12,
          border: `1px solid rgba(108,99,255,.15)`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🔬 Add your ORCID iD <span style={{ fontWeight: 400, color: T.mu }}>(optional)</span></div>
          <div style={{ fontSize: 12, color: T.mu, marginBottom: 10, lineHeight: 1.5 }}>
            Auto-fills your profile, institution, and publications — saves you 10 minutes of manual entry.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={orcidInput}
              onChange={e => setOrcidInput(e.target.value)}
              placeholder="0000-0002-1825-0097"
              style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
            />
            <Btn onClick={fetchOrcidForSignup} disabled={orcidChecking || orcidInput.length < 16}>
              {orcidChecking ? '…' : 'Fetch'}
            </Btn>
          </div>
          {orcidData && (
            <div style={{
              marginTop: 10, padding: '8px 12px',
              background: 'white', borderRadius: 8,
              fontSize: 12.5, color: T.text,
            }}>
              ✓ Found: <strong>{orcidData.name}</strong>
              {orcidData.affiliation ? ` · ${orcidData.affiliation}` : ''}
            </div>
          )}
          {orcidError && <div style={{ color: T.ro, fontSize: 12, marginTop: 6 }}>{orcidError}</div>}
        </div>

        {signupError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 10 }}>{signupError}</div>}

        <Btn variant="s" onClick={handleInviteSignup}
          disabled={signupLoading || !signupEmail || !signupPassword || !signupName}
          style={{ width: '100%', marginTop: 16 }}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    // Path B1 — Enter ORCID iD
    if (signupPath === 'orcid') return (
      <div>
        <button onClick={() => setSignupPath(null)} style={backBtn}>← Back</button>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Verify with ORCID</div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
          Enter your ORCID iD to verify you're a researcher.
          Your profile will be auto-filled from ORCID.
        </div>

        <input
          value={orcidInput}
          onChange={e => setOrcidInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && orcidInput.length >= 16) fetchOrcidForSignup(); }}
          placeholder="0000-0002-1825-0097 or https://orcid.org/…"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: 11.5, color: T.mu, marginTop: 5 }}>
          Find yours at{' '}
          <a href="https://orcid.org" target="_blank" rel="noopener noreferrer" style={{ color: T.v }}>
            orcid.org
          </a>
        </div>

        {orcidError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 8 }}>{orcidError}</div>}

        <Btn variant="s" onClick={fetchOrcidForSignup}
          disabled={orcidChecking || orcidInput.length < 16}
          style={{ width: '100%', marginTop: 12, background: T.gr, borderColor: T.gr }}>
          {orcidChecking ? 'Looking up ORCID…' : 'Verify researcher identity →'}
        </Btn>
      </div>
    );

    // Path B2 — ORCID verified, set email + password
    if (signupPath === 'orcid-details') return (
      <div>
        <div style={{
          background: T.gr2, border: `1px solid rgba(16,185,129,.2)`,
          borderRadius: 12, padding: '16px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.gr, marginBottom: 8 }}>✓ Researcher verified</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{orcidData.name}</div>
          {orcidData.affiliation && (
            <div style={{ fontSize: 12.5, color: T.mu }}>{orcidData.affiliation}</div>
          )}
          <div style={{ fontSize: 11.5, color: T.mu, marginTop: 4 }}>
            ORCID: {orcidInput.replace('https://orcid.org/', '')}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Not you?</div>
        <button
          onClick={() => { setOrcidData(null); setOrcidInput(''); setSignupPath('orcid'); }}
          style={{ fontSize: 12, color: T.v, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
          ← Try a different ORCID iD
        </button>

        <Inp label="Email address" type="email" value={signupEmail} onChange={setSignupEmail} placeholder="jane@university.edu" required />
        <Inp label="Password" type="password" value={signupPassword} onChange={setSignupPassword} placeholder="At least 8 characters" required />

        {signupError && <div style={{ color: T.ro, fontSize: 12.5, marginTop: 8 }}>{signupError}</div>}

        <Btn variant="s" onClick={handleOrcidSignup}
          disabled={signupLoading || !signupEmail || !signupPassword}
          style={{ width: '100%', marginTop: 12, background: T.gr, borderColor: T.gr }}>
          {signupLoading ? 'Creating account…' : 'Create account →'}
        </Btn>
      </div>
    );

    return null;
  };

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

        {/* Tab bar — only for login/forgot */}
        {mode !== 'signup' && (
          <div style={{ display: 'flex', background: T.s2, borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {[['login', 'Sign In'], ['signup', 'Create Account']].map(([m, l]) => (
              <div key={m} onClick={() => goToMode(m)}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, textAlign: 'center',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: mode === m ? T.w : 'transparent',
                  color: mode === m ? T.v : T.mu,
                  boxShadow: mode === m ? '0 1px 8px rgba(108,99,255,.12)' : 'none',
                }}>
                {l}
              </div>
            ))}
          </div>
        )}

        {/* Sign-in / forgot form */}
        {mode === 'login' && (
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

        {/* Sign-up flow */}
        {mode === 'signup' && renderSignup()}
      </div>
    </div>
  );
}
