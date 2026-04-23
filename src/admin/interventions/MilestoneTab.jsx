import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

export default function MilestoneTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [tpl, setTpl]         = useState({ heading: '', message: '', cta1_label: '', cta2_label: '' });

  useEffect(() => {
    supabase.rpc('get_admin_config', { p_key: 'milestone_post_template' })
      .then(({ data }) => {
        if (data) setTpl(prev => ({ ...prev, ...data }));
        setLoading(false);
      });
  }, [supabase]);

  const set = (key, val) => setTpl(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true); setSaved(false);
    await supabase.rpc('set_admin_config', { p_key: 'milestone_post_template', p_value: tpl });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: T.am2, border: `1px solid ${T.am}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: T.am }}>
        ⚠️ Changes affect future milestone posts only. Users who have already completed their profile are not affected.
      </div>

      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 22px' }}>
        {[
          { label: 'Heading',      key: 'heading',    multiline: false },
          { label: 'Message',      key: 'message',    multiline: true  },
          { label: 'CTA button 1', key: 'cta1_label', multiline: false },
          { label: 'CTA button 2', key: 'cta2_label', multiline: false },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
              {f.label}
            </div>
            {f.multiline ? (
              <textarea value={tpl[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={3}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
            ) : (
              <input value={tpl[f.key] || ''} onChange={e => set(f.key, e.target.value)}
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
            {saving ? 'Saving…' : 'Save template'}
          </button>
          {saved && <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}
