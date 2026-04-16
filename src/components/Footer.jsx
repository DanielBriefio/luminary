import { T } from '../lib/constants';

export default function Footer({ minimal = false }) {
  const links = [
    { label: 'Privacy Policy',   href: 'https://luminary.to/privacy' },
    { label: 'Terms of Service', href: 'https://luminary.to/terms' },
    { label: 'Cookie Policy',    href: 'https://luminary.to/cookies' },
    { label: 'Contact',          href: 'mailto:hello@luminary.to' },
  ];

  return (
    <div style={{
      padding: minimal ? '12px 24px' : '20px 24px',
      borderTop: `1px solid ${T.bdr}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      flexWrap: 'wrap',
      background: T.w,
    }}>
      {links.map(link => (
        <a key={link.label}
          href={link.href}
          target={link.href.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          style={{ fontSize: 11.5, color: T.mu, textDecoration: 'none', fontWeight: 500 }}
          onMouseEnter={e => e.target.style.color = T.v}
          onMouseLeave={e => e.target.style.color = T.mu}
        >
          {link.label}
        </a>
      ))}
      <span style={{ fontSize: 11, color: T.bdr }}>
        © {new Date().getFullYear()} Luminary
      </span>
    </div>
  );
}
