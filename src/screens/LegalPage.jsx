import { useEffect, useState } from 'react';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';

const DOCS = {
  privacy: { title: 'Privacy Policy',   path: '/legal/privacy.md' },
  terms:   { title: 'Terms of Service', path: '/legal/terms.md'   },
  cookies: { title: 'Cookie Policy',    path: '/legal/cookies.md' },
};

// ── Minimal markdown → React renderer ───────────────────────────────────
// Handles: headings, paragraphs, unordered/ordered lists, tables, blockquotes,
// horizontal rules, inline **bold**, _italic_, `code`, [links](url).
// Not a full CommonMark implementation — tailored to our legal docs.

function renderInline(text, keyPrefix) {
  // Escape HTML entities first to avoid injection from markdown source.
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Apply inline formatting in order: links > code > bold > italic.
  let html = escaped
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:${T.v};font-weight:500;text-decoration:none;">${label}</a>`)
    .replace(/`([^`]+)`/g,
      (_m, code) => `<code style="background:${T.s3};padding:1px 6px;border-radius:4px;font-size:.92em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g,
      (_m, bold) => `<strong style="font-weight:700;color:${T.text};">${bold}</strong>`)
    .replace(/(^|[^_])_([^_]+)_(?!_)/g,
      (_m, pre, ital) => `${pre}<em>${ital}</em>`);

  return <span key={keyPrefix} dangerouslySetInnerHTML={{ __html: html }} />;
}

function parseTable(lines, startIdx) {
  // Pipe table: header | header; ---|---; row | row
  const headerLine = lines[startIdx];
  const separator  = lines[startIdx + 1];
  if (!separator || !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(separator)) return null;

  const splitRow = (line) => line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(c => c.trim());

  const headers = splitRow(headerLine);
  const rows = [];
  let i = startIdx + 2;
  while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
    rows.push(splitRow(lines[i]));
    i++;
  }
  return { headers, rows, endIdx: i };
}

function renderMarkdown(src) {
  const lines = src.split(/\r?\n/);
  const out = [];
  let i = 0;
  let key = 0;
  const k = () => `md-${key++}`;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — skip
    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^---+\s*$/.test(trimmed) || /^\*\*\*+\s*$/.test(trimmed)) {
      out.push(<hr key={k()} style={{ border: 'none', borderTop: `1px solid ${T.bdr}`, margin: '28px 0' }}/>);
      i++; continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const sizes = { 1: 30, 2: 22, 3: 17, 4: 15, 5: 14, 6: 13 };
      const margin = { 1: '0 0 24px', 2: '32px 0 12px', 3: '22px 0 8px', 4: '18px 0 6px', 5: '16px 0 4px', 6: '14px 0 4px' };
      const Tag = `h${level}`;
      out.push(
        <Tag key={k()} style={{
          fontFamily: level <= 2 ? "'DM Serif Display', serif" : "'DM Sans', sans-serif",
          fontWeight: level <= 2 ? 400 : 700,
          fontSize: sizes[level],
          color: T.text,
          margin: margin[level],
          lineHeight: 1.3,
        }}>{renderInline(text, k())}</Tag>
      );
      i++; continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote key={k()} style={{
          borderLeft: `3px solid ${T.v}`,
          background: T.v2,
          margin: '16px 0',
          padding: '12px 16px',
          borderRadius: '0 8px 8px 0',
          color: T.text,
          fontSize: 13.5,
          lineHeight: 1.65,
        }}>
          {renderInline(quoteLines.join(' '), k())}
        </blockquote>
      );
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length) {
      const parsed = parseTable(lines, i);
      if (parsed) {
        out.push(
          <div key={k()} style={{ overflowX: 'auto', margin: '16px 0' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: 13,
              border: `1px solid ${T.bdr}`, borderRadius: 8, overflow: 'hidden',
            }}>
              <thead>
                <tr style={{ background: T.s2 }}>
                  {parsed.headers.map((h, idx) => (
                    <th key={idx} style={{
                      textAlign: 'left', padding: '10px 12px', fontWeight: 700,
                      color: T.text, borderBottom: `1px solid ${T.bdr}`,
                    }}>{renderInline(h, `th-${idx}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderTop: rIdx === 0 ? 'none' : `1px solid ${T.bdr}` }}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} style={{ padding: '10px 12px', color: T.text, verticalAlign: 'top', lineHeight: 1.55 }}>
                        {renderInline(cell, `td-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        i = parsed.endIdx;
        continue;
      }
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(
        <ul key={k()} style={{ margin: '10px 0 14px 0', paddingLeft: 22, color: T.text, fontSize: 14, lineHeight: 1.7 }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: 4 }}>{renderInline(it, `li-${idx}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(
        <ol key={k()} style={{ margin: '10px 0 14px 0', paddingLeft: 22, color: T.text, fontSize: 14, lineHeight: 1.7 }}>
          {items.map((it, idx) => <li key={idx} style={{ marginBottom: 4 }}>{renderInline(it, `oli-${idx}`)}</li>)}
        </ol>
      );
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-block lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,6})\s+/.test(lines[i].trim())
      && !/^---+\s*$/.test(lines[i].trim())
      && !lines[i].trim().startsWith('>')
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !lines[i].includes('|')) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(
        <p key={k()} style={{ margin: '0 0 14px 0', color: T.text, fontSize: 14, lineHeight: 1.75 }}>
          {renderInline(paraLines.join(' '), k())}
        </p>
      );
    } else {
      i++; // safety: avoid infinite loop on unrecognised line
    }
  }

  return out;
}

export default function LegalPage({ doc }) {
  const meta = DOCS[doc];
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    fetch(meta.path)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => { if (!cancelled) setContent(text); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [meta]);

  if (!meta) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ color: T.mu }}>Document not found.</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans', sans-serif", padding: '40px 20px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>

        {/* Back-to-app bar */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{
            fontSize: 13, color: T.mu, textDecoration: 'none', fontWeight: 600,
          }}>← Back to Luminary</a>
          <div style={{ display: 'flex', gap: 14 }}>
            {Object.entries(DOCS).filter(([key]) => key !== doc).map(([key, d]) => (
              <a key={key} href={`/${key}`} style={{
                fontSize: 12.5, color: T.mu, textDecoration: 'none', fontWeight: 600,
              }}>{d.title}</a>
            ))}
          </div>
        </div>

        {/* Document card */}
        <div style={{
          background: T.w, borderRadius: 16, border: `1px solid ${T.bdr}`,
          padding: '40px 44px', boxShadow: '0 2px 8px rgba(27,29,54,.04)',
        }}>
          {error && (
            <div style={{ color: T.ro, fontSize: 14, padding: '20px 0' }}>
              Failed to load {meta.title}: {error}
            </div>
          )}
          {!error && !content && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner/>
            </div>
          )}
          {!error && content && renderMarkdown(content)}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11.5, color: T.mu }}>
          © {new Date().getFullYear()} Qurio LLC · Luminary
        </div>
      </div>
    </div>
  );
}
