import { useState } from 'react';
import { T } from '../lib/constants';

function getShareTitle(post) {
  if (post.post_type === 'paper' && post.paper_title) return post.paper_title;
  if (post.post_type === 'link'  && post.link_title)  return post.link_title;
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  return plain.slice(0, 100) + (plain.length > 100 ? '…' : '');
}

function getShareText(post) {
  if (post.post_type === 'paper' && post.paper_title) return `"${post.paper_title}"`;
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  return plain.slice(0, 180) + (plain.length > 180 ? '…' : '');
}

export default function ShareModal({ post, onClose }) {
  const [copied, setCopied] = useState(false);

  const url   = `${window.location.origin}/s/${post.id}`;
  const title = getShareTitle(post);
  const text  = getShareText(post);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const t = document.createElement('textarea');
      t.value = url; document.body.appendChild(t); t.select();
      document.execCommand('copy'); document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    try { await navigator.share({ title, text, url }); }
    catch {}
  };

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000, backdropFilter: 'blur(2px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', left: '50%', top: '50%',
        transform: 'translate(-50%,-50%)',
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,.18)',
        zIndex: 1001, width: 360, maxWidth: 'calc(100vw - 32px)',
        padding: '20px 20px 22px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17 }}>Share post</div>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: T.s2, cursor: 'pointer', fontSize: 14, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
            ✕
          </button>
        </div>

        {/* Copy link */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
          <div style={{
            flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`,
            borderRadius: 9, padding: '8px 12px',
            fontSize: 11.5, color: T.mu, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {url}
          </div>
          <button
            onClick={copyLink}
            style={{
              padding: '8px 14px', borderRadius: 9, border: 'none', flexShrink: 0,
              background: copied ? T.gr : T.v, color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background .2s',
              whiteSpace: 'nowrap',
            }}>
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>

        {/* Platform buttons */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Share to
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: canShare ? '1fr 1fr' : '1fr', gap: 9 }}>

          {/* LinkedIn */}
          <a
            href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#EEF4FF', border: '1.5px solid rgba(10,102,194,.2)',
                borderRadius: 10, padding: '10px 13px',
                cursor: 'pointer', transition: 'opacity .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" style={{ flexShrink: 0 }}>
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>LinkedIn</span>
            </div>
          </a>

          {/* Web Share API — native OS share sheet */}
          {canShare && (
            <button
              onClick={nativeShare}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: T.v2, border: `1.5px solid rgba(108,99,255,.2)`,
                borderRadius: 10, padding: '10px 13px',
                cursor: 'pointer', transition: 'opacity .15s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.v} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.v }}>Share…</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
