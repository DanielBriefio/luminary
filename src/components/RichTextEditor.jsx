import { useState, useEffect, useRef } from 'react';
import { T } from '../lib/constants';
import { sanitiseHtml } from '../lib/htmlUtils';

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

export default function RichTextEditor({ value, onChange, placeholder="", minHeight=110 }) {
  const editorRef = useRef(null);
  const [activeFormats, setActiveFormats] = useState({});

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

  const linkifyPlain = (text) => {
    const urlRe = /(https?:\/\/[^\s<>"']+)/g;
    if (!urlRe.test(text)) return null; // no URLs — use plain insertText
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
    <div style={{flex:1}}>
      <div style={{
        display:"flex", alignItems:"center", gap:2, flexWrap:"wrap",
        padding:"5px 8px", background:T.s2,
        border:`1.5px solid ${T.bdr}`, borderBottom:"none",
        borderRadius:"10px 10px 0 0",
      }}>
        {toolbarGroups.map((grp, gi) => (
          <div key={gi} style={{display:"flex", alignItems:"center", gap:1}}>
            {gi>0 && <div style={{width:1, height:16, background:T.bdr, margin:"0 4px"}}/>}
            {grp.map(b => (
              <TBtn key={b.cmd+b.val}
                label={<span style={b.style||{}}>{b.label}</span>}
                title={b.title}
                active={b.cmd==='bold'?activeFormats.bold : b.cmd==='italic'?activeFormats.italic : b.cmd==='underline'?activeFormats.underline : b.cmd==='insertUnorderedList'?activeFormats.ul : b.cmd==='insertOrderedList'?activeFormats.ol : false}
                onClick={()=>exec(b.cmd, b.val||null)}/>
            ))}
          </div>
        ))}
        <div style={{marginLeft:"auto", fontSize:10.5, color:T.mu, paddingRight:4}}>
          ⌘B · ⌘I
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
        style={{
          minHeight, padding:"12px 15px",
          background:T.w,
          border:`1.5px solid ${T.bdr}`, borderTop:"none",
          borderRadius:"0 0 10px 10px",
          fontSize:13, fontFamily:"inherit",
          lineHeight:1.75, color:T.text,
          outline:"none", overflowY:"auto",
          cursor:"text",
        }}
      />
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
      `}</style>
    </div>
  );
}
