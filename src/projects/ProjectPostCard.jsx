import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import SafeHtml from '../components/SafeHtml';
import PaperPreview from '../components/PaperPreview';
import FilePreview from '../components/FilePreview';

export default function ProjectPostCard({ post, currentUserId, myRole, activeFolderId, onRefresh }) {
  const [liked,         setLiked]         = useState(post.user_liked || false);
  const [likeCount,     setLikeCount]     = useState(parseInt(post.like_count) || 0);
  const [sticky,        setSticky]        = useState(post.is_sticky || false);
  const [deleted,       setDeleted]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing,       setEditing]       = useState(false);
  const [editText,      setEditText]      = useState(post.content || '');
  const [editSaving,    setEditSaving]    = useState(false);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [showComments,  setShowComments]  = useState(false);
  const [comments,      setComments]      = useState([]);
  const [commLoaded,    setCommLoaded]    = useState(false);
  const [commLoading,   setCommLoading]   = useState(false);
  const [commText,      setCommText]      = useState('');
  const [commSaving,    setCommSaving]    = useState(false);
  const [commCount,     setCommCount]     = useState(parseInt(post.comment_count) || 0);
  const menuRef  = useRef(null);
  const commRef  = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (deleted) return null;

  const isOwn    = post.user_id === currentUserId;
  const isOwner  = myRole === 'owner';
  const canAdmin = isOwn || isOwner;
  const canEdit  = isOwn;

  const toggleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);
    if (newLiked) {
      await supabase.from('project_post_likes').insert({ post_id: post.id, user_id: currentUserId });
    } else {
      await supabase.from('project_post_likes').delete()
        .eq('post_id', post.id).eq('user_id', currentUserId);
    }
  };

  const toggleSticky = async () => {
    const next = !sticky;
    setSticky(next);
    await supabase.from('project_posts').update({ is_sticky: next }).eq('id', post.id);
    onRefresh?.();
  };

  const deletePost = async () => {
    await supabase.from('project_posts').delete().eq('id', post.id);
    setDeleted(true);
    onRefresh?.();
  };

  const saveEdit = async () => {
    if (!editText.trim()) return;
    setEditSaving(true);
    await supabase.from('project_posts').update({
      content: editText, edited_at: new Date().toISOString(),
    }).eq('id', post.id);
    setEditing(false);
    setEditSaving(false);
    onRefresh?.();
  };

  const loadComments = async () => {
    if (commLoaded) return;
    setCommLoading(true);
    const { data } = await supabase
      .from('project_post_comments')
      .select('*, profiles(name, avatar_color, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at');
    setComments(data || []);
    setCommLoaded(true);
    setCommLoading(false);
  };

  const toggleComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
    setTimeout(() => commRef.current?.focus(), 100);
  };

  const submitComment = async () => {
    if (!commText.trim() || commSaving) return;
    setCommSaving(true);
    const { data } = await supabase.from('project_post_comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: commText.trim() })
      .select('*, profiles(name, avatar_color, avatar_url)')
      .single();
    if (data) {
      setComments(c => [...c, data]);
      setCommCount(n => n + 1);
    }
    setCommText('');
    setCommSaving(false);
  };

  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 12, color: T.mu, fontFamily: 'inherit', padding: '4px 8px',
    borderRadius: 7,
  };

  return (
    <div style={{
      background: T.w, borderRadius: 14, border: `1px solid ${T.bdr}`,
      padding: '14px 16px', position: 'relative',
    }}>
      {/* Badges row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {post.folder_name && !activeFolderId && (
          <span style={{
            fontSize: 10.5, color: T.mu, background: T.s2,
            padding: '1px 8px', borderRadius: 20, border: `1px solid ${T.bdr}`,
          }}>
            📁 {post.folder_name}
          </span>
        )}
        {sticky && (
          <span style={{
            fontSize: 10.5, color: T.am, background: T.am2,
            padding: '1px 8px', borderRadius: 20, fontWeight: 600,
          }}>
            📌 {post.is_starter ? 'Getting started' : 'Pinned'}
          </span>
        )}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Av color={post.author_avatar} url={post.author_avatar_url} name={post.author_name} size={34}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{post.author_name}</div>
          <div style={{ fontSize: 11, color: T.mu }}>{timeAgo(post.created_at)}{post.edited_at ? ' · edited' : ''}</div>
        </div>
        {canAdmin && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button onClick={() => setMenuOpen(o => !o)} style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 16, color: T.mu, padding: '0 4px',
            }}>···</button>
            {menuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', zIndex: 50,
                background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 10,
                boxShadow: '0 4px 20px rgba(0,0,0,.12)', padding: '4px 0',
                minWidth: 150,
              }}>
                {canEdit && (
                  <button onClick={() => { setEditing(true); setMenuOpen(false); }} style={{
                    display: 'block', width: '100%', padding: '8px 14px',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left', color: T.text,
                  }}>✏️ Edit</button>
                )}
                {isOwner && (
                  <button onClick={() => { toggleSticky(); setMenuOpen(false); }} style={{
                    display: 'block', width: '100%', padding: '8px 14px',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left', color: T.text,
                  }}>{sticky ? '📌 Unpin' : '📌 Pin post'}</button>
                )}
                <button onClick={() => { setConfirmDelete(true); setMenuOpen(false); }} style={{
                  display: 'block', width: '100%', padding: '8px 14px',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, textAlign: 'left', color: T.ro,
                }}>🗑️ Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {editing ? (
        <div>
          <textarea
            value={editText} onChange={e => setEditText(e.target.value)}
            style={{
              width: '100%', background: T.s2, border: `1.5px solid ${T.v}`,
              borderRadius: 10, padding: '9px 12px', fontSize: 13,
              fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              minHeight: 80, lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setEditing(false)} style={{ ...btnStyle, border: `1px solid ${T.bdr}` }}>Cancel</button>
            <button onClick={saveEdit} disabled={editSaving} style={{
              ...btnStyle, background: T.v, color: '#fff', fontWeight: 700,
            }}>{editSaving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <>
          {post.post_type === 'text' && post.content && (
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: T.text, marginBottom: 8 }}>
              <SafeHtml html={post.content}/>
            </div>
          )}
          {post.post_type === 'paper' && post.paper_title && (
            <PaperPreview post={post}/>
          )}
          {post.post_type === 'upload' && post.image_url && (
            <FilePreview url={post.image_url} fileType={post.file_type} fileName={post.file_name}/>
          )}
        </>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Delete this post?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDelete(false)} style={{ ...btnStyle, border: `1px solid ${T.bdr}` }}>Cancel</button>
            <button onClick={deletePost} style={{ ...btnStyle, background: T.ro, color: '#fff', fontWeight: 700 }}>Delete</button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 10, borderTop: `1px solid ${T.bdr}`, paddingTop: 8 }}>
        <button onClick={toggleLike} style={{ ...btnStyle, color: liked ? T.ro : T.mu, fontWeight: liked ? 700 : 400 }}>
          {liked ? '❤️' : '🤍'} {likeCount > 0 ? likeCount : ''}
        </button>
        <button onClick={toggleComments} style={{ ...btnStyle }}>
          💬 {commCount > 0 ? commCount : ''}
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${T.bdr}`, paddingTop: 10 }}>
          {commLoading && <div style={{ fontSize: 12, color: T.mu, padding: '4px 0' }}>Loading…</div>}
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <Av color={c.profiles?.avatar_color} url={c.profiles?.avatar_url} name={c.profiles?.name} size={26}/>
              <div style={{ flex: 1, background: T.s2, borderRadius: 10, padding: '7px 11px' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 2 }}>{c.profiles?.name}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{c.content}</div>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              ref={commRef}
              value={commText}
              onChange={e => setCommText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); }}}
              placeholder="Write a comment…"
              style={{
                flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`,
                borderRadius: 10, padding: '7px 12px', fontSize: 12.5,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button onClick={submitComment} disabled={!commText.trim() || commSaving} style={{
              background: T.v, color: '#fff', border: 'none', borderRadius: 10,
              padding: '0 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 700,
            }}>
              {commSaving ? '…' : '→'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
