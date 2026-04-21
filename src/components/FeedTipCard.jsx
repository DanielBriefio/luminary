import { useState } from 'react';
import { T, FEED_TIPS } from '../lib/constants';

export default function FeedTipCard({ profile }) {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('luminary_tips_dismissed')
  );
  const [index, setIndex] = useState(
    () => parseInt(localStorage.getItem('luminary_tips_index') || '0', 10) % FEED_TIPS.length
  );

  if (dismissed || !FEED_TIPS.length) return null;

  const tip = FEED_TIPS[index];

  const next = () => {
    const ni = (index + 1) % FEED_TIPS.length;
    setIndex(ni);
    localStorage.setItem('luminary_tips_index', String(ni));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('luminary_tips_dismissed', '1');
  };

  const cardUrl = profile?.profile_slug
    ? `${window.location.origin}/c/${profile.profile_slug}`
    : null;

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(108,99,255,.07)',
      marginBottom: 12,
    }}>
      {/* Accent bar */}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #667eea, #764ba2)' }}/>

      <div style={{ padding: '12px 14px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>{tip.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Tip
            </span>
          </div>
          <button
            onClick={dismiss}
            title="Dismiss tips (re-enable in Settings)"
            style={{ fontSize: 13, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 1, padding: 0, opacity: .6 }}
          >
            ✕
          </button>
        </div>

        {/* Tip content */}
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>
          {tip.title}
        </div>
        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginBottom: 10 }}>
          {tip.body}
        </div>

        {/* Card link if applicable */}
        {tip.linkKey === 'card' && cardUrl && (
          <a href={cardUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 12, color: T.v, fontWeight: 700, textDecoration: 'none', marginBottom: 10 }}>
            {tip.linkLabel} ↗
          </a>
        )}

        {/* Footer: dot indicators + next */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {FEED_TIPS.map((_, i) => (
              <div key={i} onClick={() => { setIndex(i); localStorage.setItem('luminary_tips_index', String(i)); }}
                style={{
                  width: i === index ? 14 : 6, height: 6, borderRadius: 3,
                  background: i === index ? T.v : T.bdr,
                  cursor: 'pointer', transition: 'all .2s',
                }}
              />
            ))}
          </div>
          <button onClick={next}
            style={{ fontSize: 11.5, color: T.v, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            Next tip →
          </button>
        </div>
      </div>
    </div>
  );
}
