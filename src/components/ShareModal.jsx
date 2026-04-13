import { useState } from 'react';
import { T } from '../lib/constants';

function getShareText(post) {
  if (post.post_type === 'paper' && post.paper_title) {
    return `"${post.paper_title}"`;
  }
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  return plain.slice(0, 180) + (plain.length > 180 ? '…' : '');
}

function getShareTitle(post) {
  if (post.post_type === 'paper' && post.paper_title) return post.paper_title;
  if (post.post_type === 'link'  && post.link_title)  return post.link_title;
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  return plain.slice(0, 100) + (plain.length > 100 ? '…' : '');
}

export default function ShareModal({ post, onClose }) {
  const [copied, setCopied] = useState(false);

  const url   = `${window.location.origin}/s/${post.id}`;
  const text  = getShareText(post);
  const title = getShareTitle(post);
  const via   = 'LuminaryScience';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch { /* fallback */ const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const destinations = [
    {
      id: 'linkedin',
      label: 'LinkedIn',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      ),
      bg: '#EEF4FF',
      border: 'rgba(10,102,194,.2)',
      href: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(text)}`,
    },
    {
      id: 'x',
      label: 'X (Twitter)',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="#000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      ),
      bg: '#F7F7F7',
      border: 'rgba(0,0,0,.12)',
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}&via=${via}`,
    },
    {
      id: 'reddit',
      label: 'Reddit',
      icon: (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="#FF4500"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
      ),
      bg: '#FFF4F0',
      border: 'rgba(255,69,0,.2)',
      href: `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    },
    {
      id: 'email',
      label: 'Email',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
      ),
      bg: T.s2,
      border: T.bdr,
      href: `mailto:?subject=${encodeURIComponent('Interesting post on Luminary')}&body=${encodeURIComponent(`${text}\n\nRead on Luminary: ${url}`)}`,
    },
  ];

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
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: T.s2, cursor: 'pointer', fontSize: 14, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>✕</button>
        </div>

        {/* Copy link row */}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          {destinations.map(d => (
            <a
              key={d.id}
              href={d.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: d.bg, border: `1.5px solid ${d.border}`,
                borderRadius: 10, padding: '10px 13px',
                cursor: 'pointer', transition: 'opacity .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{d.icon}</div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{d.label}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
