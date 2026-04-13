import { useState, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Bdg from '../components/Bdg';
import FollowBtn from '../components/FollowBtn';
import SafeHtml from '../components/SafeHtml';
import FilePreview from '../components/FilePreview';
import PaperPreview from '../components/PaperPreview';
import RichTextEditor from '../components/RichTextEditor';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import ShareModal from '../components/ShareModal';

export default function PostCard({ post, currentUserId, currentProfile, onRefresh, onViewUser }) {
  const [liked,setLiked]             = useState(post.user_liked||false);
  const [likeCount,setLikeCount]     = useState(parseInt(post.like_count)||0);
  const [reposted,setReposted]       = useState(post.user_reposted||false);
  const [repostCount,setRepostCount] = useState(parseInt(post.repost_count)||0);
  const [reposting,setReposting]     = useState(false);
  const [saving,setSaving]           = useState(false);
  const [menuOpen,setMenuOpen]       = useState(false);
  const [editing,setEditing]       = useState(false);
  const [editText,setEditText]     = useState(post.content||'');
  const [editSaving,setEditSaving] = useState(false);
  const [deleted,setDeleted]       = useState(false);
  const [confirmDelete,setConfirmDelete] = useState(false);
  const [showComments,setShowComments]   = useState(false);
  const [showShare,setShowShare]         = useState(false);

  const [comments,  setComments]   = useState([]);
  const [commLoaded,setCommLoaded] = useState(false);
  const [commLoading,setCommLoading]=useState(false);
  const [commText,  setCommText]   = useState('');
  const [commSaving,setCommSaving] = useState(false);
  const [commCount, setCommCount]  = useState(parseInt(post.comment_count)||0);
  const commInputRef = useRef(null);

  const isOwner = currentUserId && currentUserId === post.user_id;
  const typeColor={text:"v",paper:"v",photo:"t",audio:"r",link:"a",tip:"g"};
  const typeLabel={text:"Post",paper:"Paper",photo:"Photo",audio:"Audio",link:"Link",tip:"Tip"};

  const goToProfile = (userId, slug) => {
    if (onViewUser && userId) { onViewUser(userId); return; }
    if (slug) window.location.href = `/p/${slug}`;
  };

  const toggleRepost = async () => {
    if (!currentUserId || reposting) return;
    setReposting(true);
    const nr = !reposted;
    setReposted(nr); setRepostCount(c => nr ? c+1 : Math.max(0,c-1));
    if (nr) await supabase.from('reposts').insert({user_id:currentUserId, post_id:post.id});
    else    await supabase.from('reposts').delete().eq('user_id',currentUserId).eq('post_id',post.id);
    setReposting(false);
  };

  const toggleLike = async () => {
    if(!currentUserId||saving) return;
    setSaving(true);
    const nl=!liked; setLiked(nl); setLikeCount(c=>nl?c+1:c-1);
    if(nl) await supabase.from('likes').insert({user_id:currentUserId,post_id:post.id});
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
    }
    setCommSaving(false);
  };

  const deleteComment = async (id) => {
    await supabase.from('comments').delete().eq('id', id);
    setComments(c => c.filter(x => x.id !== id));
    setCommCount(n => Math.max(0, n - 1));
  };

  if (deleted) return null;

  return (
    <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>

      {/* Repost banner — shown when this card appears as a repost in the feed */}
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

      <div style={{padding:16,position:"relative"}}>

        <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
          <div onClick={()=>goToProfile(post.user_id,post.author_slug)} style={{cursor:"pointer",flexShrink:0}}>
            <Av color={post.author_avatar||"me"} size={38} name={post.author_name} url={post.author_avatar_url||""}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:12.5,display:"flex",alignItems:"center",gap:5}}>
              <span onClick={()=>goToProfile(post.user_id,post.author_slug)} style={{cursor:"pointer",color:T.v}}>{post.author_name||"Researcher"}</span>
              <Bdg color={typeColor[post.post_type]||"v"}>{typeLabel[post.post_type]||"Post"}</Bdg>
            </div>
            <div style={{fontSize:10.5,color:T.mu}}>
              {post.author_institution&&`${post.author_institution} · `}{timeAgo(post.created_at)}
              {post.edited_at&&<span style={{color:T.mu,fontSize:10}}> · edited</span>}
            </div>
          </div>

          {!isOwner&&post.user_id&&(
            <FollowBtn targetType="user" targetId={post.user_id} currentUserId={currentUserId}/>
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
            {post.content&&<SafeHtml html={post.content} tags={post.tags}/>}
            {post.post_type==='text'&&(()=>{
              const url = extractFirstUrl(post.content||'');
              return url ? <LinkPreview url={url}/> : null;
            })()}
          </>
        )}

        {post.image_url&&<FilePreview url={post.image_url} fileType={post.file_type||'image'} fileName={post.file_name}/>}
        {post.post_type==='paper'&&post.paper_title&&<PaperPreview post={post} currentUserId={currentUserId}/>}
        {post.post_type==='link'&&post.link_title&&(()=>{
          const ytMatch = post.link_url?.match(
            /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
          );
          if(ytMatch) {
            const videoId = ytMatch[1];
            return (
              <div style={{margin:"8px 0",borderRadius:10,overflow:"hidden",border:`1px solid ${T.bdr}`}}>
                <div style={{position:"relative",paddingBottom:"56.25%",height:0,background:"#000"}}>
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title={post.link_title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}}
                  />
                </div>
                <a href={post.link_url} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block"}}>
                  <div style={{padding:"9px 13px",background:T.s2,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:16}}>▶️</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{post.link_title}</div>
                      <div style={{fontSize:10.5,color:T.v}}>youtube.com</div>
                    </div>
                    <span style={{fontSize:13,color:T.v,fontWeight:700,flexShrink:0}}>↗</span>
                  </div>
                </a>
              </div>
            );
          }
          return (
            <a href={post.link_url||'#'} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block"}}>
              <div style={{background:T.s2,border:`1px solid ${T.bdr}`,borderRadius:9,padding:"10px 13px",margin:"8px 0",display:"flex",gap:11,cursor:"pointer"}}>
                <div style={{width:50,height:50,borderRadius:8,background:T.am2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🔗</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,lineHeight:1.4,marginBottom:2,color:T.text}}>{post.link_title}</div>
                  {post.link_url&&<div style={{fontSize:10.5,color:T.v,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{post.link_url}</div>}
                </div>
                <div style={{flexShrink:0,fontSize:13,color:T.v,paddingTop:2,fontWeight:700}}>↗</div>
              </div>
            </a>
          );
        })()}

        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.bdr}`}}>
          <button onClick={toggleLike} style={{fontSize:12,color:liked?T.ro:T.mu,cursor:"pointer",padding:"3px 9px",borderRadius:20,fontWeight:600,background:liked?T.ro2:"transparent",border:"none",fontFamily:"inherit"}}>
            {liked?"❤️":"🤍"} {likeCount}
          </button>
          <button onClick={toggleComments}
            style={{fontSize:12,color:showComments?T.v:T.mu,cursor:"pointer",padding:"3px 9px",borderRadius:20,fontWeight:600,border:"none",background:showComments?T.v2:"transparent",fontFamily:"inherit"}}>
            💬 {commCount}
          </button>
          <button onClick={toggleRepost} title={reposted?"Undo repost":"Repost to your followers"}
            style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:reposted?T.gr:T.mu,cursor:currentUserId?"pointer":"default",padding:"3px 9px",borderRadius:20,fontWeight:600,border:"none",background:reposted?T.gr2:"transparent",fontFamily:"inherit"}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            {repostCount}
          </button>
          <button onClick={()=>setShowShare(true)} style={{fontSize:12,color:T.mu,cursor:"pointer",padding:"3px 9px",borderRadius:20,fontWeight:600,border:"none",background:"transparent",fontFamily:"inherit"}}>↗ Share</button>
        </div>
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
    </div>
  );
}
