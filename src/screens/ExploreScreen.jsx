import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import PostCard from '../feed/PostCard';

export default function ExploreScreen({ user }) {
  const [q,setQ]=useState('');
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);

  useEffect(()=>{
    if(!q.trim()){setResults([]);return;}
    const t=setTimeout(async()=>{
      setSearching(true);
      const {data}=await supabase.from('posts_with_meta').select('*').ilike('content',`%${q}%`).limit(10);
      setResults(data||[]); setSearching(false);
    },400);
    return ()=>clearTimeout(t);
  },[q]);

  const topics=[["#GLP1","v"],["#CryoEM","b"],["#CRISPR","a"],["#OpenScience","g"],["#DigitalHealth","r"],["#MedicalAffairs","v"],["#RWE","t"],["#WomensHealth","g"]];

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",flexShrink:0}}>
        <input style={{width:"100%",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:"9px 16px",fontSize:13,outline:"none",fontFamily:"inherit"}}
          placeholder="Search posts, papers, researchers..." value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 18px"}}>
        {q?(
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:T.mu,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>
              {searching?"Searching...":`${results.length} result${results.length!==1?"s":""} for "${q}"`}
            </div>
            {searching?<Spinner/>:results.length===0
              ?<div style={{color:T.mu,fontSize:13,textAlign:"center",padding:20}}>No posts found. Try a different search.</div>
              :<div style={{display:"flex",flexDirection:"column",gap:12}}>{results.map(p=><PostCard key={p.id} post={p} currentUserId={user?.id} currentProfile={profile}/>)}</div>}
          </div>
        ):(
          <>
            <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:"uppercase",letterSpacing:".07em",marginBottom:10}}>Browse by Topic</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:24}}>
              {topics.map(([t,c])=>(
                <span key={t} onClick={()=>setQ(t)} style={{cursor:"pointer",display:"inline-flex",padding:"5px 14px",borderRadius:20,fontSize:12,fontWeight:700,background:T.v2,color:T.v,border:`1px solid rgba(108,99,255,.2)`}}>{t}</span>
              ))}
            </div>
            <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:"24px",textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
              <div style={{fontSize:28,marginBottom:12}}>🔍</div>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,marginBottom:8}}>Discover scientific content</div>
              <div style={{fontSize:13,color:T.mu}}>Search for papers, topics, or click a tag above to explore the feed.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
