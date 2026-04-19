import { useState, useRef } from 'react';
import { supabase } from '../supabase';
import { T, TIER1_LIST, getTier2 } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import { useWindowSize } from '../lib/useWindowSize';
import Av from '../components/Av';
import Btn from '../components/Btn';
import SafeHtml from '../components/SafeHtml';
import FilePreview from '../components/FilePreview';
import PaperPreview from '../components/PaperPreview';
import RichTextEditor from '../components/RichTextEditor';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';

function GranularTags({ tags }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tags : tags.slice(0, 3);
  const hidden  = tags.length - 3;
  return (
    <div style={{display:'flex', gap:4, flexWrap:'wrap', marginTop:3}}>
      {visible.map(tag => (
        <span key={tag} style={{fontSize:10, color:T.mu, padding:'1px 7px', borderRadius:20, background:T.s2, border:`1px solid ${T.bdr}`}}>
          #{tag}
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <span onClick={() => setExpanded(true)}
          style={{fontSize:10, color:T.v, padding:'1px 7px', borderRadius:20, background:T.v2, border:`1px solid rgba(108,99,255,.15)`, cursor:'pointer', fontWeight:600}}>
          +{hidden} more
        </span>
      )}
    </div>
  );
}

export default function GroupPostCard({ post, currentUserId, currentProfile, groupName, myRole, onRefresh, onViewPaper }) {
  const { isMobile } = useWindowSize();
  const [liked,         setLiked]         = useState(post.user_liked || false);
  const [likeCount,     setLikeCount]     = useState(parseInt(post.like_count) || 0);
  const [saving,        setSaving]        = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [editing,       setEditing]       = useState(false);
  const [editText,      setEditText]      = useState(post.content || '');
  const [editSaving,    setEditSaving]    = useState(false);
  const [deleted,       setDeleted]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sticky,        setSticky]        = useState(post.is_sticky || false);
  const [repostConfirm, setRepostConfirm] = useState(false);
  const [reposting,     setReposting]     = useState(false);
  const [reposted,      setReposted]      = useState(post.is_reposted_public || false);

  const [showComments,  setShowComments]  = useState(false);
  const [comments,      setComments]      = useState([]);
  const [commLoaded,    setCommLoaded]    = useState(false);
  const [commLoading,   setCommLoading]   = useState(false);
  const [commText,      setCommText]      = useState('');
  const [commSaving,    setCommSaving]    = useState(false);
  const [commCount,     setCommCount]     = useState(parseInt(post.comment_count) || 0);
  const commInputRef = useRef(null);

  const [editingTags, setEditingTags] = useState(false);
  const [editTier1,   setEditTier1]   = useState(post.tier1 || '');
  const [editTier2,   setEditTier2]   = useState(post.tier2 || []);
  const [editTags,    setEditTags]    = useState(post.tags  || []);

  const isOwner  = currentUserId === post.user_id;
  const isAdmin  = myRole === 'admin';
  const canManage = isOwner || isAdmin;
  const roleBadge = post.author_display_role || (post.author_group_role === 'admin' ? 'Admin' : null);

  const toggleLike = async () => {
    if (!currentUserId || saving) return;
    setSaving(true);
    const nl = !liked; setLiked(nl); setLikeCount(c => nl ? c + 1 : Math.max(0, c - 1));
    if (nl) await supabase.from('group_post_likes').insert({ post_id: post.id, user_id: currentUserId });
    else    await supabase.from('group_post_likes').delete().eq('post_id', post.id).eq('user_id', currentUserId);
    setSaving(false);
  };

  const toggleSticky = async () => {
    const ns = !sticky; setSticky(ns);
    await supabase.from('group_posts').update({ is_sticky: ns }).eq('id', post.id);
    setMenuOpen(false);
    onRefresh?.();
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    setEditSaving(true);
    await supabase.from('group_posts').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', post.id);
    setEditSaving(false); setEditing(false); setMenuOpen(false);
    onRefresh?.();
  };

  const deletePost = async () => {
    await supabase.from('group_posts').delete().eq('id', post.id);
    setDeleted(true);
    onRefresh?.();
  };

  const repostPublic = async () => {
    setReposting(true);
    await supabase.from('posts').insert({
      user_id:        currentUserId,
      post_type:      post.post_type,
      content:        post.content || '',
      paper_title:    post.paper_title,
      paper_journal:  post.paper_journal,
      paper_doi:      post.paper_doi,
      paper_abstract: post.paper_abstract,
      paper_authors:  post.paper_authors,
      paper_year:     post.paper_year,
      link_url:       post.link_url,
      link_title:     post.link_title,
      image_url:      post.image_url,
      file_type:      post.file_type,
      file_name:      post.file_name,
      tags:           post.tags || [],
      tier1:          post.tier1 || '',
      tier2:          post.tier2 || [],
      visibility:     'everyone',
      group_id:       post.group_id,
      group_name:     groupName || '',
    });
    await supabase.from('group_posts').update({ is_reposted_public: true }).eq('id', post.id);
    setReposted(true); setRepostConfirm(false); setReposting(false); setMenuOpen(false);
  };

  const loadComments = async () => {
    if (commLoaded) return;
    setCommLoading(true);
    const { data } = await supabase
      .from('group_post_comments')
      .select('*, profiles(name, avatar_color, avatar_url, institution, profile_slug)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data || []); setCommLoaded(true); setCommLoading(false);
  };

  const toggleComments = async () => {
    const next = !showComments; setShowComments(next);
    if (next) { await loadComments(); setTimeout(() => commInputRef.current?.focus(), 100); }
  };

  const submitComment = async () => {
    if (!commText.trim() || !currentUserId || commSaving) return;
    setCommSaving(true);
    const { data } = await supabase
      .from('group_post_comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: commText.trim() })
      .select('*, profiles(name, avatar_color, avatar_url, institution, profile_slug)')
      .single();
    if (data) { setComments(c => [...c, data]); setCommCount(n => n + 1); setCommText(''); }
    setCommSaving(false);
  };

  const deleteComment = async (id) => {
    await supabase.from('group_post_comments').delete().eq('id', id);
    setComments(c => c.filter(x => x.id !== id));
    setCommCount(n => Math.max(0, n - 1));
  };

  const saveTagEdits = async () => {
    await supabase.from('group_posts').update({ tier1: editTier1, tier2: editTier2, tags: editTags }).eq('id', post.id);
    setEditingTags(false);
    onRefresh?.();
  };

  if (deleted) return null;

  return (
    <div style={{ background: T.w, border: `1px solid ${sticky ? T.v : T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: sticky ? `0 2px 12px rgba(108,99,255,.12)` : '0 1px 6px rgba(108,99,255,.06)' }}>

      {sticky && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: T.v2, borderBottom: `1px solid rgba(108,99,255,.15)`, fontSize: 11, color: T.v, fontWeight: 600 }}>
          📌 Pinned post
        </div>
      )}

      <div style={{ padding: 16, position: 'relative' }}>

        {/* Author header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <Av color={post.author_avatar || 'me'} size={38} name={post.author_name} url={post.author_avatar_url || ''}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: T.v }}>{post.author_name || 'Member'}</span>
              {roleBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: post.author_group_role === 'admin' ? T.v : T.s3, color: post.author_group_role === 'admin' ? '#fff' : T.mu }}>
                  {roleBadge}
                </span>
              )}
              {post.author_identity_tier2 && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: T.v2, color: T.v, border: `1px solid rgba(108,99,255,.2)` }}>
                  {post.author_identity_tier2}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: T.mu }}>
              {post.author_institution && `${post.author_institution} · `}{timeAgo(post.created_at)}
              {post.edited_at && <span> · edited</span>}
            </div>
          </div>

          {/* ··· menu for owners and admins */}
          {canManage && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: menuOpen ? T.s2 : 'transparent', cursor: 'pointer', fontSize: 16, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>···</button>
              {menuOpen && (
                <>
                  <div onClick={() => { setMenuOpen(false); setConfirmDelete(false); setRepostConfirm(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9 }}/>
                  <div style={{ position: 'absolute', right: 0, top: 32, background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 11, boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 10, minWidth: 180, overflow: 'hidden' }}>
                    {!confirmDelete && !repostConfirm ? (
                      <>
                        {isOwner && <button onClick={() => { setEditing(true); setMenuOpen(false); }} style={menuItemStyle(T.text)}>✏️ Edit post</button>}
                        {isOwner && <button onClick={() => { setEditingTags(true); setMenuOpen(false); }} style={menuItemStyle(T.text)}>🏷️ Edit tags</button>}
                        <button onClick={toggleSticky} style={menuItemStyle(T.text)}>{sticky ? '📌 Unpin post' : '📌 Pin post'}</button>
                        {!reposted
                          ? <button onClick={() => setRepostConfirm(true)} style={menuItemStyle(T.bl)}>↗ Repost publicly</button>
                          : <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', fontSize: 12.5, color: T.gr }}>✓ Reposted publicly</div>
                        }
                        <div style={{ height: 1, background: T.bdr, margin: '0 10px' }}/>
                        <button onClick={() => setConfirmDelete(true)} style={menuItemStyle(T.ro)}>🗑️ Delete post</button>
                      </>
                    ) : confirmDelete ? (
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: T.text }}>Delete this post?</div>
                        <div style={{ fontSize: 12, color: T.mu, marginBottom: 12 }}>This cannot be undone.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setConfirmDelete(false); setMenuOpen(false); }} style={{ flex: 1, padding: '7px', border: `1px solid ${T.bdr}`, borderRadius: 9, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>Cancel</button>
                          <button onClick={deletePost} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 9, background: T.ro, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#fff' }}>Delete</button>
                        </div>
                      </div>
                    ) : repostConfirm ? (
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: T.text }}>Repost publicly?</div>
                        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginBottom: 12 }}>This will make the post visible to everyone on Luminary.</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setRepostConfirm(false); setMenuOpen(false); }} style={{ flex: 1, padding: '7px', border: `1px solid ${T.bdr}`, borderRadius: 9, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>Cancel</button>
                          <button onClick={repostPublic} disabled={reposting} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 9, background: T.bl, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#fff' }}>{reposting ? '…' : 'Repost'}</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {editing ? (
          <div style={{ marginBottom: 12 }}>
            <RichTextEditor value={editText} onChange={setEditText} placeholder="Edit your post…" minHeight={80}/>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setEditing(false); setEditText(post.content || ''); }} style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving || !editText.trim()} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: T.v, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#fff', opacity: (editSaving || !editText.trim()) ? .6 : 1 }}>
                {editSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {post.content && <SafeHtml html={post.content} tags={post.tags}/>}
            {post.post_type === 'text' && (() => {
              const url = extractFirstUrl(post.content || '');
              return url ? <LinkPreview url={url}/> : null;
            })()}
          </>
        )}

        {/* File / image */}
        {post.image_url && <FilePreview url={post.image_url} fileType={post.file_type || 'image'} fileName={post.file_name}/>}

        {/* Paper card */}
        {post.post_type === 'paper' && post.paper_title && (
          <PaperPreview post={post} currentUserId={currentUserId} onViewPaper={onViewPaper}/>
        )}

        {/* Taxonomy tags — hidden on mobile */}
        {!isMobile && (post.tier2?.length > 0 || post.tags?.length > 0) && !editingTags && (
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${T.bdr}` }}>
            {post.tier2?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {post.tier2.map(t => (
                  <span key={t} style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 20, background: T.v2, color: T.v, border: `1px solid rgba(108,99,255,.15)` }}>{t}</span>
                ))}
              </div>
            )}
            {post.tags?.length > 0 && <GranularTags tags={post.tags}/>}
          </div>
        )}

        {/* Inline tag editor */}
        {editingTags && (
          <div style={{ background: T.s2, borderRadius: 10, padding: 12, marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: T.mu }}>
              Discipline: {editTier1 || 'Not set'}
            </div>
            <select value={editTier1} onChange={e => { setEditTier1(e.target.value); setEditTier2([]); }}
              style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.bdr}`, background: T.w, fontSize: 12, fontFamily: 'inherit', marginBottom: 8, color: T.text }}>
              <option value="">Select discipline…</option>
              {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {editTier1 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {getTier2(editTier1).map(t => (
                  <button key={t} onClick={() => setEditTier2(prev => prev.includes(t) ? prev.filter(x => x !== t) : prev.length < 3 ? [...prev, t] : prev)}
                    style={{ padding: '2px 9px', borderRadius: 20, cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', border: `1.5px solid ${editTier2.includes(t) ? T.v : T.bdr}`, background: editTier2.includes(t) ? T.v2 : T.w, color: editTier2.includes(t) ? T.v : T.text }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 4 }}>Specific tags (comma separated):</div>
            <input value={editTags.join(', ')} onChange={e => setEditTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
              placeholder="e.g. p53_mutation, CRISPR_cas9"
              style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.bdr}`, background: T.w, fontSize: 12, fontFamily: 'inherit', marginBottom: 8, color: T.text, boxSizing: 'border-box' }}/>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => setEditingTags(false)}>Cancel</Btn>
              <Btn variant="s" onClick={saveTagEdits}>Save</Btn>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8, marginTop: isMobile ? 6 : 10, paddingTop: isMobile ? 8 : 10, borderTop: `1px solid ${T.bdr}` }}>
          <button onClick={toggleLike} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '6px 8px' : '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: liked ? T.ro : T.mu, fontFamily: 'inherit', fontSize: isMobile ? 12 : 13 }}>
            <svg width={isMobile ? 15 : 16} height={isMobile ? 15 : 16} viewBox="0 0 24 24" fill={liked ? T.ro : 'none'} stroke={liked ? T.ro : T.mu} strokeWidth="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {(!isMobile || likeCount > 0) && <span>{likeCount}</span>}
          </button>
          <button onClick={toggleComments} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '6px 8px' : '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: T.mu, fontFamily: 'inherit', fontSize: isMobile ? 12 : 13 }}>
            <svg width={isMobile ? 15 : 16} height={isMobile ? 15 : 16} viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {(!isMobile || commCount > 0) && <span>{commCount}</span>}
          </button>
          <div style={{ marginLeft: 'auto' }}>
            {reposted ? (
              <span style={{ fontSize: 11, color: T.gr, fontWeight: 600 }}>✓ Shared publicly</span>
            ) : repostConfirm ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: T.mu }}>Share to public feed?</span>
                <button onClick={repostPublic} disabled={reposting} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: T.bl, border: 'none', borderRadius: 20, padding: '3px 11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {reposting ? '…' : 'Share'}
                </button>
                <button onClick={() => setRepostConfirm(false)} style={{ fontSize: 11.5, color: T.mu, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setRepostConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '6px 8px' : '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: T.mu, fontFamily: 'inherit', fontSize: isMobile ? 12 : 13 }}>
                <svg width={isMobile ? 15 : 16} height={isMobile ? 15 : 16} viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                {!isMobile && <span>Share</span>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ borderTop: `1px solid ${T.bdr}`, background: T.s2 }}>
          {commLoading && <div style={{ padding: '14px 16px', fontSize: 12.5, color: T.mu }}>Loading comments…</div>}
          {!commLoading && comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${T.bdr}`, background: T.w }}>
              <Av color={c.profiles?.avatar_color || 'me'} size={30} name={c.profiles?.name} url={c.profiles?.avatar_url || ''}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.v }}>{c.profiles?.name || 'Member'}</span>
                  {c.profiles?.institution && <span style={{ fontSize: 10.5, color: T.mu }}>{c.profiles.institution}</span>}
                  <span style={{ fontSize: 10.5, color: T.mu, marginLeft: 'auto' }}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: T.text, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{c.content}</div>
              </div>
              {currentUserId === c.user_id && (
                <button onClick={() => deleteComment(c.id)} style={{ fontSize: 12, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', opacity: .5, padding: '0 4px', alignSelf: 'flex-start' }}>✕</button>
              )}
            </div>
          ))}
          {!commLoading && comments.length === 0 && commLoaded && (
            <div style={{ padding: '14px 16px', fontSize: 12.5, color: T.mu, textAlign: 'center', background: T.w }}>No comments yet — be the first to reply.</div>
          )}
          {currentUserId && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', alignItems: 'flex-start', background: T.w, borderTop: `1px solid ${T.bdr}` }}>
              <Av color={currentProfile?.avatar_color || 'me'} size={30} name={currentProfile?.name} url={currentProfile?.avatar_url || ''}/>
              <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea ref={commInputRef} value={commText} onChange={e => setCommText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                  placeholder="Write a comment… (Enter to submit, Shift+Enter for new line)"
                  rows={1}
                  style={{ flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 20, padding: '8px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', lineHeight: 1.5, color: T.text, minHeight: 36, maxHeight: 120, overflowY: 'auto' }}/>
                <button onClick={submitComment} disabled={commSaving || !commText.trim()}
                  style={{ padding: '8px 16px', borderRadius: 20, border: 'none', background: commText.trim() ? T.v : T.bdr, color: commText.trim() ? '#fff' : T.mu, cursor: commText.trim() ? 'pointer' : 'default', fontSize: 12, fontFamily: 'inherit', fontWeight: 700, flexShrink: 0 }}>
                  {commSaving ? '…' : 'Reply'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function menuItemStyle(color) {
  return { display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color, textAlign: 'left' };
}
