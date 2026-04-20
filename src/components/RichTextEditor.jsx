import { useState, useEffect, useRef } from 'react';
import { T } from '../lib/constants';
import { sanitiseHtml } from '../lib/htmlUtils';
import Btn from './Btn';

function TBtn({ label, title, onClick, active=false }) {
  return (
    <button
      onMouseDown={e=>{ e.preventDefault(); onClick(); }}
      title={title}
      style={{
        padding:"3px 8px", border:"none", borderRadius:6, cursor:"pointer",
        fontSize:12, fontFamily:"inherit", fontWeight:700,
        background: active ? T.v2 : "transparent",
        color: active ? T.v : T.mu,
        transition:"all .12s",
        minWidth:28, textAlign:"center",
      }}>
      {label}
    </button>
  );
}

// Build a Vancouver-style reference string from CrossRef work object
function buildVancouverRef(w) {
  const authors = (w.author || [])
    .slice(0, 6)
    .map(a => {
      const family = a.family || '';
      const initials = (a.given || '').replace(/[^A-Za-z ]/g, '').split(' ')
        .map(n => n[0] ? n[0].toUpperCase() : '').filter(Boolean).join('');
      return `${family} ${initials}`.trim();
    });
  const authorStr = (w.author || []).length > 6 ? `${authors.join(', ')}, et al` : authors.join(', ');
  const title   = (w.title?.[0] || '').replace(/<[^>]+>/g, '');
  const journal = w['container-title']?.[0] || '';
  const year    = w.published?.['date-parts']?.[0]?.[0] || '';
  const volume  = w.volume || '';
  const issue   = w.issue || '';
  const pages   = w.page || '';

  let ref = authorStr ? `${authorStr}. ` : '';
  ref += title ? `${title}. ` : '';
  ref += journal ? `<em>${journal}</em>. ` : '';
  ref += year ? String(year) : '';
  if (volume) ref += `;${volume}`;
  if (issue)  ref += `(${issue})`;
  if (pages)  ref += `:${pages}`;
  if (year || volume || pages) ref += '.';
  return ref;
}

export default function RichTextEditor({ value, onChange, placeholder="", minHeight=110, isDeepDive=false }) {
  const editorRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({});
  const [showDoiCite,  setShowDoiCite]  = useState(false);
  const [citeDoiInput, setCiteDoiInput] = useState('');
  const [citeFetching, setCiteFetching] = useState(false);
  const [citeError,    setCiteError]    = useState('');
  const [citations,    setCitations]    = useState([]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, []); // eslint-disable-line

  const exec = (cmd, val=null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncContent();
    updateActiveFormats();
  };

  const syncContent = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  const updateActiveFormats = () => {
    setActiveFormats({
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul:        document.queryCommandState('insertUnorderedList'),
      ol:        document.queryCommandState('insertOrderedList'),
    });
  };

  // Toggle blockquote: detect if cursor is inside one and unwrap if so
  const toggleBlockquote = () => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (sel?.rangeCount) {
      let node = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      let bq = node;
      while (bq && bq !== editorRef.current) {
        if (bq.tagName === 'BLOCKQUOTE') break;
        bq = bq.parentElement;
      }
      if (bq && bq.tagName === 'BLOCKQUOTE' && editorRef.current?.contains(bq)) {
        // Unwrap: move all children out before the blockquote, then remove it
        const parent = bq.parentNode;
        while (bq.firstChild) parent.insertBefore(bq.firstChild, bq);
        parent.removeChild(bq);
        syncContent();
        return;
      }
    }
    exec('formatBlock', 'blockquote');
  };

  const insertDivider = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false,
      '<hr/><p><br></p>'
    );
    syncContent();
  };

  // Rebuild the references section at the bottom of the editor
  const rebuildRefs = (cits) => {
    if (!editorRef.current) return;
    const existing = editorRef.current.querySelector('[data-luminary-refs]');
    if (existing) existing.remove();
    if (cits.length === 0) { syncContent(); return; }

    const refDiv = document.createElement('div');
    refDiv.setAttribute('data-luminary-refs', '1');
    refDiv.innerHTML =
      `<hr/>` +
      `<p><strong>References</strong></p>` +
      cits.map(c =>
        `<p>${c.n}. ${c.text} ` +
        `<a href="${c.url}" target="_blank" rel="noopener noreferrer">doi:${c.doi}</a></p>`
      ).join('');

    editorRef.current.appendChild(refDiv);
    syncContent();
  };

  const insertCitation = async () => {
    if (!citeDoiInput.trim()) return;
    const rawDoi = citeDoiInput.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    setCiteFetching(true);
    setCiteError('');
    try {
      const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`);
      if (!resp.ok) throw new Error('not found');
      const { message: w } = await resp.json();

      const N      = citations.length + 1;
      const doiUrl = `https://doi.org/${rawDoi}`;
      const text   = buildVancouverRef(w);
      const updated = [...citations, { n: N, doi: rawDoi, url: doiUrl, text }];

      // Insert inline superscript at cursor
      editorRef.current?.focus();
      document.execCommand('insertHTML', false,
        `<sup><a href="${doiUrl}" target="_blank" rel="noopener noreferrer" ` +
        `style="color:#6c63ff;text-decoration:none;font-weight:700;">(${N})</a></sup>`
      );

      setCitations(updated);
      rebuildRefs(updated);
      setShowDoiCite(false);
      setCiteDoiInput('');
    } catch {
      setCiteError('DOI not found. Try e.g. 10.1038/s41586-021-03819-2');
    }
    setCiteFetching(false);
  };

  const linkifyPlain = (text) => {
    const urlRe = /(https?:\/\/[^\s<>"']+)/g;
    if (!urlRe.test(text)) return null;
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/(https?:\/\/[^\s<>"']+)/g,
        url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
      .replace(/\n/g,'<br>');
  };

  const handlePaste = e => {
    e.preventDefault();
    const html  = e.clipboardData.getData('text/html');
    const plain = e.clipboardData.getData('text/plain');
    if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = sanitiseHtml(html);
      document.execCommand('insertHTML', false, tmp.innerHTML);
    } else {
      const linked = linkifyPlain(plain);
      if (linked) document.execCommand('insertHTML', false, linked);
      else         document.execCommand('insertText', false, plain);
    }
    syncContent();
  };

  const handleKeyDown = e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
    const textBefore = range.startContainer.textContent.slice(0, range.startOffset);
    const match = textBefore.match(/(https?:\/\/\S+)$/);
    if (!match) return;
    const url = match[1];
    e.preventDefault();
    const urlRange = range.cloneRange();
    urlRange.setStart(range.startContainer, range.startOffset - url.length);
    urlRange.setEnd(range.startContainer, range.startOffset);
    sel.removeAllRanges();
    sel.addRange(urlRange);
    const suffix = e.key === 'Enter' ? '' : ' ';
    document.execCommand('insertHTML', false,
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${suffix}`);
    if (e.key === 'Enter') document.execCommand('insertParagraph', false);
    syncContent();
  };

  const toolbarGroups = [
    [
      { label:"B",  title:"Bold (⌘B)",    cmd:"bold" },
      { label:"I",  title:"Italic (⌘I)",  cmd:"italic",    style:{fontStyle:"italic"} },
      { label:"U",  title:"Underline",     cmd:"underline", style:{textDecoration:"underline"} },
    ],
    [
      { label:"H2", title:"Heading",      cmd:"formatBlock", val:"h2" },
      { label:"H3", title:"Subheading",   cmd:"formatBlock", val:"h3" },
      { label:"¶",  title:"Paragraph",    cmd:"formatBlock", val:"p" },
    ],
    [
      { label:"• List",  title:"Bullet list",   cmd:"insertUnorderedList" },
      { label:"1. List", title:"Numbered list",  cmd:"insertOrderedList" },
    ],
  ];

  return (
    <div style={{flex:1, position:'relative'}}>
      <div style={{
        display:"flex", alignItems:"center", gap:2, flexWrap:"wrap",
        padding:"5px 8px", background:T.s2,
        border:`1.5px solid ${isDeepDive ? T.v : T.bdr}`, borderBottom:"none",
        borderRadius:"10px 10px 0 0",
      }}>
        {toolbarGroups.map((grp, gi) => (
          <div key={gi} style={{display:"flex", alignItems:"center", gap:1}}>
            {gi>0 && <div style={{width:1, height:16, background:T.bdr, margin:"0 4px"}}/>}
            {grp.map(b => (
              <TBtn key={b.cmd+(b.val||'')}
                label={<span style={b.style||{}}>{b.label}</span>}
                title={b.title}
                active={
                  b.cmd==='bold'?activeFormats.bold :
                  b.cmd==='italic'?activeFormats.italic :
                  b.cmd==='underline'?activeFormats.underline :
                  b.cmd==='insertUnorderedList'?activeFormats.ul :
                  b.cmd==='insertOrderedList'?activeFormats.ol : false
                }
                onClick={()=>exec(b.cmd, b.val||null)}/>
            ))}
          </div>
        ))}

        {isDeepDive && (
          <>
            <div style={{width:1, height:18, background:T.bdr, margin:'0 4px'}}/>
            <TBtn label="❝" title="Blockquote — click again to remove" onClick={toggleBlockquote}/>
            <TBtn label="─" title="Horizontal divider" onClick={insertDivider}/>
            <TBtn label="📄 Cite" title="Cite a paper by DOI — inserts (N) with reference list" onClick={() => setShowDoiCite(s => !s)}/>
          </>
        )}

        <div style={{marginLeft:"auto", fontSize:10.5, color:T.mu, paddingRight:4}}>
          {isDeepDive
            ? <span style={{background:T.v, color:'#fff', fontWeight:700, fontSize:10, padding:'2px 8px', borderRadius:20}}>🔬 Deep Dive</span>
            : '⌘B · ⌘I'
          }
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncContent}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        {...(isDeepDive ? {'data-deep-dive': 'true'} : {})}
        style={{
          minHeight: isDeepDive ? 220 : minHeight,
          padding: isDeepDive ? '14px 16px' : '12px 15px',
          background: isDeepDive ? '#fafafe' : T.w,
          border: `1.5px solid ${isDeepDive ? T.v : T.bdr}`,
          borderTop: "none",
          borderRadius: "0 0 10px 10px",
          fontSize: isDeepDive ? 15 : 13,
          fontFamily: "inherit",
          lineHeight: isDeepDive ? 1.7 : 1.75,
          color: T.text,
          outline: "none",
          overflowY: "auto",
          cursor: "text",
        }}
      />

      {/* DOI citation popover */}
      {showDoiCite && (
        <div style={{
          position: 'absolute', zIndex: 100, top: 42, right: 0,
          background: T.w, border: `1.5px solid ${T.v}`,
          borderRadius: 10, padding: 12, boxShadow: '0 4px 20px rgba(0,0,0,.12)',
          width: 320,
        }}>
          <div style={{fontSize: 12.5, fontWeight: 700, marginBottom: 2}}>Cite a paper</div>
          <div style={{fontSize: 11.5, color: T.mu, marginBottom: 8}}>
            Inserts <strong>(N)</strong> at cursor and adds a numbered reference at the bottom.
          </div>
          <div style={{display: 'flex', gap: 6}}>
            <input
              autoFocus
              value={citeDoiInput}
              onChange={e => setCiteDoiInput(e.target.value)}
              placeholder="10.1038/s41586-021-03819-2"
              onKeyDown={e => e.key === 'Enter' && insertCitation()}
              style={{
                flex: 1, fontSize: 12.5, padding: '6px 10px',
                border: `1.5px solid ${T.bdr}`, borderRadius: 7,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <Btn onClick={insertCitation} disabled={citeFetching}>
              {citeFetching ? '...' : 'Cite'}
            </Btn>
          </div>
          {citeError && (
            <div style={{fontSize: 11.5, color: T.ro, marginTop: 4}}>{citeError}</div>
          )}
          <button onClick={() => { setShowDoiCite(false); setCiteDoiInput(''); setCiteError(''); }}
            style={{fontSize: 11, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', marginTop: 4, fontFamily: 'inherit'}}>
            Cancel
          </button>
        </div>
      )}

      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: ${T.mu};
          pointer-events: none;
          display: block;
        }
        [contenteditable] h2 { font-size:17px; font-weight:700; margin:10px 0 5px; line-height:1.3; font-family:'DM Serif Display',serif; }
        [contenteditable] h3 { font-size:14.5px; font-weight:700; margin:8px 0 4px; line-height:1.3; }
        [contenteditable] p  { margin:3px 0; }
        [contenteditable] ul { list-style-type:disc !important; padding-left:22px !important; margin:6px 0; }
        [contenteditable] ol { list-style-type:decimal !important; padding-left:22px !important; margin:6px 0; }
        [contenteditable] li { display:list-item !important; margin:3px 0; }
        [contenteditable] a  { color:${T.v}; text-decoration:underline; }
        [data-deep-dive] blockquote {
          border-left: 3px solid #6c63ff;
          margin: 12px 0; padding: 8px 14px;
          background: #f0effe; border-radius: 0 8px 8px 0;
          font-style: italic; color: #555;
        }
        [data-deep-dive] hr { border:none; border-top:1px solid #e5e7eb; margin:16px 0; }
        [data-deep-dive] sup a { color:#6c63ff; text-decoration:none; font-weight:700; }
        [data-luminary-refs] p { font-size:12px; color:#555; line-height:1.6; margin:3px 0; }
        [data-luminary-refs] hr { border:none; border-top:1px solid #e5e7eb; margin:16px 0 10px; }
      `}</style>
    </div>
  );
}
