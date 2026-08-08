import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T, WORK_MODE_MAP } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import OrcidBadge from '../components/OrcidBadge';
import { useWindowSize } from '../lib/useWindowSize';

export default function CardPage({ slug }) {
  const { isMobile } = useWindowSize();
  const [profile,       setProfile]       = useState(null);
  const [pubCount,      setPubCount]      = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [notFound,      setNotFound]      = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) setCurrentUserId(data.session.user.id);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from('profiles').select('*').eq('profile_slug', slug).single();
      if (cancelled) return;
      if (!p) { setNotFound(true); setLoading(false); return; }
      if (p.deletion_scheduled_at) { setNotFound(true); setLoading(false); return; }
      setProfile(p);
      if (p.name) document.title = `${p.name} — Luminary`;

      const vis = p.profile_visibility || {};
      if (vis.publications !== false) {
        const { count } = await supabase
          .from('publications').select('id', { count: 'exact', head: true })
          .eq('user_id', p.id);
        if (!cancelled) setPubCount(count || 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:"'DM Sans',sans-serif" }}>
      <Spinner/>
    </div>
  );

  if (notFound) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:"'DM Sans',sans-serif", color:T.text, textAlign:'center', padding:'0 24px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, marginBottom:8 }}>Card not found</div>
      <div style={{ fontSize:14, color:T.mu, marginBottom:24 }}>This card doesn't exist or hasn't been made public yet.</div>
      <a href="/" style={{ color:T.v, fontWeight:600, textDecoration:'none', background:T.v2, border:`1px solid rgba(108,99,255,.2)`, borderRadius:8, padding:'8px 18px' }}>
        ← Go to Luminary
      </a>
    </div>
  );

  const hasLinkedIn = !!profile.linkedin_url;
  const hasWhatsApp = !!profile.public_phone;

  const ActionButtons = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* Tier 1 — primary */}
      <a
        href={`/?ref=${profile.profile_slug}`}
        style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          padding:'14px 20px', borderRadius:12,
          background:T.v, color:'#fff',
          textDecoration:'none', fontWeight:700, fontSize:15, fontFamily:'inherit',
          boxShadow:'0 4px 14px rgba(108,99,255,.35)',
        }}
      >
        🔬 Connect on Luminary
      </a>
      {/* Tier 2 — secondary */}
      <button
        onClick={() => {/* Save to Contacts — Part 2 */}}
        style={{
          display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          padding:'13px 20px', borderRadius:12,
          background:'transparent', border:`2px solid ${T.v}`, color:T.v,
          fontWeight:700, fontSize:15, fontFamily:'inherit', cursor:'pointer',
        }}
      >
        💾 Save to Contacts
      </button>
      {/* Tier 3 — tertiary, only if fields populated */}
      {(hasLinkedIn || hasWhatsApp) && (
        <div style={{ display:'flex', gap:10 }}>
          {hasLinkedIn && (
            <a
              href={profile.linkedin_url}
              target="_blank" rel="noopener noreferrer"
              style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'11px', borderRadius:12,
                background:T.s2, border:`1.5px solid ${T.bdr}`,
                color:T.text, textDecoration:'none', fontWeight:600, fontSize:13.5, fontFamily:'inherit',
              }}
            >
              💼 LinkedIn
            </a>
          )}
          {hasWhatsApp && (
            <a
              href={`https://wa.me/${(profile.public_phone || '').replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              style={{
                flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                padding:'11px', borderRadius:12,
                background:T.s2, border:`1.5px solid ${T.bdr}`,
                color:T.text, textDecoration:'none', fontWeight:600, fontSize:13.5, fontFamily:'inherit',
              }}
            >
              📱 WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:T.text, paddingBottom: isMobile ? 168 : 0 }}>

      {/* Top bar */}
      <div style={{ background:T.w, borderBottom:`1px solid ${T.bdr}`, padding:'0 16px', display:'flex', alignItems:'center', gap:12, height:52, position:'sticky', top:0, zIndex:10 }}>
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
          title="Back"
          style={{ display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'50%', border:`1px solid ${T.bdr}`, background:T.s2, cursor:'pointer', color:T.mu, flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <a href="/" style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, textDecoration:'none', color:T.text, flex:1 }}>
          Lumi<span style={{ color:T.v }}>nary</span>
        </a>
        <a href="/" style={{ fontSize:12.5, color:T.v, fontWeight:600, textDecoration:'none', background:T.v2, border:`1px solid rgba(108,99,255,.2)`, borderRadius:8, padding:'7px 16px', whiteSpace:'nowrap' }}>
          Join Luminary →
        </a>
      </div>

      <div style={{ maxWidth: 480, margin:'0 auto', padding:'20px 18px 48px' }}>

        {/* Banner + centred avatar */}
        <div style={{ position:'relative', marginBottom:60 }}>
          <div style={{ height:132, borderRadius:'14px 14px 0 0', overflow:'hidden' }}>
            {profile.cover_url ? (
              <img src={profile.cover_url} alt=""
                style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:profile.cover_position || '50% 50%', display:'block' }}/>
            ) : (
              <svg width="100%" height="100%" viewBox="0 0 480 132" preserveAspectRatio="xMidYMid slice">
                <defs><linearGradient id="cov" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#667eea"/><stop offset="45%" stopColor="#764ba2"/><stop offset="100%" stopColor="#f093fb"/></linearGradient></defs>
                <rect width="480" height="132" fill="url(#cov)"/>
                <circle cx="60" cy="66" r="70" fill="white" opacity=".04"/>
                <circle cx="420" cy="26" r="55" fill="white" opacity=".06"/>
              </svg>
            )}
          </div>
          <div style={{ position:'absolute', bottom:-52, left:'50%', transform:'translateX(-50%)' }}>
            <div style={{ borderRadius:'50%', border:'4px solid white', boxShadow:'0 6px 24px rgba(108,99,255,.22)', display:'inline-block' }}>
              <Av color={profile.avatar_color || 'me'} size={104} name={profile.name} url={profile.avatar_url || ''} />
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{ background:T.w, border:`1px solid ${T.bdr}`, borderTop:'none', borderRadius:'0 0 14px 14px', padding:'0 24px 24px', boxShadow:'0 2px 12px rgba(108,99,255,.07)' }}>

          {/* Centred identity */}
          <div style={{ paddingTop:64, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, lineHeight:1.2 }}>
              {profile.name_prefix && (
                <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, color:T.mu, marginRight:6 }}>{profile.name_prefix}</span>
              )}
              {profile.name || 'Researcher'}
              {profile.name_suffix && (
                <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:15, fontWeight:600, color:T.mu, marginLeft:6 }}>, {profile.name_suffix}</span>
              )}
            </div>
            {profile.title && (
              <div style={{ fontSize:14, fontWeight:600, color:T.text }}>{profile.title}</div>
            )}
            {profile.institution && (
              <div style={{ fontSize:13, color:T.mu }}>🏛️ {profile.institution}</div>
            )}
            {profile.location && (
              <div style={{ fontSize:13, color:T.mu }}>📍 {profile.location}</div>
            )}
            {profile.orcid && (
              <div style={{ marginTop:2 }}>
                <OrcidBadge orcid={profile.orcid} verified={!!profile.orcid_verified}/>
              </div>
            )}
            {(profile.identity_tier1 || profile.identity_tier2) && (
              <div style={{ display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap', marginTop:6 }}>
                {profile.identity_tier1 && (
                  <span style={{ fontSize:11.5, fontWeight:600, padding:'3px 11px', borderRadius:20, background:T.v2, color:T.v, border:'1px solid rgba(108,99,255,.18)' }}>
                    {profile.identity_tier1}
                  </span>
                )}
                {profile.identity_tier2 && (
                  <span style={{ fontSize:11.5, fontWeight:600, padding:'3px 11px', borderRadius:20, background:T.s2, color:T.mu, border:`1px solid ${T.bdr}` }}>
                    {profile.identity_tier2}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Compact bio + pub count + interests */}
          <div style={{ margin:'20px 0 0', paddingTop:20, borderTop:`1px solid ${T.bdr}` }}>
            {profile.bio && (
              <div style={{
                fontSize:13.5, color:T.mu, lineHeight:1.65, marginBottom:12,
                display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden',
              }}>
                {profile.bio}
              </div>
            )}
            {pubCount > 0 && (
              <div style={{ fontSize:13, color:T.mu, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                <span>📄</span>
                <span>{pubCount} publication{pubCount !== 1 ? 's' : ''}</span>
              </div>
            )}
            {(profile.topic_interests || []).length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                {profile.topic_interests.slice(0, 5).map(t => (
                  <span key={t} style={{ fontSize:11.5, fontWeight:600, padding:'3px 11px', borderRadius:20, background:T.s2, color:T.mu, border:`1px solid ${T.bdr}` }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons — desktop inline */}
          {!isMobile && (
            <div style={{ marginTop:20 }}>
              <ActionButtons />
            </div>
          )}

          {/* View full profile link */}
          <div style={{ textAlign:'center', marginTop:20, paddingTop:16, borderTop:`1px solid ${T.bdr}` }}>
            <a href={`/p/${profile.profile_slug}`}
              style={{ fontSize:12.5, color:T.v, fontWeight:600, textDecoration:'none' }}>
              View full profile →
            </a>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign:'center', padding:'24px 0 0', color:T.mu, fontSize:12 }}>
          <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:17, color:T.text, marginBottom:4 }}>
            Lumi<span style={{ color:T.v }}>nary</span>
          </div>
          <div>Powered by <a href="/" style={{ color:T.v, fontWeight:600, textDecoration:'none' }}>Luminary</a> · luminary.to</div>
        </div>
      </div>

      {/* Mobile sticky action buttons */}
      {isMobile && (
        <div style={{
          position:'fixed', bottom:0, left:0, right:0, zIndex:50,
          background:T.w, borderTop:`1px solid ${T.bdr}`,
          padding:'12px 16px 20px',
          boxShadow:'0 -4px 20px rgba(108,99,255,.10)',
        }}>
          <ActionButtons />
        </div>
      )}
    </div>
  );
}
