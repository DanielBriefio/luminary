import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { capture } from '../lib/analytics';

const PAGE_COLORS = {
  violet: { bg: '#eeecff', border: 'rgba(108,99,255,.3)', accent: '#6c63ff' },
  teal:   { bg: '#f0f9ff', border: 'rgba(14,165,233,.3)', accent: '#0ea5e9' },
  green:  { bg: '#ecfdf5', border: 'rgba(16,185,129,.3)', accent: '#10b981' },
  amber:  { bg: '#fef3c7', border: 'rgba(245,158,11,.3)', accent: '#f59e0b' },
  blue:   { bg: '#e8f0fe', border: 'rgba(66,133,244,.3)', accent: '#4285f4' },
  white:  { bg: '#ffffff', border: '#e3e5f5',              accent: '#6c63ff' },
};

function handleCtaClick(url) {
  if (!url) return;
  if (url.startsWith('luminary://')) {
    const dest = url.replace('luminary://', '');
    window.dispatchEvent(new CustomEvent('luminary:navigate', { detail: { to: dest } }));
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function FeedTipCard({ profile }) {
  const [board,     setBoard]     = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem('luminary_tips_dismissed')
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
    capture('board_dismissed');
  };

  if (board === null) return null;
  if (dismissed) return null;

  const boardOn = !!(board && board.enabled);

  // Normalise pages; filter hidden
  let boardPages = [];
  if (boardOn) {
    const raw = board.pages?.length
      ? board.pages
      : [{ title: board.title, message: board.message, cta_label: board.cta_label, cta_url: board.cta_url }];
    boardPages = raw.filter(p => (p.title || p.message) && !p.hidden);
  }

  if (!boardOn || boardPages.length === 0) return null;

  const safeIdx = Math.min(pageIndex, boardPages.length - 1);
  const page    = boardPages[safeIdx];
  const color   = PAGE_COLORS[page.bg || 'violet'] || PAGE_COLORS.violet;
  const multi   = boardPages.length > 1;

  const nextPage = () => setPageIndex(i => (i + 1) % boardPages.length);

  return (
    <div style={{
      background: color.bg, border: `1px solid ${color.border}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 12,
      transition: 'background .3s, border-color .3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: page.title ? 8 : 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: color.accent, textTransform: 'uppercase', letterSpacing: '.07em' }}>
          ✦ Luminary
        </div>
        <button onClick={dismiss} title="Dismiss"
          style={{ fontSize: 13, color: color.accent, border: 'none', background: 'transparent', cursor: 'pointer', lineHeight: 1, padding: 0, opacity: .45 }}>
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
        <button onClick={() => handleCtaClick(page.cta_url)}
          style={{
            display: 'inline-block', fontSize: 12.5, color: color.accent,
            fontWeight: 700, border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', padding: 0,
            marginBottom: multi ? 10 : 0,
          }}>
          {page.cta_label} →
        </button>
      )}

      {multi && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {boardPages.map((_, i) => (
              <div key={i} onClick={() => setPageIndex(i)} style={{
                width: i === safeIdx ? 14 : 6, height: 6, borderRadius: 3,
                background: i === safeIdx ? color.accent : `${color.accent}40`,
                cursor: 'pointer', transition: 'all .2s',
              }}/>
            ))}
          </div>
          <button onClick={nextPage} style={{
            fontSize: 11.5, color: color.accent, fontWeight: 700,
            border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
