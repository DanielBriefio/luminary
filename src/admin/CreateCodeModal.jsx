import React, { useState } from 'react';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';

const MODES = [
  { id: 'personal', label: '👤 Personal',  desc: 'One code, one person' },
  { id: 'batch',    label: '📦 Batch',     desc: 'Multiple codes, same label' },
  { id: 'event',    label: '🎤 Event',     desc: 'Memorable code, many people' },
];

const randomSuffix = (len = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

export default function CreateCodeModal({ supabase, onClose, onCreated }) {
  const [mode, setMode]           = useState('personal');
  const [label, setLabel]         = useState('');
  const [eventCode, setEventCode] = useState('');
  const [maxUses, setMaxUses]     = useState('');
  const [quantity, setQuantity]   = useState('10');
  const [prefix, setPrefix]       = useState('');
  const [expires, setExpires]     = useState('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const handleCreate = async () => {
    setError('');
    setSaving(true);

    try {
      if (mode === 'personal') {
        const code = randomSuffix(8);
        const { error: e } = await supabase.from('invite_codes').insert({
          code,
          label:        label || null,
          max_uses:     1,
          is_multi_use: false,
          uses_count:   0,
          expires_at:   expires || null,
          notes:        notes || null,
        });
        if (e) throw e;
      }

      if (mode === 'batch') {
        const qty = parseInt(quantity, 10);
        if (!qty || qty < 1 || qty > 200) throw new Error('Quantity must be 1–200');
        const batchLabel = label || `BATCH-${randomSuffix(4)}`;
        const rows = Array.from({ length: qty }, () => ({
          code:         prefix ? `${prefix.toUpperCase()}-${randomSuffix(6)}` : randomSuffix(8),
          label:        batchLabel,
          batch_label:  batchLabel,
          max_uses:     1,
          is_multi_use: false,
          uses_count:   0,
          expires_at:   expires || null,
          notes:        notes || null,
        }));
        const { error: e } = await supabase.from('invite_codes').insert(rows);
        if (e) throw e;
      }

      if (mode === 'event') {
        const code = eventCode.trim().toUpperCase().replace(/\s+/g, '');
        if (!code) throw new Error('Event code cannot be empty');
        if (code.length < 4) throw new Error('Event code must be at least 4 characters');
        const mu = maxUses ? parseInt(maxUses, 10) : null;
        const { error: e } = await supabase.from('invite_codes').insert({
          code,
          label:        label || code,
          max_uses:     mu,
          is_multi_use: true,
          uses_count:   0,
          expires_at:   expires || null,
          notes:        notes || null,
        });
        if (e) {
          if (e.code === '23505') throw new Error('That code already exists — choose a different one');
          throw e;
        }
      }

      onCreated();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: T.w, borderRadius: 14, zIndex: 101,
        width: 460, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        padding: '24px 24px 20px',
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22, color: T.text, marginBottom: 18,
        }}>
          Create invite code
        </div>

        {/* Mode picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {MODES.map(m => (
            <button key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 9, border: 'none',
                background: mode === m.id ? T.v2 : T.s2,
                color: mode === m.id ? T.v3 : T.mu,
                fontWeight: mode === m.id ? 700 : 500,
                fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              <div>{m.label}</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Label (all modes) */}
          <Field label={mode === 'batch' ? 'Batch label' : 'Label'}>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder={
                mode === 'event' ? 'e.g. AHA Annual Conference 2026' :
                mode === 'batch' ? 'e.g. JSC2026_CARDIOLOGY' :
                                   'e.g. For Dr. Chen'
              }
              style={inputStyle} />
          </Field>

          {/* Event: custom code string */}
          {mode === 'event' && (
            <Field label="Event code (memorable)">
              <input value={eventCode} onChange={e => setEventCode(e.target.value)}
                placeholder="e.g. AHA2026"
                style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700 }} />
            </Field>
          )}

          {/* Batch: prefix + quantity */}
          {mode === 'batch' && (
            <>
              <Field label="Prefix (optional)">
                <input value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="e.g. JSC26 → JSC26-A4X2K8"
                  style={inputStyle} />
              </Field>
              <Field label="Quantity">
                <input value={quantity} onChange={e => setQuantity(e.target.value)}
                  type="number" min="1" max="200" placeholder="10"
                  style={inputStyle} />
              </Field>
            </>
          )}

          {/* Event: max uses */}
          {mode === 'event' && (
            <Field label="Max uses (leave blank for unlimited)">
              <input value={maxUses} onChange={e => setMaxUses(e.target.value)}
                type="number" min="1" placeholder="e.g. 200"
                style={inputStyle} />
            </Field>
          )}

          {/* Expiry (event + batch) */}
          {(mode === 'event' || mode === 'batch') && (
            <Field label="Expires (optional)">
              <input value={expires} onChange={e => setExpires(e.target.value)}
                type="date" style={inputStyle} />
            </Field>
          )}

          {/* Notes (all modes) */}
          <Field label="Notes (internal, not shown to users)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Distributed at AHA booth, April 2026"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          marginTop: 20,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.text, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? <Spinner size={14} /> : (
              mode === 'batch'
                ? `Generate ${quantity || '?'} codes`
                : 'Create code'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: T.mu,
        marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 8,
  border: `1px solid ${T.bdr}`, background: T.s2,
  fontSize: 13, color: T.text, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};
