import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

const NOTIF_CONFIG = {
  new_post:           { icon: '📝', label: (n) => `posted something new` },
  new_comment:        { icon: '💬', label: (n) => `commented on your post` },
  paper_comment:      { icon: '📄', label: (n) => `commented on a paper you follow${n.meta?.paper_title ? ` — ${n.meta.paper_title}` : ''}` },
  new_follower:       { icon: '👤', label: (n) => `started following you` },
  group_announcement: { icon: '📢', label: (n) => `posted a group announcement` },
  group_member_added: { icon: '🤝', label: (n) => `was added to a group` },
};

export default function NotifsScreen({ user }) {
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [actorMap, setActorMap] = useState({});

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
              const actor   = actorMap[n.actor_id];
              const cfg     = NOTIF_CONFIG[n.notif_type] || { icon: '🔔', label: () => n.notif_type };
              const isUnread = !n.read;
              const goToActor = () => { if (actor?.profile_slug) window.location.href = `/p/${actor.profile_slug}`; };
              return (
                <div key={n.id} style={{
                  display:"flex",alignItems:"flex-start",gap:12,
                  padding:"14px 18px",
                  borderBottom:`1px solid ${T.bdr}`,
                  background: isUnread ? T.v2 : T.w,
                  transition:"background .2s",
                }}>
                  <div onClick={goToActor} style={{position:"relative",flexShrink:0,cursor:actor?.profile_slug?"pointer":"default"}}>
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
                      <strong onClick={goToActor} style={{cursor:actor?.profile_slug?"pointer":"default",color:actor?.profile_slug?T.v:T.text}}>{actor?.name || "Someone"}</strong>{" "}
                      {cfg.label(n)}
                    </div>
                    {actor?.institution && (
                      <div style={{fontSize:11,color:T.mu,marginTop:2}}>{actor.institution}</div>
                    )}
                    <div style={{fontSize:10.5,color:T.mu,marginTop:4}}>{timeAgo(n.created_at)}</div>
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
