import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

const NOTIF_CONFIG = {
  new_post:           { icon: '📝', label: () => `posted something new` },
  new_comment:        { icon: '💬', label: () => `commented on your post` },
  paper_comment:      { icon: '📄', label: (n) => `commented on a paper you follow${n.meta?.paper_title ? ` — ${n.meta.paper_title}` : ''}` },
  new_follower:       { icon: '👤', label: () => `started following you` },
  group_post:             { icon: '🔬', label: (n) => `posted in ${n.meta?.group_name ? `"${n.meta.group_name}"` : 'your group'}` },
  group_announcement:     { icon: '📢', label: () => `posted a group announcement` },
  group_member_added:     { icon: '🤝', label: () => `was added to a group` },
  group_join_request:     { icon: '🔔', label: (n) => `requested to join ${n.meta?.group_name ? `"${n.meta.group_name}"` : 'your group'}` },
  group_request_approved: { icon: '✅', label: (n) => `approved your request to join ${n.meta?.group_name ? `"${n.meta.group_name}"` : 'a group'}` },
};

// Types that have a linked post we can show a snippet for
const POST_NOTIF_TYPES = new Set(['new_post', 'new_comment', 'paper_comment']);

function postSnippet(post) {
  if (!post) return '';
  // Prefer paper title for paper posts, then strip HTML from content
  const raw = post.paper_title
    ? `${post.paper_title}${post.content ? ' — ' + post.content.replace(/<[^>]+>/g, '') : ''}`
    : post.content?.replace(/<[^>]+>/g, '') || '';
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed.length > 160 ? trimmed.slice(0, 160).replace(/\s\S*$/, '') + '…' : trimmed;
}

export default function NotifsScreen({ user, onViewGroup }) {
  const [notifs,   setNotifs]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [actorMap, setActorMap] = useState({});
  const [postMap,  setPostMap]  = useState({});

  const fetchNotifs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const ns = data || [];
    setNotifs(ns);

    // Fetch actor profiles
    const actorIds = [...new Set(ns.filter(n => n.actor_id).map(n => n.actor_id))];
    if (actorIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, avatar_color, avatar_url, institution, profile_slug')
        .in('id', actorIds);
      const map = {};
      (profiles || []).forEach(p => { map[p.id] = p; });
      setActorMap(map);
    }

    // Fetch linked posts for post-related notifications
    // Post ID is stored in target_id (top-level column), not in meta
    const postIds = [...new Set(
      ns.filter(n => POST_NOTIF_TYPES.has(n.notif_type) && n.target_id)
        .map(n => n.target_id)
    )];
    if (postIds.length) {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, content, post_type, paper_title')
        .in('id', postIds);
      const map = {};
      (posts || []).forEach(p => { map[p.id] = p; });
      setPostMap(map);
    }

    setLoading(false);

    // Mark all as read
    const unreadIds = ns.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
  }, [user]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{fontSize:15,fontWeight:700,flex:1}}>
          Notifications
          {unreadCount > 0 && (
            <span style={{marginLeft:8,background:T.v,color:"#fff",fontSize:10,fontWeight:700,borderRadius:20,padding:"2px 8px"}}>{unreadCount} new</span>
          )}
        </div>
        <button onClick={fetchNotifs} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>↻ Refresh</button>
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        {loading ? (
          <div style={{display:"flex",justifyContent:"center",padding:32}}><Spinner/></div>
        ) : notifs.length === 0 ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{textAlign:"center",padding:40,color:T.mu}}>
              <div style={{fontSize:40,marginBottom:16}}>🔔</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:T.text,marginBottom:8}}>You're all caught up</div>
              <div style={{fontSize:13,lineHeight:1.7}}>
                When researchers you follow post, comment, or follow you back — you'll see it here.
                <br/><br/>
                <strong style={{color:T.v}}>Start by following some researchers or papers.</strong>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {notifs.map(n => {
              const actor    = actorMap[n.actor_id];
              const cfg      = NOTIF_CONFIG[n.notif_type] || { icon: '🔔', label: () => n.notif_type };
              const isUnread = !n.read;
              const postId    = POST_NOTIF_TYPES.has(n.notif_type) ? n.target_id : null;
              const groupId   = ['group_post','group_join_request','group_request_approved'].includes(n.notif_type) ? n.meta?.group_id : null;
              const post      = postId ? postMap[postId] : null;
              const snippet   = postSnippet(post);
              const goToActor = () => { if (actor?.profile_slug) window.location.href = `/p/${actor.profile_slug}`; };
              const goToPost  = () => { if (postId) window.location.href = `/s/${postId}`; };
              const goToGroup = () => { if (groupId && onViewGroup) onViewGroup(groupId); };
              const isClickable = !!(postId || groupId);
              const handleClick = groupId ? goToGroup : (postId ? goToPost : undefined);
              return (
                <div key={n.id}
                  onClick={handleClick}
                  style={{
                    display:"flex",alignItems:"flex-start",gap:12,
                    padding:"14px 18px",
                    borderBottom:`1px solid ${T.bdr}`,
                    background: isUnread ? T.v2 : T.w,
                    cursor: isClickable ? "pointer" : "default",
                    transition:"background .15s",
                  }}
                  onMouseEnter={e=>{ if(isClickable) e.currentTarget.style.background = isUnread ? '#e4e2ff' : T.s2; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background = isUnread ? T.v2 : T.w; }}
                >
                  <div onClick={e=>{ e.stopPropagation(); goToActor(); }}
                    style={{position:"relative",flexShrink:0,cursor:actor?.profile_slug?"pointer":"default"}}>
                    <Av
                      color={actor?.avatar_color || "me"}
                      size={38}
                      name={actor?.name || "?"}
                      url={actor?.avatar_url || ""}
                    />
                    <div style={{
                      position:"absolute",bottom:-2,right:-2,
                      width:18,height:18,borderRadius:"50%",
                      background:T.w,border:`1px solid ${T.bdr}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,
                    }}>{cfg.icon}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,lineHeight:1.5,color:T.text}}>
                      <strong onClick={e=>{ e.stopPropagation(); goToActor(); }}
                        style={{cursor:actor?.profile_slug?"pointer":"default",color:actor?.profile_slug?T.v:T.text}}>
                        {actor?.name || "Someone"}
                      </strong>{" "}
                      {cfg.label(n)}
                    </div>
                    {snippet && (
                      <div style={{
                        fontSize:12,color:T.mu,marginTop:5,lineHeight:1.55,
                        background: isUnread ? 'rgba(108,99,255,.07)' : T.s2,
                        borderRadius:8,padding:'6px 10px',
                        display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden',
                      }}>
                        {snippet}
                      </div>
                    )}
                    <div style={{fontSize:10.5,color:T.mu,marginTop:5,display:'flex',alignItems:'center',gap:8}}>
                      {timeAgo(n.created_at)}
                      {postId && <span style={{color:T.v,fontWeight:600}}>View post →</span>}
                      {groupId && <span style={{color:T.v,fontWeight:600}}>Open group →</span>}
                    </div>
                  </div>
                  {isUnread && (
                    <div style={{width:8,height:8,borderRadius:"50%",background:T.v,flexShrink:0,marginTop:5}}/>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
