import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { initAnalytics, optInAndIdentify, optOutAndReset, capturePageview } from './lib/analytics';
import { T, NAV, TIER_CONFIG, getTierFromLumens } from './lib/constants';
import Av from './components/Av';
import Spinner from './components/Spinner';
import BottomNav from './components/BottomNav';
import { useWindowSize } from './lib/useWindowSize';
import AuthScreen from './screens/AuthScreen';
import LandingScreen from './screens/LandingScreen';
import FeedScreen from './feed/FeedScreen';
import ExploreScreen from './screens/ExploreScreen';
import GroupsScreen from './groups/GroupsScreen';
import GroupScreen from './groups/GroupScreen';
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
import LumensScreen from './screens/LumensScreen';
import StorageScreen from './screens/StorageScreen';
import LegalPage from './screens/LegalPage';
import PublicGroupProfileScreen from './groups/PublicGroupProfileScreen';
import LibraryScreen from './library/LibraryScreen';
import ProjectsScreen from './projects/ProjectsScreen';
import AdminShell from './admin/AdminShell';
import NotFoundScreen from './screens/NotFoundScreen';

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

// Detect public group route: /g/:slug
const getPublicGroupSlug = () => {
  const m = window.location.pathname.match(/^\/g\/([^/]+)\/?$/);
  return m ? m[1] : null;
};

// Detect legal document routes: /privacy, /terms, /cookies
const getLegalDoc = () => {
  const m = window.location.pathname.match(/^\/(privacy|terms|cookies)\/?$/);
  return m ? m[1] : null;
};

// Inject deep-dive-content CSS once at module level
(function injectDeepDiveStyles() {
  if (document.getElementById('deep-dive-styles')) return;
  const s = document.createElement('style');
  s.id = 'deep-dive-styles';
  s.textContent = `
    .deep-dive-content h2 { font-family:'DM Serif Display',serif; font-size:20px; font-weight:400; margin:18px 0 8px; color:#1a1a2e; }
    .deep-dive-content h3 { font-family:'DM Serif Display',serif; font-size:16px; font-weight:400; margin:14px 0 6px; color:#1a1a2e; }
    .deep-dive-content blockquote { border-left:3px solid #6c63ff; margin:12px 0; padding:8px 14px; background:#f0effe; border-radius:0 8px 8px 0; font-style:italic; color:#555; }
    .deep-dive-content hr { border:none; border-top:1px solid #e5e7eb; margin:16px 0; }
    .deep-dive-content sup { font-size:11px; vertical-align:super; line-height:0; }
    .deep-dive-content sup a { color:#6c63ff; text-decoration:none; font-weight:700; }
    .deep-dive-content div p { font-size:12px; color:#666; line-height:1.6; margin:2px 0; }
  `;
  document.head.appendChild(s);
})();

export default function App() {
  useEffect(() => { initAnalytics(); }, []);

  const [publicSlug]      = useState(getPublicSlug);
  const [publicPostId]    = useState(getPublicPostId);
  const [publicPaperDoi]  = useState(getPublicPaperDoi);
  const [publicCardSlug]  = useState(getPublicCardSlug);
  const [publicGroupSlug] = useState(getPublicGroupSlug);
  const [legalDoc]        = useState(getLegalDoc);
  const [isAdminRoute]    = useState(() => window.location.pathname === '/admin');
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
  const [activeGroupId,setActiveGroupId]=useState(null);
  const [groupUnreadCount,setGroupUnreadCount]=useState(0);
  const [showOrcidImport,setShowOrcidImport]=useState(false);
  const [orcidPendingToken,  setOrcidPendingToken]  = useState('');
  const [orcidPendingName,   setOrcidPendingName]   = useState('');
  const [showOrcidEmailForm, setShowOrcidEmailForm] = useState(false);
  const [orcidAuthError,     setOrcidAuthError]     = useState('');
  const [groupInviteToken,   setGroupInviteToken]   = useState('');
  const [joinToast,          setJoinToast]          = useState('');
  const [showDrawer,         setShowDrawer]         = useState(false);
  const [savedPostIds,       setSavedPostIds]       = useState(new Set());
  const [savedGroupPostIds,  setSavedGroupPostIds]  = useState(new Set());
  const [showAuthScreen,     setShowAuthScreen]     = useState(false);

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
    if(publicSlug || publicPostId || publicPaperDoi || publicCardSlug || publicGroupSlug || legalDoc) return; // no auth needed for public pages
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

  // Live-sync the profile row so updates from server-side (e.g. award_lumens
  // updating lumens_current_period) reflect in the sidebar widget without a
  // page reload. Silently inert if realtime isn't enabled for `profiles`.
  useEffect(()=>{
    if(!session?.user) return;
    const userId = session.user.id;
    const channel = supabase
      .channel(`profile-self-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=eq.${userId}`,
      }, payload => {
        if (payload?.new) setProfile(p => p ? { ...p, ...payload.new } : payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },[session?.user?.id]);

  useEffect(()=>{
    if (!session?.user || !profile) return;
    if (profile.analytics_consent_at) {
      optInAndIdentify(session.user.id, {
        work_mode: profile.work_mode || null,
        has_orcid: !!profile.orcid,
        is_admin:  !!profile.is_admin,
      });
    } else {
      optOutAndReset();
    }
  },[session?.user?.id, profile?.analytics_consent_at]); // eslint-disable-line

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

  // Unread group posts badge — poll every 60s
  const fetchGroupUnreadCount = useCallback(async () => {
    if (!session?.user) return;
    const { data: memberships } = await supabase
      .from('group_members').select('group_id, last_read_at')
      .eq('user_id', session.user.id).in('role', ['admin', 'member']);
    if (!memberships?.length) { setGroupUnreadCount(0); return; }
    let total = 0;
    for (const m of memberships) {
      const { count } = await supabase.from('group_posts')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', m.group_id)
        .gt('created_at', m.last_read_at || '1970-01-01');
      total += count || 0;
    }
    setGroupUnreadCount(total);
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    fetchGroupUnreadCount();
    const interval = setInterval(fetchGroupUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [session, fetchGroupUnreadCount]);

  // Saved post IDs — fetched once on login, refreshed after save/unsave
  const fetchSavedIds = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('saved_posts')
      .select('post_id, group_post_id')
      .eq('user_id', session.user.id);
    setSavedPostIds(new Set((data||[]).map(r=>r.post_id).filter(Boolean)));
    setSavedGroupPostIds(new Set((data||[]).map(r=>r.group_post_id).filter(Boolean)));
  }, [session]);

  useEffect(() => { fetchSavedIds(); }, [fetchSavedIds]);

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

  // Post-auth redirect: handle ?view_profile= / ?connect= params and sessionStorage redirect
  useEffect(() => {
    if (!session || !profile) return;

    // 1. Check URL params first (set when redirected from business card while logged in or after auth)
    const params      = new URLSearchParams(window.location.search);
    const viewSlug    = params.get('view_profile');
    const connectSlug = params.get('connect');
    const urlSlug     = viewSlug || connectSlug;

    if (urlSlug) {
      window.history.replaceState({}, '', '/');
      if (connectSlug) sessionStorage.setItem('post_auth_action', 'follow');
      sessionStorage.setItem('post_auth_profile', urlSlug);
    }

    // 2. Act on stored profile slug (from sessionStorage or just set above)
    const storedSlug   = sessionStorage.getItem('post_auth_profile');
    const storedAction = sessionStorage.getItem('post_auth_action');
    if (!storedSlug) return;

    sessionStorage.removeItem('post_auth_profile');
    sessionStorage.removeItem('post_auth_action');

    supabase.from('profiles').select('id, name').eq('profile_slug', storedSlug).single()
      .then(({ data: target }) => {
        if (!target) return;
        setViewedUserId(target.id);
        setScreen('user_profile');
        if (storedAction === 'follow') {
          supabase.from('follows').upsert({
            follower_id: session.user.id,
            target_type: 'user',
            target_id:   target.id,
          }, { onConflict: 'follower_id,target_type,target_id', ignoreDuplicates: true })
            .then(() => {
              setJoinToast(`✓ You are now following ${target.name}`);
              setTimeout(() => setJoinToast(''), 3000);
            });
        }
      });
  }, [session, profile]); // eslint-disable-line

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

  // Handle ?settings=… deep link (opens the Account Settings panel)
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('settings')) {
      setShowSettings(true);
      params.delete('settings');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [session]);

  // Strip ?recover_account=… from the URL once we've consumed it; the
  // <DeletionPendingModal/> below renders whenever profile.deletion_scheduled_at
  // is set, regardless of how the user got here.
  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('recover_account')) {
      params.delete('recover_account');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [session]);

  const cancelDeletion = async () => {
    const { error } = await supabase.rpc('cancel_account_deletion');
    if (error) { alert('Could not cancel deletion: ' + error.message); return; }
    const { data: updated } = await supabase
      .from('profiles').select().eq('id', session.user.id).single();
    if (updated) setProfile(updated);
  };

  // Handle luminary:// deep links dispatched by FeedTipCard board CTAs
  useEffect(() => {
    const handler = (e) => {
      const to = e.detail?.to;
      if (!to || !session) return;
      if (to === 'card') {
        if (profile?.profile_slug) window.open(`/c/${profile.profile_slug}`, '_blank');
        else setScreen('profile');
      } else {
        setScreen(to);
      }
    };
    window.addEventListener('luminary:navigate', handler);
    return () => window.removeEventListener('luminary:navigate', handler);
  }, [session, profile?.profile_slug]);

  // Capture group invite token from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinToken = params.get('join_token');
    if (joinToken) {
      window.history.replaceState({}, '', window.location.pathname);
      setGroupInviteToken(joinToken);
    }
  }, []);

  // Redeem group invite once authenticated
  useEffect(() => {
    if (!groupInviteToken || !session?.user) return;
    const redeem = async () => {
      const token = groupInviteToken;
      setGroupInviteToken('');
      const { data: inv } = await supabase
        .from('group_invites')
        .select('id, group_id, use_count, max_uses, expires_at, groups(name)')
        .eq('token', token)
        .single();
      if (!inv) { setJoinToast('Invite link not found or expired.'); return; }
      if (new Date(inv.expires_at) < new Date()) { setJoinToast('This invite link has expired.'); return; }
      if (inv.use_count >= inv.max_uses) { setJoinToast('This invite link has reached its maximum uses.'); return; }
      const { error } = await supabase.from('group_members').upsert({
        group_id: inv.group_id, user_id: session.user.id, role: 'member',
      }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
      if (!error) {
        await supabase.from('group_invites').update({ use_count: inv.use_count + 1 }).eq('id', inv.id);
        setJoinToast(`You've joined "${inv.groups?.name || 'the group'}"!`);
        setActiveGroupId(inv.group_id);
        setScreen('groups');
      } else {
        setJoinToast('Could not join group. You may already be a member.');
      }
    };
    redeem();
  }, [groupInviteToken, session]); // eslint-disable-line

  const signOut=async()=>{ optOutAndReset(); await supabase.auth.signOut(); setScreen('feed'); };

  const fonts = <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet"/>;

  // Public pages — no auth required
  if(publicSlug)      return <>{fonts}<PublicProfilePage slug={publicSlug}/></>;
  if(publicPostId)    return <>{fonts}<PublicPostPage postId={publicPostId}/></>;
  if(publicPaperDoi)  return <>{fonts}<PaperDetailPage doi={publicPaperDoi} isPublicPage={true}/></>;
  if(publicCardSlug)  return <>{fonts}<CardPage slug={publicCardSlug}/></>;
  if(publicGroupSlug) return <>{fonts}<PublicGroupProfileScreen slug={publicGroupSlug}/></>;
  if(legalDoc)        return <>{fonts}<LegalPage doc={legalDoc}/></>;

  if(isPasswordRecovery) return <>{fonts}<ResetPasswordScreen onDone={()=>setIsPasswordRecovery(false)}/></>;
  if(!authChecked) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'DM Sans',sans-serif"}}><Spinner/></div>;
  if(!session) {
    const showLanding = !showAuthScreen && !isAdminRoute && !showOrcidEmailForm && !orcidAuthError;
    if (showLanding) {
      return <>{fonts}<LandingScreen supabase={supabase} onShowAuth={()=>setShowAuthScreen(true)}/></>;
    }
    return <>{fonts}<AuthScreen onAuth={()=>setScreen('feed')}
      orcidPendingToken={orcidPendingToken}
      orcidPendingName={orcidPendingName}
      showOrcidEmailForm={showOrcidEmailForm}
      orcidAuthError={orcidAuthError}
    /></>;
  }

  const user=session.user;

  // Deletion-pending modal: when the signed-in profile has
  // deletion_scheduled_at set, block normal app access and ask the user
  // to either cancel deletion or sign out. This is the recovery surface
  // for both the deletion-confirmation email link and a regular sign-in
  // during the 30-day grace window.
  if (profile?.deletion_scheduled_at) {
    const scheduled = new Date(profile.deletion_scheduled_at);
    const purgeAt   = new Date(scheduled.getTime() + 30*24*60*60*1000);
    return (
      <>
        {fonts}
        <div style={{
          position:'fixed', inset:0, background:'rgba(27,29,54,.6)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:2000, fontFamily:"'DM Sans',sans-serif", padding:20,
        }}>
          <div style={{
            background:T.w, borderRadius:16, maxWidth:480, width:'100%',
            padding:'28px 28px 22px', boxShadow:'0 8px 40px rgba(0,0,0,.18)',
          }}>
            <div style={{ fontSize:36, marginBottom:8 }}>⏳</div>
            <h2 style={{
              fontFamily:"'DM Serif Display', serif", fontSize:24,
              color:T.text, margin:'0 0 8px',
            }}>
              Your account is scheduled for deletion
            </h2>
            <p style={{ fontSize:14, color:T.text, lineHeight:1.6, margin:'0 0 8px' }}>
              We'll permanently delete your account and all your data on{' '}
              <strong>{purgeAt.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' })}</strong>.
            </p>
            <p style={{ fontSize:13.5, color:T.mu, lineHeight:1.6, margin:'0 0 18px' }}>
              Until then your profile and posts are hidden from other Luminary users.
              Cancel the deletion now to restore everything immediately.
            </p>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button
                onClick={cancelDeletion}
                style={{
                  background:T.v, color:'white', border:'none', borderRadius:10,
                  padding:'10px 18px', fontSize:14, fontWeight:700,
                  cursor:'pointer', fontFamily:'inherit',
                }}
              >
                Cancel deletion
              </button>
              <button
                onClick={signOut}
                style={{
                  background:'transparent', color:T.mu, border:`1.5px solid ${T.bdr}`,
                  borderRadius:10, padding:'10px 18px', fontSize:14, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Admin route: gate on profile.is_admin
  if (isAdminRoute) {
    if (!profile) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:"'DM Sans',sans-serif"}}><Spinner/></div>;
    if (!profile.is_admin) return <>{fonts}<NotFoundScreen /></>;
    return <>{fonts}<AdminShell supabase={supabase} user={user} profile={profile} /></>;
  }

  const screens={
    feed:         <FeedScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper} onGoToProfile={()=>setScreen('profile')} onTagClick={(tag)=>{setExploreQuery(tag);setScreen('explore');}} onViewGroup={id=>{setActiveGroupId(id);setScreen('groups');}} savedPostIds={savedPostIds} onSaveToggled={fetchSavedIds} unreadNotifs={unreadNotifs} onOpenNotifs={()=>{ setUnreadNotifs(0); setScreen('notifs'); capturePageview('notifs'); }} onCompose={()=>setScreen('post')}/>,
    explore:      <ExploreScreen user={user} currentProfile={profile} initialQuery={exploreQuery} onViewUser={onViewUser} onViewPaper={onViewPaper} onNavigateToPost={()=>setScreen('post')} onViewGroup={id=>{setActiveGroupId(id);setScreen('groups');}}/>,
    network:      <NetworkScreen user={user} profile={profile} onViewUser={onViewUser} onViewPaper={onViewPaper} onMessage={onMessage}/>,
    messages:     <MessagesScreen user={user} onViewUser={onViewUser}/>,
    library:      <LibraryScreen user={user} profile={profile} onSaveToggled={fetchSavedIds} onViewGroup={id=>{setActiveGroupId(id);setScreen('groups');}} onNavigateToPost={()=>setScreen('post')}/>,
    groups: activeGroupId
      ? <GroupScreen groupId={activeGroupId} user={user} profile={profile} onBack={()=>setActiveGroupId(null)} onViewPaper={onViewPaper} onViewGroup={id=>{setActiveGroupId(id);}} onMarkRead={fetchGroupUnreadCount} savedGroupPostIds={savedGroupPostIds} onSaveToggled={fetchSavedIds} onNavigateToPost={()=>setScreen('post')}/>
      : <GroupsScreen user={user} profile={profile} onGroupSelect={id=>{setActiveGroupId(id);}}/>,
    projects: <ProjectsScreen user={user}/>,
    profile:      <ProfileScreen user={user} profile={profile} setProfile={setProfile} setScreen={setScreen}/>,
    notifs:       <NotifsScreen user={user} onViewGroup={id=>{setActiveGroupId(id);setScreen('groups');}}/>,
    post:         <NewPostScreen user={user} profile={profile} setProfile={setProfile} onPostCreated={()=>setScreen('feed')}/>,
    user_profile: <UserProfileScreen userId={viewedUserId} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewPaper={onViewPaper} onMessage={onMessage}/>,
    paper_detail: <PaperDetailPage doi={viewedPaperDoi} currentUserId={user?.id} currentProfile={profile} onBack={()=>setScreen('feed')} onViewUser={onViewUser} onViewPaper={onViewPaper}/>,
    lumens:       <LumensScreen supabase={supabase} user={user} profile={profile} onBack={()=>setScreen('feed')}/>,
    storage:      <StorageScreen onBack={()=>setScreen('feed')}/>,
  };

  return (
    <>
      {fonts}
      {showCardQR && profile && <CardQROverlay profile={profile} onClose={()=>setShowCardQR(false)}/>}
      {joinToast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background:T.text, color:'#fff', borderRadius:12, padding:'11px 22px',
          fontSize:13, fontWeight:600, zIndex:2000, boxShadow:'0 4px 20px rgba(0,0,0,.25)',
          maxWidth:380, textAlign:'center',
        }}>
          {joinToast}
          <button onClick={()=>setJoinToast('')} style={{
            marginLeft:12, background:'transparent', border:'none', color:'rgba(255,255,255,.7)',
            cursor:'pointer', fontFamily:'inherit', fontSize:13,
          }}>✕</button>
        </div>
      )}
      {/* Account Settings panel */}
      {showSettings && (
        <AccountSettingsScreen
          user={user}
          profile={profile}
          setProfile={setProfile}
          onClose={() => setShowSettings(false)}
          onSignOut={() => { setShowSettings(false); signOut(); }}
          onOpenStorage={() => { setShowSettings(false); setScreen('storage'); }}
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
              <div style={{display:"flex",alignItems:"center",gap:2}}>
                {profile?.profile_slug && (
                  <button onClick={()=>setShowCardQR(true)} title="Share my contact card"
                    style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",borderRadius:7,color:T.mu}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                      <rect x="5" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                      <rect x="16" y="5" width="3" height="3" fill="currentColor" stroke="none"/>
                      <rect x="5" y="16" width="3" height="3" fill="currentColor" stroke="none"/>
                      <line x1="14" y1="14" x2="17" y2="14"/>
                      <line x1="17" y1="14" x2="17" y2="17"/>
                      <line x1="14" y1="17" x2="14" y2="21"/>
                      <line x1="17" y1="17" x2="21" y2="17"/>
                      <line x1="21" y1="14" x2="21" y2="21"/>
                    </svg>
                  </button>
                )}
                <button onClick={()=>setShowSettings(true)} title="Settings"
                  style={{width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",border:"none",background:"transparent",cursor:"pointer",borderRadius:7,color:T.mu}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{flex:1,padding:"8px 0",overflowY:"auto"}}>
              {NAV.filter(n=>n.id!=='notifs').map(n=>(
                <div key={n.id} onClick={()=>{
                  if(n.id==='groups') setActiveGroupId(null);
                  setScreen(n.id);
                  capturePageview(n.id);
                }}

                  style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",margin:"1px 8px",borderRadius:9,cursor:"pointer",fontSize:12.5,fontWeight:screen===n.id?700:500,color:screen===n.id?T.v:T.mu,background:screen===n.id?T.v2:"transparent"}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flexShrink:0}}><path d={n.p}/></svg>
                  {n.l}
                  {n.id==='messages' && unreadMessages>0 && (
                    <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:T.ro,color:"#fff",padding:"1px 6px",borderRadius:20,minWidth:16,textAlign:"center"}}>
                      {unreadMessages>9?'9+':unreadMessages}
                    </span>
                  )}
                  {n.id==='notifs' && unreadNotifs>0 && (
                    <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:T.ro,color:"#fff",padding:"1px 6px",borderRadius:20,minWidth:16,textAlign:"center"}}>
                      {unreadNotifs>9?'9+':unreadNotifs}
                    </span>
                  )}
                  {n.id==='groups' && groupUnreadCount>0 && (
                    <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,background:T.v,color:"#fff",padding:"1px 6px",borderRadius:20,minWidth:16,textAlign:"center"}}>
                      {groupUnreadCount>99?'99+':groupUnreadCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div style={{padding:"12px 14px",borderTop:`1px solid ${T.bdr}`}}>
              <ProfileLumensBox
                profile={profile}
                user={user}
                onProfileClick={()=>setScreen('profile')}
                onLumensClick={()=>setScreen('lumens')}
              />
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

          </div>
        )}

        {/* Mobile fixed top bar */}
        {isMobile && (
          <div style={{
            position:'fixed', top:0, left:0, right:0,
            height:52, background:T.w,
            borderBottom:`1px solid ${T.bdr}`,
            display:'flex', alignItems:'center',
            padding:'0 12px', zIndex:100, gap:8,
          }}>
            <button onClick={()=>setShowDrawer(true)} style={{
              width:36, height:36, border:'none',
              background:'transparent', cursor:'pointer',
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:5,
              flexShrink:0,
            }}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:20, height:2, background:T.text, borderRadius:2}}/>
              ))}
            </button>
            <div style={{flex:1, textAlign:'center', fontFamily:"'DM Serif Display',serif", fontSize:20, fontWeight:400}}>
              Lumi<span style={{color:T.v}}>nary</span>
            </div>
            <button onClick={()=>{setUnreadNotifs(0);setScreen('notifications');}} style={{
              position:'relative', width:36, height:36,
              border:'none', background:'transparent', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={screen==='notifications'?T.v:T.mu} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadNotifs>0 && (
                <span style={{position:'absolute', top:6, right:5, width:8, height:8, borderRadius:'50%', background:T.ro}}/>
              )}
            </button>
            <button onClick={()=>setScreen('messages')} style={{
              position:'relative', width:36, height:36,
              border:'none', background:'transparent', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke={screen==='messages'?T.v:T.mu} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {unreadMessages>0 && (
                <span style={{position:'absolute', top:6, right:5, width:8, height:8, borderRadius:'50%', background:T.ro}}/>
              )}
            </button>
            {profile?.profile_slug && (
              <button onClick={()=>setShowCardQR(true)} title="Share my contact card" style={{
                width:36, height:36, border:'none', background:'transparent',
                cursor:'pointer', display:'flex', alignItems:'center',
                justifyContent:'center', color:T.mu, flexShrink:0,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.mu} strokeWidth="1.8">
                  <rect x="3" y="3" width="7" height="7" rx="1"/>
                  <rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/>
                  <rect x="5" y="5" width="3" height="3" fill={T.mu} stroke="none"/>
                  <rect x="16" y="5" width="3" height="3" fill={T.mu} stroke="none"/>
                  <rect x="5" y="16" width="3" height="3" fill={T.mu} stroke="none"/>
                  <line x1="14" y1="14" x2="17" y2="14"/>
                  <line x1="17" y1="14" x2="17" y2="17"/>
                  <line x1="14" y1="17" x2="14" y2="21"/>
                  <line x1="17" y1="17" x2="21" y2="17"/>
                  <line x1="21" y1="14" x2="21" y2="21"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Hamburger drawer */}
        {showDrawer && isMobile && (
          <>
            <div onClick={()=>setShowDrawer(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.4)', zIndex:200}}/>
            <div style={{
              position:'fixed', top:0, left:0, bottom:0,
              width:280, background:T.w, zIndex:201,
              display:'flex', flexDirection:'column',
              boxShadow:'4px 0 24px rgba(0,0,0,.15)',
            }}>
              <div style={{padding:'48px 20px 20px', borderBottom:`1px solid ${T.bdr}`, display:'flex', alignItems:'center', gap:12}}>
                <Av size={44} color={profile?.avatar_color} name={profile?.name} url={profile?.avatar_url||''}/>
                <div>
                  <div style={{fontSize:14, fontWeight:700}}>{profile?.name}</div>
                  <div style={{fontSize:12, color:T.mu}}>{profile?.title}</div>
                </div>
              </div>
              <div style={{flex:1, overflowY:'auto', padding:'12px 0'}}>
                {[
                  {id:'network',       label:'My Network', icon:'🌐'},
                  {id:'library',       label:'Library',    icon:'📚'},
                  {id:'messages',      label:'Messages',   icon:'💬', count:unreadMessages},
                  {id:'notifications', label:'Alerts',     icon:'🔔', count:unreadNotifs},
                ].map(item=>(
                  <button key={item.id}
                    onClick={()=>{
                      if(item.disabled) return;
                      if(item.id==='notifications') setUnreadNotifs(0);
                      setScreen(item.id);
                      setShowDrawer(false);
                    }}
                    style={{
                      width:'100%', padding:'13px 20px',
                      border:'none', background:'transparent',
                      cursor:item.disabled?'default':'pointer',
                      display:'flex', alignItems:'center', gap:14,
                      fontFamily:'inherit', opacity:item.disabled?0.4:1,
                    }}>
                    <span style={{fontSize:18, width:24}}>{item.icon}</span>
                    <span style={{fontSize:14, fontWeight:500, flex:1, textAlign:'left', color:T.text}}>{item.label}</span>
                    {item.badge && (
                      <span style={{fontSize:10, background:T.am2, color:T.am, padding:'2px 7px', borderRadius:20, fontWeight:600}}>{item.badge}</span>
                    )}
                    {item.count>0 && (
                      <span style={{fontSize:10, background:T.v, color:'#fff', padding:'2px 7px', borderRadius:20, fontWeight:700}}>{item.count}</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{padding:'12px 0', borderTop:`1px solid ${T.bdr}`}}>
                <button onClick={()=>{setShowDrawer(false); setShowSettings(true);}}
                  style={{width:'100%', padding:'13px 20px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:14, fontFamily:'inherit'}}>
                  <span style={{fontSize:18, width:24}}>⚙️</span>
                  <span style={{fontSize:14, fontWeight:500, color:T.text}}>Settings</span>
                </button>
                <button onClick={()=>{ optOutAndReset(); supabase.auth.signOut(); }}
                  style={{width:'100%', padding:'13px 20px', border:'none', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:14, fontFamily:'inherit'}}>
                  <span style={{fontSize:18, width:24}}>👋</span>
                  <span style={{fontSize:14, fontWeight:500, color:T.ro}}>Sign out</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Main content */}
        <div style={{
          flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:T.bg,
          paddingBottom: isMobile ? 60 : 0,
          paddingTop: isMobile ? 52 : 0,
        }}>
          {screens[screen]||screens.feed}
        </div>

        {/* Bottom nav — mobile only */}
        {isMobile && (
          <BottomNav screen={screen} setScreen={(s)=>{ if(s==='groups') setActiveGroupId(null); setScreen(s); }} groupUnreadCount={groupUnreadCount}/>
        )}
      </div>
    </>
  );
}

// Personal sidebar bottom row: avatar + name + tier · Lumens line + gear.
// Replaces the previous standalone Lumens widget and the old name+institution
// row. Click the name area → profile, click the tier line → Lumens screen,
// click the gear → settings. Until migration_gamification.sql has been run,
// profile.lumens_current_period is undefined and the widget gracefully
// renders "✦ Catalyst · 0".
function ProfileLumensBox({ profile, user, onProfileClick, onLumensClick }) {
  const lumens = Number(profile?.lumens_current_period) || 0;
  const tier   = getTierFromLumens(lumens);
  const cfg    = TIER_CONFIG[tier];
  // First name only — full names overflow the 200px sidebar. Falls back to
  // the email local-part if the profile hasn't set a name yet.
  const fullName  = profile?.name || user?.email?.split('@')[0] || '';
  const firstName = profile?.first_name || fullName.split(/\s+/)[0] || '';

  return (
    <div style={{display:'flex', alignItems:'center', gap:9}}>
      <div onClick={onProfileClick} title="My profile"
        style={{cursor:'pointer', flexShrink:0}}>
        <Av
          color={profile?.avatar_color||'me'} size={32}
          name={profile?.name} url={profile?.avatar_url||''}
          tier={tier}
        />
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div onClick={onProfileClick} title={fullName}
          style={{
            fontSize:13, fontWeight:600,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            cursor:'pointer',
          }}>
          {firstName}
        </div>
        <div onClick={onLumensClick} title="View Lumens history"
          style={{
            fontSize:10.5, color:cfg.color, fontWeight:700,
            cursor:'pointer', letterSpacing:0.3,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>
          ✦ {cfg.name.toUpperCase()}
          <span style={{color:T.mu, fontWeight:600, marginLeft:5, letterSpacing:0}}>
            · {lumens.toLocaleString()} Lumens
          </span>
        </div>
      </div>
    </div>
  );
}
