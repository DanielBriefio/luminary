import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import ResetPasswordScreen from './ResetPasswordScreen';

export default function SettingsScreen({ user, onClose, onDeleted }) {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showDeleteConfirm,  setShowDeleteConfirm]  = useState(false);
  const [deleteInput,        setDeleteInput]        = useState('');
  const [deleting,           setDeleting]           = useState(false);
  const [deleteError,        setDeleteError]        = useState('');

  const handleDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;
      await supabase.auth.signOut();
      onDeleted();
    } catch (e) {
      setDeleteError(e.message || 'Deletion failed. Please try again.');
      setDeleting(false);
    }
  };

  if (showChangePassword) {
    return (
      <ResetPasswordScreen
        modal
        onClose={() => setShowChangePassword(false)}
        onDone={() => { setShowChangePassword(false); onClose(); }}
      />
    );
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20, fontFamily: "'DM Sans',sans-serif",
      }}
    >
      <div style={{
        width: 440, background: T.w, borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)', border: `1px solid ${T.bdr}`,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${T.bdr}`,
        }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: T.text }}>Settings</div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: T.s2, cursor: 'pointer', fontSize: 16, color: T.mu,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Account email (read-only) */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.mu, marginBottom: 4 }}>Account email</div>
            <div style={{
              fontSize: 13, color: T.text, background: T.s2,
              border: `1.5px solid ${T.bdr}`, borderRadius: 9, padding: '8px 13px',
            }}>
              {user?.email}
            </div>
          </div>

          {/* Change password */}
          <button onClick={() => setShowChangePassword(true)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', borderRadius: 12,
            border: `1.5px solid ${T.bdr}`, background: T.w,
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            transition: 'background .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = T.s2}
            onMouseLeave={e => e.currentTarget.style.background = T.w}
          >
            <span style={{ fontSize: 20 }}>🔒</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Change password</div>
              <div style={{ fontSize: 11.5, color: T.mu }}>Update your login password</div>
            </div>
            <span style={{ marginLeft: 'auto', color: T.mu, fontSize: 14 }}>→</span>
          </button>

          {/* Divider */}
          <div style={{ height: 1, background: T.bdr, margin: '8px 0' }}/>

          {/* Danger zone */}
          <div style={{
            border: `1.5px solid rgba(244,63,94,.25)`, borderRadius: 12,
            padding: '16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.ro, letterSpacing: '.06em', marginBottom: 12 }}>
              DANGER ZONE
            </div>
            <div style={{ fontSize: 13, color: T.text, marginBottom: 12, lineHeight: 1.6 }}>
              Deleting your account is permanent. All your posts, publications, messages, and connections will be removed and cannot be recovered.
            </div>
            <button onClick={() => { setShowDeleteConfirm(true); setDeleteInput(''); setDeleteError(''); }} style={{
              padding: '9px 18px', borderRadius: 9,
              border: `1.5px solid ${T.ro}`, background: 'transparent',
              color: T.ro, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = T.ro2; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              Delete my account
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1100, padding: 20,
          }}
        >
          <div style={{
            width: 420, background: T.w, borderRadius: 18,
            boxShadow: '0 12px 50px rgba(0,0,0,.25)', padding: '28px 28px 24px',
          }}>
            <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: T.text, marginBottom: 10, textAlign: 'center' }}>
              Delete account?
            </div>
            <div style={{
              fontSize: 13, color: T.text, lineHeight: 1.7,
              background: T.ro2, border: `1px solid rgba(244,63,94,.2)`,
              borderRadius: 10, padding: '12px 14px', marginBottom: 20,
            }}>
              This permanently deletes your <strong>profile, posts, publications and messages</strong>. This cannot be undone.
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 6 }}>
              Type <span style={{ fontFamily: 'monospace', color: T.ro, letterSpacing: '.05em' }}>DELETE</span> to confirm
            </div>
            <input
              value={deleteInput}
              onChange={e => { setDeleteInput(e.target.value); setDeleteError(''); }}
              placeholder="DELETE"
              autoFocus
              style={{
                width: '100%', background: T.s2, border: `1.5px solid ${deleteInput === 'DELETE' ? T.ro : T.bdr}`,
                borderRadius: 9, padding: '9px 14px', fontSize: 14, fontFamily: 'monospace',
                outline: 'none', color: T.text, boxSizing: 'border-box',
                transition: 'border-color .15s',
              }}
            />

            {deleteError && (
              <div style={{ fontSize: 12.5, color: T.ro, marginTop: 8 }}>⚠️ {deleteError}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }} style={{
                flex: 1, padding: '10px', borderRadius: 9,
                border: `1.5px solid ${T.bdr}`, background: T.w,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
              }}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== 'DELETE' || deleting}
                style={{
                  flex: 1, padding: '10px', borderRadius: 9,
                  border: 'none',
                  background: deleteInput === 'DELETE' ? T.ro : '#e8e8e8',
                  color: deleteInput === 'DELETE' ? 'white' : '#bbb',
                  cursor: deleteInput === 'DELETE' ? 'pointer' : 'default',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  transition: 'background .15s',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
