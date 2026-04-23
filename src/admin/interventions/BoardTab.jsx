import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

const EMPTY_PAGE = { title: '', message: '', cta_label: '', cta_url: '', bg: 'violet', hidden: false };

const PAGE_COLORS = [
  { id: 'violet', label: 'Violet', bg: '#eeecff', border: 'rgba(108,99,255,.3)', accent: '#6c63ff' },
  { id: 'teal',   label: 'Teal',   bg: '#f0f9ff', border: 'rgba(14,165,233,.3)', accent: '#0ea5e9' },
  { id: 'green',  label: 'Green',  bg: '#ecfdf5', border: 'rgba(16,185,129,.3)', accent: '#10b981' },
  { id: 'amber',  label: 'Amber',  bg: '#fef3c7', border: 'rgba(245,158,11,.3)', accent: '#f59e0b' },
  { id: 'blue',   label: 'Blue',   bg: '#e8f0fe', border: 'rgba(66,133,244,.3)', accent: '#4285f4' },
  { id: 'white',  label: 'White',  bg: '#ffffff', border: '#e3e5f5',              accent: '#6c63ff' },
];

const INTERNAL_LINKS = [
  { label: 'My profile',           url: 'luminary://profile',  cta: 'Go to my profile →'     },
  { label: 'Business card / QR',   url: 'luminary://card',     cta: 'View my business card →' },
  { label: 'Projects & templates', url: 'luminary://projects', cta: 'Browse templates →'      },
  { label: 'My library',           url: 'luminary://library',  cta: 'Open my library →'       },
  { label: 'Groups',               url: 'luminary://groups',   cta: 'Explore groups →'        },
  { label: 'Explore',              url: 'luminary://explore',  cta: 'Explore Luminary →'      },
  { label: 'Start a new post',     url: 'luminary://post',     cta: 'Start writing →'         },
];

export default function BoardTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [board,   setBoard]   = useState({ enabled: true, pages: [{ ...EMPTY_PAGE }] });

  useEffect(() => {
    supabase.rpc('get_admin_config', { p_key: 'luminary_board' })
      .then(({ data }) => {
        if (data) {
          const pages = data.pages?.length
            ? data.pages.map(p => ({ ...EMPTY_PAGE, ...p }))
            : [{ ...EMPTY_PAGE, title: data.title || '', message: data.message || '', cta_label: data.cta_label || '', cta_url: data.cta_url || '' }];
          setBoard({ enabled: data.enabled !== false, pages });
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

  const applyInternalLink = (idx, link) => {
    setPage(idx, 'cta_url', link.url);
    if (!board.pages[idx].cta_label) setPage(idx, 'cta_label', link.cta);
  };

  const save = async () => {
    setSaving(true); setSaved(false);
    await supabase.rpc('set_admin_config', { p_key: 'luminary_board', p_value: board });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  const visibleCount = board.pages.filter(p => !p.hidden).length;

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ background: T.am2, border: `1px solid ${T.am}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: T.am }}>
        ⚡ Changes take effect immediately for all users on next feed load.
      </div>

      {/* Main toggle */}
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${T.bdr}` }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Show Luminary Board</div>
            <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
              {visibleCount} of {board.pages.length} page{board.pages.length !== 1 ? 's' : ''} visible · falls back to cycling tips when no pages are visible
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
        {board.pages.map((page, idx) => {
          const color = PAGE_COLORS.find(c => c.id === (page.bg || 'violet')) || PAGE_COLORS[0];
          const matchedLink = INTERNAL_LINKS.find(l => l.url === page.cta_url);

          return (
            <div key={idx} style={{
              marginBottom: 12, borderRadius: 9,
              border: `1.5px solid ${page.hidden ? T.bdr : color.border}`,
              padding: '14px 16px',
              background: page.hidden ? T.s2 : color.bg,
              opacity: page.hidden ? 0.7 : 1,
              transition: 'all .2s',
            }}>
              {/* Page header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: page.hidden ? T.mu : color.accent, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Page {idx + 1}{page.hidden ? ' — hidden' : ''}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setPage(idx, 'hidden', !page.hidden)} style={{
                    fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                    border: `1px solid ${page.hidden ? T.bdr : color.accent}`,
                    background: page.hidden ? T.s3 : 'transparent',
                    color: page.hidden ? T.mu : color.accent,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {page.hidden ? 'Hidden' : 'Visible'}
                  </button>
                  {board.pages.length > 1 && (
                    <button onClick={() => removePage(idx)} style={{
                      fontSize: 11.5, color: T.ro, border: 'none', background: 'transparent',
                      cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                    }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Color swatches */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, color: T.mu, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 2 }}>Color</span>
                {PAGE_COLORS.map(c => (
                  <div key={c.id} onClick={() => setPage(idx, 'bg', c.id)}
                    title={c.label}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: c.bg,
                      border: `2px solid ${page.bg === c.id || (!page.bg && c.id === 'violet') ? c.accent : '#d0d3e8'}`,
                      cursor: 'pointer',
                      boxShadow: (page.bg === c.id || (!page.bg && c.id === 'violet')) ? `0 0 0 2px ${c.accent}40` : 'none',
                      transition: 'all .15s',
                    }}
                  />
                ))}
              </div>

              {/* Fields */}
              {[
                { label: 'Title',   key: 'title',   placeholder: 'e.g. Welcome to Luminary' },
                { label: 'Message', key: 'message', placeholder: 'The message shown to users', multiline: true },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{f.label}</div>
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

              {/* CTA */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>CTA Label</div>
                <input value={page.cta_label || ''} onChange={e => setPage(idx, 'cta_label', e.target.value)}
                  placeholder="e.g. Learn more (optional)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.w, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>CTA Link</div>
                <input value={page.cta_url || ''} onChange={e => setPage(idx, 'cta_url', e.target.value)}
                  placeholder="https://… or pick a Luminary screen below"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.w, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {INTERNAL_LINKS.map(link => (
                    <button key={link.url} onClick={() => applyInternalLink(idx, link)} style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 20,
                      border: `1px solid ${matchedLink?.url === link.url ? color.accent : T.bdr}`,
                      background: matchedLink?.url === link.url ? color.bg : T.s2,
                      color: matchedLink?.url === link.url ? color.accent : T.mu,
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: matchedLink?.url === link.url ? 700 : 400,
                      transition: 'all .1s',
                    }}>
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

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
