import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, TIER1_LIST, getTier2, DISCUSSION_PROMPTS, ZERO_COMMENT_PROMPTS, getDiscussionPrompts, LUMENS_ENABLED } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import { useWindowSize } from '../lib/useWindowSize';
import Av from '../components/Av';
import Btn from '../components/Btn';
import FollowBtn from '../components/FollowBtn';
import SafeHtml from '../components/SafeHtml';
import FilePreview from '../components/FilePreview';
import PaperPreview from '../components/PaperPreview';
import RichTextEditor from '../components/RichTextEditor';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import ShareModal from '../components/ShareModal';
import ReportModal from '../components/ReportModal';

// Awards Lumens for a comment: 2 to the commenter (creation), and 5 to the
// post owner the first time each commenter comments on this post (engagement).
// Self-comments earn no engagement Lumens. Best-effort — failures swallowed.
// Gated on LUMENS_ENABLED so a missing RPC can never break the comment flow.
async function awardLumensForComment(post, commenterId) {
  if (!LUMENS_ENABLED) return;
  try {
    supabase.rpc('award_lumens', {
      p_user_id:  commenterId,
      p_amount:   2,
      p_reason:   'comment_posted',
      p_category: 'creation',
      p_meta:     { post_id: post.id },
    }).then(() => {}, () => {});

    if (post?.user_id && post.user_id !== commenterId) {
      const { count } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id',  post.id)
        .eq('user_id',  commenterId);
      // After the insert, count === 1 means this is the commenter's first
      // comment on this post → first-time engagement, award the post owner.
      if (count === 1) {
        supabase.rpc('award_lumens', {
          p_user_id:  post.user_id,
          p_amount:   10,
          p_reason:   'comment_received',
          p_category: 'engagement',
          p_meta:     { post_id: post.id, actor_id: commenterId },
        }).then(() => {}, () => {});
      }

      // Discussion threshold: when distinct commenter count just hits 3,
      // award the post owner +50 Lumens (recognition). One-time per post —
      // dedup via lumen_transactions row check on (post.user_id, reason,
      // meta.post_id).
      const { data: distinct } = await supabase
        .from('comments')
        .select('user_id')
        .eq('post_id', post.id);
      const uniq = new Set((distinct || []).map(r => r.user_id));
      if (uniq.size === 3) {
        const { data: existing } = await supabase
          .from('lumen_transactions')
          .select('id')
          .eq('user_id', post.user_id)
          .eq('reason',  'discussion_threshold')
          .filter('meta->>post_id', 'eq', post.id)
          .limit(1);
        if (!existing?.length) {
          supabase.rpc('award_lumens', {
            p_user_id:  post.user_id,
            p_amount:   50,
            p_reason:   'discussion_threshold',
            p_category: 'recognition',
            p_meta:     { post_id: post.id },
          }).then(() => {}, () => {});
        }
      }
    }
  } catch {
    // Swallow any sync/async failure so the comment flow always completes.
  }
}

// Inserts a new_comment notification for the post owner, deduped so a flurry
// of comments while the previous one is still unread doesn't pile up.
async function notifyPostOwnerOfComment(post, commenterId) {
  if (!post?.user_id || post.user_id === commenterId) return;
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id',    post.user_id)
    .eq('notif_type', 'new_comment')
    .eq('target_id',  post.id)
    .eq('read',       false)
    .maybeSingle();
  if (existing) return;
  await supabase.from('notifications').insert({
    user_id:    post.user_id,
    actor_id:   commenterId,
    notif_type: 'new_comment',
    target_id:  post.id,
    read:       false,
  });
}

function GranularTags({ tags, onTagClick }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tags : tags.slice(0, 3);
  const hidden  = tags.length - 3;
  return (
    <div style={{display:'flex', gap:4, flexWrap:'wrap', marginTop:3}}>
      {visible.map(tag => (
        <span key={tag} onClick={() => onTagClick && onTagClick(tag)}
          style={{fontSize:10, color:T.mu, padding:'1px 7px', borderRadius:20, background:T.s2, border:`1px solid ${T.bdr}`, cursor:'pointer'}}>
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

export default function PostCard({ post, currentUserId, currentProfile, onRefresh, onViewUser, onUnfollow, onViewPaper, hidePaperDetails, onTagClick, onViewGroup, isSaved = false, onSaveToggled }) {
  const { isMobile } = useWindowSize();
  const [liked,setLiked]             = useState(post.user_liked||false);
  const [likeCount,setLikeCount]     = useState(parseInt(post.like_count)||0);
  const [reposted,setReposted]       = useState(post.user_reposted||false);
  const [repostCount,setRepostCount] = useState(parseInt(post.repost_count)||0);
  const [reposting,setReposting]     = useState(false);
  const [saving,setSaving]           = useState(false);
  const [saved,setSaved]             = useState(isSaved);
  useEffect(() => { setSaved(isSaved); }, [isSaved]);
  const [menuOpen,setMenuOpen]       = useState(false);
  const [editing,setEditing]       = useState(false);
  const [editText,setEditText]     = useState(post.content||'');
  const [editSaving,setEditSaving] = useState(false);
  const [deleted,setDeleted]       = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const [showComments,setShowComments]   = useState(false);
  const [showShare,setShowShare]         = useState(false);
  const [showReport,setShowReport]       = useState(false);

  const [comments,  setComments]   = useState([]);
  const [commLoaded,setCommLoaded] = useState(false);
  const [commLoading,setCommLoading]=useState(false);
  const [commText,  setCommText]   = useState('');
  const [commSaving,setCommSaving] = useState(false);
  const [commCount, setCommCount]  = useState(parseInt(post.comment_count)||0);
  const commInputRef = useRef(null);

  const [editingTags, setEditingTags] = useState(false);
  const [editTier1,   setEditTier1]   = useState(post.tier1 || '');
  const [editTier2,   setEditTier2]   = useState(post.tier2 || []);
  const [editTags,    setEditTags]    = useState(post.tags  || []);

  const [abstractExpanded, setAbstractExpanded] = useState(false);
  const [topComment,       setTopComment]       = useState(null);
  const [commenterAvatars, setCommenterAvatars] = useState([]);
  const [showReplyBox,     setShowReplyBox]     = useState(false);
  const [replyText,        setReplyText]        = useState('');
  const [promptIndex,      setPromptIndex]      = useState(() => Math.floor(Math.random() * 10));

  useEffect(() => {
    if (!post.comment_count || post.comment_count === 0) return;
    supabase
      .from('comments')
      .select('id, content, created_at, profiles(name, avatar_url, avatar_color)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => { if (data) setTopComment(data); });
    supabase
      .from('comments')
      .select('user_id, profiles(name, avatar_url, avatar_color)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const seen = new Set();
        const unique = data.filter(c => {
          if (seen.has(c.user_id)) return false;
          seen.add(c.user_id);
          return true;
        });
        setCommenterAvatars(unique.slice(0, 3));
      });
  }, [post.id, post.comment_count]);

  const isOwner = currentUserId && currentUserId === post.user_id;

  // Milestone post — special celebration card, no social actions
  if (post.post_type === 'milestone') {
    const slug = post.author_slug || currentProfile?.profile_slug;
    const cardUrl = slug ? `${window.location.origin}/c/${slug}` : null;
    return (
      <div style={{
        background: 'linear-gradient(135deg, #eeecff 0%, #f0f9ff 100%)',
        border: `1.5px solid rgba(108,99,255,.25)`,
        borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(108,99,255,.1)',
      }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg, #667eea, #764ba2, #f093fb)' }}/>
        <div style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, marginBottom: 6, color: T.text }}>
            Profile complete!
          </div>
          <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: 14 }}>
            Your Luminary profile is ready. Share it with colleagues, print your QR code on a poster, or exchange your virtual business card at your next conference.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {slug && (
              <a href={`${window.location.origin}/p/${slug}`} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #6c63ff, #764ba2)',
                  color: '#fff', fontSize: 12.5, fontWeight: 700,
                  textDecoration: 'none', display: 'inline-block',
                }}>
                View my profile →
              </a>
            )}
            {cardUrl && (
              <a href={cardUrl} target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  border: `1.5px solid rgba(108,99,255,.3)`, background: 'transparent',
                  color: T.v, fontSize: 12.5, fontWeight: 600,
                  textDecoration: 'none', display: 'inline-block',
                }}>
                🪪 Virtual business card
              </a>
            )}
            {slug && (
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/p/${slug}`)}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  border: `1.5px solid ${T.bdr}`, background: 'transparent',
                  color: T.mu, fontSize: 12.5, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                📋 Copy profile link
              </button>
            )}
          </div>

          <div style={{
            background: 'rgba(108,99,255,.07)', borderRadius: 9,
            padding: '9px 12px', fontSize: 12, color: T.v, lineHeight: 1.6,
          }}>
            💡 <strong>Tip:</strong> Your QR code is in your profile under <em>Share</em>. Add it to a poster or slide so colleagues can find you instantly.
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: T.mu }}>
            Only visible to you · {timeAgo(post.created_at)}
          </div>
        </div>
      </div>
    );
  }

  const goToProfile = (userId, slug) => {
    if (onViewUser && userId) { onViewUser(userId); return; }
    if (slug) window.location.href = `/p/${slug}`;
  };

  const toggleRepost = async () => {
    if (!currentUserId || reposting) return;
    setReposting(true);
    const nr = !reposted;
    setReposted(nr); setRepostCount(c => nr ? c+1 : Math.max(0,c-1));
    if (nr) {
      await supabase.from('reposts').insert({user_id:currentUserId, post_id:post.id});
      // Reward the post owner +20 Lumens for the repost (recognition).
      // Skip self-reposts. Best-effort.
      if (LUMENS_ENABLED && post?.user_id && post.user_id !== currentUserId) {
        try {
          supabase.rpc('award_lumens', {
            p_user_id:  post.user_id,
            p_amount:   20,
            p_reason:   'post_reposted',
            p_category: 'recognition',
            p_meta:     { post_id: post.id, actor_id: currentUserId },
          }).then(() => {}, () => {});
        } catch {}
      }
    } else {
      await supabase.from('reposts').delete().eq('user_id',currentUserId).eq('post_id',post.id);
    }
    setReposting(false);
  };

  const toggleLike = async () => {
    if(!currentUserId||saving) return;
    setSaving(true);
    const nl=!liked; setLiked(nl); setLikeCount(c=>nl?c+1:c-1);
    if(nl) { await supabase.from('likes').insert({user_id:currentUserId,post_id:post.id}); capture('post_liked'); }
    else await supabase.from('likes').delete().eq('user_id',currentUserId).eq('post_id',post.id);
    setSaving(false);
  };

  const saveEdit = async () => {
    if(!editText.trim()) return;
    setEditSaving(true);
    await supabase.from('posts').update({ content: editText.trim() }).eq('id', post.id);
    setEditSaving(false); setEditing(false); setMenuOpen(false);
    onRefresh && onRefresh();
  };

  const deletePost = async () => {
    await supabase.from('posts').delete().eq('id', post.id);
    setDeleted(true);
    onRefresh && onRefresh();
  };

  const loadComments = async () => {
    if (commLoaded) return;
    setCommLoading(true);
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(name, avatar_color, avatar_url, institution, profile_slug)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });
    setComments(data||[]);
    setCommLoaded(true);
    setCommLoading(false);
  };

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      await loadComments();
      setTimeout(() => commInputRef.current?.focus(), 100);
    }
  };

  const submitComment = async () => {
    if (!commText.trim() || !currentUserId || commSaving) return;
    setCommSaving(true);
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: commText.trim() })
      .select('*, profiles(name, avatar_color, avatar_url, institution, profile_slug)')
      .single();
    if (data) {
      setComments(c => [...c, data]);
      setCommCount(n => n + 1);
      setCommText('');
      capture('comment_posted');
      await awardLumensForComment(post, currentUserId);
      await notifyPostOwnerOfComment(post, currentUserId);
    }
    setCommSaving(false);
  };

  const deleteComment = async (id) => {
    await supabase.from('comments').delete().eq('id', id);
    setComments(c => c.filter(x => x.id !== id));
    setCommCount(n => Math.max(0, n - 1));
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    if (next) {
      await supabase.from('saved_posts').insert({ user_id: currentUserId, post_id: post.id });
    } else {
      await supabase.from('saved_posts').delete().eq('user_id', currentUserId).eq('post_id', post.id);
    }
    onSaveToggled?.();
  };

  const saveTagEdits = async () => {
    await supabase.from('posts').update({ tier1: editTier1, tier2: editTier2, tags: editTags }).eq('id', post.id);
    setEditingTags(false);
    onRefresh && onRefresh();
  };

  const submitQuickReply = async () => {
    if (!replyText.trim() || !currentUserId) return;
    const text = replyText.trim();
    setReplyText('');
    setShowReplyBox(false);
    await supabase.from('comments').insert({
      post_id: post.id,
      user_id: currentUserId,
      content: text,
    });
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, profiles(name, avatar_url, avatar_color)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) setTopComment(data);
    setPromptIndex(i => i + 1);
    await awardLumensForComment(post, currentUserId);
    await notifyPostOwnerOfComment(post, currentUserId);
  };

  const isRelevantToUser = () => {
    if (!currentProfile || !post.comment_count) return false;
    if (post.tier1 && post.tier1 === currentProfile.identity_tier1) return true;
    if (post.tier2?.includes(currentProfile.identity_tier2)) return true;
    const interests = new Set((currentProfile.topic_interests || []).map(t => t.toLowerCase()));
    if ((post.tier2 || []).some(t => interests.has(t.toLowerCase()))) return true;
    return false;
  };

  const getRelevanceLabel = () => {
    const count = post.comment_count;
    const field = post.tier2?.[0] || post.tier1 || 'your field';
    if (count === 1) return `1 researcher in ${field} is discussing this`;
    return `${count} researchers in ${field} are discussing this`;
  };

  if (deleted) return null;

  return (
    <div style={{
      borderLeft: post.is_admin_post ? `3px solid ${T.v}` : 'none',
      paddingLeft: post.is_admin_post ? 12 : 0,
      marginLeft: post.is_admin_post ? -12 : 0,
    }}>
    {post.is_admin_post && (
      <div style={{ fontSize: 11, fontWeight: 700, color: T.v, marginBottom: 4, letterSpacing: 0.3, paddingLeft: 2 }}>
        ✦ FROM LUMINARY TEAM
      </div>
    )}
    <div style={{
      background: post.bg_color || T.w,
      border: post.is_deep_dive ? `1.5px solid rgba(108,99,255,.25)` : `1px solid ${T.bdr}`,
      borderLeft: post.is_deep_dive ? `4px solid ${T.v}` : undefined,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 2px 12px rgba(108,99,255,.07)",
    }}>

      {/* Group source banner — entire row is clickable */}
      {post.group_id && post.group_name && (
        <div
          onClick={e=>{ e.stopPropagation(); onViewGroup?.(post.group_id); }}
          style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",background:T.v2,borderBottom:`1px solid ${T.bdr}`,fontSize:11.5,color:T.mu,fontWeight:600,cursor:onViewGroup?"pointer":"default"}}
        >
          🔬 Shared from <span style={{color:T.v,fontWeight:700}}>{post.group_name}</span>
          {onViewGroup && <span style={{marginLeft:"auto",fontSize:10.5,color:T.v}}>Open group →</span>}
        </div>
      )}

      {/* Repost banner */}
      {post.isRepost&&(
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",background:T.s2,borderBottom:`1px solid ${T.bdr}`,fontSize:11.5,color:T.mu,fontWeight:600}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
          <span onClick={()=>goToProfile(post.reposter_id,post.reposter_slug)} style={{cursor:"pointer"}}>
            {post.reposter_name||"Someone"} reposted
          </span>
        </div>
      )}

      <div style={{padding: isMobile ? '10px 12px' : 16, position:"relative"}}>

        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
          <div onClick={()=>goToProfile(post.user_id,post.author_slug)} style={{cursor:"pointer",flexShrink:0}}>
            <Av color={post.author_avatar||"me"} size={38} name={post.author_name} url={post.author_avatar_url||""}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:12.5,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span onClick={()=>goToProfile(post.user_id,post.author_slug)} style={{cursor:"pointer",color:T.v}}>{post.author_name||"Researcher"}</span>
              {post.author_identity_tier2&&(
                <span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,background:T.v2,color:T.v,border:`1px solid rgba(108,99,255,.2)`}}>
                  {post.author_identity_tier2}
                </span>
              )}
            </div>
            <div style={{fontSize:10.5,color:T.mu}}>
              {post.author_institution&&`${post.author_institution} · `}{timeAgo(post.created_at)}
              {post.edited_at&&<span style={{color:T.mu,fontSize:10}}> · edited</span>}
            </div>
            {currentProfile?.is_admin && post.report_count > 0 && (
              <div style={{display:'flex',gap:4,marginTop:3,flexWrap:'wrap'}}>
                <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:T.am,background:T.am2,padding:'2px 8px',borderRadius:20}}>
                  🚩 {post.report_count} report{post.report_count > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {!isOwner&&post.user_id&&(
            <FollowBtn targetType="user" targetId={post.user_id} currentUserId={currentUserId}
              onToggle={nowFollowing => { if (!nowFollowing) onUnfollow?.(post.user_id); }}/>
          )}

          {currentUserId&&!isOwner&&(
            <div style={{position:"relative"}}>
              <button onClick={()=>setMenuOpen(!menuOpen)}
                style={{width:28,height:28,borderRadius:"50%",border:"none",background:menuOpen?T.s2:"transparent",cursor:"pointer",fontSize:16,color:T.mu,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                ···
              </button>
              {menuOpen&&(
                <>
                  <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:9}}/>
                  <div style={{position:"absolute",right:0,top:32,background:T.w,border:`1px solid ${T.bdr}`,borderRadius:11,boxShadow:"0 4px 20px rgba(0,0,0,.12)",zIndex:10,minWidth:140,overflow:"hidden"}}>
                    <button onClick={()=>{setShowReport(true);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"11px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",color:T.text,textAlign:"left"}}>🚩 Report</button>
                  </div>
                </>
              )}
            </div>
          )}

          {isOwner&&(
            <div style={{position:"relative"}}>
              <button onClick={()=>setMenuOpen(!menuOpen)}
                style={{width:28,height:28,borderRadius:"50%",border:"none",background:menuOpen?T.s2:"transparent",cursor:"pointer",fontSize:16,color:T.mu,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                ···
              </button>
              {menuOpen&&(
                <>
                  <div onClick={()=>{setMenuOpen(false);setConfirmDelete(false);}} style={{position:"fixed",inset:0,zIndex:9}}/>
                  <div style={{position:"absolute",right:0,top:32,background:T.w,border:`1px solid ${T.bdr}`,borderRadius:11,boxShadow:"0 4px 20px rgba(0,0,0,.12)",zIndex:10,minWidth:160,overflow:"hidden"}}>
                    {!confirmDelete?(
                      <>
                        <button onClick={()=>{setEditing(true);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"11px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",color:T.text,textAlign:"left"}}>✏️ Edit post</button>
                        <button onClick={()=>{setEditingTags(true);setMenuOpen(false);}} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"11px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",color:T.text,textAlign:"left"}}>🏷️ Edit tags</button>
                        <div style={{height:1,background:T.bdr,margin:"0 10px"}}/>
                        <button onClick={()=>setConfirmDelete(true)} style={{display:"flex",alignItems:"center",gap:9,width:"100%",padding:"11px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"inherit",color:T.ro,textAlign:"left"}}>🗑️ Delete post</button>
                      </>
                    ):(
                      <div style={{padding:"14px 16px"}}>
                        <div style={{fontSize:13,fontWeight:700,marginBottom:4,color:T.text}}>Delete this post?</div>
                        <div style={{fontSize:12,color:T.mu,marginBottom:12}}>This cannot be undone.</div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{setConfirmDelete(false);setMenuOpen(false);}} style={{flex:1,padding:"7px",border:`1px solid ${T.bdr}`,borderRadius:9,background:T.w,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600,color:T.mu}}>Cancel</button>
                          <button onClick={deletePost} style={{flex:1,padding:"7px",border:"none",borderRadius:9,background:T.ro,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700,color:"#fff"}}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Post type badge */}
        {post.is_deep_dive && (
          <div style={{marginBottom: 8}}>
            <span style={{
              fontSize: 10.5, fontWeight: 700,
              padding: '2px 9px', borderRadius: 20,
              background: T.v2, color: T.v,
              border: `1px solid rgba(108,99,255,.2)`,
            }}>
              🔬 Deep Dive
            </span>
          </div>
        )}

        {editing ? (
          <div style={{marginBottom:12}}>
            <RichTextEditor value={editText} onChange={setEditText} placeholder="Edit your post..." minHeight={80}/>
            <div style={{display:"flex",gap:8,marginTop:8,justifyContent:"flex-end"}}>
              <button onClick={()=>{setEditing(false);setEditText(post.content||'');}} style={{padding:"6px 14px",borderRadius:20,border:`1px solid ${T.bdr}`,background:T.w,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600,color:T.mu}}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving||!editText.trim()} style={{padding:"6px 16px",borderRadius:20,border:"none",background:T.v,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700,color:"#fff",opacity:(editSaving||!editText.trim())?.6:1}}>{editSaving?"Saving...":"Save changes"}</button>
            </div>
          </div>
        ) : (
          <>
            {post.content&&(
              <div className={post.is_deep_dive ? 'deep-dive-content' : undefined}
                style={{fontSize: post.is_deep_dive ? 15 : undefined, lineHeight: post.is_deep_dive ? 1.7 : undefined}}>
                <SafeHtml html={post.content} tags={post.tags} onTagClick={onTagClick}/>
              </div>
            )}
            {post.post_type==='text'&&(()=>{
              const url = extractFirstUrl(post.content||'');
              return url ? <LinkPreview url={url}/> : null;
            })()}
          </>
        )}

        {post.file_deleted_at ? (
          <div style={{
            marginTop:10, padding:'10px 14px', borderRadius:10,
            background:T.s2, border:`1px dashed ${T.bdr}`,
            fontSize:12.5, color:T.mu, fontStyle:'italic',
          }}>
            📎 File removed by author
          </div>
        ) : post.image_url ? (
          <FilePreview url={post.image_url} fileType={post.file_type||'image'} fileName={post.file_name}/>
        ) : null}
        {post.post_type==='paper'&&post.paper_title&&!hidePaperDetails&&<PaperPreview post={post} currentUserId={currentUserId} onViewPaper={onViewPaper} abstractExpanded={abstractExpanded} onToggleAbstract={() => setAbstractExpanded(e => !e)}/>}

        {/* Taxonomy tags — hidden on mobile */}
        {!isMobile && (post.tier2?.length > 0 || post.tags?.length > 0) && !editingTags && (
          <div style={{marginTop:8, paddingTop:6, borderTop:`1px solid ${T.bdr}`}}>
            {post.tier2?.length > 0 && (
              <div style={{display:'flex', gap:4, flexWrap:'wrap', marginBottom:4}}>
                {post.tier2.map(t => (
                  <span key={t} onClick={() => onTagClick && onTagClick(t)}
                    style={{fontSize:10.5, fontWeight:600, padding:'1px 8px', borderRadius:20, background:T.v2, color:T.v, border:`1px solid rgba(108,99,255,.15)`, cursor:'pointer'}}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {post.tags?.length > 0 && <GranularTags tags={post.tags} onTagClick={onTagClick}/>}
          </div>
        )}

        {/* Inline tag editor */}
        {editingTags && (
          <div style={{background:T.s2, borderRadius:10, padding:12, marginTop:8}}>
            <div style={{fontSize:12, fontWeight:600, marginBottom:6, color:T.mu}}>
              Discipline: {editTier1 || 'Not set'}
            </div>
            <select value={editTier1} onChange={e=>{setEditTier1(e.target.value); setEditTier2([]);}}
              style={{width:'100%', padding:'6px 10px', borderRadius:8, border:`1.5px solid ${T.bdr}`, background:T.w, fontSize:12, fontFamily:'inherit', marginBottom:8, color:T.text}}>
              <option value="">Select discipline…</option>
              {TIER1_LIST.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            {editTier1 && (
              <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:8}}>
                {getTier2(editTier1).map(t=>(
                  <button key={t} onClick={()=>setEditTier2(prev=>prev.includes(t)?prev.filter(x=>x!==t):prev.length<3?[...prev,t]:prev)}
                    style={{padding:'2px 9px', borderRadius:20, cursor:'pointer', fontSize:11.5, fontFamily:'inherit', border:`1.5px solid ${editTier2.includes(t)?T.v:T.bdr}`, background:editTier2.includes(t)?T.v2:T.w, color:editTier2.includes(t)?T.v:T.text}}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div style={{fontSize:11.5, color:T.mu, marginBottom:4}}>Specific tags (comma separated):</div>
            <input value={editTags.join(', ')} onChange={e=>setEditTags(e.target.value.split(',').map(t=>t.trim()).filter(Boolean))}
              placeholder="e.g. p53_mutation, CRISPR_cas9"
              style={{width:'100%', padding:'6px 10px', borderRadius:8, border:`1.5px solid ${T.bdr}`, background:T.w, fontSize:12, fontFamily:'inherit', marginBottom:8, color:T.text, boxSizing:'border-box'}}/>
            <div style={{display:'flex', gap:8}}>
              <Btn onClick={()=>setEditingTags(false)}>Cancel</Btn>
              <Btn variant="s" onClick={saveTagEdits}>Save</Btn>
            </div>
          </div>
        )}

        {/* Relevance hook — shown when post.tier1 matches viewer's field and there are comments */}
        {isRelevantToUser() && (
          <div style={{
            fontSize: 11.5, color: T.v, fontWeight: 600,
            marginBottom: 8, marginTop: 6,
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill={T.v}>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            {getRelevanceLabel()}
          </div>
        )}

        {/* Action bar */}
        <div style={{display:'flex', alignItems:'center', gap:isMobile?4:8, marginTop:isMobile?6:10, paddingTop:isMobile?8:10, borderTop:`1px solid ${T.bdr}`}}>
          <button onClick={toggleLike} style={{display:'flex', alignItems:'center', gap:4, padding:isMobile?'6px 8px':'8px 10px', border:'none', background:'transparent', cursor:'pointer', color:liked?T.ro:T.mu, fontFamily:'inherit', fontSize:isMobile?12:13}}>
            <svg width={isMobile?15:16} height={isMobile?15:16} viewBox="0 0 24 24" fill={liked?T.ro:'none'} stroke={liked?T.ro:T.mu} strokeWidth="1.8">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {(!isMobile || likeCount > 0) && <span>{likeCount}</span>}
          </button>

          {/* Comment button with stacked commenter avatars */}
          <button onClick={toggleComments} style={{
            display:'flex', alignItems:'center', gap:5,
            border:'none', background:'transparent',
            cursor:'pointer', padding:isMobile?'6px 6px':'8px 8px',
          }}>
            {!isMobile && commenterAvatars.length > 0 && (
              <div style={{display:'flex', marginRight:2}}>
                {commenterAvatars.map((c, i) => (
                  <div key={c.user_id} style={{
                    marginLeft: i === 0 ? 0 : -8,
                    zIndex: commenterAvatars.length - i,
                    position: 'relative',
                    borderRadius: '50%',
                    border: `1.5px solid ${T.w}`,
                  }}>
                    <Av size={20} color={c.profiles?.avatar_color} name={c.profiles?.name} url={c.profiles?.avatar_url || ''}/>
                  </div>
                ))}
              </div>
            )}
            <svg width={isMobile?15:16} height={isMobile?15:16} viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {(!isMobile || commCount > 0) && (
              <span style={{fontSize:isMobile?12:13, color:T.mu}}>{commCount}</span>
            )}
          </button>

          <button onClick={toggleRepost} title={reposted?"Undo repost":"Repost to your followers"}
            style={{display:'flex', alignItems:'center', gap:4, padding:isMobile?'6px 8px':'8px 10px', border:'none', background:'transparent', cursor:currentUserId?'pointer':'default', color:reposted?T.gr:T.mu, fontFamily:'inherit', fontSize:isMobile?12:13}}>
            <svg width={isMobile?15:16} height={isMobile?15:16} viewBox="0 0 24 24" fill="none" stroke={reposted?T.gr:T.mu} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            {(!isMobile || repostCount > 0) && <span>{repostCount}</span>}
          </button>
          <button onClick={toggleSave} title={saved ? 'Unsave' : 'Save post'}
            style={{display:'flex', alignItems:'center', justifyContent:'center', padding:isMobile?'6px 8px':'8px 10px', border:'none', background:'transparent', cursor:'pointer', color:saved?T.v:T.mu, marginLeft:'auto'}}>
            <svg width={isMobile?14:16} height={isMobile?14:16} viewBox="0 0 24 24"
              fill={saved ? T.v : 'none'} stroke={saved ? T.v : T.mu} strokeWidth="1.8">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button onClick={()=>setShowShare(true)} style={{display:'flex', alignItems:'center', gap:4, padding:isMobile?'6px 8px':'8px 10px', border:'none', background:'transparent', cursor:'pointer', color:T.mu, fontFamily:'inherit', fontSize:isMobile?12:13}}>
            <svg width={isMobile?15:16} height={isMobile?15:16} viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            {!isMobile && <span>Share</span>}
          </button>
        </div>

        {/* Top comment preview */}
        {topComment && !showReplyBox && !showComments && (
          <div
            onClick={toggleComments}
            style={{
              marginTop: 10,
              padding: '9px 12px',
              background: T.s2,
              borderRadius: 10,
              border: `1px solid ${T.bdr}`,
              cursor: 'pointer',
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}
          >
            <Av
              size={24}
              color={topComment.profiles?.avatar_color}
              name={topComment.profiles?.name}
              url={topComment.profiles?.avatar_url || ''}
            />
            <div style={{flex: 1, minWidth: 0}}>
              <span style={{fontSize: 12, fontWeight: 700, marginRight: 5}}>
                {topComment.profiles?.name}
              </span>
              <span style={{
                fontSize: 12.5, color: T.text, lineHeight: 1.45,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {topComment.content?.replace(/<[^>]+>/g, '')}
              </span>
            </div>
            {commCount > 1 && (
              <span style={{
                fontSize: 11, color: T.mu, flexShrink: 0,
                alignSelf: 'center',
              }}>
                +{commCount - 1} more
              </span>
            )}
          </div>
        )}

        {/* Quick reply box — collapsed trigger */}
        {!showReplyBox && !showComments && currentUserId && (
          <button
            onClick={() => setShowReplyBox(true)}
            style={{
              width: '100%', marginTop: 8,
              display: 'flex', alignItems: 'center', gap: 8,
              border: `1px solid ${T.bdr}`, borderRadius: 24,
              padding: '7px 12px', background: T.s2,
              cursor: 'pointer', fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <Av size={22} color={currentProfile?.avatar_color}
              name={currentProfile?.name} url={currentProfile?.avatar_url || ''}/>
            <span style={{
              fontSize: 12.5, color: T.mu, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {commCount === 0
                ? ZERO_COMMENT_PROMPTS[promptIndex % ZERO_COMMENT_PROMPTS.length]
                : getDiscussionPrompts(post.tier1)[promptIndex % getDiscussionPrompts(post.tier1).length]
              }
            </span>
          </button>
        )}

        {/* Quick reply box — expanded */}
        {showReplyBox && !showComments && (
          <div style={{marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start'}}>
            <Av size={28} color={currentProfile?.avatar_color}
              name={currentProfile?.name} url={currentProfile?.avatar_url || ''}/>
            <div style={{flex: 1}}>
              <textarea
                autoFocus
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={
                  commCount === 0
                    ? ZERO_COMMENT_PROMPTS[promptIndex % ZERO_COMMENT_PROMPTS.length]
                    : getDiscussionPrompts(post.tier1)[promptIndex % getDiscussionPrompts(post.tier1).length]
                }
                rows={2}
                style={{
                  width: '100%', fontSize: 13, lineHeight: 1.5,
                  padding: '8px 12px', borderRadius: 12,
                  border: `1.5px solid ${T.v}`, outline: 'none',
                  fontFamily: 'inherit', resize: 'none',
                  background: T.w, boxSizing: 'border-box',
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuickReply(); }
                  if (e.key === 'Escape') { setShowReplyBox(false); setReplyText(''); }
                }}
              />
              <div style={{display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 5}}>
                <Btn onClick={() => { setShowReplyBox(false); setReplyText(''); }}>Cancel</Btn>
                <Btn variant="s" onClick={submitQuickReply} disabled={!replyText.trim()}>Reply</Btn>
              </div>
            </div>
          </div>
        )}
      </div>

      {showComments&&(
        <div style={{borderTop:`1px solid ${T.bdr}`,background:T.s2}}>
          {commLoading&&<div style={{padding:"14px 16px",fontSize:12.5,color:T.mu}}>Loading comments...</div>}
          {!commLoading&&comments.map(c=>(
            <div key={c.id} style={{display:"flex",gap:10,padding:"12px 16px",borderBottom:`1px solid ${T.bdr}`,background:T.w}}>
              <div onClick={()=>goToProfile(c.user_id,c.profiles?.profile_slug)} style={{cursor:"pointer",flexShrink:0}}>
                <Av color={c.profiles?.avatar_color||"me"} size={30} name={c.profiles?.name} url={c.profiles?.avatar_url||""}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"baseline",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                  <span onClick={()=>goToProfile(c.user_id,c.profiles?.profile_slug)} style={{fontSize:12.5,fontWeight:700,cursor:"pointer",color:T.v}}>{c.profiles?.name||"Researcher"}</span>
                  {c.profiles?.institution&&<span style={{fontSize:10.5,color:T.mu}}>{c.profiles.institution}</span>}
                  <span style={{fontSize:10.5,color:T.mu,marginLeft:"auto"}}>{timeAgo(c.created_at)}</span>
                </div>
                <div style={{fontSize:13,lineHeight:1.65,color:T.text,wordBreak:"break-word",whiteSpace:"pre-wrap"}}>{c.content}</div>
              </div>
              {currentUserId===c.user_id&&(
                <button onClick={()=>deleteComment(c.id)}
                  style={{fontSize:12,color:T.mu,border:"none",background:"transparent",cursor:"pointer",flexShrink:0,opacity:.5,padding:"0 4px",alignSelf:"flex-start"}}>✕</button>
              )}
            </div>
          ))}
          {!commLoading&&comments.length===0&&commLoaded&&(
            <div style={{padding:"14px 16px",fontSize:12.5,color:T.mu,textAlign:"center",background:T.w}}>No comments yet — be the first to reply.</div>
          )}

          {currentUserId ? (
            <div style={{display:"flex",gap:10,padding:"12px 16px",alignItems:"flex-start",background:T.w,borderTop:`1px solid ${T.bdr}`}}>
              <Av color={currentProfile?.avatar_color||"me"} size={30} name={currentProfile?.name} url={currentProfile?.avatar_url||""}/>
              <div style={{flex:1,display:"flex",gap:8,alignItems:"flex-end"}}>
                <textarea
                  ref={commInputRef}
                  value={commText}
                  onChange={e=>setCommText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); submitComment(); } }}
                  placeholder="Write a comment... (Enter to submit, Shift+Enter for new line)"
                  rows={1}
                  style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:20,padding:"8px 14px",fontSize:13,fontFamily:"inherit",outline:"none",resize:"none",lineHeight:1.5,color:T.text,minHeight:36,maxHeight:120,overflowY:"auto"}}/>
                <button onClick={submitComment} disabled={commSaving||!commText.trim()}
                  style={{padding:"8px 16px",borderRadius:20,border:"none",background:commText.trim()?T.v:T.bdr,color:commText.trim()?"#fff":T.mu,cursor:commText.trim()?"pointer":"default",fontSize:12,fontFamily:"inherit",fontWeight:700,flexShrink:0,transition:"all .15s"}}>
                  {commSaving?"...":"Reply"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{padding:"12px 16px",fontSize:12.5,color:T.mu,textAlign:"center",background:T.w}}>Sign in to comment.</div>
          )}
        </div>
      )}

      {showShare && <ShareModal post={post} onClose={()=>setShowShare(false)}/>}
      {showReport && <ReportModal supabase={supabase} postId={post.id} onClose={()=>setShowReport(false)}/>}
    </div>
    </div>
  );
}
