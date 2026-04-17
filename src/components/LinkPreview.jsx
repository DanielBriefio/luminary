import { useState, useEffect } from 'react';
import { T } from '../lib/constants';

// Module-level cache so repeated renders don't re-fetch
const cache = {};

export function extractFirstUrl(content) {
  if (!content) return null;
  // Prefer explicit <a href="..."> links
  const hrefMatch = content.match(/href=["'](https?:\/\/[^"']+)["']/);
  if (hrefMatch) return hrefMatch[1];
  // Fall back to bare URLs in text (strip trailing punctuation)
  const urlMatch = content.match(/https?:\/\/[^\s<>"']+/);
  return urlMatch ? urlMatch[0].replace(/[.,;!?)\]>]+$/, '') : null;
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export default function LinkPreview({ url, compact = false }) {
  const [data, setData]       = useState(cache[url] !== undefined ? cache[url] : undefined);
  const [loading, setLoading] = useState(cache[url] === undefined);

  useEffect(() => {
    if (!url) return;
    if (cache[url] !== undefined) { setData(cache[url]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json) {
          const d = {
            title:       json.title       || '',
            description: json.description || '',
            image:       json.image       || '',
            url:         json.url         || url,
            publisher:   json.publisher   || '',
          };
          cache[url] = d;
          setData(d);
        } else {
          cache[url] = null;
          setData(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { cache[url] = null; setData(null); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div style={{
        border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden',
        margin: '8px 0', background: T.w,
      }}>
        <div style={{ height: compact ? 0 : 140, background: T.s3, animation: 'lp-pulse 1.4s ease-in-out infinite' }}/>
        <div style={{ padding: compact ? '10px 13px' : '11px 14px', display: 'flex', alignItems: 'center', gap: compact ? 10 : 0 }}>
          {compact && <div style={{ width: 44, height: 44, borderRadius: 8, background: T.bdr, flexShrink: 0, animation: 'lp-pulse 1.4s ease-in-out infinite' }}/>}
          <div style={{ flex: 1 }}>
            <div style={{ height: 11, background: T.bdr, borderRadius: 6, width: '45%', marginBottom: 7, animation: 'lp-pulse 1.4s ease-in-out infinite' }}/>
            <div style={{ height: 13, background: T.bdr, borderRadius: 6, width: '80%', marginBottom: compact ? 0 : 5, animation: 'lp-pulse 1.4s ease-in-out infinite' }}/>
            {!compact && <div style={{ height: 11, background: T.bdr, borderRadius: 6, width: '65%', animation: 'lp-pulse 1.4s ease-in-out infinite' }}/>}
          </div>
        </div>
        <style>{`@keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }`}</style>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) return null;

  const domain = getDomain(data.url || url);

  /* ── Compact (inside composer) ────────────────────────────────────── */
  if (compact) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden',
          margin: '8px 0', background: T.w, display: 'flex',
          boxShadow: '0 1px 6px rgba(108,99,255,.06)',
          transition: 'box-shadow .15s',
        }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 12px rgba(108,99,255,.13)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(108,99,255,.06)'}
        >
          {data.image && (
            <div style={{ width: 96, minHeight: 80, flexShrink: 0, background: T.s3, overflow: 'hidden', position: 'relative' }}>
              <img src={data.image} alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}/>
            </div>
          )}
          <div style={{ padding: '10px 13px', flex: 1, minWidth: 0 }}>
            {domain && (
              <div style={{ fontSize: 10, color: T.mu, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>
                {domain}
              </div>
            )}
            {data.title && (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {data.title}
              </div>
            )}
            {data.description && (
              <div style={{ fontSize: 11.5, color: T.mu, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {data.description}
              </div>
            )}
          </div>
        </div>
      </a>
    );
  }

  /* ── Full (inside post card / feed) ───────────────────────────────── */
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden',
        margin: '8px 0', background: T.w,
        boxShadow: '0 1px 6px rgba(108,99,255,.06)',
        transition: 'box-shadow .15s',
      }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,99,255,.13)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 6px rgba(108,99,255,.06)'}
      >
        {data.image && (
          <div style={{ position: 'relative', overflow: 'hidden', background: T.s3 }}>
            <img src={data.image} alt={data.title}
              style={{ width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' }}
              onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}/>
          </div>
        )}
        <div style={{ padding: '11px 14px 13px' }}>
          {domain && (
            <div style={{ fontSize: 10.5, color: T.v, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>
              {domain}
            </div>
          )}
          {data.title && (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: data.description ? 5 : 0 }}>
              {data.title}
            </div>
          )}
          {data.description && (
            <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {data.description}
            </div>
          )}
        </div>
      </div>
    </a>
  );
}
