import { T } from '../../../lib/constants';

export default function SectionCard({ title, subtitle, children, action }) {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
      padding: '18px 20px', marginBottom: 18,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 12, marginBottom: 14,
      }}>
        <div>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 18, color: T.text, margin: 0,
          }}>
            {title}
          </h2>
          {subtitle && (
            <div style={{ fontSize: 12.5, color: T.mu, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
