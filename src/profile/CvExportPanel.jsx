import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import { useWindowSize } from '../lib/useWindowSize';
import { formatDateRange } from '../lib/linkedInUtils';

// ─── Citation helpers (Vancouver / NLM) ─────────────────────────────────────

function splitAuthors(str) {
  if (!str?.trim()) return [];
  return str.split(/\s*;\s*|\s*,\s*(?=[A-Z\u00C0-\u024F])/)
    .map(a => a.trim()).filter(Boolean);
}

function formatAuthorsVancouver(authorsStr) {
  const parts = splitAuthors(authorsStr);
  if (!parts.length) return '';
  if (parts.length <= 6) return parts.join(', ');
  return parts.slice(0, 6).join(', ') + ', et al.';
}

function formatVancouver(pub) {
  const segs = [];
  const authors = formatAuthorsVancouver(pub.authors);
  if (authors) segs.push(authors + '.');
  if (pub.title) segs.push(pub.title.replace(/[.\s]+$/, '') + '.');
  const venue = pub.journal || pub.venue;
  if (venue) segs.push(venue + '.');
  if (pub.year) segs.push(pub.year + '.');
  const extras = [];
  if (pub.doi) {
    const doi = pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`;
    extras.push(`doi: ${doi}`);
  }
  if (pub.pmid) extras.push(`PubMed PMID: ${pub.pmid}`);
  if (extras.length) segs.push(extras.join('; ') + '.');
  return segs.join(' ');
}

// ─── HTML utilities ──────────────────────────────────────────────────────────

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

// ─── Section definitions ─────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'summary',       label: 'Summary / Bio' },
  { key: 'work',          label: 'Work Experience',            field: 'work_history' },
  { key: 'education',     label: 'Education',                  field: 'education' },
  { key: 'volunteering',  label: 'Volunteering',               field: 'volunteering' },
  { key: 'organizations', label: 'Organizations & Memberships',field: 'organizations' },
  { key: 'honors',        label: 'Honors & Awards',            field: 'honors' },
  { key: 'grants',        label: 'Grants & Funding',           field: 'grants' },
  { key: 'languages',     label: 'Languages',                  field: 'languages' },
  { key: 'skills',        label: 'Skills',                     field: 'skills' },
  { key: 'patents',       label: 'Patents',                    field: 'patents' },
  { key: 'publications',  label: 'Publications' },
];

// ─── PDF HTML builder ────────────────────────────────────────────────────────

function buildCvHtml(profile, pubs, sel) {
  const name = profile?.name || 'Researcher';
  const parts = [profile?.title, profile?.institution, profile?.location].filter(Boolean);
  const links = [];
  if (profile?.orcid) links.push(`<a href="https://orcid.org/${escAttr(profile.orcid)}" style="color:#6c63ff">ORCID: ${esc(profile.orcid)}</a>`);
  if (profile?.twitter) links.push(`<a href="https://twitter.com/${escAttr(profile.twitter.replace('@',''))}" style="color:#6c63ff">@${esc(profile.twitter.replace('@',''))}</a>`);

  const sectionHtml = (title, content) => content
    ? `<section><h2>${esc(title)}</h2>${content}</section>`
    : '';

  // Work
  const workHtml = sel.work && profile?.work_history?.length
    ? profile.work_history.map(e => `
        <div class="entry">
          <div class="entry-title">${esc(e.title || '')}</div>
          <div class="entry-sub">${[esc(e.company), esc(e.location), esc(formatDateRange(e.start, e.end))].filter(Boolean).join(' · ')}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`).join('')
    : null;

  // Education
  const eduHtml = sel.education && profile?.education?.length
    ? profile.education.map(e => `
        <div class="entry">
          <div class="entry-title">${[esc(e.degree), esc(e.field)].filter(Boolean).join(' in ')}</div>
          <div class="entry-sub">${[esc(e.school), esc(e.location), esc(formatDateRange(e.start, e.end))].filter(Boolean).join(' · ')}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`).join('')
    : null;

  // Volunteering
  const volHtml = sel.volunteering && profile?.volunteering?.length
    ? profile.volunteering.map(e => `
        <div class="entry">
          <div class="entry-title">${esc(e.role || '')}</div>
          <div class="entry-sub">${[esc(e.organization), esc(formatDateRange(e.start, e.end))].filter(Boolean).join(' · ')}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`).join('')
    : null;

  // Organizations
  const orgHtml = sel.organizations && profile?.organizations?.length
    ? profile.organizations.map(e => `
        <div class="entry">
          <div class="entry-title">${esc(e.name || '')}</div>
          <div class="entry-sub">${[esc(e.role), esc(formatDateRange(e.start, e.end))].filter(Boolean).join(' · ')}</div>
        </div>`).join('')
    : null;

  // Honors
  const honHtml = sel.honors && profile?.honors?.length
    ? profile.honors.map(e => `
        <div class="entry">
          <div class="entry-title">${esc(e.title || '')}</div>
          <div class="entry-sub">${[esc(e.issuer), esc(e.date ? e.date.slice(0, 4) : '')].filter(Boolean).join(' · ')}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`).join('')
    : null;

  // Grants
  const grtHtml = sel.grants && profile?.grants?.length
    ? profile.grants.map(e => {
        const amt = e.amount ? `${e.amount}${e.currency ? ' ' + e.currency : ''}` : '';
        return `
        <div class="entry">
          <div class="entry-title">${esc(e.title || '')}</div>
          <div class="entry-sub">${[esc(e.funder), amt ? esc(amt) : '', esc(formatDateRange(e.start, e.end))].filter(Boolean).join(' · ')}</div>
          ${e.grant_num ? `<div class="entry-desc" style="font-size:10pt;color:#7a7fa8">Grant no. ${esc(e.grant_num)}</div>` : ''}
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`;
      }).join('')
    : null;

  // Languages
  const langHtml = sel.languages && profile?.languages?.length
    ? `<div class="pills">${profile.languages.map(l =>
        `<span class="pill">${esc(l.name)}${l.proficiency ? ` <span class="pill-sub">· ${esc(l.proficiency)}</span>` : ''}</span>`
      ).join('')}</div>`
    : null;

  // Skills
  const skillHtml = sel.skills && profile?.skills?.length
    ? `<div class="pills">${profile.skills.map(s => `<span class="pill">${esc(s.name)}</span>`).join('')}</div>`
    : null;

  // Patents
  const patHtml = sel.patents && profile?.patents?.length
    ? profile.patents.map(e => `
        <div class="entry">
          <div class="entry-title">${esc(e.title || '')}</div>
          <div class="entry-sub">${[e.patent_num ? `No. ${esc(e.patent_num)}` : '', esc(e.date ? e.date.slice(0, 4) : '')].filter(Boolean).join(' · ')}</div>
          ${e.description ? `<div class="entry-desc">${esc(e.description)}</div>` : ''}
        </div>`).join('')
    : null;

  // Publications
  let pubsHtml = null;
  if (sel.publications && pubs?.length) {
    const groups = [
      ['Journal Articles &amp; Reviews', pubs.filter(p => !p.pub_type || ['journal','review','preprint'].includes(p.pub_type))],
      ['Presentations &amp; Posters',    pubs.filter(p => ['conference','poster','lecture'].includes(p.pub_type))],
      ['Book Chapters',                  pubs.filter(p => p.pub_type === 'book')],
      ['Other',                          pubs.filter(p => p.pub_type === 'other')],
    ].filter(([, items]) => items.length > 0);

    let num = 1;
    pubsHtml = groups.map(([title, items]) => {
      const rows = items.map(pub => {
        const n = num++;
        const cite = formatVancouver(pub)
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const doiUrl = pub.doi
          ? (pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`)
          : null;
        const linked = doiUrl
          ? cite.replace(/(doi: )(https?:\/\/\S+\.?)/, `$1<a href="${escAttr(doiUrl)}" style="color:#6c63ff">$2</a>`)
          : cite;
        return `<tr><td class="pub-num">${n}.</td><td>${linked}</td></tr>`;
      }).join('\n');
      return `<h3 class="pub-group">${title}</h3><table class="pub-table">${rows}</table>`;
    }).join('\n');
  }

  const css = `
    *, *::before, *::after { box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap');
    body {
      font-family: 'DM Sans', Arial, sans-serif;
      font-size: 10.5pt; line-height: 1.65; color: #1b1d36;
      margin: 0; padding: 48px 58px; max-width: 860px;
    }
    header { border-bottom: 2.5px solid #6c63ff; padding-bottom: 12px; margin-bottom: 6px; }
    h1 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 26pt; font-weight: 400; margin: 0 0 4px;
      letter-spacing: -.01em;
    }
    .contact { font-size: 10pt; color: #7a7fa8; margin: 2px 0; }
    .contact a { color: #6c63ff; text-decoration: none; }
    section { margin-top: 22px; }
    h2 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-size: 13pt; font-weight: 400; color: #6c63ff;
      text-transform: uppercase; letter-spacing: .07em;
      border-bottom: 1px solid #e3e5f5; padding-bottom: 4px;
      margin: 0 0 10px;
    }
    h3.pub-group {
      font-family: 'DM Sans', Arial, sans-serif;
      font-size: 10pt; font-weight: 600; color: #7a7fa8;
      margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em;
    }
    .summary-text { font-size: 10.5pt; line-height: 1.7; color: #3a3d5c; }
    .entry { margin-bottom: 11px; }
    .entry-title { font-weight: 600; font-size: 11pt; }
    .entry-sub { font-size: 9.5pt; color: #7a7fa8; margin-top: 1px; }
    .entry-desc { font-size: 10pt; color: #3a3d5c; margin-top: 3px; }
    .pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .pill { font-size: 10pt; background: #eef0fc; color: #3a3d5c; border-radius: 20px; padding: 3px 11px; }
    .pill-sub { color: #7a7fa8; }
    .pub-table { width: 100%; border-collapse: collapse; }
    .pub-table td { vertical-align: top; padding: 3px 0; font-size: 10pt; }
    td.pub-num { width: 26px; color: #7a7fa8; font-size: 9pt; padding-top: 4px; white-space: nowrap; }
    @media print {
      body { padding: 20px 32px; }
      h2 { page-break-after: avoid; }
      .entry, tr { page-break-inside: avoid; }
    }
  `;

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>CV — ${esc(name)}</title>
<style>${css}</style>
</head>
<body>
<header>
  <h1>${esc(name)}</h1>
  ${parts.length ? `<div class="contact">${parts.map(esc).join(' · ')}</div>` : ''}
  ${links.length ? `<div class="contact">${links.join(' &nbsp;·&nbsp; ')}</div>` : ''}
  <div class="contact" style="margin-top:6px;font-size:9pt">Curriculum Vitae · ${esc(date)}</div>
</header>

${sel.summary && profile?.bio ? sectionHtml('Summary', `<div class="summary-text">${esc(profile.bio)}</div>`) : ''}
${sectionHtml('Work Experience', workHtml)}
${sectionHtml('Education', eduHtml)}
${sectionHtml('Volunteering', volHtml)}
${sectionHtml('Organizations &amp; Memberships', orgHtml)}
${sectionHtml('Honors &amp; Awards', honHtml)}
${sectionHtml('Grants &amp; Funding', grtHtml)}
${langHtml || skillHtml ? `<section><h2>Skills &amp; Languages</h2>${skillHtml || ''}${langHtml ? (skillHtml ? '<div style="margin-top:10px">' : '') + langHtml + (skillHtml ? '</div>' : '') : ''}</section>` : ''}
${sectionHtml('Patents', patHtml)}
${pubsHtml ? `<section><h2>Publications</h2>${pubsHtml}</section>` : ''}
</body>
</html>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CvExportPanel({ user, profile, onClose }) {
  const { isMobile } = useWindowSize();
  const [pubs,     setPubs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [exporting,setExporting]= useState(false);

  // Default all sections ON if there's data for them
  const [sel, setSel] = useState(() => {
    const defaults = {};
    SECTIONS.forEach(s => { defaults[s.key] = true; });
    return defaults;
  });

  useEffect(() => {
    if (!user) return;
    supabase.from('publications').select('*').eq('user_id', user.id)
      .order('year', { ascending: false })
      .then(({ data }) => { setPubs(data || []); setLoading(false); });
  }, [user]);

  // Count of items per section (for display)
  const counts = {
    summary:       profile?.bio ? 1 : 0,
    work:          profile?.work_history?.length || 0,
    education:     profile?.education?.length || 0,
    volunteering:  profile?.volunteering?.length || 0,
    organizations: profile?.organizations?.length || 0,
    honors:        profile?.honors?.length || 0,
    grants:        profile?.grants?.length || 0,
    languages:     profile?.languages?.length || 0,
    skills:        profile?.skills?.length || 0,
    patents:       profile?.patents?.length || 0,
    publications:  pubs.length,
  };

  const sectionsWithData = SECTIONS.filter(s => counts[s.key] > 0);
  const selectedCount    = sectionsWithData.filter(s => sel[s.key]).length;

  const toggle = (key) => setSel(prev => ({ ...prev, [key]: !prev[key] }));

  const handleExport = () => {
    setExporting(true);
    try {
      const html = buildCvHtml(profile, pubs, sel);
      const w = window.open('', '_blank', 'width=900,height=720');
      if (!w) { alert('Pop-up blocked — please allow pop-ups for this site.'); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => { w.print(); setExporting(false); }, 700);
    } catch (e) {
      console.error('CV export error:', e);
      setExporting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      {/* Backdrop */}
      {!isMobile && (
        <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.35)' }} />
      )}

      {/* Panel */}
      <div style={{
        width: isMobile ? '100%' : 440, height: '100%',
        background: T.w, boxShadow: isMobile ? 'none' : '-4px 0 28px rgba(0,0,0,.18)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} title="Close"
            style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${T.bdr}`, background: T.s2, cursor: 'pointer', fontSize: 13, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ✕
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Export CV</div>
            <div style={{ fontSize: 11.5, color: T.mu }}>Choose sections · opens print/save dialog</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '22px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>

          {/* ── Profile summary ── */}
          <div style={{ background: `linear-gradient(135deg,${T.v2},${T.bl2})`, border: `1px solid rgba(108,99,255,.15)`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{profile?.name || 'Your Profile'}</div>
              {profile?.title && <div style={{ fontSize: 12, color: T.v, fontWeight: 600 }}>{profile.title}</div>}
              {profile?.institution && <div style={{ fontSize: 12, color: T.mu }}>{profile.institution}</div>}
            </div>
          </div>

          {/* ── Section selector ── */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
              Sections to include
            </div>
            <div style={{ fontSize: 12, color: T.mu, marginBottom: 10 }}>
              {selectedCount} of {sectionsWithData.length} sections selected
            </div>
            <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
              {loading && (
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                  <Spinner />
                </div>
              )}
              {!loading && SECTIONS.map((s, i) => {
                const count = counts[s.key];
                const hasData = count > 0;
                const on = sel[s.key] && hasData;
                return (
                  <div
                    key={s.key}
                    onClick={() => hasData && toggle(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '11px 16px', cursor: hasData ? 'pointer' : 'default',
                      borderTop: i > 0 ? `1px solid ${T.bdr}` : 'none',
                      opacity: hasData ? 1 : 0.38, userSelect: 'none',
                      background: 'transparent', transition: 'background .12s',
                    }}
                    onMouseEnter={e => { if (hasData) e.currentTarget.style.background = T.s3; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: on ? T.text : T.mu, transition: 'color .15s' }}>
                        {s.label}
                      </span>
                      {hasData && (
                        <span style={{ fontSize: 11, color: T.mu, marginLeft: 8 }}>
                          {s.key === 'summary' ? 'bio' : `${count} item${count !== 1 ? 's' : ''}`}
                        </span>
                      )}
                      {!hasData && (
                        <span style={{ fontSize: 11, color: T.mu, marginLeft: 8 }}>no data</span>
                      )}
                    </div>
                    <Toggle on={on} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Select all / none ── */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSel(prev => { const n = {...prev}; sectionsWithData.forEach(s => { n[s.key] = true; }); return n; })}
              style={{ fontSize: 12, color: T.v, fontWeight: 600, border: `1px solid rgba(108,99,255,.25)`, background: T.v2, borderRadius: 20, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Select all
            </button>
            <button
              onClick={() => setSel(prev => { const n = {...prev}; sectionsWithData.forEach(s => { n[s.key] = false; }); return n; })}
              style={{ fontSize: 12, color: T.mu, fontWeight: 600, border: `1px solid ${T.bdr}`, background: 'transparent', borderRadius: 20, padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear all
            </button>
          </div>

          {/* ── Format note ── */}
          <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '12px 15px', fontSize: 12, color: T.mu, lineHeight: 1.6 }}>
            Opens a print-ready page in a new tab. Use your browser's <strong style={{ color: T.text }}>File → Print → Save as PDF</strong> to download. Publications use Vancouver / NLM citation format.
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 22px', borderTop: `1px solid ${T.bdr}`, display: 'flex', gap: 10, flexShrink: 0 }}>
          <Btn onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn
            variant="s"
            onClick={handleExport}
            disabled={exporting || loading || selectedCount === 0}
            style={{ flex: 2 }}>
            {exporting ? 'Opening…' : `Export CV (${selectedCount} section${selectedCount !== 1 ? 's' : ''})`}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle sub-component ────────────────────────────────────────────────────

function Toggle({ on }) {
  return (
    <div style={{ width: 38, height: 21, borderRadius: 11, background: on ? T.v : T.bdr, position: 'relative', transition: 'background .18s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left .18s', boxShadow: '0 1px 4px rgba(0,0,0,.22)' }} />
    </div>
  );
}
