import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

export default function BoardTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [board, setBoard]     = useState({ enabled: true, title: '', message: '', cta_label: '', cta_url: '' });

  useEffect(() => {
    supabase.rpc('get_admin_config', { p_key: 'luminary_board' })
      .then(({ data }) => {
        if (data) setBoard(prev => ({ ...prev, ...data }));
        setLoading(false);
      });
  }, [supabase]);

  const set = (key, val) => setBoard(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true); setSaved(false);
    await supabase.rpc('set_admin_config', { p_key: 'luminary_board', p_value: board });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: T.am2, border: `1px solid ${T.am}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: T.am }}>
        ⚡ Changes take effect immediately for all users on next feed load.
      </div>

      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.bdr}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Show Luminary Board</div>
            <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>Visible in the right sidebar of the feed</div>
          </div>
          <button onClick={() => set('enabled', !board.enabled)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: board.enabled ? T.gr : T.s3,
            color: board.enabled ? '#fff' : T.mu,
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {board.enabled ? 'On' : 'Off'}
          </button>
        </div>

        {[
          { label: 'Title',     key: 'title',     placeholder: 'e.g. Welcome to Luminary' },
          { label: 'Message',   key: 'message',   placeholder: 'The message shown to all users', multiline: true },
          { label: 'CTA Label', key: 'cta_label', placeholder: 'e.g. Learn more (optional)' },
          { label: 'CTA URL',   key: 'cta_url',   placeholder: 'https://… (optional)' },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              {f.label}
            </div>
            {f.multiline ? (
              <textarea value={board[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3}
                placeholder={f.placeholder}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            ) : (
              <input value={board[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            )}
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}
