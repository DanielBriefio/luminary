import React, { useState } from 'react';
import { T, LUMINARY_TEAM_USER_ID } from '../lib/constants';
import { capture } from '../lib/analytics';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

const TEMPLATES = [
  {
    label: '👋 Welcome',
    text: `Welcome to Luminary! We're glad you're here. If you have any questions or need help getting started, just reply to this message — we're happy to help.`,
  },
  {
    label: '📄 Complete profile',
    text: `Hi! We noticed you haven't finished setting up your Luminary profile yet. Adding your publications and work history helps other researchers find and connect with you. It only takes a few minutes!`,
  },
  {
    label: '✍️ First post',
    text: `Hi! Why not share your first thought on Luminary? It could be a paper you've been reading, a question for the community, or something from your own research. We'd love to hear from you.`,
  },
  {
    label: '🔄 Come back',
    text: `Hi! We've missed you on Luminary. There's been some great activity in the community lately — come take a look when you get a chance.`,
  },
];

export default function BulkNudgeModal({ supabase, targetUsers, onClose, onSent }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Message cannot be empty.');
      return;
    }
    setSending(true);
    setError('');

    const { error: rpcError } = await supabase.rpc('send_admin_nudge', {
      p_target_user_ids: targetUsers.map(u => u.id),
      p_message:         message.trim(),
      p_bot_user_id:     LUMINARY_TEAM_USER_ID,
    });

    setSending(false);
    if (rpcError) {
      setError(rpcError.message || 'Failed to send nudge.');
      return;
    }

    capture('admin_nudge_sent', { recipient_count: targetUsers.length });
    setSent(true);
    setTimeout(onSent, 1200);
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)', zIndex: 300,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: T.w, borderRadius: 14, zIndex: 301,
        width: 500, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        padding: '24px',
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22, color: T.text, marginBottom: 6,
        }}>
          Send nudge
        </div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>
          Sending to {targetUsers.length} user{targetUsers.length > 1 ? 's' : ''} as Luminary Team
        </div>

        {/* Recipient avatars (only when ≤8) */}
        {targetUsers.length <= 8 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {targetUsers.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: T.s2, borderRadius: 20, padding: '4px 10px 4px 4px',
                fontSize: 12, color: T.text,
              }}>
                <Av size={20} name={u.name} color={u.avatar_color} url="" />
                {u.name}
              </div>
            ))}
          </div>
        )}

        {/* Template buttons */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7,
          }}>
            Quick templates
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => setMessage(t.text)}
                style={{
                  padding: '5px 11px', borderRadius: 20,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  color: T.text, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message compose */}
        <textarea
          value={message}
          onChange={e => { setMessage(e.target.value); setError(''); }}
          rows={6}
          placeholder="Write your message to these users…"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.s2,
            fontSize: 13, color: T.text, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            marginBottom: 8,
          }}
        />

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13, marginBottom: 8,
          }}>
            {error}
          </div>
        )}

        {sent && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.gr2, color: T.gr, fontSize: 13,
            fontWeight: 600, marginBottom: 8, textAlign: 'center',
          }}>
            ✓ Nudge sent to {targetUsers.length} user{targetUsers.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.text, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent}
            style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: T.v, color: '#fff', fontWeight: 600,
              fontSize: 13, cursor: (sending || sent) ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: (sending || sent) ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {sending
              ? <><Spinner size={14} /> Sending…</>
              : `Send to ${targetUsers.length} user${targetUsers.length > 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </>
  );
}
