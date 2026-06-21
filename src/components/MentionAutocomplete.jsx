import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from './Av';

// Debounced profile search by name (case-insensitive). Skips the bot.
async function searchProfiles(query, limit = 6) {
  if (!query) return [];
  const { data } = await supabase
    .from('profiles')
    .select('id, name, profile_slug, avatar_color, avatar_url, institution')
    .ilike('name', `%${query}%`)
    .not('profile_slug', 'is', null)
    .is('deletion_scheduled_at', null)
    .limit(limit);
  return (data || []).filter(p => p.profile_slug);
}

// Standalone dropdown — caller positions it (top/left) and pipes
// query + onSelect through. Keyboard nav via ↑/↓/Enter handled
// inside; Escape closes (caller still owns close state).
export default function MentionAutocomplete({ query, top, left, onSelect, onClose }) {
  const [results, setResults] = useState([]);
  const [active,  setActive]  = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchProfiles(query);
      setResults(r);
      setActive(0);
      setLoading(false);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(a => Math.min(a + 1, Math.max(0, results.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(a => Math.max(0, a - 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (results[active]) {
          e.preventDefault();
          onSelect?.(results[active]);
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [results, active, onSelect, onClose]);

  // Portal to body + position:fixed (viewport coords) so the dropdown
  // can't be hidden by ancestor overflow / z-index / stacking-context
  // weirdness. The caller passes viewport-relative top/left.
  return createPortal(
    <div style={{
      position:'fixed', top, left, zIndex:1000,
      background:T.w, border:`1px solid ${T.bdr}`, borderRadius:10,
      boxShadow:'0 4px 16px rgba(0,0,0,.12)', minWidth:240, maxWidth:320,
      overflow:'hidden',
    }}>
      {!query && (
        <div style={{padding:'10px 14px',fontSize:12,color:T.mu}}>Type a name to mention…</div>
      )}
      {query && loading && results.length === 0 && (
        <div style={{padding:'10px 14px',fontSize:12,color:T.mu}}>Searching…</div>
      )}
      {query && !loading && results.length === 0 && (
        <div style={{padding:'10px 14px',fontSize:12,color:T.mu}}>No matches</div>
      )}
      {results.map((p, i) => (
        <div key={p.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect?.(p); }}
          onMouseEnter={() => setActive(i)}
          style={{
            display:'flex', alignItems:'center', gap:9,
            padding:'8px 12px',
            background: active === i ? T.s2 : 'transparent',
            cursor:'pointer',
          }}>
          <Av size={26} name={p.name} color={p.avatar_color} url={p.avatar_url || ''}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:600, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.name}</div>
            <div style={{fontSize:11, color:T.mu, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              @{p.profile_slug}{p.institution ? ` · ${p.institution}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}
