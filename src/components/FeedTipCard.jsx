import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T, FEED_TIPS } from '../lib/constants';

export default function FeedTipCard({ profile }) {
  const [board,     setBoard]     = useState(null);  // null = loading, false = use tips
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('luminary_tips_dismissed')
  );
  const [index, setIndex] = useState(
    () => parseInt(localStorage.getItem('luminary_tips_index') || '0', 10) % FEED_TIPS.length
  );

  useEffect(() => {
    supabase.from('admin_config').select('value').eq('key', 'luminary_board').single()
      .then(({ data }) => {
        if (data?.value) setBoard(data.value);
        else setBoard(false);
      })
      .catch(() => setBoard(false));
  }, []);

  if (board === null) return null; // loading — render nothing briefly

  // Admin board disabled
  if (board && board.enabled === false) return null;

  // Dismissed tips (only applies to the tips fallback)
  if (!board && (dismissed || !FEED_TIPS.length)) return null;

  // ── Luminary Board (admin-configured content) ────────────────────────────
  if (board && board.enabled) {
    return (
      <div style={{
        background: T.v2,
        border: `1px solid rgba(108,99,255,.3)`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 12,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: board.title ? 8 : 0,
        }}>
          <div style={{ fontSize: 14, color: T.v3, fontWeight: 700 }}>✦ Luminary</div>
        </div>

        {board.title && (
          <div style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 15, color: T.text, marginBottom: 6,
          }}>
            {board.title}
          </div>
        )}

        <div style={{
          fontSize: 13, color: T.mu, lineHeight: 1.6,
          marginBottom: (board.cta_label && board.cta_url) ? 10 : 0,
        }}>
          {board.message}
        </div>

        {board.cta_label && board.cta_url && (
          <a href={board.cta_url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-block', fontSize: 12.5,
              color: T.v, fontWeight: 700, textDecoration: 'none',
            }}
          >
            {board.cta_label} →
          </a>
        )}
      </div>
    );
  }

  // ── Fallback: cycling FEED_TIPS ───────────────────────────────────────────
  const tip    = FEED_TIPS[index];
  const cardUrl = profile?.profile_slug
    ? `${window.location.origin}/c/${profile.profile_slug}`
    : null;

  const next = () => {
    const ni = (index + 1) % FEED_TIPS.length;
    setIndex(ni);
    localStorage.setItem('luminary_tips_index', String(ni));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('luminary_tips_dismissed', '1');
  };

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(108,99,255,.07)',
      marginBottom: 12,
    }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #667eea, #764ba2)' }}/>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>{tip.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              Tip
            </span>
          </div>
          <button
            onClick={dismiss}
            title="Dismiss tips"
            style={{ fontSize: 13, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 1, padding: 0, opacity: .6 }}
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>{tip.title}</div>
        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginBottom: 10 }}>{tip.body}</div>
        {tip.linkKey === 'card' && cardUrl && (
          <a href={cardUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 12, color: T.v, fontWeight: 700, textDecoration: 'none', marginBottom: 10 }}>
            {tip.linkLabel} ↗
          </a>
        )}
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
