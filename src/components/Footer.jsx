import { useState } from 'react';
import { T } from '../lib/constants';

const links = [
  { label: 'Privacy Policy',   href: 'https://luminary.to/privacy' },
  { label: 'Terms of Service', href: 'https://luminary.to/terms' },
  { label: 'Cookie Policy',    href: 'https://luminary.to/cookies' },
];

const linkStyle = { fontSize: 11.5, color: T.mu, textDecoration: 'none', fontWeight: 500 };

// Expandable single-line version for the sidebar
function SidebarFooter() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.bdr}` }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: 'none', background: 'transparent', cursor: 'pointer',
        fontFamily: 'inherit', color: T.mu, fontSize: 11.5, fontWeight: 500,
        padding: '2px 0',
      }}>
        Privacy & Terms
        <span style={{ fontSize: 9, transition: 'transform .15s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}>▲</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(link => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
              style={{ ...linkStyle, fontSize: 11 }}
              onMouseEnter={e => e.target.style.color = T.v}
              onMouseLeave={e => e.target.style.color = T.mu}>
              {link.label} ↗
            </a>
          ))}
          <span style={{ fontSize: 10.5, color: T.bdr, marginTop: 2 }}>
            © {new Date().getFullYear()} Luminary
          </span>
        </div>
      )}
    </div>
  );
}

// Full horizontal version for the auth card
function FullFooter({ minimal }) {
  return (
    <div style={{
      padding: minimal ? '12px 0 0' : '20px 24px',
      borderTop: `1px solid ${T.bdr}`,
      marginTop: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 16, flexWrap: 'wrap',
    }}>
      {links.map(link => (
        <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
          style={linkStyle}
          onMouseEnter={e => e.target.style.color = T.v}
          onMouseLeave={e => e.target.style.color = T.mu}>
          {link.label}
        </a>
      ))}
      <span style={{ fontSize: 11, color: T.bdr }}>© {new Date().getFullYear()} Luminary</span>
    </div>
  );
}

export default function Footer({ minimal = false, sidebar = false }) {
  if (sidebar) return <SidebarFooter />;
  return <FullFooter minimal={minimal} />;
}
