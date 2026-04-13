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
  const [data, setData]     = useState(cache[url] !== undefined ? cache[url] : undefined);
  const [loading, setLoading] = useState(cache[url] === undefined);

  useEffect(() => {
    if (!url) return;
    if (cache[url] !== undefined) { setData(cache[url]); setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json.status === 'success') {
          const d = {
            title:       json.data.title || '',
            description: json.data.description || '',
            image:       json.data.image?.url || '',
            url:         json.data.url || url,
            publisher:   json.data.publisher || '',
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
        border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: 'hidden',
        margin: '8px 0', background: T.s2, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, background: T.bdr,
          flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite',
        }}/>
        <div style={{ flex: 1 }}>
          <div style={{ height: 12, background: T.bdr, borderRadius: 6, marginBottom: 6, width: '60%', animation: 'pulse 1.4s ease-in-out infinite' }}/>
          <div style={{ height: 10, background: T.bdr, borderRadius: 6, width: '80%', animation: 'pulse 1.4s ease-in-out infinite' }}/>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    );
  }

  if (!data || (!data.title && !data.image)) return null;

  const domain = getDomain(data.url || url);

  if (compact) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: 'hidden',
          margin: '8px 0', background: T.w, display: 'flex', gap: 0,
          transition: 'box-shadow .15s',
        }}>
          {data.image && (
            <div style={{
              width: 80, flexShrink: 0, background: T.s2, overflow: 'hidden',
            }}>
              <img src={data.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}/>
            </div>
          )}
          <div style={{ padding: '10px 13px', flex: 1, minWidth: 0 }}>
            {domain && <div style={{ fontSize: 10.5, color: T.mu, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{domain}</div>}
            {data.title && <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.title}</div>}
            {data.description && <div style={{ fontSize: 11.5, color: T.mu, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.description}</div>}
          </div>
        </div>
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: 'hidden',
        margin: '8px 0', background: T.w,
      }}>
        {data.image && (
          <img src={data.image} alt={data.title}
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block', background: T.s2 }}
            onError={e => { e.currentTarget.style.display = 'none'; }}/>
        )}
        <div style={{ padding: '10px 14px' }}>
          {domain && <div style={{ fontSize: 10.5, color: T.mu, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>{domain}</div>}
          {data.title && <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4, marginBottom: data.description ? 4 : 0 }}>{data.title}</div>}
          {data.description && <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.description}</div>}
        </div>
      </div>
    </a>
  );
}
