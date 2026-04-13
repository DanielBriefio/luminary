import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import PostCard from './PostCard';

export default function FeedScreen({ user, profile, onViewUser }) {
  const [posts,setPosts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('all');
  const [fp,setFp]=useState('sug');

  const withLikes = useCallback(async (data) => {
    if (!data?.length || !user) return data || [];
    const ids = data.map(p => p.id);
    const { data: ld } = await supabase.from('likes').select('post_id').eq('user_id', user.id).in('post_id', ids);
    const ls = new Set((ld || []).map(l => l.post_id));
    return data.map(p => ({ ...p, user_liked: ls.has(p.id) }));
  }, [user]);

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

    if (fp === 'fol' && user) {
      // Fetch followed users and papers
      const { data: followData } = await supabase
        .from('follows')
        .select('target_type, target_id')
        .eq('follower_id', user.id);

      const userIds  = (followData || []).filter(f => f.target_type === 'user').map(f => f.target_id);
      const paperIds = (followData || []).filter(f => f.target_type === 'paper').map(f => f.target_id);

      if (!userIds.length && !paperIds.length) {
        setPosts([]); setLoading(false); return;
      }

      // Build an OR filter: posts by followed users OR paper posts with followed DOIs
      let orParts = [];
      if (userIds.length)  orParts.push(`user_id.in.(${userIds.join(',')})`);
      if (paperIds.length) orParts.push(`paper_doi.in.(${paperIds.join(',')})`);

      let q = supabase.from('posts_with_meta').select('*').or(orParts.join(',')).order('created_at',{ascending:false}).limit(30);
      if (tab === 'papers') q = q.eq('post_type','paper');

      const { data } = await q;
      setPosts(await withSlugs(await withLikes(data)));
      setLoading(false);
      return;
    }

    // "For You" — all posts
    let q = supabase.from('posts_with_meta').select('*').order('created_at',{ascending:false}).limit(30);
    if (tab === 'papers') q = q.eq('post_type','paper');
    const { data } = await q;
    setPosts(await withSlugs(await withLikes(data)));
    setLoading(false);
  }, [user, tab, fp, withLikes, withSlugs]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

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
      <div style={{display:"flex",background:T.w,borderBottom:`1px solid ${T.bdr}`,padding:"0 18px",flexShrink:0}}>
        {[["all","All"],["papers","📄 Papers"]].map(([k,l])=>(
          <div key={k} onClick={()=>setTab(k)} style={{padding:"8px 16px",fontSize:12.5,color:tab===k?T.v:T.mu,cursor:"pointer",borderBottom:`2.5px solid ${tab===k?T.v:"transparent"}`,fontWeight:600}}>{l}</div>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        <div style={{padding:"16px 18px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 264px",gap:16,alignItems:"start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {loading ? <Spinner/> : posts.length === 0 ? (
                <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:36,textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
                  <div style={{fontSize:36,marginBottom:12}}>{emptyMsg.icon}</div>
                  <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:8}}>{emptyMsg.title}</div>
                  <div style={{fontSize:13,color:T.mu,marginBottom:16}}>{emptyMsg.body}</div>
                </div>
              ) : posts.map(p => <PostCard key={p.id} post={p} currentUserId={user?.id} currentProfile={profile} onRefresh={fetchPosts} onViewUser={onViewUser}/>)}
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
