import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import PostCard from './PostCard';

export default function FeedScreen({ user, profile, onViewUser, onViewPaper, onGoToProfile }) {
  const [posts,setPosts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('all');
  const [fp,setFp]=useState('sug');
  const [feedMode,setFeedMode]=useState(()=>{
    const saved=localStorage.getItem('luminary_feed_mode');
    if(saved) return saved;
    return (profile?.topic_interests?.length>0)?'personalised':'chronological';
  });

  useEffect(()=>{ localStorage.setItem('luminary_feed_mode',feedMode); },[feedMode]);

  const withSlugs = useCallback(async (data) => {
    if (!data?.length) return data || [];
    const ids = [...new Set(data.map(p => p.user_id).filter(Boolean))];
    if (!ids.length) return data;
    const { data: sd } = await supabase.from('profiles').select('id, profile_slug').in('id', ids);
    const slugMap = {};
    (sd || []).forEach(p => { slugMap[p.id] = p.profile_slug; });
    return data.map(p => ({ ...p, author_slug: slugMap[p.user_id] || null }));
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);

    // ── 1. Resolve follows once ──────────────────────────────────────────
    let followedUserIds = [], followedPaperIds = [];
    if (fp === 'fol' && user) {
      const { data: fols } = await supabase
        .from('follows').select('target_type, target_id').eq('follower_id', user.id);
      followedUserIds  = (fols||[]).filter(f=>f.target_type==='user').map(f=>f.target_id);
      followedPaperIds = (fols||[]).filter(f=>f.target_type==='paper').map(f=>f.target_id);
      if (!followedUserIds.length && !followedPaperIds.length) {
        setPosts([]); setLoading(false); return;
      }
    }

    // ── 2. Regular posts ─────────────────────────────────────────────────
    let postQ = supabase.from('posts_with_meta').select('*').order('created_at',{ascending:false}).limit(30);
    if (fp === 'fol') {
      const orParts = [];
      if (followedUserIds.length)  orParts.push(`user_id.in.(${followedUserIds.join(',')})`);
      if (followedPaperIds.length) orParts.push(`paper_doi.in.(${followedPaperIds.join(',')})`);
      postQ = postQ.or(orParts.join(','));
    }
    if (tab === 'papers') postQ = postQ.eq('post_type','paper');

    // ── 3. Repost items (All tab only) ───────────────────────────────────
    let repostPromise = Promise.resolve([]);
    if (tab !== 'papers') {
      const shouldFetch = fp !== 'fol' || followedUserIds.length > 0;
      if (shouldFetch) {
        repostPromise = (async () => {
          let rq = supabase.from('reposts').select('id, user_id, post_id, created_at')
            .order('created_at',{ascending:false}).limit(30);
          if (fp === 'fol') rq = rq.in('user_id', followedUserIds);

          const { data: reposts } = await rq;
          if (!reposts?.length) return [];

          // Reposter profiles + original posts in parallel
          const reposterIds = [...new Set(reposts.map(r=>r.user_id))];
          const origIds     = [...new Set(reposts.map(r=>r.post_id))];
          const [{ data: profs }, { data: origPosts }] = await Promise.all([
            supabase.from('profiles').select('id, name, avatar_color, avatar_url, profile_slug').in('id', reposterIds),
            supabase.from('posts_with_meta').select('*').in('id', origIds),
          ]);
          const profMap = Object.fromEntries((profs||[]).map(p=>[p.id,p]));
          const postMap = Object.fromEntries((origPosts||[]).map(p=>[p.id,p]));

          return reposts.filter(r=>postMap[r.post_id]).map(r => {
            const pr = profMap[r.user_id]||{};
            return {
              ...postMap[r.post_id],
              _itemKey:        `r_${r.id}`,
              _sortTime:       r.created_at,
              isRepost:        true,
              repost_id:       r.id,
              reposter_id:     r.user_id,
              reposter_name:   pr.name||'Researcher',
              reposter_avatar: pr.avatar_color||null,
              reposter_avatar_url: pr.avatar_url||'',
              reposter_slug:   pr.profile_slug||null,
            };
          });
        })();
      }
    }

    // ── 4. Await both in parallel ────────────────────────────────────────
    const [{ data: regularData }, repostItems] = await Promise.all([postQ, repostPromise]);

    // ── 5. Merge ─────────────────────────────────────────────────────────
    const followedUserSet  = new Set(followedUserIds);
    const followedPaperSet = new Set(followedPaperIds);

    const allItems = [
      ...(regularData||[]).map(p=>({...p, isRepost:false, _itemKey:p.id, _sortTime:p.created_at})),
      // In Following mode, only include reposts whose original content is from a followed user/paper
      ...repostItems.filter(item =>
        fp !== 'fol' ||
        followedUserSet.has(item.user_id) ||
        (item.paper_doi && followedPaperSet.has(item.paper_doi))
      ),
    ];
    if (!allItems.length) { setPosts([]); setLoading(false); return; }

    // ── 6. Batch-enrich: likes + repost counts ───────────────────────────
    const allPostIds = [...new Set(allItems.map(p=>p.id))];
    let likedSet = new Set(), repostCountMap = {}, userRepostedSet = new Set();
    if (user && allPostIds.length) {
      const [{ data: ld }, { data: rd }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id',user.id).in('post_id', allPostIds),
        supabase.from('reposts').select('post_id, user_id').in('post_id', allPostIds),
      ]);
      likedSet = new Set((ld||[]).map(l=>l.post_id));
      (rd||[]).forEach(r => {
        repostCountMap[r.post_id] = (repostCountMap[r.post_id]||0)+1;
        if (r.user_id === user.id) userRepostedSet.add(r.post_id);
      });
    }

    const enriched = allItems.map(item=>({
      ...item,
      user_liked:    likedSet.has(item.id),
      repost_count:  repostCountMap[item.id]||0,
      user_reposted: userRepostedSet.has(item.id),
    }));

    // ── 7. Slugs + sort ──────────────────────────────────────────────────
    const withSlugData = await withSlugs(enriched);
    withSlugData.sort((a,b) => new Date(b._sortTime) - new Date(a._sortTime));

    // In For You + personalised mode, float posts matching topic interests to top
    if (fp === 'sug' && feedMode === 'personalised' && profile?.topic_interests?.length) {
      const interests = new Set(profile.topic_interests.map(t => t.toLowerCase()));
      withSlugData.sort((a, b) => {
        const aMatch = (a.tags || []).some(tag => interests.has(tag.toLowerCase()));
        const bMatch = (b.tags || []).some(tag => interests.has(tag.toLowerCase()));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    setPosts(withSlugData);
    setLoading(false);
  }, [user, profile, tab, fp, feedMode, withSlugs]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Remove a user's posts immediately when unfollowed in the Following tab
  const handleUnfollow = (userId) => {
    if (fp !== 'fol') return;
    setPosts(prev => prev.filter(p => {
      if (p.user_id === userId) return false;           // direct posts + reposts of their content
      if (p.isRepost && p.reposter_id === userId) return false;  // reposts they made
      return true;
    }));
  };

  const emptyMsg = fp === 'fol'
    ? { icon: '👥', title: "Follow people & papers to build your feed", body: "Use the + Follow button on any post or paper to start seeing their updates here." }
    : { icon: '🌱', title: "The feed is quiet", body: "Be the first Founding Fellow to post. Share a paper, a finding, or a tip to get the community started." };

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <input style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:"7px 14px",fontSize:12,outline:"none",maxWidth:320,fontFamily:"inherit"}} placeholder="Search researchers, papers, topics..."/>
        <div style={{display:"flex",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:3}}>
          {[["sug","✨ For You"],["fol","👥 Following"]].map(([m,l])=>(
            <div key={m} onClick={()=>setFp(m)} style={{padding:"5px 14px",borderRadius:18,fontSize:12,color:fp===m?T.v:T.mu,cursor:"pointer",fontWeight:600,background:fp===m?T.w:"transparent"}}>{l}</div>
          ))}
        </div>
        <button onClick={fetchPosts} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>↻ Refresh</button>
      </div>
      <div style={{display:"flex",alignItems:"center",background:T.w,borderBottom:`1px solid ${T.bdr}`,padding:"0 18px",flexShrink:0}}>
        {[["all","All"],["papers","📄 Papers"]].map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"8px 16px",fontSize:12.5,color:tab===k?T.v:T.mu,cursor:"pointer",borderBottom:`2.5px solid ${tab===k?T.v:"transparent"}`,fontWeight:600}}>{l}</div>
        ))}
        {fp==='sug'&&(
          <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}}>
            <span style={{fontSize:11,color:T.mu}}>Feed:</span>
            {[['personalised','✨ For you'],['chronological','🕐 Latest']].map(([mode,label])=>(
              <button key={mode} onClick={()=>setFeedMode(mode)} style={{padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer',border:`1.5px solid ${feedMode===mode?T.v:T.bdr}`,background:feedMode===mode?T.v2:'transparent',color:feedMode===mode?T.v:T.mu,transition:'all .15s'}}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 264px",gap:16,alignItems:"start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {fp==='sug'&&feedMode==='personalised'&&!profile?.topic_interests?.length&&(
                <div style={{fontSize:12.5,color:T.mu,padding:'10px 16px',background:T.s2,borderRadius:9,display:'flex',alignItems:'center',gap:8}}>
                  <span>✨</span>
                  <span>Add research interests to personalise this feed.{' '}
                    <button onClick={onGoToProfile} style={{color:T.v,fontWeight:700,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',padding:0}}>
                      Go to profile →
                    </button>
                  </span>
                </div>
              )}
              {loading ? <Spinner/> : posts.length === 0 ? (
                <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:36,textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
                  <div style={{fontSize:36,marginBottom:12}}>{emptyMsg.icon}</div>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:8}}>{emptyMsg.title}</div>
                  <div style={{fontSize:13,color:T.mu,marginBottom:16}}>{emptyMsg.body}</div>
                </div>
              ) : posts.map(p => <PostCard key={p._itemKey||p.id} post={p} currentUserId={user?.id} currentProfile={profile} onRefresh={fetchPosts} onViewUser={onViewUser} onUnfollow={handleUnfollow} onViewPaper={onViewPaper}/>)}
            </div>
            <div>
              {profile&&(
                <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:15,boxShadow:"0 2px 12px rgba(108,99,255,.07)",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <Av color={profile.avatar_color||"me"} size={42} name={profile.name}/>
                    <div><div style={{fontSize:13,fontWeight:700}}>{profile.name||"Complete your profile"}</div><div style={{fontSize:11,color:T.mu}}>{profile.institution||"Add your institution"}</div></div>
                  </div>
                  {!profile.name&&<div style={{fontSize:12,color:T.v,fontWeight:600,marginTop:4,cursor:"pointer"}}>→ Edit your profile to get started</div>}
                </div>
              )}
              <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:15,boxShadow:"0 2px 12px rgba(108,99,255,.07)",marginBottom:12}}>
                <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:".08em",color:T.mu,marginBottom:11,fontWeight:700}}>🎉 Founding Fellows</div>
                <div style={{fontSize:12,color:T.mu,lineHeight:1.7}}>You're one of the first people on Luminary. Every post you share helps build the scientific community we've been missing.</div>
              </div>
              <div style={{background:`linear-gradient(135deg,${T.v2},${T.bl2})`,border:"1px solid rgba(108,99,255,.15)",borderRadius:14,padding:15}}>
                <div style={{fontSize:12,fontWeight:700,color:T.v,marginBottom:6}}>Paper of the Week</div>
                <div style={{fontSize:11.5,fontWeight:700,lineHeight:1.4,marginBottom:5}}>GLP-1 agonists and cardiovascular outcomes in T2D</div>
                <div style={{fontSize:10,color:T.mu,marginBottom:7}}>NEJM · IF 91 · Altmetric 312</div>
                <div style={{fontSize:11,color:T.v,fontWeight:700}}>342 researchers discussing →</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
