import { T } from '../../../lib/constants';

// Horizontal bar with percent label. Threshold colours optional.
export default function PreferenceRow({ label, count, pct, thresholds = 'feature' }) {
  const safePct = Math.max(0, Math.min(100, Number(pct) || 0));

  // thresholds preset:
  //   'feature'  → ≥50 green, ≥25 amber, else rose
  //   'consent'  → ≥70 green, ≥40 amber, else rose
  //   'neutral'  → always violet (no judgement)
  let color = T.v;
  if (thresholds === 'feature') {
    color = safePct >= 50 ? T.gr : safePct >= 25 ? T.am : T.ro;
  } else if (thresholds === 'consent') {
    color = safePct >= 70 ? T.gr : safePct >= 40 ? T.am : T.ro;
  }
  const trackColor = color === T.gr ? T.gr2
                   : color === T.am ? T.am2
                   : color === T.ro ? T.ro2
                   : T.v2;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', marginBottom: 4,
      }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums' }}>
          {safePct}%{count != null && ` · ${count}`}
        </div>
      </div>
      <div style={{
        width: '100%', height: 8, borderRadius: 99,
        background: trackColor, overflow: 'hidden',
      }}>
        <div style={{
          width: `${safePct}%`, height: '100%',
          background: color, transition: 'width .3s',
        }}/>
      </div>
    </div>
  );
}
