import { useState, useEffect, useRef } from 'react';
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
import CvExportPanel from './CvExportPanel';
import { useWindowSize } from '../lib/useWindowSize';
import TopicInterestsPicker from '../components/TopicInterestsPicker';

function EF({label,val,onChange,placeholder=""}) {
  return (
    <div style={{marginBottom:9}}>
      <label style={{display:"block",fontSize:11,fontWeight:600,color:T.mu,marginBottom:3}}>{label}</label>
      <input value={val} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{width:"100%",background:T.s2,border:"1.5px solid "+T.bdr,borderRadius:8,padding:"7px 11px",fontSize:12.5,fontFamily:"inherit",outline:"none"}}/>
    </div>
  );
}

function PF({label,field,form,setForm,placeholder=""}) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text,marginBottom:4}}>{label}</label>
      <input value={form[field]||''} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))} placeholder={placeholder}
        style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 13px',fontSize:13,fontFamily:'inherit',outline:'none',color:T.text}}/>
    </div>
  );
}

function VisibilityToggle({ label, value, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${T.bdr}`, cursor:'pointer' }}>
      <span style={{ fontSize:12.5, color:T.text }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{ width:36, height:20, borderRadius:10, position:'relative', background:value?T.v:T.s3, transition:'background .2s', cursor:'pointer', flexShrink:0 }}>
        <div style={{ position:'absolute', top:2, left:value?18:2, width:16, height:16, borderRadius:'50%', background:'white', transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}/>
      </div>
    </label>
  );
}

export default function ProfileScreen({ user, profile, setProfile }) {
  const { isMobile } = useWindowSize();
  const [editing,setEditing]     = useState(false);
  const [form,setForm]           = useState({name_prefix:'',first_name:'',middle_name:'',last_name:'',name_suffix:'',title:'',institution:'',location:'',bio:'',orcid:'',twitter:''});
  const [saving,setSaving]       = useState(false);
  const [tab,setTab]             = useState('about');
  const [showLinkedIn,setShowLinkedIn] = useState(false);
  const [showOrcid,setShowOrcid]       = useState(false);
  const [pubsInitialMode, setPubsInitialMode] = useState(null);

  // Auto-open an importer if onboarding set a pending flag
  useEffect(() => {
    const flag = sessionStorage.getItem('onboarding_import');
    if (!flag) return;
    sessionStorage.removeItem('onboarding_import');
    if (flag === 'linkedin') setShowLinkedIn(true);
    if (flag === 'orcid')    setShowOrcid(true);
    if (flag === 'publications') setTab('publications');
    if (flag === 'pmc_search' || flag === 'doi_lookup') { setTab('publications'); setPubsInitialMode(flag); }
    if (flag === 'cv') setShowImportMenu(true); // slight delay via setState
  }, []); // eslint-disable-line
  const [cvImportingProfile,setCvImportingProfile] = useState(false);
  const [profileCvConflicts,setProfileCvConflicts] = useState([]);
  const [showProfileCvConflicts,setShowProfileCvConflicts] = useState(false);
  const [profileCvPending,setProfileCvPending] = useState(null);
  const [pendingCvPubs, setPendingCvPubs] = useState([]);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showSharePanel,  setShowSharePanel]  = useState(false);
  const [showAllSkills,  setShowAllSkills]  = useState(false);
  const [showCvExport,   setShowCvExport]   = useState(false);
  const [editingTopics,  setEditingTopics]  = useState(false);
  const [topicDraft,     setTopicDraft]     = useState([]);
  const [savingTopics,   setSavingTopics]   = useState(false);

  // ORCID grants importer state
  const [showOrcidGrants,    setShowOrcidGrants]    = useState(false);
  const [orcidGrantsStep,    setOrcidGrantsStep]    = useState('input');
  const [orcidGrantsId,      setOrcidGrantsId]      = useState('');
  const [orcidGrantsFetching,setOrcidGrantsFetching]= useState(false);
  const [orcidGrantsError,   setOrcidGrantsError]   = useState('');
  const [orcidGrantsPreview, setOrcidGrantsPreview] = useState([]);
  const [orcidGrantsSelected,setOrcidGrantsSelected]= useState(new Set());
  const [orcidGrantsImporting,setOrcidGrantsImporting]=useState(false);

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

  const fetchOrcidGrants = async () => {
    const id = orcidGrantsId.replace(/https?:\/\/orcid\.org\//,'').trim();
    if (!id.match(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)) {
      setOrcidGrantsError('Please enter a valid ORCID iD (format: 0000-0000-0000-0000)');
      return;
    }
    setOrcidGrantsFetching(true); setOrcidGrantsError('');
    try {
      const res = await fetch(`https://pub.orcid.org/v3.0/${id}/fundings`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`ORCID returned ${res.status}. Check the iD and try again.`);
      const data = await res.json();
      const groups = data.group || [];
      const summaries = groups.flatMap(g => g['funding-summary'] || []);

      // Fetch full funding records in parallel to get amount field
      const fullRecords = await Promise.all(
        summaries.map(s =>
          fetch(`https://pub.orcid.org/v3.0/${id}/funding/${s['put-code']}`, {
            headers: { 'Accept': 'application/json' }
          }).then(r => r.ok ? r.json() : null).catch(() => null)
        )
      );

      const grants = summaries
        .map((s, i) => {
          const full = fullRecords[i];
          const extIds = s['external-ids']?.['external-id'] || [];
          const grantNum = (extIds.find(x => x['external-id-type']==='grant_number') || extIds[0]);
          const sy = s['start-date'], ey = s['end-date'];
          const amtVal  = full?.amount?.value || '';
          const amtCur  = full?.amount?.['currency-code'] || '';
          return {
            title:           s.title?.title?.value || '',
            agency:          s.organization?.name  || '',
            grant_number:    grantNum?.['external-id-value'] || '',
            amount_value:    amtVal,
            amount_currency: amtCur,
            role:         '',
            start: sy ? `${sy.year?.value||''}${sy.month?.value?'-'+String(sy.month.value).padStart(2,'0'):''}` : '',
            end:   ey ? `${ey.year?.value||''}${ey.month?.value?'-'+String(ey.month.value).padStart(2,'0'):''}` : '',
            _source: 'orcid',
          };
        })
        .filter(g => g.title || g.agency);
      setOrcidGrantsPreview(grants);
      setOrcidGrantsSelected(new Set(grants.map((_,i)=>i)));
      setOrcidGrantsStep('preview');
    } catch(e) {
      setOrcidGrantsError(e.message);
    }
    setOrcidGrantsFetching(false);
  };

  const importOrcidGrants = async () => {
    setOrcidGrantsImporting(true);
    const toAdd   = orcidGrantsPreview.filter((_,i) => orcidGrantsSelected.has(i));
    const existing = profile?.grants || [];
    const existingNums   = new Set(existing.map(g => (g.grant_number||'').toLowerCase()).filter(Boolean));
    const existingTitles = new Set(existing.map(g => (g.title||'').toLowerCase().slice(0,40)).filter(Boolean));
    const newGrants = toAdd.filter(g => {
      if (g.grant_number && existingNums.has(g.grant_number.toLowerCase())) return false;
      if (g.title && existingTitles.has(g.title.toLowerCase().slice(0,40))) return false;
      return true;
    });
    const merged = [...existing, ...newGrants];
    const { data } = await supabase.from('profiles').update({ grants: merged }).eq('id', user.id).select().single();
    if (data) setProfile(data);
    setOrcidGrantsImporting(false);
    setShowOrcidGrants(false);
    setOrcidGrantsStep('input');
    setOrcidGrantsId('');
    setOrcidGrantsPreview([]);
    setOrcidGrantsSelected(new Set());
  };

  const [userPosts,setUserPosts] = useState([]);
  const [pubStats,setPubStats]   = useState({hIndex:0,totalCitations:0,pubCount:0});
  const [followStats,setFollowStats] = useState({followers:0,following:0});
  const [networkTab,setNetworkTab]   = useState('followers'); // 'followers'|'following'
  const [networkOpen,setNetworkOpen] = useState(false);
  const [networkList,setNetworkList] = useState([]);
  const [networkLoading,setNetworkLoading] = useState(false);
  const [avatarUploading,setAvatarUploading] = useState(false);
  const [avatarHover,setAvatarHover]         = useState(false);

  const save=async()=>{
    setSaving(true);
    const composedName = [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(' ');
    // Core fields — always exist in DB
    const coreUpdates = {
      name_prefix:form.name_prefix, first_name:form.first_name, middle_name:form.middle_name,
      last_name:form.last_name, name_suffix:form.name_suffix, name:composedName||undefined,
      title:form.title, institution:form.institution, location:form.location,
      bio:form.bio, orcid:form.orcid, twitter:form.twitter, card_linkedin:form.card_linkedin,
    };
    // Card fields — only present after migration_businesscard.sql is run
    const cardUpdates = {
      card_email:form.card_email, card_phone:form.card_phone, card_address:form.card_address,
      card_website:form.card_website,
      card_show_email:form.card_show_email, card_show_phone:form.card_show_phone,
      card_show_address:form.card_show_address, card_show_linkedin:form.card_show_linkedin,
      card_show_website:form.card_show_website, card_show_orcid:form.card_show_orcid,
      card_show_twitter:form.card_show_twitter,
    };
    // Try full save first; if card columns don't exist yet, fall back to core only
    const { data, error } = await supabase.from('profiles').update({...coreUpdates,...cardUpdates}).eq('id',user.id).select().single();
    if(error){
      const { data:d2, error:e2 } = await supabase.from('profiles').update(coreUpdates).eq('id',user.id).select().single();
      if(e2){ alert('Save failed: '+e2.message); setSaving(false); return; }
      if(d2) setProfile(d2);
    } else {
      if(data) setProfile(data);
    }
    setEditing(false); setSaving(false);
  };

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

  useEffect(()=>{
    if(!profile) return;
    // Use saved name parts; fall back to splitting the legacy name field
    let fn = profile.first_name||'', mn = profile.middle_name||'', ln = profile.last_name||'';
    if(!fn && !ln && profile.name) {
      const parts = profile.name.trim().split(/\s+/);
      if(parts.length===1){ fn=parts[0]; }
      else if(parts.length===2){ fn=parts[0]; ln=parts[1]; }
      else { fn=parts[0]; ln=parts[parts.length-1]; mn=parts.slice(1,-1).join(' '); }
    }
    setForm({
      name_prefix:profile.name_prefix||'',first_name:fn,middle_name:mn,last_name:ln,name_suffix:profile.name_suffix||'',
      title:profile.title||'',institution:profile.institution||'',location:profile.location||'',bio:profile.bio||'',
      orcid:profile.orcid||'',twitter:profile.twitter||'',
      card_email:   profile.card_email   || user?.email || '',
      card_phone:   profile.card_phone   ||'',
      card_address: profile.card_address ||'',
      card_linkedin:profile.card_linkedin||'',
      card_website: profile.card_website ||'',
      card_show_email:    profile.card_show_email    ??false,
      card_show_phone:    profile.card_show_phone    ??false,
      card_show_address:  profile.card_show_address  ??false,
      card_show_linkedin: profile.card_show_linkedin ??true,
      card_show_website:  profile.card_show_website  ??true,
      card_show_orcid:    profile.card_show_orcid    ??true,
      card_show_twitter:  profile.card_show_twitter  ??true,
    });
  },[profile]);
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


  const wh  = profile?.work_history   || [];
  const edu = profile?.education       || [];
  const vol = profile?.volunteering    || [];
  const org = profile?.organizations   || [];
  const hon = profile?.honors          || [];
  const lng = profile?.languages       || [];
  const skl = profile?.skills          || [];
  const pat = profile?.patents         || [];
  const grt = profile?.grants          || [];
  const hasExperience = wh.length||edu.length||vol.length||org.length;
  const hasSkills     = hon.length||lng.length||skl.length||pat.length;

  const saveTopics = async (selected) => {
    setSavingTopics(true);
    const { data } = await supabase.from('profiles').update({ topic_interests: selected }).eq('id', user.id).select().single();
    if (data) setProfile(data);
    setSavingTopics(false);
    setEditingTopics(false);
  };

  const DATED_FIELDS = {
    work_history:  "start",
    education:     "start",
    volunteering:  "start",
    organizations: "start",
    honors:        "date",
    patents:       "date",
    grants:        "start",
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
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
      if (!showMenu) return;
      const handler = (e) => { if (!menuRef.current?.contains(e.target)) setShowMenu(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);
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
      <div style={{padding:"13px 0",borderBottom:"1px solid "+T.bdr}}>
        {/* Logo + three-dots header row */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:36,height:36,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,border:"1px solid "+T.bdr,background:T.s2}}>{logo}</div>
          <div ref={menuRef} style={{marginLeft:"auto",position:"relative"}}>
            <button onClick={()=>setShowMenu(v=>!v)}
              style={{width:28,height:28,borderRadius:"50%",border:"1px solid "+T.bdr,background:T.w,cursor:"pointer",color:T.mu,fontSize:15,fontWeight:700,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",letterSpacing:1}}>
              ···
            </button>
            {showMenu&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 4px)",background:T.w,border:"1px solid "+T.bdr,borderRadius:10,boxShadow:"0 4px 16px rgba(0,0,0,.1)",zIndex:50,minWidth:120,overflow:"hidden"}}>
                <button onClick={()=>{setShowMenu(false);setEditing(true);}}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",fontSize:13,fontFamily:"inherit",border:"none",borderBottom:"1px solid "+T.bdr,background:"transparent",cursor:"pointer",color:T.text}}>
                  Edit
                </button>
                <button onClick={()=>{setShowMenu(false);deleteRow();}}
                  style={{display:"block",width:"100%",textAlign:"left",padding:"9px 14px",fontSize:13,fontFamily:"inherit",border:"none",background:"transparent",cursor:"pointer",color:T.ro}}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Content — full width */}
        <div>{renderView(item)}</div>
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

  const openNetwork = async (tab) => {
    const newTab = networkOpen && networkTab === tab ? null : tab;
    if (!newTab) { setNetworkOpen(false); return; }
    setNetworkTab(tab);
    setNetworkOpen(true);
    setNetworkLoading(true);
    setNetworkList([]);
    try {
      let ids = [];
      if (tab === 'followers') {
        const { data } = await supabase
          .from('follows').select('follower_id')
          .eq('target_type','user').eq('target_id', user.id)
          .order('created_at',{ascending:false}).limit(50);
        ids = (data||[]).map(r=>r.follower_id).filter(Boolean);
      } else {
        const { data } = await supabase
          .from('follows').select('target_id')
          .eq('follower_id', user.id).eq('target_type','user')
          .order('created_at',{ascending:false}).limit(50);
        ids = (data||[]).map(r=>r.target_id).filter(Boolean);
      }
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles').select('id,name,title,institution,avatar_color,avatar_url')
          .in('id', ids);
        setNetworkList(profiles||[]);
      } else {
        setNetworkList([]);
      }
    } catch(e) { setNetworkList([]); }
    setNetworkLoading(false);
  };

  return (
    <div style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>
      {showLinkedIn&&<LinkedInImporter user={user} profile={profile} setProfile={setProfile} onClose={()=>setShowLinkedIn(false)}/>}
      {showOrcid&&<OrcidImporter user={user} profile={profile} setProfile={setProfile} onClose={()=>setShowOrcid(false)}/>}
      {showSharePanel&&<ShareProfilePanel user={user} profile={profile} onClose={()=>setShowSharePanel(false)} onProfileUpdate={setProfile}/>}
      {showCvExport&&<CvExportPanel user={user} profile={profile} onClose={()=>setShowCvExport(false)}/>}

      {showOrcidGrants&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px 0',overflowY:'auto'}}>
          <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:560,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:6}}>Import Grants from ORCID</div>
            {orcidGrantsStep==='input'&&(
              <>
                <div style={{fontSize:13,color:T.mu,marginBottom:20,lineHeight:1.7}}>
                  Enter your ORCID iD to fetch your funding records. Total funding amounts are imported automatically where available. Role fields can be filled in manually after import.
                </div>
                <div style={{marginBottom:16}}>
                  <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Your ORCID iD</label>
                  <input
                    value={orcidGrantsId}
                    onChange={e=>setOrcidGrantsId(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&fetchOrcidGrants()}
                    placeholder="0000-0002-1825-0097 or https://orcid.org/..."
                    style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:'10px 14px',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
                  {profile?.orcid&&(
                    <div style={{fontSize:11.5,color:T.mu,marginTop:5}}>
                      <button onClick={()=>setOrcidGrantsId(profile.orcid)} style={{background:'none',border:'none',color:T.gr,fontSize:11.5,fontWeight:600,cursor:'pointer',padding:0,fontFamily:'inherit'}}>
                        Use saved ORCID ({profile.orcid}) →
                      </button>
                    </div>
                  )}
                </div>
                {orcidGrantsError&&(
                  <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.ro}}>{orcidGrantsError}</div>
                )}
                <div style={{display:'flex',gap:9,justifyContent:'flex-end'}}>
                  <Btn onClick={()=>{setShowOrcidGrants(false);setOrcidGrantsStep('input');setOrcidGrantsId('');setOrcidGrantsError('');}}>Cancel</Btn>
                  <Btn variant="s" onClick={fetchOrcidGrants} disabled={orcidGrantsFetching||!orcidGrantsId.trim()}
                    style={{background:T.gr,borderColor:T.gr}}>
                    {orcidGrantsFetching?'Fetching...':'Fetch grants →'}
                  </Btn>
                </div>
              </>
            )}
            {orcidGrantsStep==='preview'&&(
              <>
                {orcidGrantsPreview.length===0?(
                  <div style={{textAlign:'center',padding:'24px 0',color:T.mu}}>
                    <div style={{fontSize:32,marginBottom:10}}>🔍</div>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>No funding records found</div>
                    <div style={{fontSize:12.5,lineHeight:1.6}}>This ORCID profile has no public funding data. You can add grants manually below.</div>
                  </div>
                ):(
                  <>
                    <div style={{fontSize:13,color:T.mu,marginBottom:14}}>
                      Found <strong>{orcidGrantsPreview.length}</strong> funding record{orcidGrantsPreview.length!==1?'s':''} — select the ones to import:
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:320,overflowY:'auto',marginBottom:16}}>
                      {orcidGrantsPreview.map((g,i)=>{
                        const sel=orcidGrantsSelected.has(i);
                        return (
                          <div key={i} onClick={()=>setOrcidGrantsSelected(prev=>{const s=new Set(prev);sel?s.delete(i):s.add(i);return s;})}
                            style={{background:sel?T.gr2:T.s2,border:`1.5px solid ${sel?'rgba(16,185,129,.3)':T.bdr}`,borderRadius:10,padding:'10px 14px',cursor:'pointer',transition:'all .15s'}}>
                            <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                              <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?T.gr:T.bdr}`,background:sel?T.gr:'transparent',flexShrink:0,marginTop:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                {sel&&<span style={{color:'white',fontSize:11,fontWeight:800}}>✓</span>}
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:700,marginBottom:2,lineHeight:1.4}}>{g.title||'Untitled grant'}</div>
                                {g.agency&&<div style={{fontSize:12,color:T.v,fontWeight:600,marginBottom:2}}>{g.agency}</div>}
                                <div style={{fontSize:11.5,color:T.mu,display:'flex',gap:10,flexWrap:'wrap'}}>
                                  {g.grant_number&&<span>#{g.grant_number}</span>}
                                  {g.amount_value&&<span style={{color:T.gr,fontWeight:600}}>{g.amount_value}{g.amount_currency?' '+g.amount_currency:''}</span>}
                                  {(g.start||g.end)&&<span>{[g.start,g.end].filter(Boolean).join(' – ')}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{fontSize:11.5,color:T.mu,marginBottom:16}}>
                      Amounts are imported where ORCID has them. Role fields can be filled in after import.
                    </div>
                  </>
                )}
                <div style={{display:'flex',gap:9,justifyContent:'flex-end',paddingTop:16,borderTop:`1px solid ${T.bdr}`}}>
                  <Btn onClick={()=>setOrcidGrantsStep('input')}>← Back</Btn>
                  <Btn onClick={()=>{setShowOrcidGrants(false);setOrcidGrantsStep('input');setOrcidGrantsId('');}}>Cancel</Btn>
                  {orcidGrantsPreview.length>0&&(
                    <Btn variant="s" onClick={importOrcidGrants} disabled={orcidGrantsImporting||orcidGrantsSelected.size===0}
                      style={{background:T.gr,borderColor:T.gr}}>
                      {orcidGrantsImporting?'Importing...': `Import ${orcidGrantsSelected.size} grant${orcidGrantsSelected.size!==1?'s':''} →`}
                    </Btn>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
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
            {editing
              ?<><Btn onClick={()=>setEditing(false)}>Cancel</Btn><Btn variant="s" onClick={save} disabled={saving}>{saving?'Saving...':'Save Profile'}</Btn></>
              :<>
                {!isMobile&&<div style={{position:'relative'}}>
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
                </div>}
                {!isMobile&&<Btn onClick={()=>setShowCvExport(true)}>↓ Export CV</Btn>}
                <Btn variant="v" onClick={()=>setEditing(true)}>✏️ Edit</Btn>
                <Btn variant="s" onClick={()=>setShowSharePanel(true)}>🔗 Share</Btn>
              </>}
          </div>

          {editing?(
            <div style={{maxWidth:560}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:0}}>
                <PF label="Pre-name title" field="name_prefix" form={form} setForm={setForm} placeholder="Dr. med."/>
                <PF label="Post-name credentials" field="name_suffix" form={form} setForm={setForm} placeholder="MD, PhD"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <PF label="First name" field="first_name" form={form} setForm={setForm} placeholder="Jane"/>
                <PF label="Middle name" field="middle_name" form={form} setForm={setForm} placeholder="M."/>
                <PF label="Last name" field="last_name" form={form} setForm={setForm} placeholder="Smith"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <PF label="Current role / title" field="title" form={form} setForm={setForm} placeholder="Professor of Cardiology"/>
                <PF label="Institution" field="institution" form={form} setForm={setForm} placeholder="University of Tokyo"/>
                <PF label="Location" field="location" form={form} setForm={setForm} placeholder="Tokyo, Japan 🇯🇵"/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:T.text,marginBottom:4}}>Bio / Summary</label>
                <textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="Brief summary of your research focus and background..."
                  style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 13px',fontSize:13,fontFamily:'inherit',outline:'none',color:T.text,resize:'none',height:90,lineHeight:1.65}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                <PF label="ORCID" field="orcid" form={form} setForm={setForm} placeholder="0000-0000-0000-0000"/>
                <PF label="Twitter / X" field="twitter" form={form} setForm={setForm} placeholder="@yourhandle"/>
                <PF label="LinkedIn URL" field="card_linkedin" form={form} setForm={setForm} placeholder="linkedin.com/in/yourname"/>
              </div>

              {/* Business Card section */}
              <div style={{marginTop:24,paddingTop:20,borderTop:`2px solid ${T.bdr}`}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>🪪 Business Card</div>
                  {profile?.profile_slug&&(
                    <a href={`/p/${profile.profile_slug}`} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:12,color:T.v,fontWeight:600,textDecoration:'none'}}>Preview card →</a>
                  )}
                </div>
                <div style={{fontSize:12,color:T.mu,marginBottom:16,lineHeight:1.6}}>
                  Your card is shown when someone scans your QR code. Add contact details to make it useful.
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                  <PF label="Work email" field="card_email" form={form} setForm={setForm} placeholder="daniel@organon.com"/>
                  <PF label="Work phone" field="card_phone" form={form} setForm={setForm} placeholder="+81 3 1234 5678"/>
                  <PF label="Personal website" field="card_website" form={form} setForm={setForm} placeholder="danielruzicka.com"/>
                  <div style={{gridColumn:'span 2'}}>
                    <PF label="Office address" field="card_address" form={form} setForm={setForm} placeholder="1-1 Marunouchi, Tokyo 100-0005"/>
                  </div>
                </div>
                <div style={{fontSize:11,color:T.mu,marginBottom:12,lineHeight:1.5}}>LinkedIn, ORCID, and Twitter/X are set above in your main profile fields.</div>
                <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Visibility on public card</div>
                <VisibilityToggle label="Show work email" value={form.card_show_email}    onChange={v=>setForm(f=>({...f,card_show_email:v}))}/>
                <VisibilityToggle label="Show work phone" value={form.card_show_phone}    onChange={v=>setForm(f=>({...f,card_show_phone:v}))}/>
                <VisibilityToggle label="Show office address" value={form.card_show_address} onChange={v=>setForm(f=>({...f,card_show_address:v}))}/>
                <VisibilityToggle label="Show LinkedIn"    value={form.card_show_linkedin} onChange={v=>setForm(f=>({...f,card_show_linkedin:v}))}/>
                <VisibilityToggle label="Show personal website" value={form.card_show_website}  onChange={v=>setForm(f=>({...f,card_show_website:v}))}/>
                <VisibilityToggle label="Show ORCID"      value={form.card_show_orcid}    onChange={v=>setForm(f=>({...f,card_show_orcid:v}))}/>
                <VisibilityToggle label="Show Twitter / X" value={form.card_show_twitter}  onChange={v=>setForm(f=>({...f,card_show_twitter:v}))}/>
              </div>
            </div>
          ):(
            <>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:24,lineHeight:1.2,marginBottom:4}}>
                {profile?.name_prefix && (
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:600,color:T.mu,marginRight:6}}>{profile.name_prefix}</span>
                )}
                {profile?.first_name
                  ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
                  : (profile?.name||user?.email?.split('@')[0]||'Your Name')}
                {profile?.name_suffix && (
                  <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:600,color:T.mu,marginLeft:6}}>, {profile.name_suffix}</span>
                )}
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
                  [followStats.followers,'Followers','followers'],
                  [followStats.following,'Following','following'],
                  [pubStats.pubCount||'—','Publications',null],
                  [pubStats.totalCitations||'—','Citations',null],
                  [pubStats.hIndex>0?`h${pubStats.hIndex}`:'—','h-index',null],
                ].map(([v,l,networkKey])=>{
                  const isActive = networkOpen && networkTab===networkKey;
                  const clickable = !!networkKey;
                  return (
                    <div key={l}
                      onClick={clickable ? ()=>openNetwork(networkKey) : undefined}
                      style={{background:isActive?T.v2:T.s2,borderRadius:10,padding:'10px 8px',textAlign:'center',cursor:clickable?'pointer':undefined,border:isActive?`1.5px solid rgba(108,99,255,.3)`:'1.5px solid transparent',transition:'background .15s'}}>
                      <div style={{fontSize:19,fontWeight:700,fontFamily:"'DM Serif Display',serif",color:isActive?T.v3:T.v}}>{v}</div>
                      <div style={{fontSize:9.5,color:isActive?T.v:T.mu,textTransform:'uppercase',letterSpacing:'.05em',marginTop:2,fontWeight:600}}>{l}{clickable?' ▾':''}</div>
                    </div>
                  );
                })}
              </div>
              {/* My Network panel — inline on desktop, modal on mobile */}
              {networkOpen && isMobile && (
                <div onClick={()=>setNetworkOpen(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:500,display:'flex',alignItems:'flex-end'}}>
                  <div onClick={e=>e.stopPropagation()} style={{width:'100%',background:T.w,borderRadius:'18px 18px 0 0',padding:'20px 18px 32px',maxHeight:'70vh',overflowY:'auto'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                      <span style={{fontSize:14,fontWeight:700,color:T.v}}>{networkTab==='followers'?'Followers':'Following'}</span>
                      <button onClick={()=>setNetworkOpen(false)} style={{border:'none',background:'transparent',cursor:'pointer',color:T.mu,fontSize:16,lineHeight:1,padding:'4px 6px'}}>✕</button>
                    </div>
                    {networkLoading ? (
                      <div style={{textAlign:'center',padding:'20px 0',color:T.mu,fontSize:13}}>Loading…</div>
                    ) : networkList.length === 0 ? (
                      <div style={{textAlign:'center',padding:'20px 0',color:T.mu,fontSize:13}}>No {networkTab} yet.</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:10}}>
                        {networkList.map(p=>(
                          <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.bdr}`}}>
                            <Av color={p.avatar_color||'me'} size={36} name={p.name} url={p.avatar_url||''}/>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:13,fontWeight:600,color:T.text}}>{p.name||'Unknown'}</div>
                              {(p.title||p.institution)&&<div style={{fontSize:11.5,color:T.mu,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title||p.institution}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {networkOpen && !isMobile && (
                <div style={{background:T.s2,borderRadius:12,padding:'14px 16px',marginBottom:10,border:`1px solid ${T.bdr}`}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                    <span style={{fontSize:11.5,fontWeight:700,color:T.v,textTransform:'uppercase',letterSpacing:'.06em'}}>
                      {networkTab==='followers'?'Followers':'Following'}
                    </span>
                    <button onClick={()=>setNetworkOpen(false)} style={{border:'none',background:'transparent',cursor:'pointer',color:T.mu,fontSize:14,lineHeight:1,padding:'2px 4px'}}>✕</button>
                  </div>
                  {networkLoading ? (
                    <div style={{textAlign:'center',padding:'12px 0',color:T.mu,fontSize:12}}>Loading…</div>
                  ) : networkList.length === 0 ? (
                    <div style={{textAlign:'center',padding:'12px 0',color:T.mu,fontSize:12}}>No {networkTab} yet.</div>
                  ) : (
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {networkList.map(p=>(
                        <div key={p.id} style={{display:'flex',alignItems:'center',gap:7,background:T.w,borderRadius:9,padding:'7px 10px',border:`1px solid ${T.bdr}`,minWidth:0,maxWidth:200}}>
                          <Av color={p.avatar_color||'me'} size={28} name={p.name} url={p.avatar_url||''}/>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:11.5,fontWeight:600,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name||'Unknown'}</div>
                            {(p.title||p.institution)&&<div style={{fontSize:10,color:T.mu,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title||p.institution}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div style={{display:'flex',borderBottom:`1px solid ${T.bdr}`,margin:'0',gap:0}}>
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

              {(grt.length>0||true)&&(
                <>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',margin:'20px 0 10px',paddingBottom:6,borderBottom:'2px solid '+T.bdr}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.07em'}}>Grants &amp; Funding</div>
                    <Btn onClick={()=>{setOrcidGrantsId(profile?.orcid||'');setOrcidGrantsStep('input');setOrcidGrantsError('');setShowOrcidGrants(true);}} style={{fontSize:11,padding:'3px 10px'}}>🔬 Search ORCID</Btn>
                  </div>
                  {grt.map((g,i)=>(
                    <EditableRow key={i} item={g} index={i} field="grants" array={grt} logo="💰"
                      renderView={g=>(
                        <>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:1}}>{g.title}</div>
                          {g.agency&&<div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:2}}>{g.agency}</div>}
                          <div style={{fontSize:11.5,color:T.mu,display:'flex',gap:10,flexWrap:'wrap'}}>
                            {g.grant_number&&<span>#{g.grant_number}</span>}
                            {g.amount_value&&<span style={{fontWeight:600,color:T.gr}}>{g.amount_value}{g.amount_currency?' '+g.amount_currency:''}</span>}
                            {g.role&&<span>{g.role}</span>}
                            {(g.start||g.end)&&<span>{formatDateRange(g.start,g.end)}</span>}
                          </div>
                        </>
                      )}
                      renderEdit={(f,set)=>(
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
                          <div style={{gridColumn:'span 2'}}><EF label="Grant Title" val={f.title||''} onChange={v=>set({title:v})} placeholder="Understanding Protein Folding Mechanisms..."/></div>
                          <EF label="Funding Agency" val={f.agency||''} onChange={v=>set({agency:v})} placeholder="NIH / NHLBI"/>
                          <EF label="Grant Number" val={f.grant_number||''} onChange={v=>set({grant_number:v})} placeholder="R01CA123456"/>
                          <EF label="Amount" val={f.amount_value||''} onChange={v=>set({amount_value:v})} placeholder="500000"/>
                          <EF label="Currency" val={f.amount_currency||''} onChange={v=>set({amount_currency:v})} placeholder="USD"/>
                          <EF label="Your Role" val={f.role||''} onChange={v=>set({role:v})} placeholder="Principal Investigator"/>
                          <EF label="Start (YYYY-MM)" val={f.start||''} onChange={v=>set({start:v})} placeholder="2021-01"/>
                          <EF label="End (YYYY-MM)" val={f.end||''} onChange={v=>set({end:v})} placeholder="2024-12"/>
                        </div>
                      )}/>
                  ))}
                  <AddRowItem field="grants" array={grt} logo="💰"
                    fields={[
                      ['title','Grant Title','Understanding Protein Folding Mechanisms...'],
                      ['agency','Funding Agency','NIH / NHLBI'],
                      ['grant_number','Grant Number','R01CA123456'],
                      ['amount_value','Amount','500000'],
                      ['amount_currency','Currency','USD'],
                      ['role','Your Role','Principal Investigator'],
                      ['start','Start (YYYY-MM)','2021-01'],
                      ['end','End (YYYY-MM)','2024-12'],
                    ]}/>
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
                  {(showAllSkills ? skl : skl.slice(0,5)).map((s,i)=><EditablePill key={i} item={s} index={i} field="skills" array={skl} color="mu"/>)}
                  {!showAllSkills && skl.length > 5 && (
                    <button onClick={()=>setShowAllSkills(true)} style={{fontSize:11.5,color:T.v,border:`1px solid rgba(108,99,255,.25)`,background:T.v2,borderRadius:20,padding:'3px 10px',cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
                      +{skl.length-5} more
                    </button>
                  )}
                  {showAllSkills && skl.length > 5 && (
                    <button onClick={()=>setShowAllSkills(false)} style={{fontSize:11.5,color:T.mu,border:`1px solid ${T.bdr}`,background:'transparent',borderRadius:20,padding:'3px 10px',cursor:'pointer',fontFamily:'inherit'}}>
                      Show less
                    </button>
                  )}
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

              <SectionHead label="Research Interests"/>
              {!editingTopics ? (
                <div style={{marginBottom:16}}>
                  {(profile?.topic_interests?.length > 0) ? (
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
                      {profile.topic_interests.map(t=>(
                        <span key={t} style={{fontSize:10,padding:'5px 13px',borderRadius:20,border:`1.5px solid rgba(108,99,255,.2)`,background:T.v2,color:T.v,fontWeight:700}}>#{t}</span>
                      ))}
                    </div>
                  ) : (
                    <div style={{fontSize:12.5,color:T.mu,marginBottom:10}}>No research interests set — add some to personalise your feed.</div>
                  )}
                  <Btn onClick={()=>{ setTopicDraft(profile?.topic_interests||[]); setEditingTopics(true); }}>Edit interests</Btn>
                </div>
              ) : (
                <div style={{marginBottom:16}}>
                  <TopicInterestsPicker
                    selected={topicDraft}
                    onChange={setTopicDraft}
                    minRequired={0}
                  />
                  <div style={{display:'flex',gap:8,marginTop:14}}>
                    <Btn onClick={()=>setEditingTopics(false)}>Cancel</Btn>
                    <Btn variant="s" onClick={()=>saveTopics(topicDraft)} disabled={savingTopics}>{savingTopics?'Saving…':'Save interests'}</Btn>
                  </div>
                  <div style={{fontSize:12,color:T.mu,marginTop:8}}>
                    {topicDraft.length===0
                      ?'Saving with no topics selected will disable personalised feed sorting.'
                      :`${topicDraft.length} topic${topicDraft.length!==1?'s':''} selected`}
                  </div>
                </div>
              )}

              {/* Business Card summary — view mode */}
              <SectionHead label="🪪 Business Card"/>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                <div style={{fontSize:12.5,color:T.mu,lineHeight:1.6}}>
                  {profile?.profile_slug
                    ? <>Your card is live at <a href={`/c/${profile.profile_slug}`} target="_blank" rel="noopener noreferrer" style={{color:T.v,fontWeight:600,textDecoration:'none'}}>{window.location.hostname}/c/{profile.profile_slug} ↗</a></>
                    : 'Set a profile slug in Share settings to activate your card URL.'}
                </div>
                <Btn variant="v" onClick={()=>setEditing(true)} style={{flexShrink:0,fontSize:12}}>✏️ Edit card details</Btn>
              </div>
              {(profile?.card_email||profile?.card_phone||profile?.card_address||profile?.card_linkedin||profile?.card_website||profile?.orcid||profile?.twitter)
                ? (
                  <div style={{background:T.s2,borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:7}}>
                    {profile.card_email    &&<div style={{fontSize:12,color:T.text}}>✉️ {profile.card_email}   {!profile.card_show_email   &&<span style={{color:T.mu,fontSize:11}}> (hidden)</span>}</div>}
                    {profile.card_phone    &&<div style={{fontSize:12,color:T.text}}>📞 {profile.card_phone}   {!profile.card_show_phone   &&<span style={{color:T.mu,fontSize:11}}> (hidden)</span>}</div>}
                    {profile.card_linkedin &&<div style={{fontSize:12,color:T.text}}>💼 {profile.card_linkedin} {!profile.card_show_linkedin &&<span style={{color:T.mu,fontSize:11}}> (hidden)</span>}</div>}
                    {profile.card_website  &&<div style={{fontSize:12,color:T.text}}>🌐 {profile.card_website}  {!profile.card_show_website  &&<span style={{color:T.mu,fontSize:11}}> (hidden)</span>}</div>}
                    {profile.card_address  &&<div style={{fontSize:12,color:T.text}}>📍 {profile.card_address}  {!profile.card_show_address  &&<span style={{color:T.mu,fontSize:11}}> (hidden)</span>}</div>}
                  </div>
                ) : (
                  <div style={{background:T.v2,border:`1px dashed rgba(108,99,255,.3)`,borderRadius:10,padding:'14px 16px',fontSize:12.5,color:T.mu,lineHeight:1.7}}>
                    No contact details added yet. Click <strong>Edit card details</strong> to add your work email, phone, LinkedIn, and more. These will appear when someone scans your QR code.
                  </div>
                )
              }
            </div>
          )}

          {tab==='posts'&&(
            userPosts.length===0
              ?<div style={{textAlign:'center',padding:'32px 0',color:T.mu}}><div style={{fontSize:32,marginBottom:10}}>📝</div><div style={{fontSize:14,fontFamily:"'DM Serif Display',serif",marginBottom:8}}>No posts yet</div></div>
              :<div style={{display:'flex',flexDirection:'column',gap:12}}>{userPosts.map(p=><PostCard key={p.id} post={p} currentUserId={user?.id} currentProfile={profile}/>)}</div>
          )}

          {tab==='publications'&&<PublicationsTab user={user} profile={profile} setProfile={setProfile} pendingCvPubs={pendingCvPubs} onPendingConsumed={()=>setPendingCvPubs([])} initialMode={pubsInitialMode}/>}
        </div>
      </div>
    </div>
  );
}
