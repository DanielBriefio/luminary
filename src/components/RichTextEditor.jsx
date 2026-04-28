import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { sanitiseHtml, normalisePastedHtml, toEmbedUrl } from '../lib/htmlUtils';
import { checkRemainingQuota } from '../lib/storageQuota';
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

// Inline image upload: writes to post-files. Returns { url, path }.
async function uploadInlineImage(user, file) {
  const ext  = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${user.id}/inline-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('post-files')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data:{ publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
  return { url: publicUrl, path: data.path };
}

export default function RichTextEditor({
  value, onChange, placeholder="", minHeight=110, isDeepDive=false,
  user, postId, onPendingImage,
}) {
  const editorRef      = useRef(null);
  const fileInputRef   = useRef(null);
  const savedRangeRef  = useRef(null); // saved cursor position before popover opens
  const [activeFormats, setActiveFormats] = useState({});
  const [activeBlock,   setActiveBlock]   = useState('p');
  const [showDoiCite,  setShowDoiCite]  = useState(false);
  const [citeDoiInput, setCiteDoiInput] = useState('');
  const [citeFetching, setCiteFetching] = useState(false);
  const [citeError,    setCiteError]    = useState('');
  const [citations,    setCitations]    = useState([]);
  const [showLink,     setShowLink]     = useState(false);
  const [linkUrl,      setLinkUrl]      = useState('');
  const [showVideo,    setShowVideo]    = useState(false);
  const [videoUrl,     setVideoUrl]     = useState('');
  const [videoError,   setVideoError]   = useState('');
  const [imgUploading, setImgUploading] = useState(false);

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
    const block = (document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
    setActiveBlock(['h1','h2','h3','h4','blockquote'].includes(block) ? block : 'p');
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
    document.execCommand('insertHTML', false, '<hr/><p><br></p>');
    syncContent();
  };

  // Save cursor position before popover steals focus, restore before insert
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    }
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

      editorRef.current?.focus();
      restoreSelection();
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

  const insertLink = () => {
    if (!linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url) && !url.startsWith('mailto:')) url = `https://${url}`;
    editorRef.current?.focus();
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;
    if (hasSelection) {
      document.execCommand('createLink', false, url);
      // execCommand createLink doesn't add target/rel — sanitiser will do that on save
    } else {
      document.execCommand('insertHTML', false,
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    }
    syncContent();
    setShowLink(false);
    setLinkUrl('');
  };

  const insertImageFromFile = async (file) => {
    if (!user) { alert('Sign-in required to upload images.'); return; }
    if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image is too large (max 5 MB).'); return; }
    const quotaErr = await checkRemainingQuota(file.size);
    if (quotaErr) { alert(quotaErr); return; }
    setImgUploading(true);
    try {
      const { url, path } = await uploadInlineImage(user, file);
      editorRef.current?.focus();
      restoreSelection();
      document.execCommand('insertHTML', false,
        `<img src="${url}" alt="" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;" />`);
      syncContent();

      // Storage tracking — record now if we know the post id, otherwise
      // hand off to the parent to flush after the post insert.
      if (postId) {
        supabase.rpc('record_storage_file', {
          p_bucket:      'post-files',
          p_path:        path,
          p_size_bytes:  file.size,
          p_mime_type:   file.type || 'image/jpeg',
          p_file_name:   file.name,
          p_source_kind: 'post',
          p_source_id:   postId,
        }).then(() => {}, () => {});
      } else if (onPendingImage) {
        onPendingImage({
          bucket: 'post-files',
          path,
          size:   file.size,
          mime:   file.type || 'image/jpeg',
          name:   file.name,
        });
      }
    } catch (e) {
      alert('Upload failed: ' + (e.message || 'unknown error'));
    }
    setImgUploading(false);
  };

  const insertVideo = () => {
    setVideoError('');
    const embed = toEmbedUrl(videoUrl);
    if (!embed) {
      setVideoError('Use a YouTube or Vimeo URL.');
      return;
    }
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand('insertHTML', false,
      `<iframe src="${embed}" frameborder="0" ` +
      `allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen ` +
      `style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px;margin:8px 0;display:block;"></iframe><p><br></p>`);
    syncContent();
    setShowVideo(false);
    setVideoUrl('');
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
      // Two-step: normalise style-encoded formatting (Word/Docs/web)
      // into semantic tags, then sanitise to the allow-list.
      const cleaned = sanitiseHtml(normalisePastedHtml(html));
      document.execCommand('insertHTML', false, cleaned);
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

  const inlineGroups = [
    [
      { label:"B",  title:"Bold (⌘B)",    cmd:"bold" },
      { label:"I",  title:"Italic (⌘I)",  cmd:"italic",    style:{fontStyle:"italic"} },
      { label:"U",  title:"Underline",     cmd:"underline", style:{textDecoration:"underline"} },
    ],
    [
      { label:"• List",  title:"Bullet list",   cmd:"insertUnorderedList" },
      { label:"1. List", title:"Numbered list",  cmd:"insertOrderedList" },
    ],
  ];

  const blockOptions = isDeepDive
    ? [
        { value:'p',  label:'Paragraph' },
        { value:'h1', label:'Heading 1' },
        { value:'h2', label:'Heading 2' },
        { value:'h3', label:'Heading 3' },
        { value:'h4', label:'Heading 4' },
      ]
    : [
        { value:'p',  label:'Paragraph' },
        { value:'h2', label:'Heading' },
        { value:'h3', label:'Subheading' },
      ];

  return (
    <div style={{flex:1, position:'relative'}}>
      <div style={{
        display:"flex", alignItems:"center", gap:2, flexWrap:"wrap",
        padding:"5px 8px", background:T.s2,
        border:`1.5px solid ${isDeepDive ? T.v : T.bdr}`, borderBottom:"none",
        borderRadius:"10px 10px 0 0",
        position: isDeepDive ? 'sticky' : 'static',
        top: isDeepDive ? 0 : 'auto',
        zIndex: isDeepDive ? 20 : 'auto',
      }}>
        {/* Style dropdown */}
        <select
          value={activeBlock}
          onChange={e => exec('formatBlock', e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          style={{
            fontSize:12, fontFamily:'inherit', fontWeight:600,
            color:T.text, background:'transparent',
            border:`1px solid ${T.bdr}`, borderRadius:6,
            padding:'3px 6px', cursor:'pointer', outline:'none',
            marginRight:4,
          }}
          title="Block style"
        >
          {blockOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {inlineGroups.map((grp, gi) => (
          <div key={gi} style={{display:"flex", alignItems:"center", gap:1}}>
            {gi>0 && <div style={{width:1, height:16, background:T.bdr, margin:"0 4px"}}/>}
            {grp.map(b => (
              <TBtn key={b.cmd}
                label={<span style={b.style||{}}>{b.label}</span>}
                title={b.title}
                active={
                  b.cmd==='bold'?activeFormats.bold :
                  b.cmd==='italic'?activeFormats.italic :
                  b.cmd==='underline'?activeFormats.underline :
                  b.cmd==='insertUnorderedList'?activeFormats.ul :
                  b.cmd==='insertOrderedList'?activeFormats.ol : false
                }
                onClick={()=>exec(b.cmd)}/>
            ))}
          </div>
        ))}

        <div style={{width:1, height:16, background:T.bdr, margin:"0 4px"}}/>
        <TBtn label="🔗" title="Insert link"
          onClick={() => { saveSelection(); setShowLink(s => !s); setLinkUrl(''); }}/>

        {isDeepDive && (
          <>
            <TBtn label={imgUploading ? "…" : "🖼️"} title="Insert image"
              onClick={() => { saveSelection(); fileInputRef.current?.click(); }}/>
            <TBtn label="▶" title="Embed YouTube / Vimeo"
              onClick={() => { saveSelection(); setShowVideo(s => !s); setVideoError(''); setVideoUrl(''); }}/>
            <div style={{width:1, height:18, background:T.bdr, margin:'0 4px'}}/>
            <TBtn label="❝" title="Blockquote — click again to remove" onClick={toggleBlockquote}/>
            <TBtn label="─" title="Horizontal divider" onClick={insertDivider}/>
            <TBtn label="📄 Cite" title="Cite a paper by DOI — inserts (N) with reference list"
              onClick={() => { saveSelection(); setShowDoiCite(s => !s); }}/>
          </>
        )}

        <div style={{marginLeft:"auto", fontSize:10.5, color:T.mu, paddingRight:4}}>
          {isDeepDive
            ? <span style={{background:T.v, color:'#fff', fontWeight:700, fontSize:10, padding:'2px 8px', borderRadius:20}}>🔬 Deep Dive</span>
            : '⌘B · ⌘I'
          }
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{display:'none'}}
        onChange={e => { const f = e.target.files?.[0]; if (f) insertImageFromFile(f); e.target.value = ''; }}
      />

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
          minHeight: isDeepDive ? 320 : minHeight,
          padding: isDeepDive ? '24px 28px' : '12px 15px',
          background: isDeepDive ? T.w : T.w,
          border: `1.5px solid ${isDeepDive ? T.v : T.bdr}`,
          borderTop: "none",
          borderRadius: "0 0 10px 10px",
          fontSize: isDeepDive ? 20 : 13,
          fontFamily: isDeepDive
            ? "'Source Serif 4', 'Source Serif Pro', Georgia, serif"
            : "inherit",
          lineHeight: isDeepDive ? 1.7 : 1.75,
          color: T.text,
          outline: "none",
          overflowY: "auto",
          cursor: "text",
        }}
      />

      {/* Link popover */}
      {showLink && (
        <div style={{
          position:'absolute', zIndex:100, top:42, left:8,
          background:T.w, border:`1.5px solid ${T.v}`,
          borderRadius:10, padding:12, boxShadow:'0 4px 20px rgba(0,0,0,.12)',
          width:320,
        }}>
          <div style={{fontSize:12.5, fontWeight:700, marginBottom:6}}>Insert link</div>
          <div style={{display:'flex', gap:6}}>
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={e => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') { setShowLink(false); setLinkUrl(''); } }}
              style={{
                flex:1, fontSize:12.5, padding:'6px 10px',
                border:`1.5px solid ${T.bdr}`, borderRadius:7,
                fontFamily:'inherit', outline:'none',
              }}
            />
            <Btn onClick={insertLink}>Add</Btn>
          </div>
          <button onClick={() => { setShowLink(false); setLinkUrl(''); }}
            style={{fontSize:11, color:T.mu, border:'none', background:'transparent', cursor:'pointer', marginTop:4, fontFamily:'inherit'}}>
            Cancel
          </button>
        </div>
      )}

      {/* Video embed popover */}
      {showVideo && (
        <div style={{
          position:'absolute', zIndex:100, top:42, left:8,
          background:T.w, border:`1.5px solid ${T.v}`,
          borderRadius:10, padding:12, boxShadow:'0 4px 20px rgba(0,0,0,.12)',
          width:340,
        }}>
          <div style={{fontSize:12.5, fontWeight:700, marginBottom:2}}>Embed video</div>
          <div style={{fontSize:11.5, color:T.mu, marginBottom:8}}>
            Paste a YouTube or Vimeo URL.
          </div>
          <div style={{display:'flex', gap:6}}>
            <input
              autoFocus
              value={videoUrl}
              onChange={e => { setVideoUrl(e.target.value); setVideoError(''); }}
              placeholder="https://youtu.be/… or https://vimeo.com/…"
              onKeyDown={e => { if (e.key === 'Enter') insertVideo(); if (e.key === 'Escape') { setShowVideo(false); setVideoUrl(''); setVideoError(''); } }}
              style={{
                flex:1, fontSize:12.5, padding:'6px 10px',
                border:`1.5px solid ${T.bdr}`, borderRadius:7,
                fontFamily:'inherit', outline:'none',
              }}
            />
            <Btn onClick={insertVideo}>Embed</Btn>
          </div>
          {videoError && (
            <div style={{fontSize:11.5, color:T.ro, marginTop:4}}>{videoError}</div>
          )}
          <button onClick={() => { setShowVideo(false); setVideoUrl(''); setVideoError(''); }}
            style={{fontSize:11, color:T.mu, border:'none', background:'transparent', cursor:'pointer', marginTop:4, fontFamily:'inherit'}}>
            Cancel
          </button>
        </div>
      )}

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
        [contenteditable]:not([data-deep-dive]) h2 { font-size:17px; font-weight:700; margin:10px 0 5px; line-height:1.3; font-family:'DM Serif Display',serif; }
        [contenteditable]:not([data-deep-dive]) h3 { font-size:14.5px; font-weight:700; margin:8px 0 4px; line-height:1.3; }
        [contenteditable]:not([data-deep-dive]) p  { margin:3px 0; }
        [contenteditable]:not([data-deep-dive]) ul { list-style-type:disc !important; padding-left:22px !important; margin:6px 0; }
        [contenteditable]:not([data-deep-dive]) ol { list-style-type:decimal !important; padding-left:22px !important; margin:6px 0; }
        [contenteditable]:not([data-deep-dive]) li { display:list-item !important; margin:3px 0; }

        [data-deep-dive] { font-family:'Source Serif 4', 'Source Serif Pro', Georgia, serif; }
        [data-deep-dive] p  { margin:0 0 22px; }
        [data-deep-dive] h1 { font-family:'DM Serif Display',serif; font-size:32px; font-weight:400; line-height:1.25; margin:32px 0 14px; color:${T.text}; }
        [data-deep-dive] h2 { font-family:'DM Serif Display',serif; font-size:26px; font-weight:400; line-height:1.3; margin:30px 0 12px; color:${T.text}; }
        [data-deep-dive] h3 { font-family:'DM Sans',sans-serif; font-size:20px; font-weight:700; margin:24px 0 8px; color:${T.text}; }
        [data-deep-dive] h4 { font-family:'DM Sans',sans-serif; font-size:17px; font-weight:700; margin:20px 0 6px; color:${T.text}; }
        [data-deep-dive] ul { list-style-type:disc !important; padding-left:26px !important; margin:0 0 22px; }
        [data-deep-dive] ol { list-style-type:decimal !important; padding-left:26px !important; margin:0 0 22px; }
        [data-deep-dive] li { display:list-item !important; margin:6px 0; }
        [data-deep-dive] img { max-width:100%; height:auto; border-radius:8px; margin:20px 0; display:block; }
        [data-deep-dive] iframe { max-width:100%; width:100%; aspect-ratio:16/9; border:0; border-radius:8px; margin:20px 0; display:block; }
        [data-deep-dive] a  { color:${T.v}; text-decoration:underline; }
        [data-deep-dive] blockquote {
          border-left: 3px solid ${T.v};
          margin: 24px 0; padding: 4px 0 4px 20px;
          font-style: italic; color: ${T.mu};
        }
        [data-deep-dive] hr { border:none; border-top:1px solid ${T.bdr}; margin:24px 0; }
        [data-deep-dive] sup a { color:${T.v}; text-decoration:none; font-weight:700; }

        [contenteditable] a  { color:${T.v}; text-decoration:underline; }
        [data-luminary-refs] p { font-size:14px; color:${T.mu}; line-height:1.6; margin:6px 0; font-family:'DM Sans',sans-serif; }
        [data-luminary-refs] hr { border:none; border-top:1px solid ${T.bdr}; margin:24px 0 12px; }
      `}</style>
    </div>
  );
}
