import { useState, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import SafeHtml from '../components/SafeHtml';
import PaperPreview from '../components/PaperPreview';
import RichTextEditor from '../components/RichTextEditor';

export default function GroupPostCard({ post, currentUserId, currentProfile, groupName, myRole, onRefresh, onViewPaper }) {
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

  const isOwner = currentUserId === post.user_id;
  const isAdmin = myRole === 'admin';
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
    const note = groupName ? `\n\n<em style="font-size:11.5px;color:#7a7fa8">Shared from <strong>${groupName}</strong></em>` : '';
    await supabase.from('posts').insert({
      user_id:       currentUserId,
      post_type:     post.post_type,
      content:       (post.content || '') + note,
      paper_title:   post.paper_title,
      paper_journal: post.paper_journal,
      paper_doi:     post.paper_doi,
      paper_abstract:post.paper_abstract,
      paper_authors: post.paper_authors,
      paper_year:    post.paper_year,
      link_url:      post.link_url,
      link_title:    post.link_title,
      image_url:     post.image_url,
      file_type:     post.file_type,
      file_name:     post.file_name,
      tags:          post.tags || [],
      tier1:         post.tier1 || '',
      tier2:         post.tier2 || [],
      visibility:    'everyone',
    });
    await supabase.from('group_posts').update({ is_reposted_public: true }).eq('id', post.id);
    setReposted(true); setRepostConfirm(false); setReposting(false); setMenuOpen(false);
  };

  const loadComments = async () => {
    if (commLoaded) return;
    setCommLoading(true);
    const { data } = await supabase
      .from('group_post_comments')
      .select('*, profiles(name, avatar_color, avatar_url, institution)')
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
      .select('*, profiles(name, avatar_color, avatar_url, institution)')
      .single();
    if (data) { setComments(c => [...c, data]); setCommCount(n => n + 1); setCommText(''); }
    setCommSaving(false);
  };

  const deleteComment = async (id) => {
    await supabase.from('group_post_comments').delete().eq('id', id);
    setComments(c => c.filter(x => x.id !== id));
    setCommCount(n => Math.max(0, n - 1));
  };

  if (deleted) return null;

  return (
    <div style={{ background: T.w, border: `1px solid ${sticky ? T.v : T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: sticky ? `0 2px 12px rgba(108,99,255,.12)` : '0 1px 6px rgba(108,99,255,.06)' }}>

      {sticky && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: T.v2, borderBottom: `1px solid rgba(108,99,255,.15)`, fontSize: 11, color: T.v, fontWeight: 600 }}>
          📌 Pinned post
        </div>
      )}

      <div style={{ padding: 14, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <Av color={post.author_avatar || 'me'} size={36} name={post.author_name} url={post.author_avatar_url || ''}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: T.text }}>{post.author_name || 'Member'}</span>
              {roleBadge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: post.author_group_role === 'admin' ? T.v : T.s3, color: post.author_group_role === 'admin' ? '#fff' : T.mu }}>
                  {roleBadge}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: T.mu }}>
              {post.author_institution && `${post.author_institution} · `}{timeAgo(post.created_at)}
              {post.edited_at && <span> · edited</span>}
            </div>
          </div>

          {canManage && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(!menuOpen)} style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none',
                background: menuOpen ? T.s2 : 'transparent', cursor: 'pointer',
                fontSize: 16, color: T.mu, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>···</button>
              {menuOpen && (
                <>
                  <div onClick={() => { setMenuOpen(false); setConfirmDelete(false); setRepostConfirm(false); }} style={{ position: 'fixed', inset: 0, zIndex: 9 }}/>
                  <div style={{ position: 'absolute', right: 0, top: 32, background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 11, boxShadow: '0 4px 20px rgba(0,0,0,.12)', zIndex: 10, minWidth: 180, overflow: 'hidden' }}>
                    {!confirmDelete && !repostConfirm ? (
                      <>
                        {isOwner && <button onClick={() => { setEditing(true); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: T.text, textAlign: 'left' }}>✏️ Edit post</button>}
                        <button onClick={toggleSticky} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: T.text, textAlign: 'left' }}>
                          {sticky ? '📌 Unpin post' : '📌 Pin post'}
                        </button>
                        {!reposted && (
                          <button onClick={() => setRepostConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: T.bl, textAlign: 'left' }}>↗ Repost publicly</button>
                        )}
                        {reposted && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px', fontSize: 12.5, color: T.gr }}>✓ Reposted publicly</div>
                        )}
                        <div style={{ height: 1, background: T.bdr, margin: '0 10px' }}/>
                        <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: T.ro, textAlign: 'left' }}>🗑️ Delete post</button>
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
                        <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginBottom: 12 }}>
                          This will make this post visible to everyone on Luminary, including people outside this group.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setRepostConfirm(false); setMenuOpen(false); }} style={{ flex: 1, padding: '7px', border: `1px solid ${T.bdr}`, borderRadius: 9, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>Cancel</button>
                          <button onClick={repostPublic} disabled={reposting} style={{ flex: 1, padding: '7px', border: 'none', borderRadius: 9, background: T.bl, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: '#fff' }}>
                            {reposting ? '…' : 'Repost'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

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
          post.content && <SafeHtml html={post.content}/>
        )}

        {post.image_url && (
          <img src={post.image_url} alt={post.file_name || 'attachment'} style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 10, marginTop: 8 }}/>
        )}
        {post.post_type === 'paper' && post.paper_title && (
          <PaperPreview post={post} currentUserId={currentUserId} onViewPaper={onViewPaper}/>
        )}
        {post.post_type === 'link' && post.link_url && (
          <a href={post.link_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 9, padding: '10px 13px', margin: '8px 0', display: 'flex', gap: 11 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: T.am2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔗</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, marginBottom: 2 }}>{post.link_title || post.link_url}</div>
                <div style={{ fontSize: 10.5, color: T.v, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.link_url}</div>
              </div>
              <div style={{ flexShrink: 0, fontSize: 13, color: T.v, fontWeight: 700 }}>↗</div>
            </div>
          </a>
        )}

        {/* Tags */}
        {(post.tags?.length > 0) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
            {post.tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, color: T.mu, padding: '2px 8px', borderRadius: 20, background: T.s2, border: `1px solid ${T.bdr}` }}>{tag}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.bdr}` }}>
          <button onClick={toggleLike} style={{ fontSize: 12, color: liked ? T.ro : T.mu, cursor: 'pointer', padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: liked ? T.ro2 : 'transparent', border: 'none', fontFamily: 'inherit' }}>
            {liked ? '❤️' : '🤍'} {likeCount}
          </button>
          <button onClick={toggleComments} style={{ fontSize: 12, color: showComments ? T.v : T.mu, cursor: 'pointer', padding: '3px 9px', borderRadius: 20, fontWeight: 600, border: 'none', background: showComments ? T.v2 : 'transparent', fontFamily: 'inherit' }}>
            💬 {commCount}
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
              <button onClick={() => setRepostConfirm(true)} style={{ fontSize: 12, color: T.mu, cursor: 'pointer', padding: '3px 9px', borderRadius: 20, fontWeight: 600, border: 'none', background: 'transparent', fontFamily: 'inherit' }}>
                ↗ Share
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
              <Av color={c.profiles?.avatar_color || 'me'} size={28} name={c.profiles?.name} url={c.profiles?.avatar_url || ''}/>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{c.profiles?.name || 'Member'}</span>
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
            <div style={{ padding: '14px 16px', fontSize: 12.5, color: T.mu, textAlign: 'center', background: T.w }}>No comments yet.</div>
          )}
          {currentUserId && (
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', alignItems: 'flex-start', background: T.w, borderTop: `1px solid ${T.bdr}` }}>
              <Av color={currentProfile?.avatar_color || 'me'} size={28} name={currentProfile?.name} url={currentProfile?.avatar_url || ''}/>
              <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea ref={commInputRef} value={commText} onChange={e => setCommText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                  placeholder="Write a comment… (Enter to submit)"
                  rows={1}
                  style={{ flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`, borderRadius: 20, padding: '8px 14px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'none', lineHeight: 1.5, color: T.text, minHeight: 36 }}/>
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
