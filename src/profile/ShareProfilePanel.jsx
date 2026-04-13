import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';

const DEFAULT_VIS = {
  work_history: true, education: true, volunteering: true,
  organizations: true, skills: true, publications: true, grants: true,
};

const VIS_SECTIONS = [
  ['work_history',  'Work Experience'],
  ['education',     'Education'],
  ['volunteering',  'Volunteering'],
  ['organizations', 'Organizations & Memberships'],
  ['skills',        'Skills & Achievements'],
  ['publications',  'Publications'],
  ['grants',        'Grants & Funding'],
];

function slugify(name) {
  if (!name) return '';
  const base = name.toLowerCase()
    .replace(/^dr\.?\s*/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function trunc(str, n) { return str && str.length > n ? str.slice(0, n - 1) + '…' : (str || ''); }

function makeBadgeSvg(profile, url) {
  const name  = esc(trunc(profile?.name || 'Researcher', 24));
  const title = esc(trunc(profile?.title || '', 34));
  const inst  = esc(trunc(profile?.institution || '', 36));
  const short = url ? url.replace(/^https?:\/\//, '') : '';
  const lines = [title, inst].filter(Boolean);
  // Dynamic height based on content
  const h = 72 + lines.length * 16;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${h}" role="img" aria-label="${name} on Luminary">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6c63ff"/>
      <stop offset="100%" stop-color="#5a52e8"/>
    </linearGradient>
    <clipPath id="cl"><rect width="320" height="${h}" rx="12"/></clipPath>
  </defs>
  <rect width="320" height="${h}" rx="12" fill="url(#bg)"/>
  <rect width="72" height="${h}" fill="rgba(0,0,0,0.18)" clip-path="url(#cl)"/>
  <text x="36" y="${Math.round(h/2)+6}" font-family="Georgia,serif" font-size="28" fill="white" text-anchor="middle" font-weight="bold">L</text>
  <text x="36" y="${Math.round(h/2)+20}" font-family="Arial,sans-serif" font-size="7" fill="rgba(255,255,255,0.5)" text-anchor="middle" letter-spacing="2">UMINARY</text>
  <text x="84" y="28" font-family="Arial,sans-serif" font-size="15" fill="white" font-weight="bold">${name}</text>
  ${lines.map((l, i) => `<text x="84" y="${44 + i * 16}" font-family="Arial,sans-serif" font-size="11" fill="rgba(255,255,255,${i === 0 ? '0.88' : '0.72'})">${l}</text>`).join('\n  ')}
  ${short ? `<text x="84" y="${h - 10}" font-family="Arial,sans-serif" font-size="9" fill="rgba(255,255,255,0.45)">${esc(short)}</text>` : ''}
</svg>`;
}

export default function ShareProfilePanel({ user, profile, onClose, onProfileUpdate }) {
  const [slugInput,    setSlugInput]    = useState(profile?.profile_slug || '');
  const [savedSlug,    setSavedSlug]    = useState(profile?.profile_slug || '');
  const [slugError,    setSlugError]    = useState('');
  const [slugSaving,   setSlugSaving]   = useState(false);
  const [vis,          setVis]          = useState(() => ({ ...DEFAULT_VIS, ...(profile?.profile_visibility || {}) }));
  const [urlCopied,    setUrlCopied]    = useState(false);
  const [badgeCopied,  setBadgeCopied]  = useState(false);
  const [qrDataUrl,    setQrDataUrl]    = useState(null);
  const [qrLoading,    setQrLoading]    = useState(false);

  const profileUrl = savedSlug
    ? `${window.location.origin}/p/${savedSlug}`
    : null;

  // Auto-generate slug on first open when user has no slug
  useEffect(() => {
    if (!profile?.profile_slug && profile?.name) {
      const generated = slugify(profile.name);
      setSlugInput(generated);
    }
  }, []); // eslint-disable-line

  // Generate QR code whenever the URL changes
  useEffect(() => {
    if (!profileUrl) { setQrDataUrl(null); return; }
    let cancelled = false;
    setQrLoading(true);
    import('qrcode').then(mod => {
      if (cancelled) return;
      return mod.default.toDataURL(profileUrl, { width: 200, margin: 2, color: { dark: '#1b1d36', light: '#ffffff' } });
    }).then(url => {
      if (!cancelled && url) { setQrDataUrl(url); setQrLoading(false); }
    }).catch(() => { if (!cancelled) setQrLoading(false); });
    return () => { cancelled = true; };
  }, [profileUrl]);

  const saveSlug = async () => {
    const cleaned = slugInput.toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!cleaned) { setSlugError('URL cannot be empty.'); return; }
    if (cleaned.length < 3) { setSlugError('Must be at least 3 characters.'); return; }
    setSlugError(''); setSlugSaving(true);

    // Check uniqueness (ignore the user's own current slug)
    if (cleaned !== profile?.profile_slug) {
      const { data: taken } = await supabase
        .from('profiles').select('id').eq('profile_slug', cleaned).neq('id', user.id).maybeSingle();
      if (taken) { setSlugError('That URL is already taken. Try a different one.'); setSlugSaving(false); return; }
    }

    const { data } = await supabase.from('profiles')
      .update({ profile_slug: cleaned }).eq('id', user.id).select().single();
    if (data) { onProfileUpdate(data); setSavedSlug(cleaned); setSlugInput(cleaned); }
    setSlugSaving(false);
  };

  const toggleVis = async (key) => {
    const next = { ...vis, [key]: !vis[key] };
    setVis(next);
    const { data } = await supabase.from('profiles')
      .update({ profile_visibility: next }).eq('id', user.id).select().single();
    if (data) onProfileUpdate(data);
  };

  const copyUrl = () => {
    if (!profileUrl) return;
    navigator.clipboard.writeText(profileUrl).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); });
  };

  const badgeSvg = makeBadgeSvg(profile, profileUrl);
  const badgeHtml = profileUrl
    ? `<a href="${profileUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;">${badgeSvg}</a>`
    : '';

  const copyBadge = () => {
    navigator.clipboard.writeText(badgeHtml).then(() => { setBadgeCopied(true); setTimeout(() => setBadgeCopied(false), 2000); });
  };

  const downloadBadge = () => {
    const blob = new Blob([badgeSvg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${savedSlug || 'profile'}-badge.svg`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl; a.download = `${savedSlug || 'profile'}-qr.png`; a.click();
  };

  const slugChanged = slugInput !== savedSlug;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.35)' }} />

      {/* Panel */}
      <div style={{ width: 440, height: '100%', background: T.w, boxShadow: '-4px 0 28px rgba(0,0,0,.18)', overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} title="Close"
            style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${T.bdr}`, background: T.s2, cursor: 'pointer', fontSize: 13, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ✕
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Share Profile</div>
            <div style={{ fontSize: 11.5, color: T.mu }}>Public research profile settings</div>
          </div>
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 7, padding: '5px 10px', whiteSpace: 'nowrap' }}>
              Preview ↗
            </a>
          )}
        </div>

        <div style={{ flex: 1, padding: '22px', display: 'flex', flexDirection: 'column', gap: 26, overflowY: 'auto' }}>

          {/* ── Profile URL ── */}
          <section>
            <SectionTitle>Edit Profile URL</SectionTitle>

            {/* Slug editor */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', background: T.s2, border: `1.5px solid ${slugError ? T.ro : T.bdr}`, borderRadius: 9, overflow: 'hidden' }}>
                <span style={{ padding: '9px 8px 9px 13px', fontSize: 11.5, color: T.mu, whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {window.location.host}/p/
                </span>
                <input
                  value={slugInput}
                  onChange={e => { setSlugError(''); setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                  onKeyDown={e => e.key === 'Enter' && slugChanged && saveSlug()}
                  placeholder="your-name"
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, fontFamily: 'inherit', padding: '9px 0', fontWeight: 600, color: T.text, minWidth: 0 }}
                />
                {slugChanged && (
                  <button onClick={saveSlug} disabled={slugSaving}
                    style={{ padding: '9px 14px', background: T.v, color: 'white', border: 'none', fontSize: 12, fontWeight: 700, cursor: slugSaving ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    {slugSaving ? '…' : 'Save'}
                  </button>
                )}
              </div>
              {slugError
                ? <div style={{ fontSize: 11.5, color: T.ro, marginTop: 5 }}>{slugError}</div>
                : <div style={{ fontSize: 11, color: T.mu, marginTop: 5 }}>Letters, numbers, and hyphens only · 3+ characters</div>
              }
            </div>

            {/* Share link */}
            {profileUrl ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, background: T.s3, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: '9px 12px', fontSize: 12.5, color: T.v, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profileUrl}
                </div>
                <Btn variant="s" onClick={copyUrl} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {urlCopied ? '✓ Copied' : '📋 Copy'}
                </Btn>
              </div>
            ) : (
              <div style={{ background: T.am2, border: `1px solid rgba(245,158,11,.25)`, borderRadius: 9, padding: '11px 14px', fontSize: 12.5, color: '#92400e', lineHeight: 1.5 }}>
                Set a profile URL above to make your profile public and get a shareable link.
              </div>
            )}
          </section>

          {/* ── Section Visibility ── */}
          <section>
            <SectionTitle>Section Visibility</SectionTitle>
            <div style={{ fontSize: 12, color: T.mu, marginBottom: 10 }}>
              Control which sections are visible on your public profile.
            </div>
            <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
              {VIS_SECTIONS.map(([key, label], i) => (
                <div key={key} onClick={() => toggleVis(key)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderTop: i > 0 ? `1px solid ${T.bdr}` : 'none', userSelect: 'none', background: 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = T.s3}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 13, color: vis[key] !== false ? T.text : T.mu, transition: 'color .15s' }}>{label}</span>
                  <Toggle on={vis[key] !== false} />
                </div>
              ))}
            </div>
          </section>

          {/* ── Badge Export ── */}
          {profileUrl && (
            <section>
              <SectionTitle>Profile Badge</SectionTitle>
              <div style={{ fontSize: 12, color: T.mu, marginBottom: 12, lineHeight: 1.5 }}>
                Copy this badge as HTML and paste it into your poster, slide deck, or website.
              </div>

              {/* Badge preview */}
              <div style={{ background: '#f0f0f0', borderRadius: 10, padding: 18, marginBottom: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', border: `1px solid ${T.bdr}` }}
                dangerouslySetInnerHTML={{ __html: badgeSvg }} />

              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={copyBadge} style={{ flex: 1, fontSize: 12 }}>
                  {badgeCopied ? '✓ HTML Copied!' : '📋 Copy HTML'}
                </Btn>
                <Btn onClick={downloadBadge} style={{ fontSize: 12 }}>⬇ SVG</Btn>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: T.mu }}>
                The HTML snippet embeds the badge as inline SVG and links to your profile.
              </div>
            </section>
          )}

          {/* ── QR Code ── */}
          {profileUrl && (
            <section>
              <SectionTitle>QR Code</SectionTitle>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                {/* QR preview box */}
                <div style={{ flexShrink: 0, background: 'white', border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 10, width: 136, height: 136, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {qrLoading && <div style={{ fontSize: 11, color: T.mu, textAlign: 'center' }}>Generating…</div>}
                  {!qrLoading && qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width: 116, height: 116, display: 'block', imageRendering: 'pixelated' }} />}
                  {!qrLoading && !qrDataUrl && <div style={{ fontSize: 11, color: T.ro, textAlign: 'center' }}>Failed to generate.<br/>Make sure qrcode is installed.</div>}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.6, marginBottom: 12 }}>
                    Add this QR code to your poster or presentation so attendees can instantly access your full profile.
                  </div>
                  <Btn onClick={downloadQr} disabled={!qrDataUrl} style={{ fontSize: 12, width: '100%' }}>
                    ⬇ Download PNG
                  </Btn>
                </div>
              </div>

              {/* QR URL hint */}
              <div style={{ marginTop: 10, background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: T.mu, wordBreak: 'break-all' }}>
                {profileUrl}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function Toggle({ on }) {
  return (
    <div style={{ width: 38, height: 21, borderRadius: 11, background: on ? T.v : T.bdr, position: 'relative', transition: 'background .18s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .18s', boxShadow: '0 1px 4px rgba(0,0,0,.22)' }} />
    </div>
  );
}
