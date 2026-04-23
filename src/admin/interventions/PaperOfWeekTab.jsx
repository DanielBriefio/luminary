import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

export default function PaperOfWeekTab({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [config, setConfig]   = useState({ mode: 'algorithm', algorithm: 'most_discussed', manual_post_id: null, manual_doi: null });
  const [manualInput, setManualInput] = useState('');

  useEffect(() => {
    supabase.rpc('get_admin_config', { p_key: 'paper_of_week' })
      .then(({ data }) => {
        if (data) { setConfig(data); setManualInput(data.manual_doi || ''); }
        setLoading(false);
      });
  }, [supabase]);

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const save = async () => {
    setSaving(true); setSaved(false);
    const toSave = { ...config };
    if (config.mode === 'manual') {
      toSave.manual_doi     = manualInput.trim() || null;
      toSave.manual_post_id = null;
    }
    await supabase.rpc('set_admin_config', { p_key: 'paper_of_week', p_value: toSave });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16 }}>
          Paper of the Week — sidebar control
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Mode</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'algorithm', label: '⚡ Automatic'   },
              { id: 'manual',    label: '✋ Manual pick' },
            ].map(m => (
              <button key={m.id} onClick={() => set('mode', m.id)} style={{
                padding: '8px 16px', borderRadius: 9, border: 'none',
                background: config.mode === m.id ? T.v2 : T.s2,
                color: config.mode === m.id ? T.v3 : T.mu,
                fontWeight: config.mode === m.id ? 700 : 500,
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {config.mode === 'algorithm' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Algorithm</div>
            {[
              { id: 'most_discussed', label: '👥 Most discussed', desc: 'Paper with the most total posts on Luminary' },
              { id: 'most_commented', label: '💬 Most commented', desc: 'Paper with the most total comments' },
            ].map(a => (
              <button key={a.id} onClick={() => set('algorithm', a.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', borderRadius: 9, border: 'none',
                background: config.algorithm === a.id ? T.v2 : T.s2,
                marginBottom: 6, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <div style={{ fontSize: 13, fontWeight: config.algorithm === a.id ? 700 : 500, color: config.algorithm === a.id ? T.v3 : T.text }}>
                  {a.label}
                </div>
                <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>{a.desc}</div>
              </button>
            ))}
          </div>
        )}

        {config.mode === 'manual' && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              DOI of paper to feature
            </div>
            <input
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="e.g. 10.1056/NEJMoa2304741"
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 12, color: T.mu, marginTop: 6 }}>
              The paper must have been posted on Luminary by at least one user.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span style={{ fontSize: 13, color: T.gr, fontWeight: 600 }}>✓ Saved · Takes effect on next feed load</span>}
        </div>
      </div>
    </div>
  );
}
