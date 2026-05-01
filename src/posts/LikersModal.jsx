import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T, WORK_MODE_MAP } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 50;

export default function LikersModal({ postId, currentUserId, onClose }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset,  setOffset]  = useState(0);
  const [followingMap, setFollowingMap] = useState({}); // user_id -> bool
  const [pending, setPending] = useState(new Set());

  const fetchPage = useCallback(async (off, append) => {
    const { data } = await supabase.rpc('get_post_likers', {
      p_post_id: postId,
      p_limit:   PAGE_SIZE,
      p_offset:  off,
    });
    const list = data || [];
    setRows(prev => append ? [...prev, ...list] : list);
    setFollowingMap(prev => {
      const next = { ...prev };
      list.forEach(r => { next[r.user_id] = !!r.is_following; });
      return next;
    });
    setHasMore(list.length === PAGE_SIZE);
    setOffset(off + list.length);
  }, [postId]);

  useEffect(() => {
    setLoading(true);
    fetchPage(0, false).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    await fetchPage(offset, true);
    setLoadingMore(false);
  };

  const toggleFollow = async (userId) => {
    if (!currentUserId || userId === currentUserId || pending.has(userId)) return;
    const isFollowing = !!followingMap[userId];
    setPending(prev => { const n = new Set(prev); n.add(userId); return n; });
    setFollowingMap(prev => ({ ...prev, [userId]: !isFollowing }));
    try {
      if (isFollowing) {
        await supabase.from('follows').delete()
          .eq('follower_id', currentUserId)
          .eq('target_type', 'user')
          .eq('target_id', userId);
      } else {
        await supabase.from('follows').insert({
          follower_id: currentUserId,
          target_type: 'user',
          target_id:   userId,
        });
      }
    } catch {
      // revert on failure
      setFollowingMap(prev => ({ ...prev, [userId]: isFollowing }));
    }
    setPending(prev => { const n = new Set(prev); n.delete(userId); return n; });
  };

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0,
        background:'rgba(0,0,0,0.35)', zIndex:400,
      }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%',
        transform:'translate(-50%, -50%)',
        background:'#fff', borderRadius:14, zIndex:401,
        width:420, maxWidth:'calc(100vw - 32px)',
        maxHeight:'80vh', display:'flex', flexDirection:'column',
        boxShadow:'0 8px 40px rgba(0,0,0,0.18)', overflow:'hidden',
      }}>
        <div style={{
          padding:'16px 20px', borderBottom:`1px solid ${T.bdr}`,
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <div style={{
            fontFamily:"'DM Serif Display', serif",
            fontSize:18, color:T.text,
          }}>
            Liked by
          </div>
          <button onClick={onClose} style={{
            border:'none', background:'transparent', cursor:'pointer',
            fontSize:18, color:T.mu, fontFamily:'inherit', padding:'2px 6px',
          }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'4px 0' }}>
          {loading ? (
            <div style={{ padding:'40px 0', textAlign:'center' }}><Spinner/></div>
          ) : rows.length === 0 ? (
            <div style={{ padding:'40px 20px', textAlign:'center', color:T.mu, fontSize:13 }}>
              No likes yet.
            </div>
          ) : (
            <>
              {rows.map(r => {
                const work = WORK_MODE_MAP[r.work_mode];
                const isSelf = currentUserId && r.user_id === currentUserId;
                const isFollowing = !!followingMap[r.user_id];
                const isPending = pending.has(r.user_id);
                return (
                  <div key={r.user_id} style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 18px', borderBottom:`1px solid ${T.bdr}`,
                  }}>
                    {r.slug ? (
                      <a href={`/p/${r.slug}`} target="_blank" rel="noopener noreferrer"
                        style={{ flexShrink:0, textDecoration:'none' }}>
                        <Av size={36} name={r.name || ''}
                          color={r.avatar_color || T.v}
                          url={r.avatar_url || ''}/>
                      </a>
                    ) : (
                      <Av size={36} name={r.name || ''}
                        color={r.avatar_color || T.v}
                        url={r.avatar_url || ''}/>
                    )}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        {r.slug ? (
                          <a href={`/p/${r.slug}`} target="_blank" rel="noopener noreferrer"
                            style={{
                              fontSize:13.5, fontWeight:700, color:T.v,
                              textDecoration:'none',
                            }}>
                            {r.name || 'Researcher'}
                          </a>
                        ) : (
                          <span style={{ fontSize:13.5, fontWeight:700, color:T.text }}>
                            {r.name || 'Researcher'}
                          </span>
                        )}
                        {work && (
                          <span style={{
                            fontSize:10, fontWeight:600,
                            padding:'1px 7px', borderRadius:20,
                            background:T.v2, color:T.v,
                            border:`1px solid rgba(108,99,255,.2)`,
                          }}>
                            {work.icon} {work.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:T.mu, marginTop:2 }}>
                        Liked {timeAgo(r.liked_at)}
                      </div>
                    </div>
                    {!isSelf && currentUserId && (
                      <button
                        onClick={() => toggleFollow(r.user_id)}
                        disabled={isPending}
                        style={{
                          padding:'5px 12px', borderRadius:20,
                          border:`1.5px solid ${isFollowing ? T.bdr : T.v}`,
                          background: isFollowing ? T.w : T.v,
                          color: isFollowing ? T.mu : '#fff',
                          fontSize:11.5, fontWeight:700, fontFamily:'inherit',
                          cursor: isPending ? 'default' : 'pointer',
                          opacity: isPending ? 0.6 : 1,
                          flexShrink:0,
                        }}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
              {hasMore && (
                <div style={{ padding:'10px 18px', textAlign:'center' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      padding:'7px 18px', borderRadius:9,
                      border:`1px solid ${T.bdr}`, background:T.w,
                      color:T.v, fontSize:12.5, fontWeight:600,
                      cursor:loadingMore ? 'default' : 'pointer',
                      fontFamily:'inherit', opacity: loadingMore ? 0.6 : 1,
                    }}>
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
