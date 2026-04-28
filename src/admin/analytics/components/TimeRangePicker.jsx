import { T } from '../../../lib/constants';

const RANGES = [
  { label: '7d',       days: 7 },
  { label: '30d',      days: 30 },
  { label: '90d',      days: 90 },
  { label: 'All time', days: null },
];

export default function TimeRangePicker({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', background: T.s2,
      border: `1px solid ${T.bdr}`, borderRadius: 9,
      padding: 3, gap: 2,
    }}>
      {RANGES.map(r => {
        const active = r.days === value;
        return (
          <button
            key={r.label}
            onClick={() => onChange(r.days)}
            style={{
              padding: '6px 12px', borderRadius: 7, border: 'none',
              background: active ? T.w : 'transparent',
              color: active ? T.text : T.mu,
              fontWeight: active ? 700 : 500, fontSize: 12.5,
              fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: active ? '0 1px 4px rgba(0,0,0,.05)' : 'none',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
