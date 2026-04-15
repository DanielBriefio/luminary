import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Inp from '../components/Inp';
import Btn from '../components/Btn';

/**
 * Used in two contexts:
 *  1. Full-page mode (modal=false): shown after clicking a reset-password email link.
 *     The user is authenticated via the recovery token.
 *  2. Modal mode (modal=true): shown when a logged-in user wants to change their password.
 *     Clicking the backdrop calls onClose.
 */
export default function ResetPasswordScreen({ onDone, onClose, modal = false }) {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (password.length < 6)              { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm)             { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess(true);
    setTimeout(() => { onDone?.(); onClose?.(); }, 2000);
  };

  const card = (
    <div style={{
      width: 420, background: T.w, borderRadius: 20, padding: 36,
      boxShadow: '0 8px 40px rgba(108,99,255,.15)', border: `1px solid ${T.bdr}`,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 34, color: T.text, marginBottom: 4 }}>
          Lumi<span style={{ color: T.v }}>nary</span>
        </div>
        <div style={{ fontSize: 13, color: T.mu }}>Set a new password</div>
      </div>

      {error && (
        <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.ro, fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 9, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.gr, fontWeight: 600 }}>
          ✅ Password updated! {modal ? 'Closing…' : 'Signing you in…'}
        </div>
      )}

      {!success && (
        <form onSubmit={submit}>
          <Inp label="New password" type="password" value={password} onChange={setPassword}
            placeholder="Minimum 6 characters" required />
          <Inp label="Confirm new password" type="password" value={confirm} onChange={setConfirm}
            placeholder="Repeat new password" required />
          <Btn variant="s" type="submit" disabled={loading}
            style={{ width: '100%', padding: '11px', fontSize: 14, marginBottom: 14, marginTop: 4 }}>
            {loading ? 'Saving…' : 'Set new password →'}
          </Btn>
        </form>
      )}

      {modal && !success && (
        <div style={{ textAlign: 'center', fontSize: 12, color: T.mu }}>
          <span style={{ cursor: 'pointer', color: T.v, fontWeight: 600 }} onClick={onClose}>
            ← Cancel
          </span>
        </div>
      )}
    </div>
  );

  if (modal) {
    return (
      <div
        onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '20px',
        }}>
        {card}
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg,${T.v2},${T.bl2},#fff)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {card}
    </div>
  );
}
