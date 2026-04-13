import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { normForMatch, deduplicateSectionFuzzy, scoreWorkMatch, scoreEduMatch, mergeRicher } from '../lib/utils';
import { formatDateRange } from '../lib/linkedInUtils';
import Av from '../components/Av';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import ConflictResolverModal from '../components/ConflictResolverModal';
import ExpandableBio from '../components/ExpandableBio';
import PostCard from '../feed/PostCard';
import LinkedInImporter from './LinkedInImporter';
import OrcidImporter from './OrcidImporter';
import PublicationsTab from './PublicationsTab';
import ShareProfilePanel from './ShareProfilePanel';

function EF({label,val,onChange,placeholder=""}) {
  return (
    <div style={{marginBottom:9}}>
      <label style={{display:"block",fontSize:11,fontWeight:600,color:T.mu,marginBottom:3}}>{label}</label>
      <input value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:T.s2,border:"1.5px solid "+T.bdr,borderRadius:8,padding:"7px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none"}}/>
    </div>
  );
}

export default function ProfileScreen({ user, profile, setProfile }) {
  const [editing,setEditing]     = useState(false);
  const [form,setForm]           = useState({name:'',title:'',institution:'',location:'',bio:'',orcid:'',twitter:''});
  const [saving,setSaving]       = useState(false);
  const [tab,setTab]             = useState('about');
  const [showLinkedIn,setShowLinkedIn] = useState(false);
  const [showOrcid,setShowOrcid]       = useState(false);
  const [cvImportingProfile,setCvImportingProfile] = useState(false);
  const [profileCvConflicts,setProfileCvConflicts] = useState([]);
  const [showProfileCvConflicts,setShowProfileCvConflicts] = useState(false);
  const [profileCvPending,setProfileCvPending] = useState(null);
  const [pendingCvPubs, setPendingCvPubs] = useState([]);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  const handleProfileCvUpload = async (file) => {
    if(!file) return;
    setCvImportingProfile(true);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let payload = {};
      if(ext==='pdf') {
        if(file.size > 4*1024*1024) { alert('PDF max 4MB. Try .txt export.'); setCvImportingProfile(false); return; }
        const base64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
        payload = { base64, mediaType:'application/pdf' };
      } else if(ext==='docx') {
        const mammoth = await import('mammoth');
        payload = { text: (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value };
      } else {
        payload = { text: await file.text() };
      }
      const resp = await fetch('https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/extract-publications', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmxxeWxob3N3Y2t2d3dzcGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUzOTQsImV4cCI6MjA5MTEyMTM5NH0.lHcaMtZ6a781g8RTVkddupNc7qV1Ll1lvBdtdsaIgOs' },
        body: JSON.stringify({ ...payload, mode:'full_cv' })
      });
      const rd = await resp.json();
      if(rd.error) throw new Error(rd.error);
      const cv = rd.result || {};

      const baseUpdates = {};
      if(cv.profile?.bio      && !profile?.bio)      baseUpdates.bio      = cv.profile.bio;
      if(cv.profile?.title    && !profile?.title)    baseUpdates.title    = cv.profile.title;
      if(cv.profile?.location && !profile?.location) baseUpdates.location = cv.profile.location;
      if(cv.honors?.length)    baseUpdates.honors    = cv.honors;
      if(cv.languages?.length) baseUpdates.languages = cv.languages;
      if(cv.skills?.length)    baseUpdates.skills    = cv.skills;

      const existingWH  = profile?.work_history || [];
      const existingEdu = profile?.education    || [];
      const whResult  = (cv.work_history||[]).length ? deduplicateSectionFuzzy(cv.work_history, existingWH,  scoreWorkMatch,'work') : {autoMerged:existingWH,  conflicts:[],newItems:[]};
      const eduResult = (cv.education||[]).length    ? deduplicateSectionFuzzy(cv.education,    existingEdu, scoreEduMatch, 'edu')  : {autoMerged:existingEdu, conflicts:[],newItems:[]};

      const allConflicts = [
        ...whResult.conflicts.map(c=>({...c,field:'work_history',fieldLabel:'Work Experience'})),
        ...eduResult.conflicts.map(c=>({...c,field:'education',  fieldLabel:'Education'})),
      ];

      if(allConflicts.length > 0) {
        setProfileCvPending({ baseUpdates, whAutoMerged:whResult.autoMerged, whNew:whResult.newItems, eduAutoMerged:eduResult.autoMerged, eduNew:eduResult.newItems, publications:cv.publications||[] });
        setProfileCvConflicts(allConflicts);
        setShowProfileCvConflicts(true);
        setCvImportingProfile(false);
        return;
      }

      await saveProfileCvImport(baseUpdates, [...whResult.autoMerged,...whResult.newItems], [...eduResult.autoMerged,...eduResult.newItems], cv.publications||[]);
    } catch(e) {
      alert('CV import failed: ' + e.message);
    }
    setCvImportingProfile(false);
  };

  const applyProfileCvConflicts = async (resolvedConflicts) => {
    const { baseUpdates, whAutoMerged, whNew, eduAutoMerged, eduNew, publications } = profileCvPending;
    let whFinal=[...whAutoMerged], eduFinal=[...eduAutoMerged];
    for(const c of resolvedConflicts) {
      const arr = c.field==='work_history' ? whFinal : eduFinal;
      if(c.resolution==='use_incoming')  arr[c.existingIdx]=c.incoming;
      else if(c.resolution==='merge')    arr[c.existingIdx]=mergeRicher(c.incoming,c.existing);
      else if(c.resolution==='keep_both') arr.push(c.incoming);
    }
    await saveProfileCvImport(baseUpdates, [...whFinal,...whNew], [...eduFinal,...eduNew], publications);
    setShowProfileCvConflicts(false); setProfileCvConflicts([]); setProfileCvPending(null);
  };

  const saveProfileCvImport = async (baseUpdates, whFinal, eduFinal, publications) => {
    if(whFinal.length)  baseUpdates.work_history = whFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    if(eduFinal.length) baseUpdates.education    = eduFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    const { data } = await supabase.from('profiles').update(baseUpdates).eq('id',user.id).select().single();
    if(data) setProfile(data);

    let pubsInserted = 0;
    if(publications?.length) {
      const { data: existingPubs } = await supabase.from('publications').select('doi,title').eq('user_id', user.id);
      const existingDois   = new Set((existingPubs||[]).map(p=>(p.doi||'').toLowerCase()).filter(Boolean));
      const existingTitles = new Set((existingPubs||[]).map(p=>normForMatch(p.title).slice(0,40)));
      const toInsert = publications.filter(p => {
        if(!p.title?.trim()) return false;
        if(p.doi && existingDois.has(p.doi.toLowerCase())) return false;
        if(existingTitles.has(normForMatch(p.title).slice(0,40))) return false;
        return true;
      });
      if(toInsert.length) {
        await supabase.from('publications').insert(
          toInsert.map(p=>({ user_id:user.id, title:p.title||'', journal:p.journal||'',
            year:String(p.year||''), doi:p.doi||'', authors:p.authors||'',
            pmid:'', pub_type:p.pub_type||'journal', venue:p.venue||'', source:'cv' }))
        );
        pubsInserted = toInsert.length;
      }
    }

    alert(`CV imported!\n• ${whFinal.length} work entries\n• ${eduFinal.length} education entries${pubsInserted?`\n• ${pubsInserted} publications added`:publications?.length?' \n• Publications already up to date':''}\n\nCheck your Profile and Publications tabs.`);
  };

  const [userPosts,setUserPosts] = useState([]);
  const [pubStats,setPubStats]   = useState({hIndex:0,totalCitations:0,pubCount:0});
  const [followStats,setFollowStats] = useState({followers:0,following:0});
  const [avatarUploading,setAvatarUploading] = useState(false);
  const [avatarHover,setAvatarHover]         = useState(false);

  const save=async()=>{ setSaving(true); const{data}=await supabase.from('profiles').update(form).eq('id',user.id).select().single(); if(data)setProfile(data); setEditing(false);setSaving(false); };

  const uploadAvatar = async (file) => {
    if(!file) return;
    if(file.size > 5*1024*1024) { alert('Photo must be under 5MB.'); return; }
    setAvatarUploading(true);
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${user.id}/avatar.${ext}`;
    const { data, error } = await supabase.storage.from('post-files').upload(path, file, { contentType:file.type, upsert:true });
    if(error){ alert(`Upload failed: ${error.message}`); setAvatarUploading(false); return; }
    const { data:{ publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
    const { data:updated } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id).select().single();
    if(updated) setProfile(updated);
    setAvatarUploading(false);
  };

  useEffect(()=>{ if(profile) setForm({name:profile.name||'',title:profile.title||'',institution:profile.institution||'',location:profile.location||'',bio:profile.bio||'',orcid:profile.orcid||'',twitter:profile.twitter||''}); },[profile]);
  useEffect(()=>{ if(!user) return; supabase.from('posts_with_meta').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).then(({data})=>setUserPosts(data||[])); },[user]);
  useEffect(()=>{
    if(!user) return;
    Promise.all([
      supabase.from('follows').select('id',{count:'exact',head:true}).eq('target_type','user').eq('target_id',user.id),
      supabase.from('follows').select('id',{count:'exact',head:true}).eq('follower_id',user.id).eq('target_type','user'),
    ]).then(([{count:followers},{count:following}])=>{
      setFollowStats({followers:followers||0,following:following||0});
    });
  },[user]);
  useEffect(()=>{
    if(!user) return;
    supabase.from('publications').select('citations').eq('user_id',user.id).then(({data})=>{
      if(!data) return;
      const counts = data.map(p=>p.citations||0).sort((a,b)=>b-a);
      const hIndex = counts.reduce((h,c,i)=>c>=(i+1)?i+1:h, 0);
      const totalCitations = counts.reduce((s,c)=>s+c, 0);
      setPubStats({hIndex, totalCitations, pubCount:data.length});
    });
  },[user]);

  const F=({label,field,placeholder=""})=>(
    <div style={{marginBottom:12}}>
      <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text,marginBottom:4}}>{label}</label>
      <input value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={placeholder}
        style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 13px',fontSize:13,fontFamily:'inherit',outline:'none',color:T.text}}/>
    </div>
  );

  const wh  = profile?.work_history   || [];
  const edu = profile?.education       || [];
  const vol = profile?.volunteering    || [];
  const org = profile?.organizations   || [];
  const hon = profile?.honors          || [];
  const lng = profile?.languages       || [];
  const skl = profile?.skills          || [];
  const pat = profile?.patents         || [];
  const hasExperience = wh.length||edu.length||vol.length||org.length;
  const hasSkills     = hon.length||lng.length||skl.length||pat.length;

  const DATED_FIELDS = {
    work_history:  "start",
    education:     "start",
    volunteering:  "start",
    organizations: "start",
    honors:        "date",
    patents:       "date",
  };

  const sortByDate = (arr, dateKey) =>
    [...arr].sort((a, b) => {
      const da = a[dateKey] || "", db = b[dateKey] || "";
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });

  const saveSection = async (field, arr) => {
    const dateKey = DATED_FIELDS[field];
    const sorted  = dateKey ? sortByDate(arr, dateKey) : arr;
    const { data } = await supabase.from("profiles").update({ [field]: sorted }).eq("id", user.id).select().single();
    if (data) setProfile(data);
  };

  const SectionHead=({label})=>(
    <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:"uppercase",letterSpacing:".07em",margin:"20px 0 10px",paddingBottom:6,borderBottom:"2px solid "+T.bdr}}>{label}</div>
  );

  function EditableRow({ item, index, field, array, logo, renderView, renderEdit }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm]       = useState({...item});
    const [saving, setSaving]   = useState(false);
    const saveRow = async () => {
      setSaving(true);
      const updated = [...array]; updated[index] = form;
      await saveSection(field, updated);
      setEditing(false); setSaving(false);
    };
    const deleteRow = async () => { await saveSection(field, array.filter((_,i)=>i!==index)); };
    if (editing) return (
      <div style={{padding:"13px 0",borderBottom:"1px solid "+T.bdr}}>
        {renderEdit(form, f=>setForm(prev=>({...prev,...f})))}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>
          <Btn onClick={()=>{setEditing(false);setForm({...item});}}>Cancel</Btn>
          <Btn variant="s" onClick={saveRow} disabled={saving}>{saving?"Saving...":"Save"}</Btn>
        </div>
      </div>
    );
    return (
      <div style={{display:"flex",gap:13,padding:"13px 0",borderBottom:"1px solid "+T.bdr,alignItems:"flex-start"}}>
        <div style={{width:40,height:40,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:"1px solid "+T.bdr,background:T.s2}}>{logo}</div>
        <div style={{flex:1}}>{renderView(item)}</div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>setEditing(true)} title="Edit" style={{width:26,height:26,borderRadius:"50%",border:"1px solid "+T.bdr,background:T.w,cursor:"pointer",fontSize:12,color:T.mu}}>✏️</button>
          <button onClick={deleteRow} title="Delete" style={{width:26,height:26,borderRadius:"50%",border:"1px solid "+T.bdr,background:T.w,cursor:"pointer",fontSize:12,color:T.ro}}>✕</button>
        </div>
      </div>
    );
  }


  function EditablePill({ item, index, field, array, color="mu" }) {
    const [editing,setEditing] = useState(false);
    const [val,setVal]         = useState(item.name||"");
    const [prof,setProf]       = useState(item.proficiency||"");
    const save = async () => {
      const updated=[...array]; updated[index]=field==="languages"?{name:val,proficiency:prof}:{name:val};
      await saveSection(field,updated); setEditing(false);
    };
    const del = async () => { await saveSection(field,array.filter((_,i)=>i!==index)); };
    if (editing) return (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,background:T.s2,border:"1.5px solid "+T.v,borderRadius:20,padding:"4px 10px"}}>
        <input value={val} onChange={e=>setVal(e.target.value)} autoFocus style={{background:"transparent",border:"none",outline:"none",fontSize:12,fontFamily:"inherit",width:80}}/>
        {field==="languages"&&<input value={prof} onChange={e=>setProf(e.target.value)} placeholder="Level" style={{background:"transparent",border:"none",outline:"none",fontSize:11,fontFamily:"inherit",width:60,color:T.mu}}/>}
        <button onClick={save} style={{fontSize:11,color:T.gr,fontWeight:700,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>✓</button>
        <button onClick={()=>setEditing(false)} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
      </div>
    );
    const bg=color==="v"?T.v2:T.s2, fg=color==="v"?T.v:T.mu, bdr=color==="v"?"1px solid rgba(108,99,255,.15)":"1px solid "+T.bdr;
    return (
      <div style={{display:"inline-flex",alignItems:"center",gap:5,background:bg,border:bdr,borderRadius:20,padding:"4px 10px",fontSize:12.5,fontWeight:600,color:fg}}>
        <span>{item.name}{item.proficiency?" · "+item.proficiency:""}</span>
        <button onClick={()=>setEditing(true)} style={{fontSize:10,color:fg,border:"none",background:"transparent",cursor:"pointer",opacity:.6,padding:"0 2px"}}>✏️</button>
        <button onClick={del} style={{fontSize:10,color:T.ro,border:"none",background:"transparent",cursor:"pointer",opacity:.7,padding:"0 2px"}}>✕</button>
      </div>
    );
  }

  function AddPill({ field, array, placeholder, extraField=null, extraPlaceholder="" }) {
    const [open,setOpen]=useState(false), [val,setVal]=useState(""), [extra,setExtra]=useState(""), [saving,setSaving]=useState(false);
    const add = async () => {
      if(!val.trim())return; setSaving(true);
      const item=extraField?{name:val.trim(),[extraField]:extra.trim()}:{name:val.trim()};
      await saveSection(field,[...array,item]);
      setVal("");setExtra("");setOpen(false);setSaving(false);
    };
    if(!open) return <button onClick={()=>setOpen(true)} style={{fontSize:12,color:T.v,fontWeight:600,border:"1px dashed rgba(108,99,255,.3)",background:T.v2,borderRadius:20,padding:"4px 13px",cursor:"pointer",fontFamily:"inherit"}}>+ Add</button>;
    return (
      <div style={{display:"inline-flex",alignItems:"center",gap:6,background:T.s2,border:"1.5px solid "+T.v,borderRadius:20,padding:"4px 10px"}}>
        <input value={val} onChange={e=>setVal(e.target.value)} placeholder={placeholder} autoFocus style={{background:"transparent",border:"none",outline:"none",fontSize:12,fontFamily:"inherit",width:100}}/>
        {extraField&&<input value={extra} onChange={e=>setExtra(e.target.value)} placeholder={extraPlaceholder} style={{background:"transparent",border:"none",outline:"none",fontSize:11,fontFamily:"inherit",width:70,color:T.mu}}/>}
        <button onClick={add} disabled={saving||!val.trim()} style={{fontSize:11,color:T.gr,fontWeight:700,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>✓</button>
        <button onClick={()=>{setOpen(false);setVal("");setExtra("");}} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
      </div>
    );
  }

  function AddRowItem({ field, array, fields, logo }) {
    const [open,setOpen]=useState(false), [form,setForm]=useState({}), [saving,setSaving]=useState(false);
    const add=async()=>{ if(!Object.values(form).some(v=>v?.trim()))return; setSaving(true); await saveSection(field,[...array,form]); setForm({});setOpen(false);setSaving(false); };
    if(!open) return <Btn variant="v" onClick={()=>setOpen(true)} style={{fontSize:11.5,marginTop:8}}>+ Add entry</Btn>;
    return (
      <div style={{background:T.v2,border:"1.5px solid "+T.v,borderRadius:12,padding:"14px 16px",marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:18}}>{logo}</span><span style={{fontSize:13,fontWeight:700,color:T.v}}>Add new entry</span></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
          {fields.map(([key,label,ph])=>(
            <div key={key} style={{gridColumn:key==="description"?"span 2":"span 1"}}>
              <label style={{display:"block",fontSize:11,fontWeight:600,color:T.mu,marginBottom:3}}>{label}</label>
              <input value={form[key]||""} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} placeholder={ph}
                style={{width:"100%",background:"rgba(255,255,255,.8)",border:"1.5px solid "+T.bdr,borderRadius:8,padding:"7px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none"}}/>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
          <Btn onClick={()=>{setOpen(false);setForm({});}}>Cancel</Btn>
          <Btn variant="s" onClick={add} disabled={saving}>{saving?"Saving...":"Add"}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {showLinkedIn&&<LinkedInImporter user={user} profile={profile} setProfile={setProfile} onClose={()=>setShowLinkedIn(false)}/>}
      {showOrcid&&<OrcidImporter user={user} profile={profile} setProfile={setProfile} onClose={()=>setShowOrcid(false)}/>}
      {showSharePanel&&<ShareProfilePanel user={user} profile={profile} onClose={()=>setShowSharePanel(false)} onProfileUpdate={setProfile}/>}
      {showProfileCvConflicts&&(
        <ConflictResolverModal
          conflicts={profileCvConflicts}
          saving={false}
          onApply={applyProfileCvConflicts}
          onCancel={()=>{setShowProfileCvConflicts(false);setProfileCvConflicts([]);setProfileCvPending(null);}}
        />
      )}
      <div style={{padding:'16px 18px'}}>

        <div style={{position:'relative',marginBottom:46}}>
          <div style={{height:148,borderRadius:'14px 14px 0 0',overflow:'hidden'}}>
            <svg width="100%" height="148" viewBox="0 0 760 148" preserveAspectRatio="xMidYMid slice">
              <defs><linearGradient id="cov" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#667eea"/><stop offset="45%" stopColor="#764ba2"/><stop offset="100%" stopColor="#f093fb"/></linearGradient></defs>
              <rect width="760" height="148" fill="url(#cov)"/>
              <circle cx="95" cy="74" r="85" fill="white" opacity=".04"/><circle cx="665" cy="30" r="65" fill="white" opacity=".06"/>
            </svg>
          </div>
          <div style={{position:'absolute',bottom:-43,left:22}}>
            <label style={{display:'block',cursor:'pointer',position:'relative'}}
              onMouseEnter={()=>setAvatarHover(true)}
              onMouseLeave={()=>setAvatarHover(false)}>
              <input type="file" accept="image/*" style={{display:'none'}}
                onChange={e=>e.target.files?.[0]&&uploadAvatar(e.target.files[0])}/>
              <div style={{borderRadius:'50%',border:'4px solid white',boxShadow:'0 4px 18px rgba(108,99,255,.2)',display:'inline-block',position:'relative',overflow:'hidden'}}>
                <Av color={profile?.avatar_color||'me'} size={84} name={profile?.name} url={profile?.avatar_url||''}/>
                <div style={{
                  position:'absolute',inset:0,borderRadius:'50%',
                  background:'rgba(0,0,0,.45)',
                  display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                  opacity: avatarUploading||avatarHover ? 1 : 0,
                  transition:'opacity .15s',
                }}>
                  {avatarUploading
                    ? <div style={{width:18,height:18,borderRadius:'50%',border:'2.5px solid rgba(255,255,255,.3)',borderTop:'2.5px solid white',animation:'spin 1s linear infinite'}}/>
                    : <><div style={{fontSize:16,marginBottom:2}}>📷</div><div style={{fontSize:9,color:'white',fontWeight:700,letterSpacing:'.03em'}}>CHANGE</div></>}
                </div>
              </div>
            </label>
          </div>
        </div>

        <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderTop:'none',borderRadius:'0 0 14px 14px',padding:'0 24px 20px',boxShadow:'0 2px 12px rgba(108,99,255,.07)'}}>
          <div style={{display:'flex',justifyContent:'flex-end',paddingTop:14,gap:8,marginBottom:16,flexWrap:'wrap'}}>
            {!editing&&(
              <div style={{position:'relative'}}>
                {showImportMenu&&<div onClick={()=>setShowImportMenu(false)} style={{position:'fixed',inset:0,zIndex:99}}/>}
                <Btn onClick={()=>setShowImportMenu(v=>!v)} style={{fontSize:12}}>⬇ Import</Btn>
                {showImportMenu&&(
                  <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:T.w,border:`1px solid ${T.bdr}`,borderRadius:10,boxShadow:'0 4px 16px rgba(0,0,0,.12)',zIndex:100,minWidth:200,padding:6,display:'flex',flexDirection:'column',gap:4}}>
                    <input id="profile-cv-input" type="file" accept=".pdf,.docx,.txt,.md" onChange={e=>{if(e.target.files?.[0]){handleProfileCvUpload(e.target.files[0]);setShowImportMenu(false);}}} style={{display:'none'}}/>
                    <button onClick={()=>{setShowLinkedIn(true);setShowImportMenu(false);}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:7,border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:T.bl,textAlign:'left'}}>
                      <span style={{fontWeight:800,fontSize:14}}>in</span> Import from LinkedIn
                    </button>
                    <button onClick={()=>{setShowOrcid(true);setShowImportMenu(false);}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:7,border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:T.gr,textAlign:'left'}}>
                      🔬 Import from ORCID
                    </button>
                    <button onClick={()=>{document.getElementById('profile-cv-input').click();}} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:7,border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:600,color:'#92400e',textAlign:'left'}}>
                      📋 Import full CV
                    </button>
                  </div>
                )}
              </div>
            )}
            {editing
              ?<><Btn onClick={()=>setEditing(false)}>Cancel</Btn><Btn variant="s" onClick={save} disabled={saving}>{saving?'Saving...':'Save Profile'}</Btn></>
              :<><Btn variant="v" onClick={()=>setEditing(true)}>✏️ Edit</Btn><Btn variant="s" onClick={()=>setShowSharePanel(true)}>🔗 Share</Btn></>}
          </div>

          {editing?(
            <div style={{maxWidth:560}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <F label="Full name" field="name" placeholder="Dr. Jane Smith"/>
                <F label="Current role / title" field="title" placeholder="Professor of Cardiology"/>
                <F label="Institution" field="institution" placeholder="University of Tokyo"/>
                <F label="Location" field="location" placeholder="Tokyo, Japan 🇯🇵"/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text,marginBottom:4}}>Bio / Summary</label>
                <textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="Brief summary of your research focus and background..."
                  style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 13px',fontSize:13,fontFamily:'inherit',outline:'none',color:T.text,resize:'none',height:90,lineHeight:1.65}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <F label="ORCID" field="orcid" placeholder="0000-0000-0000-0000"/>
                <F label="Twitter / X" field="twitter" placeholder="@yourhandle"/>
              </div>
            </div>
          ):(
            <>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,lineHeight:1.2,marginBottom:4}}>
                {profile?.name||user?.email?.split('@')[0]||'Your Name'}
              </div>
              {profile?.title&&(
                <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>{profile.title}</div>
              )}
              <div style={{fontSize:13,color:T.mu,marginBottom:12,display:'flex',gap:12,flexWrap:'wrap'}}>
                {profile?.institution&&<span>🏛️ {profile.institution}</span>}
                {profile?.location&&<span>📍 {profile.location}</span>}
                {profile?.orcid&&<a href={`https://orcid.org/${profile.orcid}`} target="_blank" rel="noopener noreferrer" style={{color:T.gr,textDecoration:'none',fontWeight:600}}>ORCID ↗</a>}
              </div>
              {profile?.bio&&<div style={{marginBottom:14,maxWidth:620}}><ExpandableBio text={profile.bio}/></div>}
              {!profile?.name&&(
                <div style={{background:T.v2,border:`1px solid rgba(108,99,255,.2)`,borderRadius:10,padding:'12px 16px',marginBottom:12,fontSize:12.5,color:T.v,fontWeight:600}}>
                  👆 Click Edit to add your profile, or Import from LinkedIn to populate everything automatically.
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:9,margin:'14px 0'}}>
                {[
                  [followStats.followers,'Followers'],
                  [followStats.following,'Following'],
                  [pubStats.pubCount||'—','Publications'],
                  [pubStats.totalCitations||'—','Citations'],
                  [pubStats.hIndex>0?`h${pubStats.hIndex}`:'—','h-index'],
                ].map(([v,l])=>(
                  <div key={l} style={{background:T.s2,borderRadius:10,padding:'10px 8px',textAlign:'center'}}>
                    <div style={{fontSize:19,fontWeight:700,fontFamily:"'DM Serif Display',serif",color:T.v}}>{v}</div>
                    <div style={{fontSize:9.5,color:T.mu,textTransform:'uppercase',letterSpacing:'.05em',marginTop:2,fontWeight:600}}>{l}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{display:'flex',borderBottom:`1px solid ${T.bdr}`,margin:'16px 0 0',gap:0}}>
            {[['about','About'],['posts','Posts'],['publications','Publications']].map(([k,l])=>(
              <div key={k} onClick={()=>setTab(k)} style={{padding:'8px 16px',fontSize:12.5,color:tab===k?T.v:T.mu,cursor:'pointer',borderBottom:`2.5px solid ${tab===k?T.v:'transparent'}`,fontWeight:600,whiteSpace:'nowrap'}}>{l}</div>
            ))}
          </div>
        </div>

        <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderTop:'none',borderRadius:'0 0 14px 14px',padding:'20px 24px',boxShadow:'0 2px 12px rgba(108,99,255,.07)'}}>

          {tab==='about'&&(
            <div>
              {!hasExperience&&!hasSkills&&(
                <div style={{background:`linear-gradient(135deg,${T.bl2},#dbeafe)`,border:'1px solid rgba(66,133,244,.2)',borderRadius:12,padding:'16px 18px',marginBottom:18,display:'flex',alignItems:'center',gap:14}}>
                  <div style={{fontSize:28}}>💼</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>Import your work history from LinkedIn</div>
                    <div style={{fontSize:12,color:T.mu,lineHeight:1.6}}>Get your full career history, education, skills, and more imported in 2 minutes.</div>
                  </div>
                  <Btn onClick={()=>setShowLinkedIn(true)} style={{borderColor:T.bl,color:T.bl,background:'white',whiteSpace:'nowrap',flexShrink:0}}><span style={{fontWeight:700}}>in</span> Import now</Btn>
                </div>
              )}

              {(wh.length>0||true)&&(
                <>
                  <SectionHead label="Work Experience"/>
                  {wh.map((p,i)=>(
                    <EditableRow key={i} item={p} index={i} field="work_history" array={wh} logo="🏢"
                      renderView={p=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{p.title}</div>
                          <div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:1}}>{[p.company,p.location].filter(Boolean).join(' · ')}</div>
                          {(p.start||p.end)&&<div style={{fontSize:11,color:T.mu}}>{formatDateRange(p.start,p.end)}</div>}
                          {p.description&&<div style={{fontSize:12,color:T.mu,lineHeight:1.6,marginTop:3}}>{p.description.slice(0,200)}{p.description.length>200?'…':''}</div>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="Title" val={f.title||''} onChange={v=>set({title:v})} placeholder="Senior Director"/>
                          <EF label="Company" val={f.company||''} onChange={v=>set({company:v})} placeholder="Organon"/>
                          <EF label="Location" val={f.location||''} onChange={v=>set({location:v})} placeholder="Tokyo, Japan"/>
                          <EF label="Started (YYYY-MM)" val={f.start||''} onChange={v=>set({start:v})} placeholder="2021-04"/>
                          <EF label="Ended (YYYY-MM or blank)" val={f.end||''} onChange={v=>set({end:v})} placeholder="2024-01"/>
                          <div style={{gridColumn:'span 2'}}><EF label="Description" val={f.description||''} onChange={v=>set({description:v})} placeholder="Brief description of role..."/></div>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="work_history" array={wh} logo="🏢"
                    fields={[['title','Title','Senior Director'],['company','Company','Organon'],['location','Location','Tokyo, Japan'],['start','Started (YYYY-MM)','2021-04'],['end','Ended (YYYY-MM)','2024-01'],['description','Description','Brief description...']]}/>
                </>
              )}

              {(edu.length>0||true)&&(
                <>
                  <SectionHead label="Education"/>
                  {edu.map((e,i)=>(
                    <EditableRow key={i} item={e} index={i} field="education" array={edu} logo="🎓"
                      renderView={e=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{e.school}</div>
                          <div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:1}}>{[e.degree,e.field].filter(Boolean).join(', ')}</div>
                          {(e.start||e.end)&&<div style={{fontSize:11,color:T.mu}}>{formatDateRange(e.start,e.end)}</div>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="School" val={f.school||''} onChange={v=>set({school:v})} placeholder="University of Tokyo"/>
                          <EF label="Degree" val={f.degree||''} onChange={v=>set({degree:v})} placeholder="MD"/>
                          <EF label="Field" val={f.field||''} onChange={v=>set({field:v})} placeholder="Medicine"/>
                          <EF label="Started" val={f.start||''} onChange={v=>set({start:v})} placeholder="1995-04"/>
                          <EF label="Ended" val={f.end||''} onChange={v=>set({end:v})} placeholder="2001-03"/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="education" array={edu} logo="🎓"
                    fields={[['school','School','University of Tokyo'],['degree','Degree','MD / PhD'],['field','Field of Study','Medicine'],['start','Started','1995-04'],['end','Ended','2001-03']]}/>
                </>
              )}

              {(vol.length>0||true)&&(
                <>
                  <SectionHead label="Volunteering"/>
                  {vol.map((v,i)=>(
                    <EditableRow key={i} item={v} index={i} field="volunteering" array={vol} logo="🤝"
                      renderView={v=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{v.role||'Volunteer'}</div>
                          <div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:1}}>{v.org}</div>
                          {(v.start||v.end)&&<div style={{fontSize:11,color:T.mu}}>{formatDateRange(v.start,v.end)}</div>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="Role" val={f.role||''} onChange={v=>set({role:v})} placeholder="Board Member"/>
                          <EF label="Organization" val={f.org||''} onChange={v=>set({org:v})} placeholder="Red Cross"/>
                          <EF label="Started" val={f.start||''} onChange={v=>set({start:v})} placeholder="2020-01"/>
                          <EF label="Ended" val={f.end||''} onChange={v=>set({end:v})} placeholder="Present or blank"/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="volunteering" array={vol} logo="🤝"
                    fields={[['role','Role','Board Member'],['org','Organization','Red Cross'],['start','Started','2020-01'],['end','Ended','']]}/>
                </>
              )}

              {(org.length>0||true)&&(
                <>
                  <SectionHead label="Organizations &amp; Memberships"/>
                  {org.map((o,i)=>(
                    <EditableRow key={i} item={o} index={i} field="organizations" array={org} logo="🏛️"
                      renderView={o=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{o.name}</div>
                          {o.role&&<div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:1}}>{o.role}</div>}
                          {(o.start||o.end)&&<div style={{fontSize:11,color:T.mu}}>{formatDateRange(o.start,o.end)}</div>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="Organization" val={f.name||''} onChange={v=>set({name:v})} placeholder="ISMPP"/>
                          <EF label="Role" val={f.role||''} onChange={v=>set({role:v})} placeholder="Member"/>
                          <EF label="Started" val={f.start||''} onChange={v=>set({start:v})} placeholder="2019-01"/>
                          <EF label="Ended" val={f.end||''} onChange={v=>set({end:v})} placeholder=""/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="organizations" array={org} logo="🏛️"
                    fields={[['name','Organization','ISMPP'],['role','Role','Member'],['start','Started',''],['end','Ended','']]}/>
                </>
              )}

              <SectionHead label="Skills &amp; Achievements"/>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:T.text}}>Languages</div>
                <div style={{display:'flex',gap:7,flexWrap:'wrap',alignItems:'center'}}>
                  {lng.map((l,i)=><EditablePill key={i} item={l} index={i} field="languages" array={lng} color="v"/>)}
                  <AddPill field="languages" array={lng} placeholder="Language" extraField="proficiency" extraPlaceholder="Native"/>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:T.text}}>Skills</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  {skl.map((s,i)=><EditablePill key={i} item={s} index={i} field="skills" array={skl} color="mu"/>)}
                  <AddPill field="skills" array={skl} placeholder="e.g. Real-World Evidence"/>
                </div>
              </div>
              {(hon.length>0||true)&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:T.text}}>Honors &amp; Awards</div>
                  {hon.map((h,i)=>(
                    <EditableRow key={i} item={h} index={i} field="honors" array={hon} logo="🏅"
                      renderView={h=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{h.title}</div>
                          {h.issuer&&<div style={{fontSize:12,color:T.mu}}>{h.issuer}</div>}
                          {h.date&&<div style={{fontSize:11,color:T.mu}}>{h.date}</div>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="Title" val={f.title||''} onChange={v=>set({title:v})} placeholder="Award name"/>
                          <EF label="Issuer" val={f.issuer||''} onChange={v=>set({issuer:v})} placeholder="Organization"/>
                          <EF label="Date (YYYY-MM)" val={f.date||''} onChange={v=>set({date:v})} placeholder="2022-06"/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="honors" array={hon} logo="🏅"
                    fields={[['title','Award title','Best Paper Award'],['issuer','Issuer','ISMPP'],['date','Date (YYYY-MM)','2022-06']]}/>
                </div>
              )}
              {(pat.length>0||true)&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:T.text}}>Patents</div>
                  {pat.map((p,i)=>(
                    <EditableRow key={i} item={p} index={i} field="patents" array={pat} logo="⚗️"
                      renderView={p=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{p.title}</div>
                          {p.number&&<div style={{fontSize:12,color:T.mu}}>Patent {p.number}</div>}
                          {p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11.5,color:T.v}}>View ↗</a>}
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <EF label="Title" val={f.title||''} onChange={v=>set({title:v})} placeholder="Patent title"/>
                          <EF label="Patent number" val={f.number||''} onChange={v=>set({number:v})} placeholder="US1234567"/>
                          <EF label="URL" val={f.url||''} onChange={v=>set({url:v})} placeholder="https://..."/>
                          <EF label="Date" val={f.date||''} onChange={v=>set({date:v})} placeholder="2020-03"/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="patents" array={pat} logo="⚗️"
                    fields={[['title','Title','Patent title'],['number','Patent number','US1234567'],['date','Date','2020-03'],['url','URL','https://...']]}/>
                </div>
              )}
            </div>
          )}

          {tab==='posts'&&(
            userPosts.length===0
              ?<div style={{textAlign:'center',padding:'32px 0',color:T.mu}}><div style={{fontSize:32,marginBottom:10}}>📝</div><div style={{fontSize:14,fontFamily:"'DM Serif Display',serif",marginBottom:8}}>No posts yet</div></div>
              :<div style={{display:'flex',flexDirection:'column',gap:12}}>{userPosts.map(p=><PostCard key={p.id} post={p} currentUserId={user?.id} currentProfile={profile}/>)}</div>
          )}

          {tab==='publications'&&<PublicationsTab user={user} profile={profile} pendingCvPubs={pendingCvPubs} onPendingConsumed={()=>setPendingCvPubs([])}/>}
        </div>
      </div>
    </div>
  );
}
