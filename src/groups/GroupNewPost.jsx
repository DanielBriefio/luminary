import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T, AUTO_TAG_ENABLED, EDGE_HEADERS } from '../lib/constants';

const AUTO_TAG_URL = 'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/auto-tag';
import { getFileCategory } from '../lib/fileUtils';
import { getCachedTagsByDoi, buildCitationFromEpmc, buildCitationFromCrossRef } from '../lib/utils';
import Btn from '../components/Btn';
import RichTextEditor from '../components/RichTextEditor';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';

async function smartAutoTag({ postId, postType, content, paperDoi, paperTitle, paperAbstract, paperJournal }) {
  if (postType !== 'paper') {
    const textContent = (content || '').replace(/<[^>]+>/g, '').trim();
    if (textContent.length < 100) { console.log('Auto-tag skipped: content too short'); return; }
  }
  if (postType === 'paper' && paperDoi) {
    const cached = await getCachedTagsByDoi(paperDoi, supabase);
    if (cached) {
      await supabase.from('group_posts').update({ tier1: cached.tier1, tier2: cached.tier2, tags: cached.tags }).eq('id', postId);
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
      await supabase.from('group_posts').update({ tier1: data.tier1 || '', tier2: data.tier2 || [], tags: data.tags || [] }).eq('id', postId);
      console.log(`Auto-tag saved: confidence=${data.confidence}`);
    }
  } catch(e) {
    console.warn('Auto-tag failed silently:', e.message);
  }
}

async function fetchDoiMeta(doi) {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').trim();
  if (!clean) return null;
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
    if (!r.ok) return null;
    const { message: m } = await r.json();
    return {
      title:    m.title?.[0] || '',
      journal:  m['container-title']?.[0] || '',
      year:     m.published?.['date-parts']?.[0]?.[0]?.toString() || '',
      authors:  (m.author || []).slice(0, 5).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') + ((m.author || []).length > 5 ? ' et al.' : ''),
      abstract:  m.abstract || '',
      doi:       clean,
      citation:  buildCitationFromCrossRef(m, clean),
    };
  } catch { return null; }
}

async function notifyGroupMembers(groupId, groupName, posterId, postId) {
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('role', ['admin', 'member'])
    .neq('user_id', posterId);
  if (!members?.length) return;
  await supabase.from('notifications').insert(
    members.map(m => ({
      user_id:    m.user_id,
      notif_type: 'group_post',
      actor_id:   posterId,
      target_id:  postId,
      meta:       { group_id: groupId, group_name: groupName },
    }))
  );
}

function EpResultCard({ title, authors, journal, year, cited, oa, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? T.s2 : 'rgba(255,255,255,.8)', border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '12px 14px', transition: 'background .12s' }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {authors.length > 80 ? authors.slice(0, 80) + '…' : authors}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.mu }}>{[journal, year].filter(Boolean).join(' · ')}</span>
        {oa && <span style={{ fontSize: 10, fontWeight: 700, color: T.gr, background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 20, padding: '1px 7px' }}>Open Access</span>}
        {cited > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: T.bl, background: T.bl2, border: `1px solid ${T.bl}`, borderRadius: 20, padding: '1px 7px' }}>{cited} citations</span>}
        <button onClick={onSelect} style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${T.v}`, background: T.v, color: '#fff', fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', flexShrink: 0 }}>
          Select →
        </button>
      </div>
    </div>
  );
}

export default function GroupNewPost({ groupId, groupName, user, onPostCreated, onCancel }) {
  const [postType,      setPostType]      = useState('text');
  const [content,       setContent]       = useState('');

  // Paper
  const [paperTitle,    setPaperTitle]    = useState('');
  const [paperJournal,  setPaperJournal]  = useState('');
  const [paperDoi,      setPaperDoi]      = useState('');
  const [paperAbstract, setPaperAbstract] = useState('');
  const [paperAuthors,  setPaperAuthors]  = useState('');
  const [paperYear,     setPaperYear]     = useState('');
  const [paperCitation, setPaperCitation] = useState('');
  const [doiFetching,   setDoiFetching]   = useState(false);
  const [doiFetched,    setDoiFetched]    = useState(false);
  const [paperMode,     setPaperMode]     = useState('search');
  const [epQuery,       setEpQuery]       = useState('');
  const [epAuthor,      setEpAuthor]      = useState('');
  const [epYearFrom,    setEpYearFrom]    = useState('');
  const [epYearTo,      setEpYearTo]      = useState('');
  const [epJournal,     setEpJournal]     = useState('');
  const [showEpAdv,     setShowEpAdv]     = useState(false);
  const [epResults,     setEpResults]     = useState([]);
  const [epNextCursor,  setEpNextCursor]  = useState(null);
  const [epHasMore,     setEpHasMore]     = useState(false);
  const [epSearching,   setEpSearching]   = useState(false);
  const [epLoadingMore, setEpLoadingMore] = useState(false);
  const [epError,       setEpError]       = useState('');
  const [epTotal,       setEpTotal]       = useState(null);

  // File attachment
  const [attachType,     setAttachType]     = useState(null);
  const [uploadFile,     setUploadFile]     = useState(null);
  const [uploadPreview,  setUploadPreview]  = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploading,      setUploading]      = useState(false);

  const [tags,    setTags]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Live link preview
  const [previewUrl, setPreviewUrl] = useState('');
  const urlDebounceRef = useRef(null);
  useEffect(() => {
    if (postType !== 'text') { setPreviewUrl(''); return; }
    clearTimeout(urlDebounceRef.current);
    urlDebounceRef.current = setTimeout(() => {
      setPreviewUrl(extractFirstUrl(content) || '');
    }, 600);
    return () => clearTimeout(urlDebounceRef.current);
  }, [content, postType]);

  const FILE_LIMITS = { image: 10, video: 200, audio: 50, pdf: 25, data: 5, file: 10 };
  const catInfo = {
    image: { icon: '📸', label: 'Photo' },
    video: { icon: '🎥', label: 'Video' },
    audio: { icon: '🎙️', label: 'Audio' },
    pdf:   { icon: '📄', label: 'PDF document' },
    data:  { icon: '📊', label: 'Dataset (CSV)' },
    file:  { icon: '📎', label: 'File attachment' },
  };

  const handleDoiLookup = async (doi) => {
    const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').trim();
    if (!clean || doiFetched) return;
    setDoiFetching(true);
    const meta = await fetchDoiMeta(clean);
    setDoiFetching(false);
    if (meta) {
      if (!paperTitle)   setPaperTitle(meta.title);
      if (!paperJournal) setPaperJournal(meta.journal || '');
      if (!paperAuthors) setPaperAuthors(meta.authors);
      setPaperAbstract(meta.abstract);
      setPaperYear(meta.year);
      setPaperDoi(meta.doi);
      setPaperCitation(meta.citation || '');
      setDoiFetched(true);
    } else {
      setError('Could not find this DOI in CrossRef. Fill in details manually.');
    }
  };

  const resetDoi = () => {
    setPaperDoi(''); setPaperTitle(''); setPaperJournal('');
    setPaperAuthors(''); setPaperAbstract(''); setPaperYear(''); setPaperCitation('');
    setDoiFetched(false); setEpResults([]); setError('');
  };

  const buildEpQuery = () => {
    const parts = [];
    if (epQuery.trim())      parts.push(epQuery.trim());
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
    if (!resp.ok) throw new Error();
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
    catch { setEpError('Search failed. Check your connection.'); }
    setEpSearching(false);
  };

  const loadMoreEp = async () => {
    if (!epNextCursor || epLoadingMore) return;
    setEpLoadingMore(true);
    try { await doEpFetch(epNextCursor, true); }
    catch { setEpError('Failed to load more results.'); }
    setEpLoadingMore(false);
  };

  const selectEpResult = async (r) => {
    const doi = r.doi || '';
    setPaperTitle(r.title?.replace(/<[^>]+>/g, '') || '');
    setPaperJournal(r.journalTitle || '');
    setPaperAuthors(r.authorString || '');
    setPaperAbstract(r.abstractText?.slice(0, 300) || '');
    setPaperYear(r.pubYear || '');
    setPaperCitation(buildCitationFromEpmc(r));
    setPaperDoi(doi);
    setEpResults([]); setEpQuery('');
    if (doi) { setDoiFetched(false); await handleDoiLookup(doi); }
    else setDoiFetched(true);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cat = getFileCategory(file.type);
    const limitMB = FILE_LIMITS[cat] || 10;
    if (file.size > limitMB * 1024 * 1024) { setError(`File too large. Max ${limitMB}MB for ${cat}.`); return; }
    setUploadFile(file); setUploadCategory(cat); setError('');
    if (['image', 'video', 'audio'].includes(cat)) setUploadPreview(URL.createObjectURL(file));
    else setUploadPreview('');
  };

  const clearFile = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null); setUploadPreview(''); setUploadCategory('');
  };

  const clearAttachment = () => { clearFile(); setAttachType(null); };

  const switchAttachType = (type) => {
    if (attachType === type) { clearAttachment(); return; }
    clearFile(); setAttachType(type);
  };

  const uploadFileToStorage = async (file) => {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage.from('post-files').upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
    return publicUrl;
  };

  const publish = async () => {
    const plain = content.replace(/<[^>]+>/g, '').trim();
    if (postType === 'paper' && !paperTitle.trim()) { setError('Please add a paper title.'); return; }
    if (postType !== 'paper' && !plain && !uploadFile) { setError('Please write something or attach a file.'); return; }
    setLoading(true); setError('');

    let fileUrl = '';
    if (uploadFile) {
      setUploading(true);
      try { fileUrl = await uploadFileToStorage(uploadFile); }
      catch (e) { setError(`Upload failed: ${e.message}`); setLoading(false); setUploading(false); return; }
      setUploading(false);
    }

    let resolvedType = postType;
    if (uploadFile) resolvedType = uploadCategory || 'text';

    const manualTags = tags.split(/[\s,]+/).filter(t => t.trim()).map(t => t.startsWith('#') ? t : `#${t}`);

    const { data: post, error: pe } = await supabase.from('group_posts').insert({
      group_id:      groupId,
      user_id:       user.id,
      post_type:     resolvedType,
      content:       content.trim(),
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
    }).select('id').single();

    setLoading(false);
    if (pe) { setError(pe.message); return; }

    if (AUTO_TAG_ENABLED && post?.id) {
      smartAutoTag({
        postId:        post.id,
        postType:      resolvedType,
        content,
        paperDoi:      paperDoi.trim(),
        paperTitle:    paperTitle.trim(),
        paperAbstract: paperAbstract.trim(),
        paperJournal:  paperJournal.trim(),
      }).catch(console.warn);
    }

    notifyGroupMembers(groupId, groupName, user.id, post.id).catch(() => {});
    onPostCreated();
  };

  const inputStyle = { width: '100%', background: 'rgba(255,255,255,.8)', border: `1.5px solid ${T.bdr}`, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: T.text, boxSizing: 'border-box' };

  return (
    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(108,99,255,.1)' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>New post to group</div>
        {onCancel && <button onClick={onCancel} style={{ fontSize: 13, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>}
      </div>

      <div style={{ padding: 16 }}>
        {error && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '9px 13px', fontSize: 12.5, color: T.ro, marginBottom: 12 }}>{error}</div>}

        {/* Type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {[{ id: 'text', icon: '✏️', label: 'Text' }, { id: 'paper', icon: '📄', label: 'Paper' }].map(t => (
            <div key={t.id} onClick={() => { setPostType(t.id); setError(''); if (t.id === 'paper') clearAttachment(); }}
              style={{ border: `${postType === t.id ? 2 : 1.5}px solid ${postType === t.id ? T.v : T.bdr}`, borderRadius: 11, padding: '10px 8px', textAlign: 'center', cursor: 'pointer', background: postType === t.id ? T.v2 : T.w }}>
              <div style={{ fontSize: 20, marginBottom: 3 }}>{t.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: postType === t.id ? T.v : T.mu }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Paper panel */}
        {postType === 'paper' && (
          <div style={{ background: T.v2, borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: `1px solid rgba(108,99,255,.15)` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.v, marginBottom: 12 }}>📄 Paper details</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['search', '🔍 Search Europe PMC'], ['doi', '✏️ Enter DOI']].map(([m, l]) => (
                <button key={m} onClick={() => setPaperMode(m)} style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${paperMode === m ? T.v : T.bdr}`, background: paperMode === m ? T.v2 : T.w, color: paperMode === m ? T.v : T.mu }}>{l}</button>
              ))}
            </div>

            {paperMode === 'search' && !doiFetched && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={epQuery} onChange={e => setEpQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEpSearch(); }} placeholder="Title, keywords, topic…" style={{ ...inputStyle, flex: 1, width: 'auto' }}/>
                  <Btn variant="s" onClick={handleEpSearch} disabled={epSearching || !buildEpQuery()} style={{ whiteSpace: 'nowrap' }}>{epSearching ? '…' : 'Search →'}</Btn>
                </div>
                <button onClick={() => setShowEpAdv(s => !s)} style={{ fontSize: 11.5, color: T.v, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: showEpAdv ? 8 : 4 }}>
                  {showEpAdv ? '▲ Hide filters' : '▼ Author, year, journal…'}
                </button>
                {showEpAdv && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, padding: '9px 11px', background: 'rgba(255,255,255,.7)', borderRadius: 9, border: `1px solid ${T.bdr}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ fontSize: 11.5, color: T.mu, width: 48, flexShrink: 0 }}>Author</label>
                      <input value={epAuthor} onChange={e => setEpAuthor(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEpSearch()} placeholder="e.g. Smith J" style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, minWidth: 0 }}/>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ fontSize: 11.5, color: T.mu, width: 48, flexShrink: 0 }}>Year</label>
                      <input value={epYearFrom} onChange={e => setEpYearFrom(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEpSearch()} placeholder="From" style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, minWidth: 0 }}/>
                      <span style={{ fontSize: 12, color: T.mu, flexShrink: 0 }}>–</span>
                      <input value={epYearTo} onChange={e => setEpYearTo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEpSearch()} placeholder="To" style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, minWidth: 0 }}/>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <label style={{ fontSize: 11.5, color: T.mu, width: 48, flexShrink: 0 }}>Journal</label>
                      <input value={epJournal} onChange={e => setEpJournal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEpSearch()} placeholder="e.g. Nature" style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5, minWidth: 0 }}/>
                    </div>
                  </div>
                )}
                {epError && <div style={{ fontSize: 12, color: T.ro, marginBottom: 8 }}>{epError}</div>}
                {epTotal !== null && epResults.length > 0 && (
                  <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 8 }}>{epTotal.toLocaleString()} results · showing {epResults.length}</div>
                )}
                {epResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                    {epResults.map((r, i) => (
                      <EpResultCard key={r.pmid || r.doi || i}
                        title={r.title?.replace(/<[^>]+>/g, '') || ''}
                        authors={r.authorString || ''}
                        journal={r.journalTitle || ''}
                        year={r.pubYear || ''}
                        cited={r.citedByCount || 0}
                        oa={r.isOpenAccess === 'Y'}
                        onSelect={() => selectEpResult(r)}
                      />
                    ))}
                  </div>
                )}
                {epHasMore && (
                  <div style={{ textAlign: 'center', paddingTop: 6 }}>
                    <Btn onClick={loadMoreEp} disabled={epLoadingMore}>
                      {epLoadingMore ? '…' : 'Show next 10'}
                    </Btn>
                  </div>
                )}
              </div>
            )}

            {(paperMode === 'doi' || doiFetched) && (
              <div style={{ marginBottom: 12 }}>
                {doiFetched ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.6)', borderRadius: 9, padding: '9px 14px', border: `1px solid ${T.gr}` }}>
                    <span style={{ fontSize: 12, color: T.gr, fontWeight: 700 }}>✓ Paper selected</span>
                    <span style={{ fontSize: 12, color: T.mu, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paperTitle}</span>
                    <button onClick={resetDoi} style={{ fontSize: 11, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer' }}>✕ Clear</button>
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 5 }}>DOI <span style={{ fontWeight: 400, color: T.mu }}>— paste to auto-fill</span></label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={paperDoi} onChange={e => { setPaperDoi(e.target.value); setDoiFetched(false); }} onBlur={e => handleDoiLookup(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDoiLookup(paperDoi)} placeholder="10.1038/s41586-024-00001-0" style={inputStyle}/>
                      {doiFetching ? <span style={{ fontSize: 12, color: T.mu, whiteSpace: 'nowrap' }}>Fetching…</span> : <Btn variant="v" onClick={() => handleDoiLookup(paperDoi)} style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}>Look up →</Btn>}
                    </div>
                  </>
                )}
              </div>
            )}

            {doiFetched && (
              <div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Paper title *</label>
                  <input value={paperTitle} onChange={e => setPaperTitle(e.target.value)} style={inputStyle}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Journal</label>
                    <input value={paperJournal} onChange={e => setPaperJournal(e.target.value)} style={inputStyle}/>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>Authors</label>
                    <input value={paperAuthors} onChange={e => setPaperAuthors(e.target.value)} style={inputStyle}/>
                  </div>
                </div>
                {paperAbstract && (
                  <div style={{ background: 'rgba(255,255,255,.6)', borderRadius: 9, padding: '10px 12px', border: `1px solid rgba(108,99,255,.15)` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.v, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Abstract</div>
                    <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.8 }}>{paperAbstract.replace(/<[^>]+>/g, '').trim()}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Text editor */}
        <div style={{ marginBottom: 0 }}>
          <RichTextEditor value={content} onChange={setContent} minHeight={90}
            placeholder={postType === 'paper' ? "Why does this paper matter to the group?" : "Share an update, finding, or question with the group…"}/>
        </div>

        {/* Live link preview */}
        {postType === 'text' && previewUrl && (
          <div style={{ marginTop: 4 }}>
            <LinkPreview url={previewUrl} compact/>
          </div>
        )}

        {/* File attachment */}
        {postType !== 'paper' && (
          <div style={{ marginTop: 10, marginBottom: 14 }}>
            {!uploadFile && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => switchAttachType('file')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: `1.5px solid ${attachType === 'file' ? T.v : T.bdr}`, background: attachType === 'file' ? T.v2 : T.w, color: attachType === 'file' ? T.v : T.mu }}>
                  📎 File
                </button>
              </div>
            )}

            {attachType === 'file' && !uploadFile && (
              <label style={{ display: 'block', cursor: 'pointer', marginTop: 10 }}>
                <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/csv" onChange={handleFileSelect} style={{ display: 'none' }}/>
                <div style={{ border: `2px dashed rgba(108,99,255,.3)`, borderRadius: 12, padding: '20px', textAlign: 'center', background: `linear-gradient(135deg,${T.v2},${T.bl2})` }}>
                  <div style={{ fontSize: 26, marginBottom: 6 }}>📎</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>Click to select a file</div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {[['📸', 'Photos', '10MB'], ['🎥', 'Video', '200MB'], ['🎙️', 'Audio', '50MB'], ['📄', 'PDF', '25MB'], ['📊', 'CSV', '5MB']].map(([icon, label, limit]) => (
                      <span key={label} style={{ background: 'rgba(255,255,255,.7)', border: '1px solid rgba(108,99,255,.2)', borderRadius: 20, padding: '3px 9px', fontSize: 10.5, fontWeight: 700, color: T.v }}>{icon} {label} · {limit}</span>
                    ))}
                  </div>
                </div>
              </label>
            )}

            {uploadFile && (
              <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden', marginTop: 10 }}>
                {uploadCategory === 'image' && uploadPreview && <img src={uploadPreview} alt="Preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }}/>}
                {uploadCategory === 'video' && uploadPreview && <video src={uploadPreview} controls muted style={{ width: '100%', maxHeight: 280, display: 'block', background: '#000' }}/>}
                {uploadCategory === 'audio' && uploadPreview && (
                  <div style={{ padding: 14, background: `linear-gradient(135deg,${T.v2},${T.bl2})` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 24 }}>🎙️</span>
                      <div><div style={{ fontSize: 13, fontWeight: 700 }}>{uploadFile.name}</div><div style={{ fontSize: 11, color: T.mu }}>Audio</div></div>
                    </div>
                    <audio controls src={uploadPreview} style={{ width: '100%' }}/>
                  </div>
                )}
                {uploadCategory === 'pdf' && (
                  <div style={{ padding: 14, background: T.bl2, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28 }}>📄</span>
                    <div><div style={{ fontSize: 13, fontWeight: 700 }}>{uploadFile.name}</div><div style={{ fontSize: 11, color: T.mu }}>PDF · {(uploadFile.size / 1024 / 1024).toFixed(1)}MB</div></div>
                  </div>
                )}
                {uploadCategory === 'data' && (
                  <div style={{ padding: 14, background: T.gr2, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28 }}>📊</span>
                    <div><div style={{ fontSize: 13, fontWeight: 700 }}>{uploadFile.name}</div><div style={{ fontSize: 11, color: T.mu }}>CSV · {(uploadFile.size / 1024).toFixed(0)}KB</div></div>
                  </div>
                )}
                <div style={{ padding: '9px 12px', background: T.w, borderTop: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15 }}>{catInfo[uploadCategory]?.icon || '📎'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile.name}</div>
                    <div style={{ fontSize: 10.5, color: T.mu }}>{catInfo[uploadCategory]?.label} · {(uploadFile.size / 1024 / 1024).toFixed(1)}MB</div>
                  </div>
                  <button onClick={clearAttachment} style={{ padding: '3px 10px', borderRadius: 20, border: `1px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>✕ Remove</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hashtags */}
        <div style={{ marginBottom: 14 }}>
          <input value={tags} onChange={e => setTags(e.target.value)}
            style={{ width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 10, padding: '8px 14px', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: T.text, boxSizing: 'border-box' }}
            placeholder="Hashtags: #GLP1 #CardioOncology (optional)"/>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: `1px solid ${T.bdr}` }}>
          {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
          <Btn variant="s" onClick={publish} disabled={loading || uploading} style={{ padding: '9px 24px', fontSize: 13 }}>
            {uploading ? 'Uploading…' : loading ? 'Posting…' : 'Post to group →'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
