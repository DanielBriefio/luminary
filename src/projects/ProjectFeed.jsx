import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { buildCitationFromCrossRef, buildCitationFromEpmc } from '../lib/utils';
import Spinner from '../components/Spinner';
import RichTextEditor from '../components/RichTextEditor';
import ProjectPostCard from './ProjectPostCard';

const selectStyle = {
  background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 8, padding: '5px 10px', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', color: T.text, cursor: 'pointer',
};

function EpResultCard({ r, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const citation = buildCitationFromEpmc(r);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? T.s2 : T.w, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '10px 12px', transition: 'background .1s' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 3,
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {r.title?.replace(/<[^>]+>/g, '')}
      </div>
      <div style={{ fontSize: 11, color: T.mu, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.authorString}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.mu }}>{citation || [r.journalTitle, r.pubYear].filter(Boolean).join(' · ')}</span>
        {r.isOpenAccess === 'Y' && <span style={{ fontSize: 10, fontWeight: 700, color: T.gr, background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 20, padding: '1px 6px' }}>OA</span>}
        <button onClick={() => onSelect(r)} style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, border: `1.5px solid ${T.v}`, background: T.v, color: '#fff', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          Select →
        </button>
      </div>
    </div>
  );
}

export default function ProjectFeed({ project, user, myRole, activeFolderId, folders }) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [likedSet,    setLikedSet]    = useState(new Set());
  const [showCompose, setShowCompose] = useState(false);

  // Compose state
  const [postType,           setPostType]           = useState('text');
  const [content,            setContent]            = useState('');
  const [selectedFolderPost, setSelectedFolderPost] = useState(activeFolderId || '');
  const [posting,            setPosting]            = useState(false);
  const [postError,          setPostError]          = useState('');

  // Paper
  const [paperMode,     setPaperMode]     = useState('search'); // 'search' | 'doi'
  const [paperDoi,      setPaperDoi]      = useState('');
  const [paperTitle,    setPaperTitle]    = useState('');
  const [paperJournal,  setPaperJournal]  = useState('');
  const [paperAuthors,  setPaperAuthors]  = useState('');
  const [paperAbstract, setPaperAbstract] = useState('');
  const [paperYear,     setPaperYear]     = useState('');
  const [paperCitation, setPaperCitation] = useState('');
  const [doiLookup,     setDoiLookup]     = useState(false);
  const [doiError,      setDoiError]      = useState('');

  // EPMC search
  const [epQuery,       setEpQuery]       = useState('');
  const [epResults,     setEpResults]     = useState([]);
  const [epSearching,   setEpSearching]   = useState(false);
  const [epLoadingMore, setEpLoadingMore] = useState(false);
  const [epNextCursor,  setEpNextCursor]  = useState(null);
  const [epHasMore,     setEpHasMore]     = useState(false);
  const [epError,       setEpError]       = useState('');

  useEffect(() => {
    setSelectedFolderPost(activeFolderId || '');
  }, [activeFolderId]);

  // Track when user last read this project (for unread badge)
  useEffect(() => {
    if (!project?.id || !user) return;
    supabase
      .from('project_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('user_id', user.id);
  }, [project?.id]); // eslint-disable-line

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('project_posts_with_meta')
      .select('*')
      .eq('project_id', project.id)
      .order('is_sticky', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (activeFolderId) query = query.eq('folder_id', activeFolderId);

    const { data } = await query;
    const rows = data || [];

    if (user && rows.length) {
      const ids = rows.map(p => p.id);
      const { data: likes } = await supabase
        .from('project_post_likes').select('post_id')
        .eq('user_id', user.id).in('post_id', ids);
      setLikedSet(new Set((likes || []).map(l => l.post_id)));
    }

    setPosts(rows);
    setLoading(false);
  }, [project.id, activeFolderId, user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // EPMC search
  const doEpFetch = async (cursor, append) => {
    if (!epQuery.trim()) return;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
      + `?query=${encodeURIComponent(epQuery.trim())}`
      + `&resultType=core&pageSize=10&format=json`
      + `&cursorMark=${encodeURIComponent(cursor || '*')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error();
    const d = await resp.json();
    const rows = d.resultList?.result || [];
    const next = d.nextCursorMark;
    if (append) setEpResults(prev => [...prev, ...rows]);
    else { setEpResults(rows); }
    setEpNextCursor(next || null);
    setEpHasMore(!!next && next !== cursor && rows.length === 10);
    if (!rows.length && !append) setEpError('No results found.');
  };

  const handleEpSearch = async () => {
    if (!epQuery.trim() || epSearching) return;
    setEpSearching(true); setEpError(''); setEpResults([]);
    try { await doEpFetch('*', false); } catch { setEpError('Search failed. Check your connection.'); }
    setEpSearching(false);
  };

  const loadMoreEp = async () => {
    if (!epNextCursor || epLoadingMore) return;
    setEpLoadingMore(true);
    try { await doEpFetch(epNextCursor, true); } catch { setEpError('Failed to load more.'); }
    setEpLoadingMore(false);
  };

  const selectEpResult = (r) => {
    setPaperTitle(r.title?.replace(/<[^>]+>/g, '') || '');
    setPaperJournal(r.journalTitle || '');
    setPaperAuthors(r.authorString || '');
    setPaperAbstract(r.abstractText?.slice(0, 500) || '');
    setPaperYear(r.pubYear || '');
    setPaperCitation(buildCitationFromEpmc(r));
    setPaperDoi(r.doi || '');
    setEpResults([]);
    setEpQuery('');
  };

  // DOI lookup
  const lookupDoi = async () => {
    if (!paperDoi.trim()) return;
    setDoiLookup(true); setDoiError('');
    try {
      const clean = paperDoi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
      if (!r.ok) throw new Error();
      const { message: w } = await r.json();
      setPaperTitle(w.title?.[0] || '');
      setPaperJournal(w['container-title']?.[0] || '');
      setPaperAuthors((w.author || []).slice(0, 5).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ') + ((w.author || []).length > 5 ? ' et al.' : ''));
      setPaperAbstract(w.abstract?.replace(/<[^>]+>/g, '') || '');
      setPaperYear(String(w.published?.['date-parts']?.[0]?.[0] || ''));
      setPaperCitation(buildCitationFromCrossRef(w, clean));
    } catch { setDoiError('Could not find this DOI. Check and try again.'); }
    setDoiLookup(false);
  };

  const clearPaper = () => {
    setPaperDoi(''); setPaperTitle(''); setPaperJournal(''); setPaperAuthors('');
    setPaperAbstract(''); setPaperYear(''); setPaperCitation('');
    setDoiError(''); setEpResults([]); setEpQuery('');
  };

  const resetCompose = () => {
    setContent(''); setPostType('text'); setPosting(false); setPostError('');
    setPaperMode('search'); clearPaper();
    setShowCompose(false);
  };

  const contentText = content.replace(/<[^>]+>/g, '').trim();

  const submitPost = async () => {
    if (posting) return;
    if (postType === 'text' && !contentText) return;
    if (postType === 'paper' && !paperTitle) return;
    setPosting(true); setPostError('');

    try {
      await supabase.from('project_posts').insert({
        project_id:     project.id,
        user_id:        user.id,
        folder_id:      selectedFolderPost || null,
        post_type:      postType,
        content:        content,
        paper_doi:      paperDoi,
        paper_title:    paperTitle,
        paper_journal:  paperJournal,
        paper_authors:  paperAuthors,
        paper_abstract: paperAbstract,
        paper_year:     paperYear,
        paper_citation: paperCitation,
      });
      resetCompose();
      fetchPosts();
    } catch (e) {
      setPostError(e.message || 'Failed to post.');
      setPosting(false);
    }
  };

  const canPost = (myRole === 'owner' || myRole === 'member') && project.status !== 'archived';
  const activeFolder = folders.find(f => f.id === activeFolderId);
  const paperSelected = !!(paperTitle);

  const inpStyle = {
    flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`,
    borderRadius: 8, padding: '7px 12px', fontSize: 12.5,
    fontFamily: 'inherit', outline: 'none', color: T.text,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Folder header */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${T.bdr}`,
        background: T.w, fontSize: 12, fontWeight: 700, color: T.mu,
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        {activeFolderId ? `📁 ${activeFolder?.name || 'Folder'}` : '📋 All Posts'}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Compose trigger */}
        {canPost && !showCompose && (
          <button onClick={() => setShowCompose(true)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '12px 16px', marginBottom: 16,
            background: T.w, border: `1.5px dashed ${T.bdr}`,
            borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            color: T.mu, fontSize: 13, textAlign: 'left',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.v}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
          >
            ✏️ Post something in {activeFolderId ? activeFolder?.name : 'this project'}…
          </button>
        )}

        {showCompose && (
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>

            {/* Type tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['text','📝 Text'],['paper','📄 Paper']].map(([t, l]) => (
                <button key={t} onClick={() => { setPostType(t); clearPaper(); }} style={{
                  padding: '5px 12px', borderRadius: 8,
                  border: `1.5px solid ${postType === t ? T.v : T.bdr}`,
                  background: postType === t ? T.v2 : T.w,
                  color: postType === t ? T.v : T.mu,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                }}>{l}</button>
              ))}
            </div>

            {/* Folder selector */}
            {folders.length > 0 && (
              <select value={selectedFolderPost} onChange={e => setSelectedFolderPost(e.target.value)}
                style={{ ...selectStyle, marginBottom: 10, width: '100%' }}>
                <option value="">No folder (general)</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}

            {/* ── Text compose ── */}
            {postType === 'text' && (
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="What do you want to share?"
              />
            )}

            {/* ── Paper compose ── */}
            {postType === 'paper' && (
              <div>
                {/* Search / DOI mode tabs */}
                {!paperSelected && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    {[['search','🔍 Search Europe PMC'],['doi','🔗 Paste DOI']].map(([m, l]) => (
                      <button key={m} onClick={() => { setPaperMode(m); clearPaper(); }} style={{
                        padding: '4px 10px', borderRadius: 7,
                        border: `1.5px solid ${paperMode === m ? T.v : T.bdr}`,
                        background: paperMode === m ? T.v2 : T.w,
                        color: paperMode === m ? T.v : T.mu,
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      }}>{l}</button>
                    ))}
                  </div>
                )}

                {/* EPMC Search mode */}
                {paperMode === 'search' && !paperSelected && (
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        value={epQuery}
                        onChange={e => setEpQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleEpSearch(); }}
                        placeholder="Title, author, keyword…"
                        style={inpStyle}
                      />
                      <button onClick={handleEpSearch} disabled={epSearching || !epQuery.trim()} style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none',
                        background: T.v, color: '#fff', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        opacity: (!epQuery.trim() || epSearching) ? 0.5 : 1,
                      }}>{epSearching ? '…' : 'Search'}</button>
                    </div>
                    {epError && <div style={{ color: T.ro, fontSize: 12, marginBottom: 6 }}>{epError}</div>}
                    {epResults.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {epResults.map((r, i) => (
                          <EpResultCard key={r.id || i} r={r} onSelect={selectEpResult}/>
                        ))}
                        {epHasMore && (
                          <button onClick={loadMoreEp} disabled={epLoadingMore} style={{
                            padding: '7px', borderRadius: 8, border: `1px solid ${T.bdr}`,
                            background: T.w, cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 12, color: T.v, fontWeight: 600,
                          }}>{epLoadingMore ? 'Loading…' : 'Load more'}</button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* DOI mode */}
                {paperMode === 'doi' && !paperSelected && (
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input value={paperDoi} onChange={e => setPaperDoi(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') lookupDoi(); }}
                        placeholder="10.xxxx/xxxxxxxx"
                        style={inpStyle}
                      />
                      <button onClick={lookupDoi} disabled={doiLookup || !paperDoi.trim()} style={{
                        padding: '7px 12px', borderRadius: 8, border: 'none',
                        background: T.v, color: '#fff', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        opacity: (!paperDoi.trim() || doiLookup) ? 0.5 : 1,
                      }}>{doiLookup ? '…' : 'Look up'}</button>
                    </div>
                    {doiError && <div style={{ color: T.ro, fontSize: 12, marginBottom: 6 }}>{doiError}</div>}
                  </div>
                )}

                {/* Selected paper preview */}
                {paperSelected && (
                  <div style={{ background: T.s2, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 }}>{paperTitle}</div>
                        {paperJournal && <div style={{ fontSize: 11.5, color: T.mu }}>{paperJournal}{paperYear ? ` · ${paperYear}` : ''}</div>}
                        {paperAuthors && <div style={{ fontSize: 11, color: T.mu }}>{paperAuthors}</div>}
                      </div>
                      <button onClick={clearPaper} style={{ fontSize: 11, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>✕ Change</button>
                    </div>
                  </div>
                )}

                {/* Optional note */}
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Add a note about this paper… (optional)"
                />
              </div>
            )}

            {postError && <div style={{ color: T.ro, fontSize: 12, marginTop: 6 }}>{postError}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={resetCompose} style={{
                padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${T.bdr}`,
                background: T.w, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
              }}>Cancel</button>
              <button onClick={submitPost}
                disabled={posting || (postType === 'text' && !contentText) || (postType === 'paper' && !paperTitle)}
                style={{
                  flex: 1, padding: '7px 14px', borderRadius: 9, border: 'none',
                  background: T.v, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                  opacity: (posting || (postType === 'text' && !contentText) || (postType === 'paper' && !paperTitle)) ? 0.5 : 1,
                }}>
                {posting ? 'Posting…' : 'Post →'}
              </button>
            </div>
          </div>
        )}

        {/* Posts */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
        ) : posts.length === 0 ? (
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✨</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 6 }}>
              {activeFolderId ? `${activeFolder?.name} is empty` : 'No posts yet'}
            </div>
            <div style={{ fontSize: 13, color: T.mu }}>
              {canPost ? 'Be the first to post here.' : 'Nothing here yet.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(p => (
              <ProjectPostCard
                key={p.id}
                post={{ ...p, user_liked: likedSet.has(p.id) }}
                currentUserId={user?.id}
                myRole={myRole}
                activeFolderId={activeFolderId}
                onRefresh={fetchPosts}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
