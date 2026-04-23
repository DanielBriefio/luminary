import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

const EMPTY_PAGE = { title: '', message: '', cta_label: '', cta_url: '' };

export default function BoardTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [board,   setBoard]   = useState({
    enabled: true,
    pages: [{ ...EMPTY_PAGE }],
  });

  useEffect(() => {
    supabase.rpc('get_admin_config', { p_key: 'luminary_board' })
      .then(({ data }) => {
        if (data) {
          // Migrate old flat config { title, message, ... } into pages array
          const pages = data.pages?.length
            ? data.pages
            : [{ title: data.title || '', message: data.message || '', cta_label: data.cta_label || '', cta_url: data.cta_url || '' }];
          setBoard({
            enabled: data.enabled !== false,
            pages,
          });
        }
        setLoading(false);
      });
  }, [supabase]);

  const setTop  = (key, val) => setBoard(prev => ({ ...prev, [key]: val }));
  const setPage = (idx, key, val) => setBoard(prev => ({
    ...prev,
    pages: prev.pages.map((p, i) => i === idx ? { ...p, [key]: val } : p),
  }));
  const addPage    = () => setBoard(prev => ({ ...prev, pages: [...prev.pages, { ...EMPTY_PAGE }] }));
  const removePage = (idx) => setBoard(prev => ({ ...prev, pages: prev.pages.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true); setSaved(false);
    await supabase.rpc('set_admin_config', { p_key: 'luminary_board', p_value: board });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: T.am2, border: `1px solid ${T.am}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: T.am }}>
        ⚡ Changes take effect immediately for all users on next feed load.
      </div>

      {/* Luminary Board — toggle + pages */}
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${T.bdr}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Show Luminary Board</div>
            <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
              When on, shows board pages in the sidebar. Falls back to cycling tips if no pages are set.
            </div>
          </div>
          <button onClick={() => setTop('enabled', !board.enabled)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: board.enabled ? T.gr : T.s3,
            color: board.enabled ? '#fff' : T.mu,
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {board.enabled ? 'On' : 'Off'}
          </button>
        </div>

        {/* Pages */}
        {board.pages.map((page, idx) => (
          <div key={idx} style={{ marginBottom: 12, borderRadius: 9, border: `1px solid ${T.bdr}`, padding: '14px 16px', background: T.s2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.v, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Page {idx + 1}
              </div>
              {board.pages.length > 1 && (
                <button onClick={() => removePage(idx)} style={{
                  fontSize: 12, color: T.ro, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>
                  Remove
                </button>
              )}
            </div>

            {[
              { label: 'Title',     key: 'title',     placeholder: 'e.g. Welcome to Luminary' },
              { label: 'Message',   key: 'message',   placeholder: 'The message shown to all users', multiline: true },
              { label: 'CTA Label', key: 'cta_label', placeholder: 'e.g. Learn more (optional)' },
              { label: 'CTA URL',   key: 'cta_url',   placeholder: 'https://… (optional)' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                  {f.label}
                </div>
                {f.multiline ? (
                  <textarea value={page[f.key] || ''} onChange={e => setPage(idx, f.key, e.target.value)} rows={3}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.w, fontSize: 13, color: T.text, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                  />
                ) : (
                  <input value={page[f.key] || ''} onChange={e => setPage(idx, f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.w, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                )}
              </div>
            ))}
          </div>
        ))}

        <button onClick={addPage} style={{
          width: '100%', padding: '9px', borderRadius: 8,
          border: `1.5px dashed ${T.bdr}`, background: 'transparent',
          color: T.mu, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Add page
        </button>
      </div>

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
  );
}
