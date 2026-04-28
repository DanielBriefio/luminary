import { T } from '../../../lib/constants';

// All PostHog links currently point to the project root — no saved
// insights yet. Once dashboards are built, swap the url for a deep link.
const POSTHOG_PROJECT_URL = 'https://us.posthog.com/project/392644/';

export default function PostHogLinks({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12,
      paddingTop: 12, borderTop: `1px solid ${T.bdr}`,
    }}>
      <div style={{ fontSize: 11, color: T.mu, alignSelf: 'center', marginRight: 4 }}>
        PostHog →
      </div>
      {items.map(item => (
        <a
          key={item.label}
          href={POSTHOG_PROJECT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 11, fontWeight: 600,
            color: T.v3, background: T.v2,
            padding: '4px 10px', borderRadius: 20,
            textDecoration: 'none',
          }}
        >
          {item.label} ↗
        </a>
      ))}
    </div>
  );
}
