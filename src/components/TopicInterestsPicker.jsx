import { useState } from 'react';
import { T } from '../lib/constants';
import Spinner from './Spinner';
import { useSuggestedTopics } from '../lib/useSuggestedTopics';

/**
 * Controlled topic picker used by onboarding and the profile editor.
 *
 * Props:
 *   selected     string[]  — currently selected topics (no # prefix)
 *   onChange     fn        — called with the new array on every change
 *   minRequired  number    — if > 0, shows a count nudge (0 = no minimum)
 */
export default function TopicInterestsPicker({ selected = [], onChange, minRequired = 0 }) {
  const [input, setInput] = useState('');
  const { suggested, loading } = useSuggestedTopics(selected);

  const add = (raw) => {
    const clean = raw.replace(/^#+/, '').trim();
    if (!clean) return;
    const normalised = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!selected.includes(normalised)) {
      onChange([...selected, normalised]);
    }
    setInput('');
  };

  const remove = (topic) => {
    onChange(selected.filter(t => t !== topic));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(input); }
  };

  return (
    <div>
      {/* ── Selected chips ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Your interests {selected.length > 0 && `(${selected.length})`}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, minHeight: 34 }}>
          {selected.length === 0
            ? <span style={{ color: T.mu, fontSize: 12, alignSelf: 'center' }}>None selected yet</span>
            : selected.map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px 5px 13px', borderRadius: 20, background: T.v2, border: `1.5px solid ${T.v}`, fontSize: 12.5, fontWeight: 600, color: T.v, cursor: 'default' }}>
                  #{t}
                  <button
                    onClick={() => remove(t)}
                    style={{ fontSize: 13, color: T.v, opacity: 0.7, border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 0 0 2px', lineHeight: 1, fontFamily: 'inherit' }}
                    title={`Remove ${t}`}
                  >
                    ✕
                  </button>
                </span>
              ))
          }
        </div>
        {minRequired > 0 && (
          <div style={{ fontSize: 12, color: selected.length >= minRequired ? T.v : T.mu, marginTop: 8, fontWeight: 600 }}>
            {selected.length >= minRequired
              ? `${selected.length} selected ✓`
              : `Select at least ${minRequired} topics to continue (${selected.length}/${minRequired})`}
          </div>
        )}
      </div>

      {/* ── Free-text input ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add your own topic..."
          style={{ flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 9, padding: '8px 13px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: T.text }}
        />
        <button
          onClick={() => add(input)}
          disabled={!input.trim()}
          style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: input.trim() ? T.v : T.bdr, color: input.trim() ? '#fff' : T.mu, cursor: input.trim() ? 'pointer' : 'default', fontSize: 13, fontFamily: 'inherit', fontWeight: 700, flexShrink: 0, transition: 'all .15s' }}
        >
          Add
        </button>
      </div>

      {/* ── Suggested chips ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Suggested topics
        </div>
        {loading
          ? <div style={{ padding: '8px 0' }}><Spinner /></div>
          : suggested.length === 0
            ? <span style={{ color: T.mu, fontSize: 12 }}>No suggestions yet — add your own above.</span>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {suggested.map(t => (
                  <SuggestedChip key={t} label={t} onClick={() => add(t)} />
                ))}
              </div>
            )
        }
      </div>
    </div>
  );
}

function SuggestedChip({ label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 13px', borderRadius: 20,
        background: hovered ? T.v2 : T.s2,
        border: `1px solid ${hovered ? T.v : T.bdr}`,
        color: hovered ? T.v : T.text,
        fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
        transition: 'all .12s',
      }}
    >
      #{label}
    </button>
  );
}
