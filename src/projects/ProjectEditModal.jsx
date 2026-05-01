import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';

const COLOR_SWATCHES = [
  T.v,        // violet (default)
  T.gr,       // green
  T.bl,       // blue
  T.am,       // amber
  T.te,       // teal
  T.ro,       // rose
  '#1b1d36',  // ink
  '#7a7fa8',  // slate
];

export default function ProjectEditModal({ project, onClose, onSaved }) {
  const [name,        setName]        = useState(project.name || '');
  const [icon,        setIcon]        = useState(project.icon || '✏️');
  const [description, setDescription] = useState(project.description || '');
  const [coverColor,  setCoverColor]  = useState(project.cover_color || T.v);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  const save = async () => {
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    setErr('');
    const { data, error } = await supabase
      .from('projects')
      .update({
        name:        name.trim(),
        icon:        icon || '✏️',
        description: description.trim(),
        cover_color: coverColor,
      })
      .eq('id', project.id)
      .select()
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved?.(data);
    onClose?.();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(27,29,54,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.w, borderRadius: 14, padding: 24,
          width: '100%', maxWidth: 440,
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ height: 4, borderRadius: 2, background: coverColor, marginBottom: 14 }}/>

        <div style={{
          fontFamily: "'DM Serif Display', serif", fontSize: 22,
          color: T.text, marginBottom: 4,
        }}>
          Edit project
        </div>
        <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 18 }}>
          Owner-only. Updates are visible to all members immediately.
        </div>

        {/* Icon + name on one row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flexShrink: 0 }}>
            <Label>Icon</Label>
            <input
              value={icon}
              onChange={e => setIcon(e.target.value.slice(0, 4))}
              maxLength={4}
              placeholder="✏️"
              style={{
                width: 60, height: 40, padding: '0 10px',
                borderRadius: 9, border: `1.5px solid ${T.bdr}`,
                background: T.s2, fontSize: 20, textAlign: 'center',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Label>Name <span style={{ color: T.ro }}>*</span></Label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Project name"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <Label>Description <span style={{ color: T.mu, fontWeight: 400 }}>(optional)</span></Label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What's this project about?"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.5 }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <Label>Accent color</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setCoverColor(c)}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: c, cursor: 'pointer',
                  border: coverColor === c ? `3px solid ${T.text}` : `2px solid ${T.bdr}`,
                  padding: 0,
                }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        {err && (
          <div style={{
            padding: '8px 12px', background: T.ro2,
            border: `1px solid ${T.ro}`, color: T.ro,
            fontSize: 12.5, borderRadius: 8, marginBottom: 12,
          }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="s" onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.mu,
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 9,
  border: `1.5px solid ${T.bdr}`,
  background: T.s2,
  fontSize: 13.5,
  fontFamily: 'inherit',
  outline: 'none',
  color: T.text,
  boxSizing: 'border-box',
};
