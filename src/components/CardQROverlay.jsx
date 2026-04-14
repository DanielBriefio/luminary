import { useState, useEffect } from 'react';
import { T } from '../lib/constants';

export default function CardQROverlay({ profile, onClose }) {
  const cardUrl  = `https://luminary.to/p/${profile.profile_slug}`;
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(mod => {
      if (cancelled) return;
      mod.default.toDataURL(cardUrl, {
        width: 220, margin: 1,
        color: { dark: '#1a1a2e', light: '#ffffff' },
      }).then(url => { if (!cancelled) setQrDataUrl(url); });
    });
    return () => { cancelled = true; };
  }, [cardUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(cardUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.85)',
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        zIndex:2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:'white', borderRadius:24,
          padding:'32px 28px', textAlign:'center',
          maxWidth:320, width:'90%',
          boxShadow:'0 24px 80px rgba(0,0,0,.4)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Name + title */}
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, marginBottom:4 }}>
          {profile.name}
        </div>
        <div style={{ fontSize:12.5, color:'#888', marginBottom:24, lineHeight:1.4 }}>
          {[profile.title, profile.institution].filter(Boolean).join(' · ')}
        </div>

        {/* QR code */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
          {qrDataUrl
            ? <img src={qrDataUrl} alt="QR code" style={{ width:220, height:220, display:'block', imageRendering:'pixelated', borderRadius:12 }}/>
            : <div style={{ width:220, height:220, background:'#f5f5f5', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#bbb' }}>
                Generating…
              </div>
          }
        </div>

        {/* URL label */}
        <div style={{ fontSize:11.5, color:'#bbb', marginBottom:20, letterSpacing:'.03em' }}>
          luminary.to/p/{profile.profile_slug}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={copyLink} style={{
            flex:1, padding:'10px', borderRadius:10,
            border:`1.5px solid ${T.v}`, background:T.v2,
            color:T.v, fontSize:13, fontWeight:700,
            fontFamily:'inherit', cursor:'pointer',
          }}>
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
          <button onClick={onClose} style={{
            flex:1, padding:'10px', borderRadius:10,
            border:'1.5px solid #ddd', background:'white',
            color:'#888', fontSize:13, fontWeight:600,
            fontFamily:'inherit', cursor:'pointer',
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
