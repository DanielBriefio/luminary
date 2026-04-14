import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Btn from '../components/Btn';
import FollowBtn from '../components/FollowBtn';
import Inp from '../components/Inp';
import Spinner from '../components/Spinner';

export default function GroupsScreen({ user }) {
  const [groups,setGroups]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showCreate,setShowCreate]=useState(false);
  const [groupName,setGroupName]=useState('');
  const [groupInst,setGroupInst]=useState('');
  const [creating,setCreating]=useState(false);
  const [selected,setSelected]=useState(null);
  const [groupPosts,setGroupPosts]=useState([]);
  const [newPost,setNewPost]=useState('');
  const [posting,setPosting]=useState(false);

  const fetchGroups=async()=>{
    setLoading(true);
    const {data}=await supabase.from('groups').select('*').order('created_at',{ascending:false});
    setGroups(data||[]); setLoading(false);
  };

  const fetchGroupPosts=async(gid)=>{
    const {data}=await supabase.from('group_posts').select('*, profiles(name,avatar_color,institution)').eq('group_id',gid).order('created_at',{ascending:false});
    setGroupPosts(data||[]);
  };

  useEffect(()=>{ fetchGroups(); },[]);

  const createGroup=async()=>{
    if(!groupName.trim()) return;
    setCreating(true);
    const {data:g}=await supabase.from('groups').insert({name:groupName,institution:groupInst,owner_id:user.id}).select().single();
    if(g){ await supabase.from('group_members').insert({group_id:g.id,user_id:user.id,role:'owner'}); fetchGroups(); setShowCreate(false); setGroupName(''); setGroupInst(''); }
    setCreating(false);
  };

  const openGroup=async(g)=>{ setSelected(g); await fetchGroupPosts(g.id); };

  const postToGroup=async()=>{
    if(!newPost.trim()) return;
    setPosting(true);
    await supabase.from('group_posts').insert({group_id:selected.id,user_id:user.id,content:newPost.trim(),post_type:'text'});
    setNewPost(''); await fetchGroupPosts(selected.id);
    setPosting(false);
  };

  if(selected) return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button onClick={()=>setSelected(null)} style={{fontSize:12,color:T.v,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>← Groups</button>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700}}>{selected.name}</div>
          <div style={{fontSize:10.5,color:T.mu}}>Private group feed 🔒</div>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 18px"}}>
        <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:16,marginBottom:14,boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
            <Av color="me" size={32} name=""/>
            <textarea value={newPost} onChange={e=>setNewPost(e.target.value)}
              style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",resize:"none",height:70,lineHeight:1.6}}
              placeholder="Share an update, paper, or message with your group..."/>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn variant="s" onClick={postToGroup} disabled={posting||!newPost.trim()}>{posting?"Posting...":"Post to Group"}</Btn>
          </div>
        </div>
        {groupPosts.length===0?(
          <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:32,textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
            <div style={{fontSize:32,marginBottom:12}}>💬</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:16,marginBottom:8}}>Group feed is empty</div>
            <div style={{fontSize:13,color:T.mu}}>Be the first to post an update, share a paper, or start a discussion.</div>
          </div>
        ):groupPosts.map(p=>(
          <div key={p.id} style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:12,padding:14,marginBottom:10,boxShadow:"0 1px 6px rgba(108,99,255,.06)"}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
              <Av color={p.profiles?.avatar_color||"me"} size={30} name={p.profiles?.name}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12.5,fontWeight:700}}>{p.profiles?.name||"Member"}</div>
                <div style={{fontSize:10.5,color:T.mu}}>{p.profiles?.institution} · {timeAgo(p.created_at)}</div>
              </div>
            </div>
            <div style={{fontSize:13,lineHeight:1.65}}>{p.content}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{fontWeight:700,fontSize:15,flex:1}}>Research Groups</div>
        <Btn variant="s" onClick={()=>setShowCreate(!showCreate)}>+ Create Group</Btn>
      </div>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"16px 18px"}}>
        {showCreate&&(
          <div style={{background:T.w,border:`2px solid ${T.v}`,borderRadius:14,padding:20,marginBottom:16,boxShadow:"0 4px 20px rgba(108,99,255,.15)"}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14,fontFamily:"'DM Serif Display',serif"}}>Create a new research group</div>
            <Inp label="Group name *" value={groupName} onChange={setGroupName} placeholder="König Medical Affairs Lab"/>
            <Inp label="Institution" value={groupInst} onChange={setGroupInst} placeholder="Organon · Asia-Pacific"/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn onClick={()=>setShowCreate(false)}>Cancel</Btn>
              <Btn variant="s" onClick={createGroup} disabled={creating||!groupName.trim()}>{creating?"Creating...":"Create Group"}</Btn>
            </div>
          </div>
        )}
        {loading?<Spinner/>:groups.length===0?(
          <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:"40px 24px",textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
            <div style={{fontSize:36,marginBottom:12}}>🔬</div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:8}}>No groups yet</div>
            <div style={{fontSize:13,color:T.mu,marginBottom:16}}>Create a private group for your lab or research team. Share papers, post updates, and collaborate — all in one private feed.</div>
            <Btn variant="s" onClick={()=>setShowCreate(true)}>Create your first group →</Btn>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
            {groups.map(g=>(
              <div key={g.id} onClick={()=>openGroup(g)}
                style={{background:g.owner_id===user?.id?`linear-gradient(160deg,${T.v2},${T.bl2})`:T.w,border:`1px solid ${g.owner_id===user?.id?T.v:T.bdr}`,borderRadius:14,padding:16,boxShadow:"0 2px 12px rgba(108,99,255,.07)",cursor:"pointer",transition:"all .15s"}}>
                {g.owner_id===user?.id&&<div style={{fontSize:10,fontWeight:700,color:T.v,marginBottom:8}}>🏛️ Your Group</div>}
                <div style={{width:46,height:46,borderRadius:10,background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,marginBottom:10,color:"#fff"}}>
                  {g.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div style={{fontSize:13.5,fontWeight:700,marginBottom:3}}>{g.name}</div>
                <div style={{fontSize:11,color:T.mu,marginBottom:9}}>{g.institution||"Research Group"}</div>
                <div style={{paddingTop:9,borderTop:`1px solid ${T.bdr}`,display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:11,color:T.mu,flex:1}}>Private group</span>
                  {g.owner_id===user?.id
                    ? <span style={{fontSize:11,color:T.v,fontWeight:600}}>Owner</span>
                    : <FollowBtn targetType="group" targetId={g.id} currentUserId={user?.id} label="Follow Group"/>
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
