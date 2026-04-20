import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { buildCitationFromCrossRef } from '../lib/utils';
import Spinner from '../components/Spinner';
import ProjectPostCard from './ProjectPostCard';

const selectStyle = {
  background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 8, padding: '5px 10px', fontSize: 12,
  fontFamily: 'inherit', outline: 'none', color: T.text, cursor: 'pointer',
};

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

  // Paper compose
  const [paperDoi,      setPaperDoi]      = useState('');
  const [paperTitle,    setPaperTitle]    = useState('');
  const [paperJournal,  setPaperJournal]  = useState('');
  const [paperAuthors,  setPaperAuthors]  = useState('');
  const [paperAbstract, setPaperAbstract] = useState('');
  const [paperYear,     setPaperYear]     = useState('');
  const [paperCitation, setPaperCitation] = useState('');
  const [doiLookup,     setDoiLookup]     = useState(false);
  const [doiError,      setDoiError]      = useState('');

  // Sync folder selector when sidebar changes
  useEffect(() => {
    setSelectedFolderPost(activeFolderId || '');
  }, [activeFolderId]);

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

  const lookupDoi = async () => {
    if (!paperDoi.trim()) return;
    setDoiLookup(true); setDoiError('');
    try {
      const clean = paperDoi.trim().replace(/^https?:\/\/doi\.org\//i, '');
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
      if (!r.ok) throw new Error('DOI not found');
      const j = await r.json();
      const w = j.message;
      setPaperTitle(w.title?.[0] || '');
      setPaperJournal(w['container-title']?.[0] || '');
      setPaperAuthors((w.author || []).map(a => `${a.family || ''} ${(a.given || '')[0] || ''}`.trim()).join(', '));
      setPaperAbstract(w.abstract?.replace(/<[^>]+>/g, '') || '');
      setPaperYear(String(w.published?.['date-parts']?.[0]?.[0] || ''));
      setPaperCitation(buildCitationFromCrossRef(w, clean));
    } catch { setDoiError('Could not find this DOI. Check and try again.'); }
    setDoiLookup(false);
  };

  const resetCompose = () => {
    setContent(''); setPostType('text'); setPosting(false); setPostError('');
    setPaperDoi(''); setPaperTitle(''); setPaperJournal(''); setPaperAuthors('');
    setPaperAbstract(''); setPaperYear(''); setPaperCitation(''); setDoiError('');
    setShowCompose(false);
  };

  const submitPost = async () => {
    if (posting) return;
    if (postType === 'text' && !content.trim()) return;
    if (postType === 'paper' && !paperTitle) return;
    setPosting(true); setPostError('');

    try {
      await supabase.from('project_posts').insert({
        project_id:  project.id,
        user_id:     user.id,
        folder_id:   selectedFolderPost || null,
        post_type:   postType,
        content:     content,
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

  const canPost = myRole === 'owner' || myRole === 'member';
  const activeFolder = folders.find(f => f.id === activeFolderId);

  const taStyle = {
    width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit',
    outline: 'none', resize: 'vertical', minHeight: 80, lineHeight: 1.6,
    boxSizing: 'border-box', color: T.text,
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

        {/* Compose */}
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
            ✏️ Post something in {activeFolderId ? `${activeFolder?.name}` : 'this project'}…
          </button>
        )}

        {showCompose && (
          <div style={{
            background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
            padding: '14px 16px', marginBottom: 16,
          }}>
            {/* Type selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['text','📝 Text'],['paper','📄 Paper']].map(([t, l]) => (
                <button key={t} onClick={() => setPostType(t)} style={{
                  padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${postType === t ? T.v : T.bdr}`,
                  background: postType === t ? T.v2 : T.w, color: postType === t ? T.v : T.mu,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                }}>{l}</button>
              ))}
            </div>

            {/* Folder selector */}
            {folders.length > 0 && (
              <select value={selectedFolderPost} onChange={e => setSelectedFolderPost(e.target.value)}
                style={{ ...selectStyle, marginBottom: 8, width: '100%' }}>
                <option value="">No folder (general)</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}

            {/* Text compose */}
            {postType === 'text' && (
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="What do you want to share?"
                style={{ ...taStyle, marginBottom: 8 }}/>
            )}

            {/* Paper compose */}
            {postType === 'paper' && (
              <div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <input value={paperDoi} onChange={e => setPaperDoi(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') lookupDoi(); }}
                    placeholder="Paste DOI…"
                    style={{
                      flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`,
                      borderRadius: 8, padding: '7px 12px', fontSize: 12.5,
                      fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button onClick={lookupDoi} disabled={doiLookup || !paperDoi.trim()} style={{
                    padding: '7px 12px', borderRadius: 8, border: 'none',
                    background: T.v, color: '#fff', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  }}>{doiLookup ? '…' : 'Look up'}</button>
                </div>
                {doiError && <div style={{ color: T.ro, fontSize: 12, marginBottom: 6 }}>{doiError}</div>}
                {paperTitle && (
                  <div style={{ background: T.s2, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55 }}>
                    <div style={{ fontWeight: 700, marginBottom: 3 }}>{paperTitle}</div>
                    {paperJournal && <div style={{ color: T.mu }}>{paperJournal}{paperYear ? ` · ${paperYear}` : ''}</div>}
                    {paperAuthors && <div style={{ color: T.mu, fontSize: 11.5 }}>{paperAuthors}</div>}
                  </div>
                )}
                <textarea value={content} onChange={e => setContent(e.target.value)}
                  placeholder="Add a note about this paper… (optional)"
                  rows={2} style={{ ...taStyle, marginTop: 8 }}/>
              </div>
            )}

            {postError && <div style={{ color: T.ro, fontSize: 12, marginBottom: 6 }}>{postError}</div>}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={resetCompose} style={{
                padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${T.bdr}`,
                background: T.w, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
              }}>Cancel</button>
              <button onClick={submitPost}
                disabled={posting || (postType === 'text' && !content.trim()) || (postType === 'paper' && !paperTitle)}
                style={{
                  flex: 1, padding: '7px 14px', borderRadius: 9, border: 'none',
                  background: T.v, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                  opacity: (posting || (postType === 'text' && !content.trim()) || (postType === 'paper' && !paperTitle)) ? 0.5 : 1,
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
