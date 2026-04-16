import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { T, NAV } from './lib/constants';
import Av from './components/Av';
import Spinner from './components/Spinner';
import BottomNav from './components/BottomNav';
import { useWindowSize } from './lib/useWindowSize';
import AuthScreen from './screens/AuthScreen';
import FeedScreen from './feed/FeedScreen';
import ExploreScreen from './screens/ExploreScreen';
import GroupsScreen from './screens/GroupsScreen';
import NotifsScreen from './screens/NotifsScreen';
import NewPostScreen from './screens/NewPostScreen';
import ProfileScreen from './profile/ProfileScreen';
import PublicProfilePage from './profile/PublicProfilePage';
import PublicPostPage from './post/PublicPostPage';
import UserProfileScreen from './profile/UserProfileScreen';
import NetworkScreen from './screens/NetworkScreen';
import MessagesScreen, { startConversation } from './screens/MessagesScreen';
import PaperDetailPage from './paper/PaperDetailPage';
import OnboardingScreen from './screens/OnboardingScreen';
import CardQROverlay from './components/CardQROverlay';
import CardPage from './profile/CardPage';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import AccountSettingsScreen from './screens/AccountSettingsScreen';
import Footer from './components/Footer';
import OrcidImporter from './profile/OrcidImporter';

// Detect public profile route: /p/:slug
const getPublicSlug = () => {
  const m = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
  return m ? m[1] : null;
};

// Detect public post route: /s/:postId
const getPublicPostId = () => {
  const m = window.location.pathname.match(/^\/s\/([^/]+)\/?$/);
  return m ? m[1] : null;
};

// Detect public paper route: /paper/:doi  (DOI may contain slashes)
const getPublicPaperDoi = () => {
  const m = window.location.pathname.match(/^\/paper\/(.+)$/);
  return m ? m[1] : null;
};

// Detect business card route: /c/:slug
const getPublicCardSlug = () => {
  const m = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
  return m ? m[1] : null;
};

export default function App() {
  const [publicSlug]     = useState(getPublicSlug);
  const [publicPostId]   = useState(getPublicPostId);
  const [publicPaperDoi] = useState(getPublicPaperDoi);
  const [publicCardSlug] = useState(getPublicCardSlug);
  const { isMobile } = useWindowSize();
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [screen,setScreen]=useState('feed');
  const [viewedUserId,  setViewedUserId]  = useState(null);
  const [viewedPaperDoi,setViewedPaperDoi]= useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [exploreQuery,setExploreQuery]=useState('');
  const [unreadMessages,setUnreadMessages]=useState(0);
  const [unreadNotifs,setUnreadNotifs]=useState(0);
  const [showCardQR,setShowCardQR]=useState(false);
  const [isPasswordRecovery,setIsPasswordRecovery]=useState(false);
  const [showInvites,setShowInvites]=useState(false);
  const [inviteCodes,setInviteCodes]=useState([]);
  const [invitesRemaining,setInvitesRemaining]=useState(0);
  const [copiedCode,setCopiedCode]=useState(null);
  const [showSettings,setShowSettings]=useState(false);
  const [showOrcidImport,setShowOrcidImport]=useState(false);
  const [orcidPendingToken,  setOrcidPendingToken]  = useState('');
  const [orcidPendingName,   setOrcidPendingName]   = useState('');
  const [showOrcidEmailForm, setShowOrcidEmailForm] = useState(false);
  const [orcidAuthError,     setOrcidAuthError]     = useState('');

  const onViewUser  = (userId) => { setViewedUserId(userId);   setScreen('user_profile'); };
  const onViewPaper = (doi)    => { setViewedPaperDoi(doi);    setScreen('paper_detail'); };
  const onMessage   = async (otherUserId) => {
    const uid = session?.user?.id;
    if(!uid) return;
    const convId = await startConversation(uid, otherUserId, supabase);
    if(convId){ sessionStorage.setItem('open_conversation', convId); }
    setScreen('messages');
  };

  useEffect(()=>{
    if(publicSlug || publicPostId || publicPaperDoi || publicCardSlug) return; // no auth needed for public pages
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setAuthChecked(true); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{
      setSession(s);
      if(event==='PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });
    return ()=>subscription.unsubscribe();
  },[publicSlug, publicPostId, publicPaperDoi]);

  useEffect(()=>{
    if(!session?.user){setProfile(null);return;}
    supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setProfile(data));
  },[session]);

  useEffect(()=>{
    if (!profile) return;
    if (profile.onboarding_completed) return;
    // Only show for genuinely new users (no follows and no publications yet)
    Promise.all([
      supabase.from('follows').select('id',{count:'exact',head:true}).eq('follower_id',profile.id),
      supabase.from('publications').select('id',{count:'exact',head:true}).eq('user_id',profile.id),
    ]).then(([{count:fc},{count:pc}])=>{
      if ((fc||0) === 0 && (pc||0) === 0) setShowOnboarding(true);
    });
  },[profile]);

  // Unread message badge — fetch on login and poll every 30s
  useEffect(()=>{
    if(!session?.user) return;
    const fetchUnread = async () => {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`user_id_a.eq.${session.user.id},user_id_b.eq.${session.user.id}`);
      if (!convs?.length){ setUnreadMessages(0); return; }
      const { count } = await supabase
        .from('messages')
        .select('id',{count:'exact',head:true})
        .in('conversation_id', convs.map(c=>c.id))
        .neq('sender_id', session.user.id)
        .is('read_at', null);
      setUnreadMessages(count||0);
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return ()=>clearInterval(interval);
  },[session]);

  // Unread notification badge
  useEffect(()=>{
    if(!session?.user) return;
    const fetchUnreadNotifs = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('id',{count:'exact',head:true})
        .eq('user_id', session.user.id)
        .eq('read', false);
      setUnreadNotifs(count||0);
    };
    fetchUnreadNotifs();
    const interval = setInterval(fetchUnreadNotifs, 30000);
    return ()=>clearInterval(interval);
  },[session]);

  // Invite codes
  useEffect(()=>{
    if(!session?.user) return;
    supabase
      .from('invite_codes')
      .select('id, code, claimed_by, claimed_at, batch_label')
      .eq('created_by', session.user.id)
      .order('created_at')
      .then(async ({data})=>{
        if(!data) return;
        const claimedIds = data.filter(c=>c.claimed_by).map(c=>c.claimed_by);
        let nameMap = {};
        if(claimedIds.length){
          const {data:profiles} = await supabase.from('profiles').select('id,name').in('id',claimedIds);
          (profiles||[]).forEach(p=>{nameMap[p.id]=p.name;});
        }
        const enriched = data.map(c=>({...c, claimed_name: nameMap[c.claimed_by]||null}));
        setInviteCodes(enriched);
        setInvitesRemaining(enriched.filter(c=>!c.claimed_by).length);
      });
  },[session]);

  // Offer ORCID import on first login if user has a verified ORCID but hasn't imported yet
  useEffect(()=>{
    if(!profile) return;
    if(!profile.orcid || !profile.orcid_verified) return;
    if(profile.orcid_imported_at) return;
    if(!profile.onboarding_completed) return; // wait until onboarding finishes
    const dismissed = localStorage.getItem(`orcid_import_dismissed_${profile.id}`);
    if(dismissed) return;
    setShowOrcidImport(true);
  },[profile]);

  // Handle ORCID OAuth callback params (?orcid_token=... or ?orcid_error=...)
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const orcidToken = params.get('orcid_token');
    const orcidName  = params.get('orcid_name');
    const orcidError = params.get('orcid_error');

    if (orcidError) {
      setOrcidAuthError(decodeURIComponent(orcidError));
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (orcidToken) {
      setOrcidPendingToken(orcidToken);
      setOrcidPendingName(decodeURIComponent(orcidName || ''));
      setShowOrcidEmailForm(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Handle PWA shortcut deep links (?shortcut=post / ?shortcut=explore)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortcut = params.get('shortcut');
    if (shortcut && session) {
      setScreen(shortcut);
      window.history.replaceState({}, '', '/');
    }
  }, [session]);

  const signOut=async()=>{ await supabase.auth.signOut(); setScreen('feed'); };

  const fonts = <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>;

  // Public pages — no auth required
  if(publicSlug)     return <>{fonts}<PublicProfilePage slug={publicSlug}/></>;
  if(publicPostId)   return <>{fonts}<PublicPostPage postId={publicPostId}/></>;
  if(publicPaperDoi) return <>{fonts}<PaperDetailPage doi={publicPaperDoi} isPublicPage={true}/></>;
  if(publicCardSlug) return <>{fonts}<CardPage slug={publicCardSlug}/>;</>;

  if(isPasswordRecovery) return <>{fonts}<ResetPasswordScreen onDone={()=>setIsPasswordRecovery(false)}/></>;
  if(!authChecked) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'DM Sans',sans-serif"}}><Spinner/></div>;
  if(!session) return <AuthScreen onAuth={()=>setScreen('feed')}
    orcidPendingToken={orcidPendingToken}
    orcidPendingName={orcidPendingName}
    showOrcidEmailForm={showOrcidEmailForm}
    orcidAuthError={orcidAuthError}
  />;

  const user=session.user;
  const screens={
    feed:         <FeedScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper} onGoToProfile={()=>setScreen('profile')} onTagClick={(tag)=>{setExploreQuery(tag);setScreen('explore');}}/>,
    explore:      <ExploreScreen user={user} currentProfile={profile} initialQuery={exploreQuery} onViewUser={onViewUser} onViewPaper={onViewPaper} onNavigateToPost={()=>setScreen('post')}/>,
    network:      <NetworkScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper} onMessage={onMessage}/>,
    messages:     <MessagesScreen user={user} onViewUser={onViewUser}/>,
    groups:       <GroupsScreen user={user}/>,
    profile:      <ProfileScreen user={user} profile={profile} setProfile={setProfile}/>,
    notifs:       <NotifsScreen user={user}/>,
    post:         <NewPostScreen user={user} profile={profile} onPostCreated={()=>setScreen('feed')}/>,
    user_profile: <UserProfileScreen userId={viewedUserId} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewPaper={onViewPaper} onMessage={onMessage}/>,
    paper_detail: <PaperDetailPage doi={viewedPaperDoi} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewUser={onViewUser} onViewPaper={onViewPaper}/>,
  };

  return (
    <>
      {fonts}
      {showCardQR && profile && <CardQROverlay profile={profile} onClose={()=>setShowCardQR(false)}/>}
      {/* Account Settings panel */}
      {showSettings && (
        <AccountSettingsScreen
          user={user}
          profile={profile}
          setProfile={setProfile}
          onClose={() => setShowSettings(false)}
          onSignOut={() => { setShowSettings(false); signOut(); }}
        />
      )}
      {/* ORCID import offer modal */}
      {showOrcidImport && profile && (
        <OrcidImporter
          user={user}
          profile={profile}
          setProfile={setProfile}
          onClose={() => {
            localStorage.setItem(`orcid_import_dismissed_${user.id}`, '1');
            setShowOrcidImport(false);
          }}
        />
      )}
      {/* Invite codes modal */}
      {showInvites && (
        <div onClick={()=>setShowInvites(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,fontFamily:"'DM Sans',sans-serif"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.w,borderRadius:18,padding:28,maxWidth:480,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)',maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,marginBottom:4}}>Your invite codes</div>
            <div style={{fontSize:13,color:T.mu,marginBottom:20,lineHeight:1.6}}>
              Share these with colleagues you'd like to invite to Luminary.
              Each code can only be used once.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {inviteCodes.length===0&&<div style={{fontSize:13,color:T.mu,textAlign:'center',padding:'20px 0'}}>No invite codes yet.</div>}
              {inviteCodes.map(code=>(
                <div key={code.id} style={{
                  display:'flex',alignItems:'center',gap:10,
                  padding:'10px 14px',borderRadius:10,
                  background:code.claimed_by?T.s2:T.v2,
                  border:`1px solid ${code.claimed_by?T.bdr:'rgba(108,99,255,.2)'}`,
                }}>
                  <span style={{fontFamily:'monospace',fontSize:13,fontWeight:700,flex:1,letterSpacing:'.05em',color:code.claimed_by?T.mu:T.v}}>
                    {code.code}
                  </span>
                  {code.claimed_by?(
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.gr}}>✓ Claimed</div>
                      {code.claimed_name&&<div style={{fontSize:10.5,color:T.mu}}>by {code.claimed_name}</div>}
                    </div>
                  ):(
                    <button onClick={()=>{
                      navigator.clipboard.writeText(code.code);
                      setCopiedCode(code.id);
                      setTimeout(()=>setCopiedCode(null),1500);
                    }} style={{
                      fontSize:11.5,fontWeight:600,color:copiedCode===code.id?T.gr:T.v,
                      border:`1px solid ${copiedCode===code.id?T.gr:T.v}`,background:'white',
                      borderRadius:8,padding:'4px 10px',cursor:'pointer',fontFamily:'inherit',
                      transition:'all .15s',
                    }}>
                      {copiedCode===code.id?'Copied!':'Copy'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{marginTop:16,padding:'10px 14px',background:T.s2,borderRadius:10,fontSize:12,color:T.mu,lineHeight:1.6}}>
              💡 Codes work like conference badges — whoever you give them to joins your Luminary network automatically as a connection.
            </div>
            <button onClick={()=>setShowInvites(false)} style={{width:'100%',marginTop:16,padding:'10px',borderRadius:10,border:`1.5px solid ${T.bdr}`,background:T.w,cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,color:T.text}}>
              Close
            </button>
          </div>
        </div>
      )}
      <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.text,background:T.bg,overflow:"hidden"}}>
        {/* Onboarding overlay */}
        {showOnboarding && (
          <OnboardingScreen
            user={user}
            profile={profile}
            setProfile={setProfile}
            onComplete={() => { setShowOnboarding(false); setScreen('feed'); }}
            onGoToProfile={() => { setShowOnboarding(false); setScreen('profile'); }}
          />
        )}
        {/* Sidebar — desktop only */}
        {!isMobile && (
          <div style={{width:200,flexShrink:0,background:T.w,borderRight:`1px solid ${T.bdr}`,display:"flex",flexDirection:"column"}}>
            <div style={{padding:"16px 14px 14px",borderBottom:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:21}}>Lumi<span style={{color:T.v}}>nary</span></div>
              {profile?.profile_slug && (
                <button onClick={()=>setShowCardQR(true)} title="Share my card"
                  style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",borderRadius:7,color:T.mu}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm9-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm9 0h2v2h-2zm0 4h2v2h-2zm4-4h2v2h-2zm0 4h2v2h-2zm-2 2h2v-2h-2zm-2-6h2v2h-2z"/>
                  </svg>
                </button>
              )}
            </div>
            <div style={{flex:1,padding:"8px 0",overflowY:"auto"}}>
              {NAV.map(n=>(
                <div key={n.id} onClick={()=>setScreen(n.id)}
                  style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",margin:"1px 8px",borderRadius:9,cursor:"pointer",fontSize:12.5,fontWeight:screen===n.id?700:500,color:screen===n.id?T.v:T.mu,background:screen===n.id?T.v2:"transparent"}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0}}><path d={n.p}/></svg>
                  {n.l}
                  {n.id==='messages' && unreadMessages>0 && (
                    <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:T.ro,color:"#fff",padding:"1px 6px",borderRadius:20,minWidth:16,textAlign:"center"}}>
                      {unreadMessages>9?'9+':unreadMessages}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div style={{padding:"12px 14px",borderTop:`1px solid ${T.bdr}`}}>
              <div style={{background:`linear-gradient(135deg,${T.v2},${T.bl2})`,border:`1px solid ${T.bdr}`,borderRadius:9,padding:"8px 11px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:700,color:T.v}}>Lv.1 — Researcher</span><span style={{fontSize:9.5,color:T.mu}}>0 XP</span></div>
                <div style={{height:4,background:T.s3,borderRadius:2,marginTop:5,overflow:"hidden"}}><div style={{height:"100%",width:"5%",background:`linear-gradient(90deg,${T.v},${T.bl})`,borderRadius:2}}/></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <div onClick={()=>setScreen('profile')}
                  title="My Profile"
                  style={{display:"flex",alignItems:"center",gap:9,flex:1,minWidth:0,cursor:"pointer",borderRadius:8,padding:"3px 4px",margin:"-3px -4px",transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=T.s2}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <Av color={profile?.avatar_color||"me"} size={32} name={profile?.name} url={profile?.avatar_url||""}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile?.name||user.email?.split('@')[0]}</div>
                    <div style={{fontSize:10,color:T.mu,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile?.institution||user.email}</div>
                  </div>
                </div>
                <button onClick={()=>setShowSettings(true)} title="Settings"
                  style={{fontSize:13,cursor:"pointer",border:"none",background:"transparent",color:T.mu,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:22,height:22}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
              {/* Invite colleagues button */}
              <button onClick={()=>setShowInvites(true)} style={{
                display:'flex',alignItems:'center',gap:8,
                width:'100%',padding:'7px 10px',marginTop:8,
                border:`1px dashed ${T.bdr}`,borderRadius:9,
                background:'transparent',cursor:'pointer',
                fontFamily:'inherit',color:T.mu,
              }}>
                <span style={{fontSize:13}}>🎟️</span>
                <span style={{fontSize:11.5,fontWeight:600}}>Invite colleagues</span>
                {invitesRemaining>0&&(
                  <span style={{marginLeft:'auto',fontSize:10,fontWeight:700,background:T.v,color:'white',padding:'1px 6px',borderRadius:20}}>
                    {invitesRemaining}
                  </span>
                )}
              </button>
            </div>
            <Footer sidebar/>
          </div>
        )}

        {/* Main content */}
        <div style={{
          flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:T.bg,
          // On mobile, reserve space for the fixed bottom nav
          paddingBottom: isMobile ? 60 : 0,
        }}>
          {/* Mobile header — logo + inbox icon + sign out */}
          {isMobile && (
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 16px", background:T.w, borderBottom:`1px solid ${T.bdr}`,
              flexShrink:0,
            }}>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:19}}>
                Lumi<span style={{color:T.v}}>nary</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                {/* Inbox icon with unread count */}
                <button onClick={()=>setScreen('messages')} title="Messages"
                  style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",height:36,border:"none",
                    background:screen==='messages'?T.v2:(unreadMessages>0?T.ro2:"transparent"),
                    borderRadius:9,cursor:"pointer",color:screen==='messages'?T.v:(unreadMessages>0?T.ro:T.mu)}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <polyline points="2,4 12,13 22,4"/>
                  </svg>
                  {unreadMessages>0 && (
                    <span style={{fontSize:12,fontWeight:700,lineHeight:1}}>
                      {unreadMessages>99?"99+":unreadMessages}
                    </span>
                  )}
                </button>
                {/* Card QR button — mobile */}
                {profile?.profile_slug && (
                  <button onClick={()=>setShowCardQR(true)} title="Share my card"
                    style={{width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",borderRadius:9,color:T.mu}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm9-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm9 0h2v2h-2zm0 4h2v2h-2zm4-4h2v2h-2zm0 4h2v2h-2zm-2 2h2v-2h-2zm-2-6h2v2h-2z"/>
                    </svg>
                  </button>
                )}
                <button onClick={signOut} title="Sign out"
                  style={{fontSize:13,cursor:"pointer",border:"none",background:"transparent",color:T.mu,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:9}}>
                  ↩
                </button>
              </div>
            </div>
          )}
          {screens[screen]||screens.feed}
        </div>

        {/* Bottom nav — mobile only */}
        {isMobile && (
          <BottomNav screen={screen} setScreen={(s)=>{ if(s==='notifs') setUnreadNotifs(0); setScreen(s); }} unreadNotifs={unreadNotifs}/>
        )}
      </div>
    </>
  );
}
