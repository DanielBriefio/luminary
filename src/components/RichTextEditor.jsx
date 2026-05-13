import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  user, postId, onPendingImage, toolbarPortalTarget=null,
}) {
  // When a toolbarPortalTarget DOM node is provided, the toolbar
  // (and its popovers) render via React portal into that node — a
  // header-bar slot that PostComposer mounts ABOVE its scroll
  // container. Used for all modes (text/paper/deepdive) so the
  // toolbar sits in the same place regardless of post type. Pulling
  // it out of the editor wrapper also avoids the sticky+contenteditable
  // stacking bug that used to let scrolled body text paint over the
  // toolbar.
  const shouldPortal = !!toolbarPortalTarget;
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
  const [imgToolbar,   setImgToolbar]   = useState(null);
    // { el, size, top, left } — the currently selected inline image and
    // the position to place the resize toolbar at. Cleared on outside click.

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
    // Hydrate the citations array from any References block already in the
    // initial HTML — without this, opening an existing deep dive leaves
    // `citations` empty and the auto-delete-on-marker-remove path can't
    // find the matching ref to drop.
    if (editorRef.current) {
      const refsBlock = editorRef.current.querySelector('[data-luminary-refs]');
      if (refsBlock) {
        const cits = [];
        refsBlock.querySelectorAll(':scope > p').forEach(p => {
          // Skip the "References" header paragraph.
          const txt = p.textContent.trim();
          if (/^references$/i.test(txt)) return;
          const a = p.querySelector('a[href*="doi.org"]');
          if (!a) return;
          const url = a.getAttribute('href') || '';
          const doi = url.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
          // Citation text is everything between "N. " and the trailing
          // "doi:xxx" link text.
          const text = txt
            .replace(/^\s*\d+\.\s*/, '')
            .replace(/\s*doi:\S+\s*$/i, '')
            .trim();
          cits.push({ n: cits.length + 1, doi, url, text });
        });
        if (cits.length) setCitations(cits);
      }
    }
  }, []); // eslint-disable-line

  // Close the image toolbar on outside clicks / scroll / Escape.
  useEffect(() => {
    if (!imgToolbar) return;
    const onDoc = (e) => {
      if (e.target.tagName === 'IMG') return;            // image click handled by editor handler
      if (e.target.closest('[data-img-toolbar]')) return; // toolbar click
      setImgToolbar(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setImgToolbar(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [imgToolbar]);

  // Snap the cursor-driven width to common landmarks (25/50/75/100) when
  // within 3% — gives the drag a slight detent for the most common sizes
  // without taking away free-form precision elsewhere.
  const snapWidth = (raw) => {
    const clamped = Math.max(10, Math.min(100, Math.round(raw)));
    for (const target of [25, 50, 75, 100]) {
      if (Math.abs(clamped - target) <= 3) return target;
    }
    return clamped;
  };

  // Read the currently rendered width % from an image element, regardless
  // of whether it was set via data-width, the legacy data-size, or
  // neither (default = full). Used to seed the drag start state.
  const readImgWidth = (img) => {
    const w = parseInt(img.getAttribute('data-width') || '', 10);
    if (Number.isFinite(w) && w >= 10 && w <= 100) return w;
    const size = img.getAttribute('data-size') || '';
    if (size === 'small')  return 25;
    if (size === 'medium') return 50;
    if (size === 'large')  return 75;
    return 100;
  };

  // Find/return the parent <figure data-luminary-fig> for an <img>, or
  // null if the image is unwrapped (legacy). Used to find the figcaption
  // sibling for caption editing and to position the resize handles.
  const findFigure = (img) => {
    let el = img.parentElement;
    while (el && el !== editorRef.current) {
      if (el.tagName === 'FIGURE' && el.getAttribute('data-luminary-fig') === '1') return el;
      el = el.parentElement;
    }
    return null;
  };

  // Lazily wrap an unwrapped <img> in a <figure data-luminary-fig> so
  // captions can be added to images inserted before the figure-wrap
  // change shipped. Returns the figure (existing or new).
  const ensureFigure = (img) => {
    const existing = findFigure(img);
    if (existing) return existing;
    const fig = document.createElement('figure');
    fig.setAttribute('data-luminary-fig', '1');
    img.replaceWith(fig);
    fig.appendChild(img);
    const cap = document.createElement('figcaption');
    fig.appendChild(cap);
    return fig;
  };

  // Recompute toolbar/handle layout from the currently selected image.
  // Pulled out so it can run on click, after a drag, after a resize-window
  // event, or after a scroll.
  const measureImg = (img) => {
    const editor = editorRef.current;
    if (!editor || !img.isConnected) return null;
    const editorRect = editor.getBoundingClientRect();
    const imgRect    = img.getBoundingClientRect();
    return {
      top:    imgRect.top    - editorRect.top,
      left:   imgRect.left   - editorRect.left,
      width:  imgRect.width,
      height: imgRect.height,
    };
  };

  // Position the toolbar + handles when an image is clicked.
  const handleEditorClick = (e) => {
    if (!isDeepDive) return;
    if (e.target.tagName !== 'IMG') {
      // Caption click? Don't dismiss the toolbar — let the caption keep focus.
      const fc = e.target.closest?.('figcaption');
      if (fc && fc.parentElement?.getAttribute('data-luminary-fig') === '1') return;
      setImgToolbar(null);
      return;
    }
    const img = e.target;
    ensureFigure(img);
    const m = measureImg(img);
    if (!m) return;
    setImgToolbar({
      el:    img,
      width: readImgWidth(img),
      ...m,
    });
  };

  // Apply a new width %. Also strips inline style and the legacy
  // data-size attribute so the new selector wins cleanly.
  const setImageWidth = (next) => {
    if (!imgToolbar?.el) return;
    const w = snapWidth(next);
    imgToolbar.el.setAttribute('data-width', String(w));
    imgToolbar.el.removeAttribute('data-size');
    imgToolbar.el.removeAttribute('style');
    // Re-measure on the next frame so the handle positions track the
    // image as it visibly resizes (CSS applies on the same frame).
    requestAnimationFrame(() => {
      const m = imgToolbar.el && measureImg(imgToolbar.el);
      if (m) setImgToolbar(t => (t ? { ...t, width: w, ...m } : t));
    });
  };

  // Drag start: capture pointer X and the image's starting width%.
  // Both handles drag symmetrically — the image stays centred.
  const beginResize = (e, side) => {
    if (!imgToolbar?.el) return;
    e.preventDefault();
    e.stopPropagation();
    const editor = editorRef.current;
    if (!editor) return;
    const editorWidth = editor.getBoundingClientRect().width;
    const startX  = e.clientX;
    const startW  = readImgWidth(imgToolbar.el);
    const sign    = side === 'right' ? 1 : -1; // dragging right side right = wider; left side left = wider

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      // Each handle moves at half-rate vs. the underlying width because
      // the image is centred — dragging right edge right by Xpx grows the
      // image by 2*X total (Xpx on each side).
      const deltaPct = (sign * dx * 2 * 100) / editorWidth;
      setImageWidth(startW + deltaPct);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      syncContent();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const removeImage = () => {
    if (!imgToolbar?.el) return;
    const fig = findFigure(imgToolbar.el);
    if (fig) fig.remove();
    else     imgToolbar.el.remove();
    setImgToolbar(null);
    syncContent();
  };

  // Focus the figcaption associated with the selected image so the user
  // can start typing a caption immediately. Wraps a legacy unwrapped
  // <img> in a figure if needed.
  const focusCaption = () => {
    if (!imgToolbar?.el) return;
    const fig = ensureFigure(imgToolbar.el);
    let cap = fig.querySelector(':scope > figcaption');
    if (!cap) {
      cap = document.createElement('figcaption');
      fig.appendChild(cap);
    }
    cap.setAttribute('contenteditable', 'true');
    cap.setAttribute('data-placeholder', 'Add a caption…');
    // Move the cursor into the caption.
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(cap);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    cap.focus();
    syncContent();
  };

  // Keep figcaptions inside our figures contenteditable while the editor
  // is mounted so they accept typing without an explicit click. Done in
  // an effect so it survives content updates.
  useEffect(() => {
    if (!isDeepDive || !editorRef.current) return;
    const annotate = () => {
      editorRef.current?.querySelectorAll('figure[data-luminary-fig] > figcaption').forEach(cap => {
        cap.setAttribute('contenteditable', 'true');
        cap.setAttribute('data-placeholder', 'Add a caption…');
      });
    };
    annotate();
    const obs = new MutationObserver(annotate);
    obs.observe(editorRef.current, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [isDeepDive]);

  // Reposition handles on window resize / scroll while a toolbar is open.
  useEffect(() => {
    if (!imgToolbar?.el) return;
    const reflow = () => {
      const m = imgToolbar.el && measureImg(imgToolbar.el);
      if (m) setImgToolbar(t => (t ? { ...t, ...m } : t));
    };
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [imgToolbar?.el]);

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

  // Walk up the ancestor chain to find the element that actually scrolls
  // — could be the editor div itself (overflowY:auto) or PostComposer's
  // outer scroll wrapper depending on content length.
  const findScrollableAncestor = (el) => {
    let n = el;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
      n = n.parentElement;
    }
    return null;
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

  // Read the DOIs currently referenced by <sup><a> markers in the body
  // (excluding anything inside the References block itself). Order is
  // document order, first occurrence wins — so renumbering matches the
  // reading order, not insertion order.
  const readBodyCitationDois = () => {
    if (!editorRef.current) return [];
    const refsBlock = editorRef.current.querySelector('[data-luminary-refs]');
    const seen = new Set();
    const out = [];
    editorRef.current.querySelectorAll('sup').forEach(sup => {
      if (refsBlock && refsBlock.contains(sup)) return;
      const a = sup.querySelector('a[href*="doi.org"]');
      if (!a) return;
      const url = a.getAttribute('href') || '';
      const doi = url.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      if (!doi || seen.has(doi)) return;
      seen.add(doi);
      out.push(doi);
    });
    return out;
  };

  // When the user deletes a citation marker in the body (backspace through
  // the (N) sup, or any other edit that removes it), drop the matching
  // entry from `citations`, renumber the remaining markers + refs
  // sequentially in reading order, and rebuild the refs block. No-op
  // when the marker set hasn't changed (cheap on every keystroke).
  const syncCitationsFromBody = () => {
    if (!editorRef.current || citations.length === 0) return;
    const orderedDois = readBodyCitationDois();
    const sameLen = orderedDois.length === citations.length;
    const sameOrder = sameLen && orderedDois.every((d, i) => d === citations[i].doi);
    if (sameOrder) return;

    const byDoi = Object.fromEntries(citations.map(c => [c.doi, c]));
    const next = orderedDois
      .map(doi => byDoi[doi])
      .filter(Boolean)
      .map((c, i) => ({ ...c, n: i + 1 }));

    // Update each in-body marker's visible "(N)" to match the new
    // sequential number.
    const numByDoi = Object.fromEntries(next.map(c => [c.doi, c.n]));
    const refsBlock = editorRef.current.querySelector('[data-luminary-refs]');
    editorRef.current.querySelectorAll('sup > a[href*="doi.org"]').forEach(a => {
      if (refsBlock && refsBlock.contains(a)) return;
      const url = a.getAttribute('href') || '';
      const doi = url.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      const n   = numByDoi[doi];
      if (n !== undefined) a.textContent = `(${n})`;
    });

    setCitations(next);
    rebuildRefs(next);
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

      // Snapshot scroll position of the editor's scrolling ancestor so the
      // view doesn't jump after focus/insert/rebuildRefs mutate the DOM
      // (browsers default focus() to scroll-into-view, which can pull a
      // scrolled-down deep dive back to the top).
      const scroller = findScrollableAncestor(editorRef.current);
      const scrollTop = scroller?.scrollTop ?? 0;

      editorRef.current?.focus({ preventScroll: true });
      restoreSelection();
      document.execCommand('insertHTML', false,
        `<sup><a href="${doiUrl}" target="_blank" rel="noopener noreferrer" ` +
        `style="color:#6c63ff;text-decoration:none;font-weight:700;">(${N})</a></sup>`
      );

      setCitations(updated);
      rebuildRefs(updated);
      setShowDoiCite(false);
      setCiteDoiInput('');

      // Restore the scroll position the user had before the insert — they
      // stay reading right where they were citing.
      if (scroller) scroller.scrollTop = scrollTop;
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
      // Wrap in <figure> so the user can add a caption later via the
      // resize toolbar. data-luminary-fig marks our own figures so the
      // sanitiser keeps them and the global CSS scope picks them up.
      // No inline style — editor + reader CSS provide width / margin /
      // border-radius / display via data-width / figure selectors.
      document.execCommand('insertHTML', false,
        `<figure data-luminary-fig="1"><img src="${url}" alt="" /><figcaption></figcaption></figure><p><br></p>`
      );
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

  const toolbarButtonsJSX = (
    <>
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
    </>
  );

  // Popovers triggered by toolbar buttons. Anchor under the buttons that
  // opened them — top offset accounts for the taller portal-mode toolbar
  // (padded slot + inner pill) vs the slimmer inline toolbar.
  const popoverTop = shouldPortal ? 48 : 42;
  const popoversJSX = (
    <>
      {showLink && (
        <div style={{
          position:'absolute', zIndex:100, top:popoverTop, left:8,
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

      {showVideo && (
        <div style={{
          position:'absolute', zIndex:100, top:popoverTop, left:8,
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

      {showDoiCite && (
        <div style={{
          position: 'absolute', zIndex: 100, top: popoverTop, right: 0,
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
    </>
  );

  // Inline toolbar (non-deep-dive, or deep-dive before the portal target
  // mounts). Pinned to the editor body's top edge with a shared border.
  const inlineToolbarBlock = (
    <div style={{
      display:"flex", alignItems:"center", gap:2, flexWrap:"wrap",
      padding:"5px 8px", background:T.s2,
      border:`1.5px solid ${isDeepDive ? T.v : T.bdr}`, borderBottom:"none",
      borderRadius:"10px 10px 0 0",
    }}>
      {toolbarButtonsJSX}
    </div>
  );

  // Portaled toolbar: a header-bar strip below the top chrome, full
  // width visually with the buttons themselves centered at reading
  // width (~680px) so they sit above the editor body's column.
  // Popovers live inside the centered relative wrapper so absolute
  // top offsets anchor under the buttons that opened them.
  const portaledToolbarBlock = (
    <div style={{
      background: T.w,
      borderBottom: `1px solid ${T.bdr}`,
    }}>
      <div style={{
        maxWidth: 680, margin: '0 auto', position: 'relative',
        padding: '0 16px',
      }}>
        <div style={{
          display:"flex", alignItems:"center", gap:2, flexWrap:"wrap",
          padding: '8px 0',
        }}>
          {toolbarButtonsJSX}
        </div>
        {popoversJSX}
      </div>
    </div>
  );

  return (
    <div style={{flex:1, position:'relative'}}>
      {shouldPortal
        ? createPortal(portaledToolbarBlock, toolbarPortalTarget)
        : (
          <>
            {inlineToolbarBlock}
            {popoversJSX}
          </>
        )
      }

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
        onInput={() => { syncCitationsFromBody(); syncContent(); }}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        data-placeholder={placeholder}
        {...(isDeepDive ? {'data-deep-dive': 'true'} : {})}
        style={{
          minHeight: isDeepDive ? 320 : minHeight,
          padding: isDeepDive ? '24px 28px' : '12px 15px',
          background: T.w,
          border: `1.5px solid ${isDeepDive ? T.v : T.bdr}`,
          // Toolbar lives in a portal above the scroll, so the body sits
          // alone — full top border + all-corner radius. Inline mode keeps
          // the merged-with-toolbar look (no top border, bottom-only radius).
          borderTop: shouldPortal ? undefined : "none",
          borderRadius: shouldPortal ? "10px" : "0 0 10px 10px",
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

      {/* Image resize handles + toolbar — floats over the selected image.
          Two drag handles (left + right edge, vertically centred) drive
          live width %; the floating toolbar above shows the current
          width plus actions (caption, remove). Mouse-down on any of
          these uses preventDefault so contenteditable doesn't lose
          selection / blur the image we're operating on. */}
      {imgToolbar && (
        <>
          {/* Left handle */}
          <div
            data-img-toolbar="1"
            onMouseDown={(e) => beginResize(e, 'left')}
            title="Drag to resize"
            style={{
              position: 'absolute', zIndex: 50,
              top:    imgToolbar.top + imgToolbar.height / 2 - 14,
              left:   imgToolbar.left - 14,
              width: 28, height: 28, borderRadius: '50%',
              background: T.v, border: `2px solid ${T.w}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              cursor: 'col-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1,
              userSelect: 'none',
            }}
          >‹›</div>

          {/* Right handle */}
          <div
            data-img-toolbar="1"
            onMouseDown={(e) => beginResize(e, 'right')}
            title="Drag to resize"
            style={{
              position: 'absolute', zIndex: 50,
              top:    imgToolbar.top + imgToolbar.height / 2 - 14,
              left:   imgToolbar.left + imgToolbar.width - 14,
              width: 28, height: 28, borderRadius: '50%',
              background: T.v, border: `2px solid ${T.w}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              cursor: 'col-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1,
              userSelect: 'none',
            }}
          >‹›</div>

          {/* Floating action toolbar above the image */}
          <div
            data-img-toolbar="1"
            onMouseDown={(e) => e.preventDefault()}
            style={{
              position: 'absolute', zIndex: 50,
              top:  Math.max(0, imgToolbar.top - 38),
              left: imgToolbar.left + imgToolbar.width / 2,
              transform: 'translateX(-50%)',
              background: T.w, border: `1.5px solid ${T.v}`,
              borderRadius: 8, padding: '4px 8px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              padding: '3px 8px', borderRadius: 5,
              background: T.v2, color: T.v, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {imgToolbar.width}%
            </span>
            <button
              onClick={focusCaption}
              title="Add caption"
              style={{
                padding: '4px 8px', borderRadius: 5, border: 'none',
                background: 'transparent', color: T.text,
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 11.5, fontWeight: 700,
              }}
            >
              ✎ Caption
            </button>
            <div style={{ width: 1, height: 14, background: T.bdr }}/>
            <button
              onClick={removeImage}
              title="Remove image"
              style={{
                padding: '4px 8px', borderRadius: 5, border: 'none',
                background: 'transparent', color: T.ro,
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 700,
              }}
            >
              ✕
            </button>
          </div>
        </>
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
        [data-deep-dive] img { max-width:100%; height:auto; border-radius:8px; margin:20px auto; display:block; cursor:pointer; }
        /* img[data-size] resize rules live in PostContentStyles (mounted globally in App.jsx) */
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
