import { T } from '../../../lib/constants';

export default function StatCard({ label, value, sub, trend, benchmark }) {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
      padding: '16px 18px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.mu,
        letterSpacing: 0.4, textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 28, color: T.text, lineHeight: 1.1,
        }}>
          {value}
        </div>
        {trend && (
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: trend.direction === 'up' ? T.gr : trend.direction === 'down' ? T.ro : T.mu,
          }}>
            {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : ''} {trend.delta}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: T.mu, marginTop: 4 }}>{sub}</div>
      )}
      {benchmark && (
        <div style={{ fontSize: 11, color: T.mu, marginTop: 6, fontStyle: 'italic' }}>
          {benchmark}
        </div>
      )}
    </div>
  );
}
