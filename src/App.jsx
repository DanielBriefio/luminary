import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { T, NAV } from './lib/constants';
import Av from './components/Av';
import Spinner from './components/Spinner';
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
import PaperDetailPage from './paper/PaperDetailPage';

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

export default function App() {
  const [publicSlug]     = useState(getPublicSlug);
  const [publicPostId]   = useState(getPublicPostId);
  const [publicPaperDoi] = useState(getPublicPaperDoi);
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [screen,setScreen]=useState('feed');
  const [viewedUserId,  setViewedUserId]  = useState(null);
  const [viewedPaperDoi,setViewedPaperDoi]= useState(null);
  const [authChecked,setAuthChecked]=useState(false);

  const onViewUser  = (userId) => { setViewedUserId(userId);   setScreen('user_profile'); };
  const onViewPaper = (doi)    => { setViewedPaperDoi(doi);    setScreen('paper_detail'); };

  useEffect(()=>{
    if(publicSlug || publicPostId || publicPaperDoi) return; // no auth needed for public pages
    supabase.auth.getSession().then(({data})=>{ setSession(data.session); setAuthChecked(true); });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[publicSlug, publicPostId, publicPaperDoi]);

  useEffect(()=>{
    if(!session?.user){setProfile(null);return;}
    supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setProfile(data));
  },[session]);

  const signOut=async()=>{ await supabase.auth.signOut(); setScreen('feed'); };

  const fonts = <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>;

  // Public pages — no auth required
  if(publicSlug)     return <>{fonts}<PublicProfilePage slug={publicSlug}/></>;
  if(publicPostId)   return <>{fonts}<PublicPostPage postId={publicPostId}/></>;
  if(publicPaperDoi) return <>{fonts}<PaperDetailPage doi={publicPaperDoi} isPublicPage={true}/></>;

  if(!authChecked) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'DM Sans',sans-serif"}}><Spinner/></div>;
  if(!session) return <AuthScreen onAuth={()=>setScreen('feed')}/>;

  const user=session.user;
  const screens={
    feed:         <FeedScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper}/>,
    explore:      <ExploreScreen user={user}/>,
    network:      <NetworkScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper}/>,
    groups:       <GroupsScreen user={user}/>,
    profile:      <ProfileScreen user={user} profile={profile} setProfile={setProfile}/>,
    notifs:       <NotifsScreen user={user}/>,
    post:         <NewPostScreen user={user} profile={profile} onPostCreated={()=>setScreen('feed')}/>,
    user_profile: <UserProfileScreen userId={viewedUserId} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewPaper={onViewPaper}/>,
    paper_detail: <PaperDetailPage doi={viewedPaperDoi} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewUser={onViewUser} onViewPaper={onViewPaper}/>,
  };

  return (
    <>
      {fonts}
      <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans',sans-serif",fontSize:13,color:T.text,background:T.bg,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:200,flexShrink:0,background:T.w,borderRight:`1px solid ${T.bdr}`,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 14px 14px",borderBottom:`1px solid ${T.bdr}`}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:21}}>Lumi<span style={{color:T.v}}>nary</span></div>
          </div>
          <div style={{flex:1,padding:"8px 0",overflowY:"auto"}}>
            {NAV.map(n=>(
              <div key={n.id} onClick={()=>setScreen(n.id)}
                style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",margin:"1px 8px",borderRadius:9,cursor:"pointer",fontSize:12.5,fontWeight:screen===n.id?700:500,color:screen===n.id?T.v:T.mu,background:screen===n.id?T.v2:"transparent"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0}}><path d={n.p}/></svg>
                {n.l}
              </div>
            ))}
          </div>
          <div style={{padding:"12px 14px",borderTop:`1px solid ${T.bdr}`}}>
            <div style={{background:`linear-gradient(135deg,${T.v2},${T.bl2})`,border:`1px solid ${T.bdr}`,borderRadius:9,padding:"8px 11px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,fontWeight:700,color:T.v}}>Lv.1 — Researcher</span><span style={{fontSize:9.5,color:T.mu}}>0 XP</span></div>
              <div style={{height:4,background:T.s3,borderRadius:2,marginTop:5,overflow:"hidden"}}><div style={{height:"100%",width:"5%",background:`linear-gradient(90deg,${T.v},${T.bl})`,borderRadius:2}}/></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <Av color={profile?.avatar_color||"me"} size={32} name={profile?.name} url={profile?.avatar_url||""}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile?.name||user.email?.split('@')[0]}</div>
                <div style={{fontSize:10,color:T.mu,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile?.institution||user.email}</div>
              </div>
              <button onClick={signOut} title="Sign out" style={{fontSize:14,cursor:"pointer",border:"none",background:"transparent",color:T.mu,flexShrink:0}}>↩</button>
            </div>
          </div>
        </div>
        {/* Main */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:T.bg}}>
          {screens[screen]||screens.feed}
        </div>
      </div>
    </>
  );
}
