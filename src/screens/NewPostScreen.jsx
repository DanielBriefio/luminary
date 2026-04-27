import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, AUTO_TAG_ENABLED, EDGE_HEADERS, COMPOSER_PROMPTS, LUMENS_ENABLED } from '../lib/constants';

const AUTO_TAG_URL = 'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/auto-tag';
import { getFileCategory } from '../lib/fileUtils';
import { getCachedTagsByDoi, buildCitationFromEpmc, buildCitationFromCrossRef } from '../lib/utils';
import Btn from '../components/Btn';
import Inp from '../components/Inp';
import RichTextEditor from '../components/RichTextEditor';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import { useWindowSize } from '../lib/useWindowSize';

async function smartAutoTag({ postId, postType, content, paperDoi, paperTitle, paperAbstract, paperJournal, userId }) {
  if (postType !== 'paper') {
    const textContent = (content || '').replace(/<[^>]+>/g, '').trim();
    if (textContent.length < 100) { console.log('Auto-tag skipped: content too short'); return; }
  }
  if (postType === 'paper' && paperDoi) {
    const cached = await getCachedTagsByDoi(paperDoi, supabase);
    if (cached) {
      await supabase.from('posts').update({ tier1: cached.tier1, tier2: cached.tier2, tags: cached.tags }).eq('id', postId);
      console.log('Auto-tag: used cached tags from DOI');
      return;
    }
  }
  try {
    const res = await fetch(AUTO_TAG_URL, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({ content, paperTitle, paperAbstract, paperJournal }),
    });
    if (!res.ok) { console.warn('Auto-tag HTTP error:', res.status); return; }
    const data = await res.json();
    if (!data || data.confidence === 'low') { console.log('Auto-tag skipped: low confidence'); return; }
    if (data.tier1 || data.tags?.length) {
      await supabase.from('posts').update({ tier1: data.tier1 || '', tier2: data.tier2 || [], tags: data.tags || [] }).eq('id', postId);
      console.log(`Auto-tag saved: confidence=${data.confidence}`);
      if (postType === 'paper' && paperDoi && data.tier1 && userId) {
        supabase.from('publications')
          .update({ tier1: data.tier1, tier2: data.tier2 || [], tags: data.tags || [] })
          .eq('user_id', userId).eq('doi', paperDoi.toLowerCase())
          .then(() => {});
      }
    }
  } catch(e) {
    console.warn('Auto-tag failed silently:', e.message);
  }
}

// 200px-tall preview frame matching the PostCard feed crop. Drag the image
// up or down to choose what's visible; horizontal stays centred. Returns
// `y` as a 0–100 percentage stored as `object-position: 50% Y%` at save
// time. Touch + mouse supported.
function CoverRepositioner({ url, y, onChange, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ y: 0, posY: 50 });

  const begin = (clientY) => {
    startRef.current = { y: clientY, posY: y };
    setDragging(true);
  };
  const move = (clientY) => {
    if (!dragging) return;
    const dy = clientY - startRef.current.y;
    // Drag down → reveal upper part of the image (Y% toward 0).
    // 200px drag ≈ 100% shift.
    const next = Math.max(0, Math.min(100, startRef.current.posY - (dy / 200) * 100));
    onChange(next);
  };
  const end = () => setDragging(false);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e) => move(e.clientY);
    const onTouchMove = (e) => { if (e.touches[0]) move(e.touches[0].clientY); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchend', end);
    };
  }); // eslint-disable-line

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative', width: '100%', height: 200,
          borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${T.bdr}`, background: T.s2,
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none', touchAction: 'none',
        }}
        onMouseDown={(e) => { e.preventDefault(); begin(e.clientY); }}
        onTouchStart={(e) => { if (e.touches[0]) begin(e.touches[0].clientY); }}
      >
        <img src={url} alt="" draggable={false}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: `50% ${y}%`,
            display: 'block', pointerEvents: 'none',
          }}/>
        <div style={{
          position: 'absolute', left: 8, bottom: 8,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          padding: '3px 9px', borderRadius: 20,
          fontSize: 11, fontWeight: 600, pointerEvents: 'none',
        }}>
          ↕ Drag to reposition
        </div>
      </div>
      <button
        onClick={onRemove}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,.55)', color: '#fff',
          border: 'none', borderRadius: 20, padding: '4px 10px',
          fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        title="Remove cover image"
      >
        ✕ Remove
      </button>
    </div>
  );
}

async function fetchDoiMetadata(doi) {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
  if(!clean) return null;
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
    if(!r.ok) return null;
    const j = await r.json();
    const w = j.message;
    const title   = w.title?.[0] || '';
    const journal = w['container-title']?.[0] || w['institution']?.[0]?.name || '';
    const year    = w.published?.['date-parts']?.[0]?.[0]?.toString() || '';
    const authors = (w.author||[]).slice(0,5).map(a=>`${a.given||''} ${a.family||''}`.trim()).join(', ') + ((w.author||[]).length>5?' et al.':'');
    const abstract= w.abstract || '';
    const doiUrl  = `https://doi.org/${clean}`;
    const citation = buildCitationFromCrossRef(w, clean);
    return { title, journal, year, authors, abstract, doi: clean, doiUrl, citation };
  } catch { return null; }
}

function EpResultCard({ title, authors, citation, journal, year, cited, oa, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      style={{
        background: hovered ? T.s2 : "rgba(255,255,255,.8)",
        border: `1px solid ${T.bdr}`,
        borderRadius: 10,
        padding: "12px 14px",
        transition: "background .12s",
      }}
    >
      <div style={{fontSize:13,fontWeight:700,color:T.text,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",marginBottom:4}}>{title}</div>
      <div style={{fontSize:11.5,color:T.mu,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {authors.length>80 ? authors.slice(0,80)+'…' : authors}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:T.mu}}>{citation || [journal,year].filter(Boolean).join(' · ')}</span>
        {oa && <span style={{fontSize:10,fontWeight:700,color:T.gr,background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:20,padding:"1px 7px"}}>Open Access</span>}
        {cited>0 && <span style={{fontSize:10,fontWeight:700,color:T.bl,background:T.bl2,border:`1px solid ${T.bl}`,borderRadius:20,padding:"1px 7px"}}>{cited} citations</span>}
        <button onClick={onSelect} style={{marginLeft:"auto",padding:"4px 12px",borderRadius:20,border:`1.5px solid ${T.v}`,background:T.v,color:"#fff",fontSize:11.5,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>
          Select →
        </button>
      </div>
    </div>
  );
}

export default function NewPostScreen({ user, profile, setProfile, onPostCreated }) {
  const { isMobile } = useWindowSize();
  const [postType,setPostType]           = useState('text');
  const [content,setContent]             = useState('');

  const [composerPrompt] = useState(() => {
    const prompts = COMPOSER_PROMPTS[profile?.work_mode || 'researcher'];
    return prompts[Math.floor(Math.random() * prompts.length)];
  });

  // Paper fields
  const [paperTitle,setPaperTitle]       = useState('');
  const [paperJournal,setPaperJournal]   = useState('');
  const [paperDoi,setPaperDoi]           = useState('');
  const [paperAbstract,setPaperAbstract] = useState('');
  const [paperAuthors,setPaperAuthors]   = useState('');
  const [paperYear,setPaperYear]         = useState('');
  const [paperCitation,setPaperCitation] = useState('');
  const [doiFetching,setDoiFetching]     = useState(false);
  const [doiFetched,setDoiFetched]       = useState(false);
  const [paperInputMode,setPaperInputMode] = useState('search');
  const [epSearchTerm,setEpSearchTerm]   = useState('');
  const [epAuthor,     setEpAuthor]      = useState('');
  const [epYearFrom,   setEpYearFrom]    = useState('');
  const [epYearTo,     setEpYearTo]      = useState('');
  const [epJournal,    setEpJournal]     = useState('');
  const [showEpAdv,    setShowEpAdv]     = useState(false);
  const [epResults,setEpResults]         = useState([]);
  const [epNextCursor, setEpNextCursor]  = useState(null);
  const [epHasMore,    setEpHasMore]     = useState(false);
  const [epSearching,setEpSearching]     = useState(false);
  const [epLoadingMore,setEpLoadingMore] = useState(false);
  const [epError,setEpError]             = useState('');
  const [epTotal,      setEpTotal]       = useState(null);

  // Inline images uploaded by the rich-text editor (deep dive only) before
  // we know the post.id. We flush record_storage_file for each after publish.
  const pendingImagesRef = useRef([]);

  // Attachments (for text / tip posts)
  const [attachType,setAttachType]       = useState(null); // null | 'file'
  const [uploadFile,setUploadFile]       = useState(null);
  const [uploadPreview,setUploadPreview] = useState('');
  const [uploadCategory,setUploadCategory] = useState('');
  const [uploading,setUploading]         = useState(false);

  const [isDeepDive, setIsDeepDive]       = useState(false);
  // Deep-dive optional title + cover image. Cover uploads immediately; we
  // record the storage row after the post insert returns (same pattern as
  // pendingImagesRef for inline editor images).
  const [deepDiveTitle,    setDeepDiveTitle]    = useState('');
  const [coverUrl,         setCoverUrl]         = useState('');
  const [coverPath,        setCoverPath]        = useState('');
  const [coverFileMeta,    setCoverFileMeta]    = useState(null); // { size, type, name }
  const [coverUploading,   setCoverUploading]   = useState(false);
  const [coverY,           setCoverY]           = useState(50);    // 0–100; vertical object-position %
  const coverInputRef = useRef(null);
  const [tags,setTags]                   = useState('');
  const [visibility,setVisibility]       = useState('everyone');
  const [loading,setLoading]             = useState(false);
  const [success,setSuccess]             = useState(false);
  const [error,setError]                 = useState('');

  // Debounced URL detection for live link preview in text posts
  const [previewUrl, setPreviewUrl]      = useState('');
  const urlDebounceRef = useRef(null);
  useEffect(() => {
    if (postType !== 'text') { setPreviewUrl(''); return; }
    clearTimeout(urlDebounceRef.current);
    urlDebounceRef.current = setTimeout(() => {
      setPreviewUrl(extractFirstUrl(content) || '');
    }, 600);
    return () => clearTimeout(urlDebounceRef.current);
  }, [content, postType]);

  // Pre-fill paper fields from Explore "Share this paper"
  useEffect(() => {
    const raw = sessionStorage.getItem('prefill_paper');
    if (!raw) return;
    try {
      const paper = JSON.parse(raw);
      sessionStorage.removeItem('prefill_paper');
      setPostType('paper');
      if (paper.title)    setPaperTitle(paper.title);
      if (paper.journal)  setPaperJournal(paper.journal);
      if (paper.authors)  setPaperAuthors(paper.authors);
      if (paper.abstract) setPaperAbstract(paper.abstract);
      if (paper.year)     setPaperYear(paper.year);
      if (paper.doi)      setPaperDoi(paper.doi);
      if (paper.citation) setPaperCitation(paper.citation);
      // Always open filled-fields view if there's any metadata to show
      if (paper.title || paper.doi) setDoiFetched(true);
    } catch(e) {}
  }, []); // eslint-disable-line

  const FILE_LIMITS = { image:10, video:200, audio:50, pdf:25, data:5, file:10 };

  const handleDoiLookup = async (doi) => {
    const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
    if(!clean || doiFetched) return;
    setDoiFetching(true);
    const meta = await fetchDoiMetadata(clean);
    setDoiFetching(false);
    if(meta) {
      if(!paperTitle)   setPaperTitle(meta.title);
      if(!paperJournal) setPaperJournal(meta.journal || '');
      if(!paperAuthors) setPaperAuthors(meta.authors);
      setPaperAbstract(meta.abstract);
      setPaperYear(meta.year);
      setPaperDoi(meta.doi);
      setPaperCitation(meta.citation || '');
      setDoiFetched(true);
    } else {
      setError('Could not find this DOI in CrossRef. Check it and fill in details manually.');
    }
  };

  const resetDoi = () => {
    setPaperDoi(''); setPaperTitle(''); setPaperJournal('');
    setPaperAuthors(''); setPaperAbstract(''); setPaperYear(''); setPaperCitation('');
    setDoiFetched(false); setError('');
  };

  const buildEpQuery = () => {
    const parts = [];
    if (epSearchTerm.trim()) parts.push(epSearchTerm.trim());
    if (epAuthor.trim())     parts.push(`AUTH:"${epAuthor.trim()}"`);
    if (epJournal.trim())    parts.push(`JOURNAL:"${epJournal.trim()}"`);
    if (epYearFrom.trim() || epYearTo.trim()) {
      const from = epYearFrom.trim() || epYearTo.trim();
      const to   = epYearTo.trim()   || epYearFrom.trim();
      parts.push(from === to ? `(PUB_YEAR:${from})` : `(PUB_YEAR:[${from} TO ${to}])`);
    }
    return parts.join(' ');
  };

  const doEpFetch = async (cursor, append) => {
    const q = buildEpQuery();
    if (!q) return;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
      + `?query=${encodeURIComponent(q)}`
      + `&resultType=core&pageSize=10&format=json`
      + `&cursorMark=${encodeURIComponent(cursor || '*')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Search failed');
    const data = await resp.json();
    const rows = data.resultList?.result || [];
    const next = data.nextCursorMark;
    if (append) setEpResults(prev => [...prev, ...rows]);
    else { setEpResults(rows); setEpTotal(data.hitCount || 0); }
    setEpNextCursor(next || null);
    setEpHasMore(!!next && next !== cursor && rows.length === 10);
    if (!rows.length && !append) setEpError('No results found. Try different keywords.');
  };

  const handleEpSearch = async () => {
    const q = buildEpQuery();
    if (!q || epSearching) return;
    setEpSearching(true); setEpError(''); setEpResults([]);
    setEpNextCursor(null); setEpHasMore(false); setEpTotal(null);
    try { await doEpFetch('*', false); }
    catch { setEpError('Search failed. Check your connection and try again.'); }
    setEpSearching(false);
  };

  const loadMoreEp = async () => {
    if (!epNextCursor || epLoadingMore) return;
    setEpLoadingMore(true);
    try { await doEpFetch(epNextCursor, true); }
    catch { setEpError('Failed to load more results.'); }
    setEpLoadingMore(false);
  };

  const selectEpResult = async (result) => {
    const title   = result.title?.replace(/<[^>]+>/g, '') || '';
    const authors = result.authorString || '';
    const journal = result.journalTitle || '';
    const year    = result.pubYear || '';
    const doi     = result.doi || '';
    const abstract= result.abstractText?.slice(0, 300) || '';

    if (doi) {
      setPaperDoi(doi);
      setPaperTitle(title);
      setPaperJournal(journal);
      setPaperAuthors(authors);
      setPaperAbstract(abstract);
      setPaperYear(year);
      setPaperCitation(buildCitationFromEpmc(result));
      setDoiFetched(false);
      await handleDoiLookup(doi);
    } else {
      setPaperTitle(title);
      setPaperJournal(journal);
      setPaperAuthors(authors);
      setPaperCitation(buildCitationFromEpmc(result));
      setPaperAbstract(abstract);
      setPaperYear(year);
      setDoiFetched(true);
    }
    setEpResults([]);
    setEpSearchTerm('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const cat = getFileCategory(file.type);
    const limitMB = FILE_LIMITS[cat] || 10;
    if(file.size > limitMB * 1024 * 1024) {
      setError(`File too large. Max size for ${cat} is ${limitMB}MB.`); return;
    }
    setUploadFile(file);
    setUploadCategory(cat);
    setError('');
    if(cat === 'image' || cat === 'video' || cat === 'audio') {
      setUploadPreview(URL.createObjectURL(file));
    } else {
      setUploadPreview('');
    }
  };

  const clearFile = () => {
    if(uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null); setUploadPreview(''); setUploadCategory('');
  };

  const clearAttachment = () => {
    clearFile();
    setAttachType(null);
  };

  const switchAttachType = (type) => {
    if (attachType === type) { clearAttachment(); return; }
    clearFile();
    setAttachType(type);
  };

  const switchPostType = (type) => {
    setPostType(type);
    setError('');
    if (type === 'paper') clearAttachment();
  };

  const uploadFileToStorage = async (file) => {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('post-files')
      .upload(path, file, { contentType: file.type, upsert: false });
    if(error) throw error;
    const { data:{ publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
    return { url: publicUrl, path: data.path };
  };

  const publish = async () => {
    const plainContent = content.replace(/<[^>]+>/g,'').trim();
    if(postType === 'paper' && !paperTitle.trim()) { setError('Please add a paper title.'); return; }
    if(postType !== 'paper' && !plainContent && !uploadFile) {
      setError('Please write something or add an attachment.'); return;
    }
    setLoading(true); setError('');

    let fileUrl = '', uploadedPath = '';
    if(uploadFile) {
      setUploading(true);
      try {
        const r = await uploadFileToStorage(uploadFile);
        fileUrl = r.url; uploadedPath = r.path;
      }
      catch(err) { setError(`Upload failed: ${err.message}`); setLoading(false); setUploading(false); return; }
      setUploading(false);
    }

    // Derive post_type from attachment
    let resolvedPostType = postType;
    if (uploadFile) resolvedPostType = uploadCategory || 'text';

    const manualTags = tags.split(/[\s,]+/).filter(t=>t.trim()).map(t=>t.startsWith('#')?t:`#${t}`);

    const { data: newPost, error } = await supabase.from('posts').insert({
      user_id:       user.id,
      content:       content.trim(),
      post_type:     resolvedPostType,
      paper_title:   paperTitle.trim(),
      paper_journal: paperJournal.trim(),
      paper_doi:     paperDoi.trim(),
      paper_abstract:paperAbstract.trim(),
      paper_authors: paperAuthors.trim(),
      paper_year:     paperYear.trim(),
      paper_citation: paperCitation.trim(),
      image_url:      fileUrl,
      file_type:      uploadCategory,
      file_name:      uploadFile?.name || '',
      tags:           manualTags.slice(0, 10),
      tier1:          '',
      tier2:          [],
      visibility,
      is_deep_dive:   isDeepDive,
      deep_dive_title:          isDeepDive ? deepDiveTitle.trim() : '',
      deep_dive_cover_url:      isDeepDive ? coverUrl : '',
      deep_dive_cover_position: (isDeepDive && coverUrl) ? `50% ${Math.round(coverY)}%` : '50% 50%',
    }).select('id').single();
    setLoading(false);
    if(error) { setError(error.message); return; }

    if (uploadFile && uploadedPath && newPost?.id) {
      // supabase.rpc returns a PromiseLike (no .catch); use the two-arg .then form.
      supabase.rpc('record_storage_file', {
        p_bucket:      'post-files',
        p_path:        uploadedPath,
        p_size_bytes:  uploadFile.size,
        p_mime_type:   uploadFile.type || '',
        p_file_name:   uploadFile.name,
        p_source_kind: 'post',
        p_source_id:   newPost.id,
      }).then(() => {}, () => {});
    }

    // Record the deep-dive cover image (uploaded earlier, before we had
    // the post id) against the post.
    if (newPost?.id && coverPath && coverFileMeta) {
      supabase.rpc('record_storage_file', {
        p_bucket:      'post-files',
        p_path:        coverPath,
        p_size_bytes:  coverFileMeta.size,
        p_mime_type:   coverFileMeta.type,
        p_file_name:   coverFileMeta.name,
        p_source_kind: 'post',
        p_source_id:   newPost.id,
      }).then(() => {}, () => {});
    }

    // Flush deferred records for any inline images uploaded by the editor
    // before we knew the post id.
    if (newPost?.id && pendingImagesRef.current.length > 0) {
      for (const rec of pendingImagesRef.current) {
        supabase.rpc('record_storage_file', {
          p_bucket:      rec.bucket,
          p_path:        rec.path,
          p_size_bytes:  rec.size,
          p_mime_type:   rec.mime,
          p_file_name:   rec.name,
          p_source_kind: 'post',
          p_source_id:   newPost.id,
        }).then(() => {}, () => {});
      }
      pendingImagesRef.current = [];
    }

    if (LUMENS_ENABLED && newPost?.id) {
      try {
        supabase.rpc('award_lumens', {
          p_user_id:  user.id,
          p_amount:   5,
          p_reason:   'post_created',
          p_category: 'creation',
          p_meta:     { post_id: newPost.id, post_type: resolvedPostType },
        }).then(() => {}, () => {});
        // Optimistic local update so the sidebar widget reflects the +5 right
        // away without waiting for a profile re-fetch.
        setProfile?.(p => p ? {
          ...p,
          lumens_current_period: (p.lumens_current_period || 0) + 5,
          lumens_lifetime:       (p.lumens_lifetime       || 0) + 5,
        } : p);

        // Recognition: if this is the user's first post, find the inviter and
        // award them +100 Lumens. Best-effort; never blocks the publish flow.
        (async () => {
          try {
            const { count } = await supabase
              .from('posts')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id);
            if (count !== 1) return;
            const { data: code } = await supabase
              .from('invite_codes')
              .select('created_by')
              .eq('claimed_by', user.id)
              .maybeSingle();
            const inviterId = code?.created_by;
            if (inviterId && inviterId !== user.id) {
              supabase.rpc('award_lumens', {
                p_user_id:  inviterId,
                p_amount:   100,
                p_reason:   'invited_user_active',
                p_category: 'recognition',
                p_meta:     { invited_user_id: user.id },
              }).then(() => {}, () => {});
            }
          } catch {}
        })();
      } catch {}
    }

    if (AUTO_TAG_ENABLED && newPost?.id) {
      smartAutoTag({
        postId:        newPost.id,
        postType:      resolvedPostType,
        content,
        paperDoi:      paperDoi.trim(),
        paperTitle:    paperTitle.trim(),
        paperAbstract: paperAbstract.trim(),
        paperJournal:  paperJournal.trim(),
        userId:        user.id,
      }).catch(console.warn);
    }
    capture('post_created', { post_type: resolvedPostType, has_tags: tags.trim().length > 0 });
    if (resolvedPostType === 'paper') capture('paper_shared', { has_doi: !!paperDoi.trim() });
    setSuccess(true);
    setContent(''); resetDoi(); clearAttachment(); setTags('');
    setTimeout(() => { setSuccess(false); onPostCreated && onPostCreated(); }, 2000);
  };

  const types = [
    {id:"text",  icon:"✏️", label:"Text"},
    {id:"paper", icon:"📄", label:"Paper"},
  ];

  const catInfo = {
    image: { icon:"📸", label:"Photo",          color:T.te },
    video: { icon:"🎥", label:"Video",          color:T.v  },
    audio: { icon:"🎙️", label:"Audio",          color:T.ro },
    pdf:   { icon:"📄", label:"PDF document",   color:T.bl },
    data:  { icon:"📊", label:"Dataset (CSV)",  color:T.gr },
    file:  { icon:"📎", label:"File attachment",color:T.mu },
  };

  const attachBtnStyle = (active) => ({
    display:"flex", alignItems:"center", gap:6,
    padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600,
    fontFamily:"inherit", cursor:"pointer",
    border:`1.5px solid ${active ? T.v : T.bdr}`,
    background: active ? T.v2 : T.w,
    color: active ? T.v : T.mu,
  });

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?0:32,background:T.bg,display:"flex",alignItems:"flex-start",justifyContent:"center"}}>
      <div style={{maxWidth:isMobile?"100%":640,width:"100%",background:T.w,border:isMobile?"none":`1px solid ${T.bdr}`,borderRadius:isMobile?0:16,padding:isMobile?"16px 16px 0":28,boxShadow:isMobile?"none":"0 4px 24px rgba(108,99,255,.1)",display:"flex",flexDirection:"column"}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:19,fontWeight:700,marginBottom:5}}>Share something with the scientific community</div>
        <div style={{fontSize:13,color:T.mu,marginBottom:20}}>Select what you're sharing and publish to the feed.</div>

        {success && <div style={{background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:10,padding:"10px 16px",marginBottom:16,color:T.gr,fontWeight:700}}>✅ Published! Taking you back to the feed...</div>}
        {error   && <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:10,padding:"10px 16px",marginBottom:16,color:T.ro,fontWeight:600}}>⚠️ {error}</div>}

        {/* Post type selector */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:20}}>
          {types.map(t=>(
            <div key={t.id} onClick={()=>switchPostType(t.id)}
              style={{border:`${postType===t.id?2:1.5}px solid ${postType===t.id?T.v:T.bdr}`,borderRadius:11,padding:"12px 8px",textAlign:"center",cursor:"pointer",background:postType===t.id?T.v2:T.w}}>
              <div style={{fontSize:22,marginBottom:4}}>{t.icon}</div>
              <div style={{fontSize:11,fontWeight:700,color:postType===t.id?T.v:T.mu}}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Paper search / DOI panel */}
        {postType==='paper' && (
          <div style={{background:T.v2,borderRadius:12,padding:"16px 18px",marginBottom:16,border:`1px solid rgba(108,99,255,.15)`}}>
            <div style={{fontSize:12,fontWeight:700,color:T.v,marginBottom:12}}>📄 Paper details</div>

            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[['search','🔍 Search Europe PMC'],['doi','✏️ Enter DOI']].map(([mode,label])=>(
                <button key={mode} onClick={()=>setPaperInputMode(mode)} style={{
                  padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,
                  fontFamily:"inherit",cursor:"pointer",
                  border:`1.5px solid ${paperInputMode===mode?T.v:T.bdr}`,
                  background:paperInputMode===mode?T.v2:T.w,
                  color:paperInputMode===mode?T.v:T.mu,
                }}>{label}</button>
              ))}
            </div>

            {paperInputMode==='search' && !doiFetched && (
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <input
                    value={epSearchTerm}
                    onChange={e=>setEpSearchTerm(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') handleEpSearch(); }}
                    placeholder="Title, keywords, topic…"
                    style={{flex:1,background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}
                  />
                  <Btn variant="s" onClick={handleEpSearch} disabled={epSearching||!buildEpQuery()} style={{whiteSpace:"nowrap"}}>
                    {epSearching?'Searching...':'Search →'}
                  </Btn>
                </div>
                <button onClick={()=>setShowEpAdv(s=>!s)} style={{fontSize:11.5,color:T.v,fontWeight:600,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',padding:0,marginBottom:showEpAdv?8:4}}>
                  {showEpAdv?'▲ Hide filters':'▼ Author, year, journal…'}
                </button>
                {showEpAdv && (
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10,padding:'10px 12px',background:'rgba(255,255,255,.6)',borderRadius:9,border:`1px solid ${T.bdr}`}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Author</label>
                      <input value={epAuthor} onChange={e=>setEpAuthor(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="e.g. Smith J"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Year</label>
                      <input value={epYearFrom} onChange={e=>setEpYearFrom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="From"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                      <span style={{fontSize:12,color:T.mu,flexShrink:0}}>–</span>
                      <input value={epYearTo} onChange={e=>setEpYearTo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="To"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Journal</label>
                      <input value={epJournal} onChange={e=>setEpJournal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="e.g. Nature"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                  </div>
                )}
                {epError && <div style={{fontSize:12,color:T.ro,marginBottom:8}}>{epError}</div>}
                {epTotal !== null && epResults.length > 0 && (
                  <div style={{fontSize:11.5,color:T.mu,marginBottom:8}}>{epTotal.toLocaleString()} results · showing {epResults.length}</div>
                )}
                {epResults.length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:340,overflowY:"auto"}}>
                    {epResults.map((r,i)=>{
                      const title   = r.title?.replace(/<[^>]+>/g,'')||'';
                      const authors = r.authorString||'';
                      const journal = r.journalTitle||'';
                      const year    = r.pubYear||'';
                      const cited   = r.citedByCount||0;
                      const oa      = r.isOpenAccess==='Y';
                      return (
                        <EpResultCard key={r.pmid||r.doi||i}
                          title={title} authors={authors} journal={journal} year={year}
                          citation={buildCitationFromEpmc(r)}
                          cited={cited} oa={oa}
                          onSelect={()=>selectEpResult(r)}
                        />
                      );
                    })}
                  </div>
                )}
                {epHasMore && (
                  <div style={{textAlign:'center',paddingTop:6}}>
                    <Btn onClick={loadMoreEp} disabled={epLoadingMore}>
                      {epLoadingMore?'Loading...':'Show next 10'}
                    </Btn>
                  </div>
                )}
              </div>
            )}

            {(paperInputMode==='doi' || doiFetched) && (
              <div style={{marginBottom:14}}>
                {doiFetched ? (
                  <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.6)",borderRadius:9,padding:"9px 14px",border:`1px solid ${T.gr}`}}>
                    <span style={{fontSize:12,color:T.gr,fontWeight:700}}>✓ Paper selected</span>
                    <span style={{fontSize:12,color:T.mu,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{paperTitle}</span>
                    <button onClick={()=>{ resetDoi(); setEpResults([]); }} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>✕ Clear</button>
                  </div>
                ) : (
                  <>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>
                      DOI <span style={{fontWeight:400,color:T.mu}}>— paste to auto-fill everything below</span>
                    </label>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input value={paperDoi}
                        onChange={e=>{setPaperDoi(e.target.value);setDoiFetched(false);}}
                        onBlur={e=>handleDoiLookup(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&handleDoiLookup(paperDoi)}
                        placeholder="10.1038/s41586-024-00001-0 or https://doi.org/..."
                        style={{flex:1,background:"rgba(255,255,255,.8)",border:`1.5px solid ${doiFetched?T.gr:T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                      {doiFetching
                        ? <span style={{fontSize:12,color:T.mu,whiteSpace:"nowrap"}}>Fetching...</span>
                        : <Btn variant="v" onClick={()=>handleDoiLookup(paperDoi)} style={{whiteSpace:"nowrap",fontSize:11.5}}>Look up →</Btn>}
                    </div>
                    <div style={{fontSize:11,color:T.mu,marginTop:4}}>Fetches title, authors, abstract, and journal automatically via CrossRef.</div>
                  </>
                )}
              </div>
            )}

            {doiFetched && (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Paper title *</label>
                  <input value={paperTitle} onChange={e=>setPaperTitle(e.target.value)} placeholder="Will auto-fill"
                    style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Journal</label>
                    <input value={paperJournal} onChange={e=>setPaperJournal(e.target.value)} placeholder="Auto-filled"
                      style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Authors</label>
                    <input value={paperAuthors} onChange={e=>setPaperAuthors(e.target.value)} placeholder="Auto-filled"
                      style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                  </div>
                </div>
                {paperAbstract&&(
                  <div style={{background:"rgba(255,255,255,.6)",borderRadius:9,padding:"12px 14px",border:`1px solid rgba(108,99,255,.15)`}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.v,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Abstract</div>
                    <div style={{fontSize:12.5,color:T.text,lineHeight:1.8}}>{paperAbstract.replace(/<[^>]+>/g,'').trim()}</div>
                  </div>
                )}
              </>
            )}

            {paperInputMode==='doi' && !doiFetched && paperTitle && (
              <div style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Paper title *</label>
                <input value={paperTitle} onChange={e=>setPaperTitle(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
              </div>
            )}
          </div>
        )}

        {/* Deep Dive toggle — text posts only, shown above the editor */}
        {postType === 'text' && (
          <div
            onClick={() => setIsDeepDive(d => !d)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', marginBottom: 8,
              borderRadius: 10,
              background: isDeepDive ? T.v2 : T.s2,
              border: `1.5px solid ${isDeepDive ? T.v : T.bdr}`,
              cursor: 'pointer',
            }}
          >
            <div style={{
              width: 38, height: 20, borderRadius: 10,
              background: isDeepDive ? T.v : T.bdr,
              position: 'relative', flexShrink: 0,
              transition: 'background .2s',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: isDeepDive ? 19 : 2,
                width: 16, height: 16, borderRadius: '50%',
                background: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                transition: 'left .2s',
              }}/>
            </div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 12.5, fontWeight: 700, color: isDeepDive ? T.v : T.text}}>
                🔬 Deep Dive {isDeepDive ? '— on' : ''}
              </div>
              <div style={{fontSize: 11, color: T.mu}}>
                {isDeepDive
                  ? 'H2/H3 headings, blockquotes, horizontal dividers, and inline DOI citations enabled'
                  : 'Enable for structured posts with headings, blockquotes, and paper citations'}
              </div>
            </div>
          </div>
        )}

        {/* Deep-dive: title + cover image (above the editor) */}
        {isDeepDive && postType === 'text' && (
          <div style={{marginBottom: 10, display:'flex', flexDirection:'column', gap: 8}}>
            <input
              value={deepDiveTitle}
              onChange={e => setDeepDiveTitle(e.target.value)}
              placeholder="Article title…"
              maxLength={140}
              style={{
                width:'100%', padding:'10px 14px', borderRadius:10,
                border:`1.5px solid ${T.bdr}`, outline:'none',
                fontFamily:"'DM Serif Display', Georgia, serif",
                fontSize:22, color:T.text, background:T.w,
              }}
            />

            {coverUrl ? (
              <CoverRepositioner
                url={coverUrl}
                y={coverY}
                onChange={setCoverY}
                onRemove={() => { setCoverUrl(''); setCoverPath(''); setCoverFileMeta(null); setCoverY(50); }}
              />
            ) : (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  width:'100%', padding:'14px 16px',
                  background:T.s2, border:`1.5px dashed ${T.bdr}`, borderRadius:10,
                  cursor: coverUploading ? 'wait' : 'pointer',
                  fontFamily:'inherit', color:T.mu, fontSize:13,
                }}
              >
                {coverUploading ? '⏳ Uploading cover…' : '🖼️ Add cover image (optional)'}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{display:'none'}}
              onChange={async e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!f.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
                if (f.size > 10 * 1024 * 1024)   { setError('Cover image is too large (max 10 MB).'); return; }
                setCoverUploading(true);
                setError('');
                try {
                  const r = await uploadFileToStorage(f);
                  setCoverUrl(r.url);
                  setCoverPath(r.path);
                  setCoverFileMeta({ size: f.size, type: f.type || 'image/jpeg', name: f.name });
                } catch (err) {
                  setError(`Cover upload failed: ${err.message || 'unknown error'}`);
                }
                setCoverUploading(false);
              }}
            />
          </div>
        )}

        {/* Text editor */}
        <div style={{marginBottom:0}}>
          <RichTextEditor
            value={content}
            onChange={setContent}
            isDeepDive={isDeepDive}
            user={user}
            onPendingImage={(rec) => { pendingImagesRef.current.push(rec); }}
            minHeight={isMobile ? (uploadFile ? 120 : 200) : (uploadFile ? 70 : 110)}
            placeholder={
              postType==='paper' ? "Why does this paper matter? What's the key finding?" :
              isDeepDive ? "Write your article here. Use Heading 2 / 3 for sections, ❝ for pull quotes, 📄 Cite to add paper references…" :
              composerPrompt
            }/>
        </div>

        {/* Live link preview for text posts */}
        {postType === 'text' && previewUrl && (
          <div style={{ marginTop: 4 }}>
            <LinkPreview url={previewUrl} compact/>
          </div>
        )}

        {/* Attachment area (text / tip only) */}
        {postType !== 'paper' && (
          <div style={{marginTop:10, marginBottom:14}}>

            {/* Attach buttons */}
            {!uploadFile && (
              <div style={{display:"flex",gap:8}}>
                <button style={attachBtnStyle(attachType==='file')} onClick={()=>switchAttachType('file')}>
                  <span>📎</span> File
                </button>
              </div>
            )}

            {/* File upload UI */}
            {attachType === 'file' && !uploadFile && (
              <label style={{display:"block",cursor:"pointer",marginTop:10}}>
                <input type="file"
                  accept="image/*,video/*,audio/*,application/pdf,text/csv,application/vnd.ms-excel"
                  onChange={handleFileSelect} style={{display:"none"}}/>
                <div style={{border:`2px dashed rgba(108,99,255,.3)`,borderRadius:12,padding:"20px 20px",textAlign:"center",background:`linear-gradient(135deg,${T.v2},${T.bl2})`}}>
                  <div style={{fontSize:26,marginBottom:6}}>📎</div>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>Click to select a file</div>
                  <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                    {[["📸","Photos","10MB"],["🎥","Video","200MB"],["🎙️","Audio","50MB"],["📄","PDF","25MB"],["📊","CSV","5MB"]].map(([icon,label,limit])=>(
                      <span key={label} style={{background:"rgba(255,255,255,.7)",border:"1px solid rgba(108,99,255,.2)",borderRadius:20,padding:"3px 9px",fontSize:10.5,fontWeight:700,color:T.v}}>
                        {icon} {label} · {limit}
                      </span>
                    ))}
                  </div>
                </div>
              </label>
            )}

            {/* File preview */}
            {uploadFile && (
              <div style={{border:`1px solid ${T.bdr}`,borderRadius:12,overflow:"hidden",marginTop:10}}>
                {uploadCategory==='image' && uploadPreview && (
                  <img src={uploadPreview} alt="Preview" style={{width:"100%",maxHeight:320,objectFit:"cover",display:"block"}}/>
                )}
                {uploadCategory==='video' && uploadPreview && (
                  <video src={uploadPreview} controls muted style={{width:"100%",maxHeight:320,display:"block",background:"#000"}}/>
                )}
                {uploadCategory==='audio' && uploadPreview && (
                  <div style={{padding:"14px",background:`linear-gradient(135deg,${T.v2},${T.bl2})`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:24}}>🎙️</span>
                      <div><div style={{fontSize:13,fontWeight:700}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>Audio</div></div>
                    </div>
                    <audio controls src={uploadPreview} style={{width:"100%"}}/>
                  </div>
                )}
                {uploadCategory==='pdf' && (
                  <div style={{padding:"14px",background:T.bl2,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:28}}>📄</span>
                    <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>PDF · {(uploadFile.size/1024/1024).toFixed(1)}MB</div></div>
                  </div>
                )}
                {uploadCategory==='data' && (
                  <div style={{padding:"14px",background:T.gr2,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:28}}>📊</span>
                    <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>CSV · {(uploadFile.size/1024).toFixed(0)}KB</div></div>
                  </div>
                )}
                <div style={{padding:"9px 12px",background:T.w,borderTop:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:15}}>{catInfo[uploadCategory]?.icon||"📎"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{uploadFile.name}</div>
                    <div style={{fontSize:10.5,color:T.mu}}>{catInfo[uploadCategory]?.label} · {(uploadFile.size/1024/1024).toFixed(1)}MB</div>
                  </div>
                  <button onClick={clearAttachment}
                    style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${T.bdr}`,background:T.w,cursor:"pointer",fontSize:11.5,fontFamily:"inherit",fontWeight:600,color:T.mu}}>
                    ✕ Remove
                  </button>
                </div>
                {uploading && (
                  <div style={{padding:"9px 14px",background:T.v2,display:"flex",alignItems:"center",gap:9,fontSize:12.5,color:T.v,fontWeight:600}}>
                    <div style={{width:13,height:13,borderRadius:"50%",border:`2px solid ${T.v2}`,borderTop:`2px solid ${T.v}`,animation:"spin 1s linear infinite"}}/>
                    Uploading {catInfo[uploadCategory]?.label||"file"}...
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Hashtags */}
        <div style={{marginBottom:16}}>
          <input value={tags} onChange={e=>setTags(e.target.value)}
            style={{width:"100%",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"8px 14px",fontSize:12,fontFamily:"inherit",outline:"none",color:T.text}}
            placeholder="Hashtags: #MedicalAffairs #RWE #DigitalHealth (space or comma separated)"/>
        </div>

        {/* Footer */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12,padding:isMobile?"12px 0 calc(12px + env(safe-area-inset-bottom))":"12px 0 0",borderTop:`1px solid ${T.bdr}`,background:T.w,position:isMobile?"sticky":undefined,bottom:isMobile?0:undefined,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:T.mu,fontWeight:600}}>Visible to:</span>
          <div style={{display:"flex",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:3}}>
            {[["everyone","Everyone"],["followers","Followers only"]].map(([v,l])=>(
              <div key={v} onClick={()=>setVisibility(v)}
                style={{padding:"4px 12px",borderRadius:18,fontSize:12,color:visibility===v?T.v:T.mu,cursor:"pointer",fontWeight:700,background:visibility===v?T.w:"transparent"}}>{l}</div>
            ))}
          </div>
          <div style={{marginLeft:"auto",display:"flex",gap:9}}>
            <Btn onClick={()=>{setContent('');setError('');clearAttachment();}}>Clear</Btn>
            <Btn variant="s" onClick={publish} disabled={loading||uploading} style={{padding:"9px 24px",fontSize:13}}>
              {uploading?"Uploading...":loading?"Publishing...":"Publish →"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
