import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T, TIER1_LIST, getTier2, WORK_MODE_MAP } from '../lib/constants';
import FeedTipCard from '../components/FeedTipCard';

import Spinner from '../components/Spinner';
import PostCard from './PostCard';
import { useWindowSize } from '../lib/useWindowSize';

export default function FeedScreen({ user, profile, onViewUser, onViewPaper, onGoToProfile, onTagClick, onViewGroup, savedPostIds = new Set(), onSaveToggled, unreadNotifs = 0, onOpenNotifs, onCompose }) {
  const { isMobile } = useWindowSize();
  const [posts,setPosts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('all');
  const [fp,setFp]=useState('sug');
  const [feedMode,setFeedMode]=useState(()=>{
    const saved=localStorage.getItem('luminary_feed_mode');
    if(saved) return saved;
    return (profile?.topic_interests?.length>0)?'personalised':'chronological';
  });
  const [potw, setPotw] = useState(null); // { title, journal, year, doi, discussCount }
  const [filterTier1,  setFilterTier1]  = useState([]);
  const [filterTier2,  setFilterTier2]  = useState([]);
  const [showFilter,   setShowFilter]   = useState(false);
  const [modeFilter, setModeFilter] = useState(() =>
    localStorage.getItem('luminary_mode_filter') || 'myfield'
  );
  const [showModeTooltip, setShowModeTooltip] = useState(
    () => !localStorage.getItem('luminary_mode_tooltip_seen')
  );

  useEffect(()=>{ localStorage.setItem('luminary_feed_mode',feedMode); },[feedMode]);
  useEffect(()=>{ localStorage.setItem('luminary_mode_filter',modeFilter); },[modeFilter]);

  useEffect(() => {
    const fetchPotw = async () => {
      // Fetch admin config for Paper of the Week settings
      const { data: configData } = await supabase.rpc('get_admin_config', { p_key: 'paper_of_week' });
      const config = configData || { mode: 'algorithm', algorithm: 'most_discussed' };

      if (config.mode === 'manual' && config.manual_doi) {
        // Manual pick: look up the post with this DOI
        const { data: post } = await supabase
          .from('posts_with_meta')
          .select('paper_doi, paper_title, paper_journal, paper_year')
          .eq('post_type', 'paper')
          .eq('paper_doi', config.manual_doi)
          .limit(1)
          .maybeSingle();
        if (post?.paper_doi) {
          setPotw({
            doi:          post.paper_doi,
            title:        post.paper_title || config.manual_doi,
            journal:      post.paper_journal || '',
            year:         post.paper_year || '',
            discussCount: 1,
            mode:         'manual',
          });
        }
        return;
      }

      // Algorithm mode: use get_paper_stats_public so counts match exactly what admin sees
      const algorithm = config.algorithm || 'most_discussed';
      const { data: papers } = await supabase.rpc('get_paper_stats_public');

      if (!papers?.length) return;

      const best = [...papers].sort((a, b) =>
        algorithm === 'most_discussed'
          ? (b.discussions    - a.discussions)    || (b.total_comments - a.total_comments)
          : (b.total_comments - a.total_comments) || (b.discussions    - a.discussions)
      )[0];

      if (!best) return;

      setPotw({
        doi:          best.paper_doi,
        title:        best.paper_title,
        journal:      best.paper_journal || '',
        year:         best.paper_year    || '',
        discussCount: algorithm === 'most_discussed' ? best.discussions : best.total_comments,
        mode:         algorithm,
      });
    };

    fetchPotw();
  }, []);

  const applyModeFilter = useCallback((posts, filter, userWorkMode) => {
    if (filter === 'all') return posts;
    if (filter === 'myfield') {
      // Sort field-matching posts above non-matching, but keep date order
      // within each group. Admin posts integrate chronologically — they're
      // not pinned to top here, so a fresh user post pushes the Luminary
      // Team announcement down.
      return [...posts].sort((a, b) => {
        const aMatch = a.author_work_mode === userWorkMode || userWorkMode === 'clinician_scientist';
        const bMatch = b.author_work_mode === userWorkMode || userWorkMode === 'clinician_scientist';
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }
    const modeMap = {
      research: ['researcher', 'clinician_scientist'],
      clinical: ['clinician',  'clinician_scientist'],
      industry: ['industry'],
    };
    const allowed = modeMap[filter] || [];
    return posts.filter(p => p.is_admin_post || !p.author_work_mode || allowed.includes(p.author_work_mode));
  }, []);

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
    let postQ = supabase.from('posts_with_meta').select('*').eq('is_hidden', false).order('created_at',{ascending:false}).limit(30);
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

    // ── 3b. Group reposts for Following feed ─────────────────────────────
    let groupRepostPromise = Promise.resolve([]);
    if (fp === 'fol' && tab !== 'papers') {
      groupRepostPromise = (async () => {
        const { data: followedGroups } = await supabase
          .from('follows').select('target_id')
          .eq('follower_id', user.id).eq('target_type', 'group');
        const followedGroupIds = (followedGroups || []).map(f => f.target_id);
        if (!followedGroupIds.length) return [];
        const { data } = await supabase
          .from('group_posts_with_meta').select('*')
          .in('group_id', followedGroupIds)
          .eq('is_reposted_public', true)
          .order('created_at', { ascending: false }).limit(20);
        return (data || []).map(p => ({
          ...p,
          _itemKey:   `gp_${p.id}`,
          _sortTime:  p.created_at,
          isRepost:   false,
          group_id:   p.group_id,
          group_name: p.group_name,
        }));
      })();
    }

    // ── 4. Await both in parallel ────────────────────────────────────────
    const [{ data: regularData }, repostItems, groupRepostItems] = await Promise.all([postQ, repostPromise, groupRepostPromise]);

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
      ...groupRepostItems,
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

    // ── 6b. Fetch group_id / group_name + is_deep_dive from posts directly ──
    // posts_with_meta view was compiled before these columns were added;
    // SELECT * on a view does not auto-include new columns in PostgreSQL.
    let groupRefMap   = {};
    let deepDiveMap   = {};
    let bgColorMap    = {};
    if (allItems.length) {
      const postIds = allItems.map(p => p.id);
      const { data: extraCols } = await supabase
        .from('posts')
        .select('id, group_id, group_name, is_deep_dive, bg_color')
        .in('id', postIds);
      (extraCols || []).forEach(p => {
        if (p.group_id)     groupRefMap[p.id] = { group_id: p.group_id, group_name: p.group_name };
        if (p.is_deep_dive) deepDiveMap[p.id] = true;
        if (p.bg_color)     bgColorMap[p.id]  = p.bg_color;
      });
    }

    const enriched = allItems.map(item => ({
      ...item,
      ...(groupRefMap[item.id] || {}),
      is_deep_dive:  deepDiveMap[item.id] || false,
      bg_color:      bgColorMap[item.id]  || null,
      user_liked:    likedSet.has(item.id),
      repost_count:  repostCountMap[item.id] || 0,
      user_reposted: userRepostedSet.has(item.id),
    }));

    // ── 7. Slugs + sort ──────────────────────────────────────────────────
    const withSlugData = await withSlugs(enriched);
    withSlugData.sort((a,b) => new Date(b._sortTime) - new Date(a._sortTime));

    // In For You + personalised mode, score posts by taxonomy match
    if (fp === 'sug' && feedMode === 'personalised') {
      const userTier1     = profile?.identity_tier1 || '';
      const userTier2     = profile?.identity_tier2 || '';
      const userInterests = new Set(
        (profile?.topic_interests || []).map(t => t.toLowerCase())
      );

      if (userTier1 || userTier2 || userInterests.size > 0) {
        withSlugData.sort((a, b) => {
          const score = (post) => {
            let s = 0;
            if (post.tier1 && post.tier1 === userTier1)        s += 3;
            if (userTier2 && post.tier2?.includes(userTier2))  s += 5;
            const topics = [...(post.tags||[]), ...(post.tier2||[])].map(t => t.toLowerCase());
            if (topics.some(t => userInterests.has(t)))        s += 2;
            return s;
          };
          const diff = score(b) - score(a);
          if (diff !== 0) return diff;
          return new Date(b._sortTime) - new Date(a._sortTime);
        });
      }
    }

    // Strip milestone posts from other users; hide targeted posts not meant for this user
    const visible = withSlugData.filter(p =>
      (p.post_type !== 'milestone' || p.user_id === user?.id) &&
      (p.target_user_id == null || p.target_user_id === user?.id)
    );

    const filtered = fp === 'sug'
      ? applyModeFilter(visible, modeFilter, profile?.work_mode || 'researcher')
      : visible;

    setPosts(filtered);
    setLoading(false);
  }, [user, profile, tab, fp, feedMode, modeFilter, withSlugs, applyModeFilter]);

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

  const toggleTier1 = (t1) => {
    const selected = filterTier1.includes(t1);
    setFilterTier1(prev => selected ? prev.filter(x => x !== t1) : [...prev, t1]);
    if (selected) {
      const tier2s = getTier2(t1);
      setFilterTier2(prev => prev.filter(t => !tier2s.includes(t)));
    }
  };

  const toggleTier2 = (t2) =>
    setFilterTier2(prev => prev.includes(t2) ? prev.filter(x => x !== t2) : [...prev, t2]);

  // Tier filters are applied client-side; the content-type tab is applied at
  // the server query level (post_type = 'paper'), so the client-side filter
  // must NOT gate on the tab — otherwise turning on Papers excludes every
  // post when no tier filters are set.
  const tierFilterCount = filterTier1.length + filterTier2.length;
  const activeFilters   = tierFilterCount + (tab !== 'all' ? 1 : 0);

  const filteredPosts = posts.filter(p => {
    if (!tierFilterCount) return true;
    if (filterTier1.includes(p.tier1)) return true;
    if (filterTier2.length && p.tier2?.some(t => filterTier2.includes(t))) return true;
    return false;
  });

  const getEmptyMsg = () => {
    if (fp === 'fol') return { icon: '👥', title: "Follow people & papers to build your feed", body: "Use the + Follow button on any post or paper to start seeing their updates here." };
    switch (profile?.work_mode) {
      case 'clinician': return { icon: '🏥', title: 'No posts yet', body: 'Share a clinical insight, a guideline update, or a technique that changed your practice. Your peers will learn from it.' };
      case 'industry':  return { icon: '💊', title: 'No posts yet', body: "Share a perspective on evidence translation, real-world data, or what's changing in your field." };
      default:          return { icon: '🔬', title: 'No posts yet', body: 'Share a paper, a finding, or a question with the community.' };
    }
  };
  const emptyMsg = getEmptyMsg();

  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
      <div style={{background:"rgba(255,255,255,.96)",borderBottom:`1px solid ${T.bdr}`,padding:"9px 18px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
        {!isMobile && <input style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:"7px 14px",fontSize:12,outline:"none",maxWidth:320,fontFamily:"inherit"}} placeholder="Search researchers, papers, topics..."/>}
        <div style={{display:"flex",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:22,padding:3,flex:isMobile?1:undefined}}>
          {[["sug","✨ For You"],["fol","👥 Following"]].map(([m,l])=>(
            <div key={m} onClick={()=>setFp(m)} style={{flex:isMobile?1:undefined,textAlign:"center",padding:"5px 14px",borderRadius:18,fontSize:12,color:fp===m?T.v:T.mu,cursor:"pointer",fontWeight:600,background:fp===m?T.w:"transparent"}}>{l}</div>
          ))}
        </div>
        <button onClick={fetchPosts} title="Refresh feed"
          style={{
            width:32, height:32, fontSize:18,
            color:T.mu, border:"none", background:"transparent",
            cursor:"pointer", fontFamily:"inherit",
            display:"flex", alignItems:"center", justifyContent:"center",
            borderRadius:7,
          }}>
          ↻
        </button>
        {onOpenNotifs && (
          <button onClick={onOpenNotifs} title="Notifications"
            style={{
              position:"relative",
              width:32, height:32, borderRadius:7,
              border:"none", background:"transparent",
              cursor:"pointer", color:T.mu,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadNotifs > 0 && (
              <span style={{
                position:"absolute", top:-2, right:-2,
                minWidth:16, height:16, padding:"0 4px",
                borderRadius:20, background:T.ro, color:"#fff",
                fontSize:10, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center",
                border:`2px solid ${T.w}`,
              }}>
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </button>
        )}
      </div>
      {/* Mode pills + Sort + Filter — single combined row */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'7px 16px', borderBottom:`1px solid ${T.bdr}`,
        background:T.w, flexShrink:0, flexWrap:'wrap',
      }}>
        {fp === 'sug' && (
          <div style={{
            display:'flex', gap:5, flex:1, minWidth:0,
            overflowX:'auto', scrollbarWidth:'none', msOverflowStyle:'none',
          }}>
            {[
              { id: 'all',      label: '🌐 All'     },
              { id: 'myfield',  label: '⭐ My Field' },
              { id: 'research', label: '🔬 Research' },
              { id: 'clinical', label: '🏥 Clinical' },
              { id: 'industry', label: '💊 Industry' },
            ].map(f => (
              <button key={f.id} onClick={() => setModeFilter(f.id)} style={{
                padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit', flexShrink: 0,
                border: `1.5px solid ${modeFilter === f.id ? T.v : T.bdr}`,
                background: modeFilter === f.id ? T.v2 : T.w,
                color: modeFilter === f.id ? T.v : T.mu,
                transition: 'all .12s',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:fp==='sug'?0:'auto',flexShrink:0}}>
          {fp==='sug'&&!isMobile&&(
            <>
              <div style={{width:1,height:16,background:T.bdr,margin:'0 2px'}}/>
              <span style={{fontSize:11,color:T.mu}}>Sort:</span>
              {[['personalised','Personalised'],['chronological','Chronological']].map(([mode,label])=>(
                <button key={mode} onClick={()=>setFeedMode(mode)} style={{
                  padding:'4px 10px',borderRadius:20,fontSize:11,fontWeight:600,
                  fontFamily:'inherit',cursor:'pointer',
                  border:`1.5px solid ${feedMode===mode?T.v:T.bdr}`,
                  background:feedMode===mode?T.v2:'transparent',
                  color:feedMode===mode?T.v:T.mu,
                  transition:'all .15s',
                }}>
                  {label}
                </button>
              ))}
              <div style={{width:1,height:16,background:T.bdr,margin:'0 2px'}}/>
            </>
          )}
          <button onClick={()=>setShowFilter(s=>!s)} style={{
            padding:'4px 11px',borderRadius:20,fontSize:11,fontWeight:600,
            fontFamily:'inherit',cursor:'pointer',transition:'all .15s',
            border:`1.5px solid ${activeFilters?T.v:T.bdr}`,
            background:activeFilters?T.v2:showFilter?T.s2:'transparent',
            color:activeFilters?T.v:T.mu,
          }}>
            🔬 Filter{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
        </div>
      </div>

      {fp === 'sug' && showModeTooltip && modeFilter === 'myfield' && (
        <div style={{
          margin: '8px 16px 0', padding: '9px 12px',
          background: T.v2, borderRadius: 9,
          border: `1px solid rgba(108,99,255,.15)`,
          display: 'flex', alignItems: 'flex-start', gap: 8,
          fontSize: 12.5, color: T.v, flexShrink: 0,
        }}>
          <span style={{ flexShrink: 0 }}>⭐</span>
          <span style={{ flex: 1 }}>
            <strong>My Field</strong> surfaces more posts from{' '}
            {WORK_MODE_MAP[profile?.work_mode]?.label || 'researchers'}{' '}
            like you, while still showing the full community.
            Use Research, Clinical or Industry to filter strictly.
          </span>
          <button onClick={() => {
            setShowModeTooltip(false);
            localStorage.setItem('luminary_mode_tooltip_seen', '1');
          }} style={{
            fontSize: 12, color: T.v, border: 'none', background: 'transparent',
            cursor: 'pointer', flexShrink: 0, opacity: 0.7,
          }}>
            Got it
          </button>
        </div>
      )}

      {showFilter && (
        <div style={{background:T.w,borderBottom:`1px solid ${T.bdr}`,padding:'10px 18px',flexShrink:0}}>
          {/* Content type */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:T.mu,textTransform:'uppercase',letterSpacing:0.4,fontWeight:700}}>Content type</span>
            {[['all','All'],['papers','📄 Papers']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{
                padding:'4px 11px',borderRadius:20,fontSize:11,fontWeight:600,
                fontFamily:'inherit',cursor:'pointer',transition:'all .15s',
                border:`1.5px solid ${tab===k?T.v:T.bdr}`,
                background:tab===k?T.v2:T.w,
                color:tab===k?T.v:T.mu,
              }}>{l}</button>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontSize:11,color:T.mu,textTransform:'uppercase',letterSpacing:0.4,fontWeight:700}}>Discipline</span>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {TIER1_LIST.map(t1 => (
              <button key={t1} onClick={()=>toggleTier1(t1)} style={{
                padding:'4px 11px',borderRadius:20,fontSize:11,fontWeight:600,
                fontFamily:'inherit',cursor:'pointer',transition:'all .15s',
                border:`1.5px solid ${filterTier1.includes(t1)?T.v:T.bdr}`,
                background:filterTier1.includes(t1)?T.v2:T.w,
                color:filterTier1.includes(t1)?T.v:T.mu,
              }}>{t1}</button>
            ))}
          </div>
          {filterTier1.length > 0 && (
            <div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:8,paddingTop:8,borderTop:`1px solid ${T.bdr}`}}>
              {filterTier1.flatMap(t1=>getTier2(t1)).map(t2=>(
                <button key={t2} onClick={()=>toggleTier2(t2)} style={{
                  padding:'3px 10px',borderRadius:20,fontSize:10.5,fontWeight:600,
                  fontFamily:'inherit',cursor:'pointer',transition:'all .15s',
                  border:`1.5px solid ${filterTier2.includes(t2)?T.v:T.bdr}`,
                  background:filterTier2.includes(t2)?T.v2:T.s2,
                  color:filterTier2.includes(t2)?T.v:T.mu,
                }}>{t2}</button>
              ))}
            </div>
          )}
          {activeFilters > 0 && (
            <button onClick={()=>{setFilterTier1([]);setFilterTier2([]);setTab('all');}} style={{
              marginTop:8,fontSize:11,color:T.ro,border:'none',background:'transparent',
              cursor:'pointer',fontFamily:'inherit',padding:0,display:'block',
            }}>Clear all filters</button>
          )}
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden"}}>
        <div style={{padding:"16px 18px",boxSizing:"border-box",width:"100%"}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 264px",gap:16,alignItems:"start",minWidth:0,width:"100%"}}>
            <div style={{display:"flex",flexDirection:"column",gap:12,minWidth:0}}>
              {/* Compose entry — opens the dedicated NewPost screen */}
              {onCompose && (
                <button onClick={onCompose}
                  style={{
                    display:'flex', alignItems:'center', gap:12,
                    width:'100%', padding:'12px 16px',
                    background:T.w, border:`1.5px dashed ${T.bdr}`,
                    borderRadius:14, cursor:'pointer', fontFamily:'inherit',
                    color:T.mu, fontSize:13, textAlign:'left',
                    transition:'border-color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.v}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
                >
                  ✏️ Share something with the scientific community…
                </button>
              )}
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
              {loading ? <Spinner/> : filteredPosts.length === 0 ? (
                fp === 'sug' && modeFilter !== 'all' && modeFilter !== 'myfield' ? (
                  <div style={{textAlign:'center',padding:'48px 20px',color:T.mu}}>
                    <div style={{fontSize:36,marginBottom:12}}>
                      {modeFilter==='research'?'🔬':modeFilter==='clinical'?'🏥':'💊'}
                    </div>
                    <div style={{fontSize:15,fontFamily:"'DM Serif Display',serif",marginBottom:8}}>
                      No {modeFilter} posts yet
                    </div>
                    <div style={{fontSize:13,marginBottom:16,lineHeight:1.6}}>
                      Be the first — or switch to{' '}
                      <button onClick={()=>setModeFilter('all')} style={{
                        color:T.v,fontWeight:700,border:'none',background:'transparent',
                        cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',padding:0,
                      }}>All posts</button>
                    </div>
                  </div>
                ) : (
                  <div style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:14,padding:36,textAlign:"center",boxShadow:"0 2px 12px rgba(108,99,255,.07)"}}>
                    <div style={{fontSize:36,marginBottom:12}}>{emptyMsg.icon}</div>
                    <div style={{fontFamily:"'DM Serif Display',serif",fontSize:18,marginBottom:8}}>{emptyMsg.title}</div>
                    <div style={{fontSize:13,color:T.mu,marginBottom:16}}>{emptyMsg.body}</div>
                  </div>
                )
              ) : filteredPosts.map(p => <PostCard key={p._itemKey||p.id} post={p} currentUserId={user?.id} currentProfile={profile} onRefresh={fetchPosts} onViewUser={onViewUser} onUnfollow={handleUnfollow} onViewPaper={onViewPaper} onTagClick={onTagClick} onViewGroup={onViewGroup} isSaved={savedPostIds.has(p.id)} onSaveToggled={onSaveToggled}/>)}
            </div>
            {!isMobile && (
              <div>
                {potw && (
                  <button
                    onClick={() => onViewPaper && onViewPaper(potw.doi)}
                    style={{
                      background:`linear-gradient(135deg,${T.v2},${T.bl2})`,
                      border:"1px solid rgba(108,99,255,.15)",borderRadius:14,padding:18,
                      textAlign:'left', width:'100%', cursor:'pointer', fontFamily:'inherit',
                      transition:'box-shadow .15s', marginBottom:12,
                    }}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 18px rgba(108,99,255,.18)'}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}
                  >
                    <div style={{fontSize:10,fontWeight:700,color:T.v,marginBottom:8,letterSpacing:'.06em',textTransform:'uppercase'}}>Paper of the Week</div>
                    <div style={{fontSize:13,fontWeight:700,lineHeight:1.5,marginBottom:6,color:T.text}}>
                      {potw.title.length > 110 ? potw.title.slice(0,110)+'…' : potw.title}
                    </div>
                    <div style={{fontSize:11,color:T.mu,marginBottom:10}}>
                      {[potw.journal, potw.year].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{fontSize:11.5,color:T.v,fontWeight:700}}>
                      {potw.mode === 'most_discussed'
                        ? `${potw.discussCount} post${potw.discussCount !== 1 ? 's' : ''} discussing this →`
                        : `${potw.discussCount} comment${potw.discussCount !== 1 ? 's' : ''} across all posts →`
                      }
                    </div>
                  </button>
                )}
                <FeedTipCard profile={profile}/>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
