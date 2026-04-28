import { T, TIER_CONFIG } from '../../../lib/constants';

// Horizontal stacked bar showing tier distribution.
export default function TierBar({ rows, total }) {
  if (!rows || rows.length === 0) return null;
  const t = total ?? rows.reduce((s, r) => s + (r.count || 0), 0);
  if (t === 0) return null;

  const ORDER = ['catalyst', 'pioneer', 'beacon', 'luminary'];
  const sorted = [...rows].sort(
    (a, b) => ORDER.indexOf(a.tier) - ORDER.indexOf(b.tier)
  );

  return (
    <div>
      <div style={{
        width: '100%', height: 18, borderRadius: 99,
        background: T.s3, overflow: 'hidden',
        display: 'flex',
      }}>
        {sorted.map(r => {
          const cfg = TIER_CONFIG[r.tier] || TIER_CONFIG.catalyst;
          const w = (r.count / t) * 100;
          if (w < 0.5) return null;
          return (
            <div key={r.tier} style={{
              width: `${w}%`,
              background: cfg.color,
              height: '100%',
            }} title={`${cfg.name}: ${r.count} (${r.pct}%)`}/>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {sorted.map(r => {
          const cfg = TIER_CONFIG[r.tier] || TIER_CONFIG.catalyst;
          return (
            <div key={r.tier} style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: 99,
                background: cfg.color, display: 'inline-block',
              }}/>
              <span style={{ color: T.text, fontWeight: 600 }}>{cfg.name}</span>
              <span style={{ color: T.mu }}>{r.count} · {r.pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
