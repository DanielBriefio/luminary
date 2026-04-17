import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { getFileCategory } from '../lib/fileUtils';
import Btn from '../components/Btn';
import RichTextEditor from '../components/RichTextEditor';

const ANON_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmxxeWxob3N3Y2t2d3dzcGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUzOTQsImV4cCI6MjA5MTEyMTM5NH0.lHcaMtZ6a781g8RTVkddupNc7qV1Ll1lvBdtdsaIgOs';

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
      abstract: m.abstract || '',
      doi:      clean,
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

export default function GroupNewPost({ groupId, groupName, user, onPostCreated, onCancel }) {
  const [postType,     setPostType]     = useState('text');
  const [content,      setContent]      = useState('');

  // Paper
  const [paperTitle,   setPaperTitle]   = useState('');
  const [paperJournal, setPaperJournal] = useState('');
  const [paperDoi,     setPaperDoi]     = useState('');
  const [paperAbstract,setPaperAbstract]= useState('');
  const [paperAuthors, setPaperAuthors] = useState('');
  const [paperYear,    setPaperYear]    = useState('');
  const [doiFetching,  setDoiFetching]  = useState(false);
  const [doiFetched,   setDoiFetched]   = useState(false);
  const [epQuery,      setEpQuery]      = useState('');
  const [epResults,    setEpResults]    = useState([]);
  const [epSearching,  setEpSearching]  = useState(false);
  const [epError,      setEpError]      = useState('');
  const [paperMode,    setPaperMode]    = useState('search');

  // Upload
  const [uploadFile,     setUploadFile]     = useState(null);
  const [uploadPreview,  setUploadPreview]  = useState('');
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploading,      setUploading]      = useState(false);

  // Link
  const [linkUrl,   setLinkUrl]   = useState('');
  const [linkTitle, setLinkTitle] = useState('');

  const [tags,    setTags]    = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleDoiLookup = async (doi) => {
    const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '').trim();
    if (!clean || doiFetched) return;
    setDoiFetching(true);
    const meta = await fetchDoiMeta(clean);
    setDoiFetching(false);
    if (meta) {
      if (!paperTitle)   setPaperTitle(meta.title);
      if (!paperJournal) setPaperJournal([meta.journal, meta.year].filter(Boolean).join(' · '));
      if (!paperAuthors) setPaperAuthors(meta.authors);
      setPaperAbstract(meta.abstract);
      setPaperYear(meta.year);
      setPaperDoi(meta.doi);
      setDoiFetched(true);
    } else {
      setError('Could not find this DOI in CrossRef. Fill in details manually.');
    }
  };

  const handleEpSearch = async () => {
    if (!epQuery.trim() || epSearching) return;
    setEpSearching(true); setEpError(''); setEpResults([]);
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epQuery)}&resultType=core&pageSize=8&format=json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setEpResults(data.resultList?.result || []);
      if (!data.resultList?.result?.length) setEpError('No results found.');
    } catch { setEpError('Search failed. Check your connection.'); }
    setEpSearching(false);
  };

  const selectEpResult = async (r) => {
    const doi = r.doi || '';
    setPaperTitle(r.title?.replace(/<[^>]+>/g, '') || '');
    setPaperJournal([r.journalTitle, r.pubYear].filter(Boolean).join(' · '));
    setPaperAuthors(r.authorString || '');
    setPaperAbstract(r.abstractText?.slice(0, 300) || '');
    setPaperYear(r.pubYear || '');
    setPaperDoi(doi);
    setEpResults([]); setEpQuery('');
    if (doi) { setDoiFetched(false); await handleDoiLookup(doi); }
    else setDoiFetched(true);
  };

  const resetDoi = () => {
    setPaperDoi(''); setPaperTitle(''); setPaperJournal('');
    setPaperAuthors(''); setPaperAbstract(''); setPaperYear('');
    setDoiFetched(false); setEpResults([]); setError('');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cat = getFileCategory(file.type);
    const limits = { image: 10, video: 200, audio: 50, pdf: 25, data: 5, file: 10 };
    if (file.size > (limits[cat] || 10) * 1024 * 1024) {
      setError(`File too large. Max ${limits[cat] || 10}MB for ${cat}.`); return;
    }
    setUploadFile(file); setUploadCategory(cat); setError('');
    if (['image', 'video', 'audio'].includes(cat)) setUploadPreview(URL.createObjectURL(file));
    else setUploadPreview('');
  };

  const clearFile = () => {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null); setUploadPreview(''); setUploadCategory('');
  };

  const publish = async () => {
    const plain = content.replace(/<[^>]+>/g, '').trim();
    if (postType === 'paper' && !paperTitle.trim()) { setError('Please add a paper title.'); return; }
    if (postType === 'link' && !linkUrl.trim()) { setError('Please add a URL.'); return; }
    if (postType === 'text' && !plain && !uploadFile) { setError('Please write something or attach a file.'); return; }
    setLoading(true); setError('');

    let fileUrl = '';
    if (uploadFile) {
      setUploading(true);
      try {
        const ext  = uploadFile.name.split('.').pop().toLowerCase();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data, error: ue } = await supabase.storage.from('post-files').upload(path, uploadFile, { contentType: uploadFile.type, upsert: false });
        if (ue) throw ue;
        const { data: { publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
        fileUrl = publicUrl;
      } catch (e) { setError(`Upload failed: ${e.message}`); setLoading(false); setUploading(false); return; }
      setUploading(false);
    }

    let resolvedType = postType;
    if (uploadFile) resolvedType = uploadCategory || 'text';
    else if (postType === 'link' && linkUrl.trim()) resolvedType = 'link';

    const manualTags = tags.split(/[\s,]+/).filter(t => t.trim()).map(t => t.startsWith('#') ? t : `#${t}`);

    const { data: post, error: pe } = await supabase.from('group_posts').insert({
      group_id:     groupId,
      user_id:      user.id,
      post_type:    resolvedType,
      content:      content.trim(),
      paper_title:  paperTitle.trim(),
      paper_journal:paperJournal.trim(),
      paper_doi:    paperDoi.trim(),
      paper_abstract:paperAbstract.trim(),
      paper_authors:paperAuthors.trim(),
      paper_year:   paperYear.trim(),
      link_url:     linkUrl.trim(),
      link_title:   linkTitle.trim(),
      image_url:    fileUrl,
      file_type:    uploadCategory,
      file_name:    uploadFile?.name || '',
      tags:         manualTags,
    }).select().single();

    setLoading(false);
    if (pe) { setError(pe.message); return; }

    // Auto-tag in background (fire and forget)
    fetch('https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/auto-tag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_TOKEN}` },
      body: JSON.stringify({ content: plain, paperTitle: paperTitle.trim(), paperJournal: paperJournal.trim(), paperAbstract: paperAbstract.trim() }),
    }).then(r => r.json()).then(d => {
      if (d?.tags?.length || d?.tier1) {
        supabase.from('group_posts').update({
          tags:  [...manualTags, ...(d.tags || []).map(t => `#${t}`).filter(t => !manualTags.includes(t))].slice(0, 10),
          tier1: d.tier1 || '',
          tier2: d.tier2 || [],
        }).eq('id', post.id);
      }
    }).catch(() => {});

    // Notify members in background
    notifyGroupMembers(groupId, groupName, user.id, post.id).catch(() => {});

    onPostCreated();
  };

  const types = [
    { id: 'text',  icon: '✏️', label: 'Text' },
    { id: 'paper', icon: '📄', label: 'Paper' },
    { id: 'link',  icon: '🔗', label: 'Link' },
  ];

  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,.8)', border: `1.5px solid ${T.bdr}`,
    borderRadius: 10, padding: '9px 14px', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', color: T.text, boxSizing: 'border-box',
  };

  return (
    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(108,99,255,.1)' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>New post to group</div>
        {onCancel && (
          <button onClick={onCancel} style={{ fontSize: 13, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {error && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '9px 13px', fontSize: 12.5, color: T.ro, marginBottom: 12 }}>{error}</div>}

        {/* Type selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {types.map(t => (
            <button key={t.id} onClick={() => { setPostType(t.id); setError(''); }} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              border: `1.5px solid ${postType === t.id ? T.v : T.bdr}`,
              background: postType === t.id ? T.v2 : T.w,
              color: postType === t.id ? T.v : T.mu,
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Paper panel */}
        {postType === 'paper' && (
          <div style={{ background: T.v2, borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: `1px solid rgba(108,99,255,.15)` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.v, marginBottom: 12 }}>📄 Paper details</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['search', '🔍 Search'], ['doi', '✏️ DOI']].map(([m, l]) => (
                <button key={m} onClick={() => setPaperMode(m)} style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                  border: `1.5px solid ${paperMode === m ? T.v : T.bdr}`,
                  background: paperMode === m ? T.v2 : T.w,
                  color: paperMode === m ? T.v : T.mu,
                }}>{l}</button>
              ))}
            </div>

            {paperMode === 'search' && !doiFetched && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={epQuery} onChange={e => setEpQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEpSearch(); }}
                    placeholder="Search by title, keyword, or author…" style={inputStyle}/>
                  <Btn variant="s" onClick={handleEpSearch} disabled={epSearching || !epQuery.trim()} style={{ whiteSpace: 'nowrap' }}>
                    {epSearching ? '…' : 'Search →'}
                  </Btn>
                </div>
                {epError && <div style={{ fontSize: 12, color: T.ro }}>{epError}</div>}
                {epResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                    {epResults.map((r, i) => (
                      <div key={r.pmid || r.doi || i} style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 }}>{r.title?.replace(/<[^>]+>/g, '') || ''}</div>
                        <div style={{ fontSize: 11, color: T.mu, marginBottom: 6 }}>{[r.journalTitle, r.pubYear].filter(Boolean).join(' · ')}</div>
                        <button onClick={() => selectEpResult(r)} style={{
                          padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${T.v}`,
                          background: T.v, color: '#fff', fontSize: 11.5, fontWeight: 700,
                          fontFamily: 'inherit', cursor: 'pointer',
                        }}>Select →</button>
                      </div>
                    ))}
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={paperDoi} onChange={e => { setPaperDoi(e.target.value); setDoiFetched(false); }}
                      onBlur={e => handleDoiLookup(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleDoiLookup(paperDoi)}
                      placeholder="10.1038/s41586-024-00001-0" style={inputStyle}/>
                    {doiFetching
                      ? <span style={{ fontSize: 12, color: T.mu, whiteSpace: 'nowrap' }}>Fetching…</span>
                      : <Btn variant="v" onClick={() => handleDoiLookup(paperDoi)} style={{ whiteSpace: 'nowrap', fontSize: 11.5 }}>Look up →</Btn>}
                  </div>
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.v, marginBottom: 5 }}>ABSTRACT</div>
                    <div style={{ fontSize: 12, color: T.text, lineHeight: 1.7 }}>{paperAbstract.replace(/<[^>]+>/g, '').trim()}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Link panel */}
        {postType === 'link' && (
          <div style={{ marginBottom: 14 }}>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" style={{ ...inputStyle, marginBottom: 8 }}/>
            <input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Link title (optional)" style={inputStyle}/>
          </div>
        )}

        {/* Content editor */}
        <div style={{ marginBottom: 12 }}>
          <RichTextEditor value={content} onChange={setContent} minHeight={90}
            placeholder={
              postType === 'paper' ? 'Why does this paper matter to the group?' :
              postType === 'link'  ? 'Add context or commentary…' :
              'Share an update, finding, or question with the group…'
            }/>
        </div>

        {/* File attachment (text posts) */}
        {postType === 'text' && (
          <div style={{ marginBottom: 12 }}>
            {!uploadFile ? (
              <label style={{ display: 'inline-block', cursor: 'pointer' }}>
                <input type="file" accept="image/*,video/*,audio/*,application/pdf,text/csv" onChange={handleFileSelect} style={{ display: 'none' }}/>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${T.bdr}`, background: T.w, color: T.mu, cursor: 'pointer',
                }}>📎 Attach file</span>
              </label>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: T.s2, borderRadius: 10, border: `1px solid ${T.bdr}` }}>
                <span style={{ fontSize: 18 }}>{uploadCategory === 'image' ? '📸' : uploadCategory === 'pdf' ? '📄' : '📎'}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadFile.name}</span>
                <button onClick={clearFile} style={{ fontSize: 12, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px' }}>✕</button>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        <input value={tags} onChange={e => setTags(e.target.value)}
          placeholder="Hashtags: #GLP1 #CardioOncology (optional)"
          style={{ ...inputStyle, marginBottom: 14, background: T.s2, fontSize: 12 }}/>

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
