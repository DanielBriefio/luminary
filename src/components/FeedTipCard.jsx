import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T, FEED_TIPS } from '../lib/constants';

export default function FeedTipCard({ profile }) {
  const [board,     setBoard]     = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('luminary_tips_dismissed')
  );
  const [tipIndex, setTipIndex] = useState(
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

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('luminary_tips_dismissed', '1');
  };

  if (board === null) return null;
  if (dismissed) return null;

  const boardOn = !!(board && board.enabled);

  // Normalise pages: support old flat config { title, message, cta_label, cta_url }
  let boardPages = [];
  if (boardOn) {
    const raw = board.pages?.length
      ? board.pages
      : [{ title: board.title, message: board.message, cta_label: board.cta_label, cta_url: board.cta_url }];
    boardPages = raw.filter(p => p.title || p.message);
  }

  const showBoard = boardOn && boardPages.length > 0;
  const showTips  = !showBoard && boardOn && FEED_TIPS.length > 0;

  if (!showBoard && !showTips) return null;

  // ── Luminary Board ───────────────────────────────────────────────────────────
  if (showBoard) {
    const safeIdx = Math.min(pageIndex, boardPages.length - 1);
    const page    = boardPages[safeIdx];
    const multi   = boardPages.length > 1;

    const nextPage = () => setPageIndex(i => (i + 1) % boardPages.length);

    return (
      <div style={{
        background: T.v2, border: `1px solid rgba(108,99,255,.3)`,
        borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: page.title ? 8 : 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.v, textTransform: 'uppercase', letterSpacing: '.07em' }}>
            ✦ Luminary
          </div>
          <button onClick={dismiss} title="Dismiss"
            style={{ fontSize: 13, color: T.v, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 1, padding: 0, opacity: .5 }}>
            ✕
          </button>
        </div>

        {page.title && (
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 15, color: T.text, marginBottom: 6 }}>
            {page.title}
          </div>
        )}

        <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: (page.cta_label && page.cta_url) ? 10 : (multi ? 10 : 0) }}>
          {page.message}
        </div>

        {page.cta_label && page.cta_url && (
          <a href={page.cta_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 12.5, color: T.v, fontWeight: 700, textDecoration: 'none', marginBottom: multi ? 10 : 0 }}>
            {page.cta_label} →
          </a>
        )}

        {multi && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {boardPages.map((_, i) => (
                <div key={i} onClick={() => setPageIndex(i)} style={{
                  width: i === safeIdx ? 14 : 6, height: 6, borderRadius: 3,
                  background: i === safeIdx ? T.v : 'rgba(108,99,255,.25)',
                  cursor: 'pointer', transition: 'all .2s',
                }}/>
              ))}
            </div>
            <button onClick={nextPage} style={{
              fontSize: 11.5, color: T.v, fontWeight: 700,
              border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            }}>
              Next →
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Fallback: cycling FEED_TIPS ───────────────────────────────────────────────
  const tip    = FEED_TIPS[tipIndex];
  const cardUrl = profile?.profile_slug
    ? `${window.location.origin}/c/${profile.profile_slug}`
    : null;

  const nextTip = () => {
    const ni = (tipIndex + 1) % FEED_TIPS.length;
    setTipIndex(ni);
    localStorage.setItem('luminary_tips_index', String(ni));
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
          <button onClick={dismiss} title="Dismiss"
            style={{ fontSize: 13, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 1, padding: 0, opacity: .6 }}>
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
              <div key={i} onClick={() => { setTipIndex(i); localStorage.setItem('luminary_tips_index', String(i)); }}
                style={{
                  width: i === tipIndex ? 14 : 6, height: 6, borderRadius: 3,
                  background: i === tipIndex ? T.v : T.bdr,
                  cursor: 'pointer', transition: 'all .2s',
                }}
              />
            ))}
          </div>
          <button onClick={nextTip}
            style={{ fontSize: 11.5, color: T.v, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
            Next tip →
          </button>
        </div>
      </div>
    </div>
  );
}
