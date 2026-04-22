import React, { useState } from 'react';
import { T } from '../lib/constants';
import Spinner from './Spinner';

const REASONS = [
  { id: 'spam',           label: '🚫 Spam or self-promotion'   },
  { id: 'misinformation', label: '⚠️ Misinformation'           },
  { id: 'inappropriate',  label: '🔞 Inappropriate content'    },
  { id: 'off_topic',      label: '💬 Off-topic'                },
  { id: 'other',          label: '···  Other'                  },
];

export default function ReportModal({
  supabase,
  postId,        // uuid — set for public posts
  groupPostId,   // uuid — set for group posts
  onClose,
}) {
  const [reason, setReason]         = useState('');
  const [note, setNote]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);
  const [error, setError]           = useState('');

  const handleSubmit = async () => {
    if (!reason) {
      setError('Please select a reason.');
      return;
    }
    setSubmitting(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('You must be signed in to report.'); setSubmitting(false); return; }

    const payload = {
      reporter_id: user.id,
      reason,
      note: note.trim() || null,
    };
    if (postId)      payload.post_id       = postId;
    if (groupPostId) payload.group_post_id = groupPostId;

    const { error: insertErr } = await supabase
      .from('post_reports')
      .insert(payload);

    setSubmitting(false);

    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('You have already reported this post.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      return;
    }

    setDone(true);
    setTimeout(onClose, 2000);
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)', zIndex: 400,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: 14, zIndex: 401,
        width: 380, padding: '22px 24px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, color: T.text, marginBottom: 16,
        }}>
          Report post
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 600, marginBottom: 6 }}>
              Thanks for your report
            </div>
            <div style={{ fontSize: 13, color: T.mu }}>
              We'll review it shortly.
            </div>
          </div>
        ) : (
          <>
            {/* Reason selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setReason(r.id); setError(''); }}
                  style={{
                    padding: '9px 13px', borderRadius: 9,
                    border: `1.5px solid ${reason === r.id ? T.v : T.bdr}`,
                    background: reason === r.id ? T.v2 : T.w,
                    color: reason === r.id ? T.v3 : T.text,
                    fontWeight: reason === r.id ? 600 : 400,
                    fontSize: 13.5, cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Optional note */}
            <textarea
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 200))}
              placeholder="Add a note (optional, max 200 chars)"
              rows={3}
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: T.s2,
                fontSize: 13, color: T.text, fontFamily: 'inherit',
                resize: 'none', outline: 'none',
                boxSizing: 'border-box', marginBottom: 4,
              }}
            />
            <div style={{ fontSize: 11, color: T.mu, textAlign: 'right', marginBottom: 12 }}>
              {note.length}/200
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: T.ro2, color: T.ro,
                fontSize: 13, marginBottom: 10,
              }}>
                {error}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: T.w,
                color: T.text, fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  border: 'none', background: T.ro,
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: submitting ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: submitting ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {submitting ? <Spinner size={13} /> : 'Submit report'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
