import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import { BusinessCardView } from './BusinessCardView';

export default function CardPage({ slug }) {
  const [profile,       setProfile]       = useState(null);
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
      setProfile(p);
      if (p.name) document.title = `${p.name} — Luminary`;
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

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'DM Sans',sans-serif", fontSize:13, color:T.text }}>
      {/* Minimal top bar */}
      <div style={{ background:T.w, borderBottom:`1px solid ${T.bdr}`, padding:'0 16px', display:'flex', alignItems:'center', gap:12, height:52, position:'sticky', top:0, zIndex:10 }}>
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
          title="Back"
          style={{ display:'flex', alignItems:'center', justifyContent:'center', width:32, height:32, borderRadius:'50%', border:`1px solid ${T.bdr}`, background:T.s2, cursor:'pointer', color:T.mu, flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ flex:1 }}/>
        <a href="/" style={{ fontSize:12.5, color:T.v, fontWeight:600, textDecoration:'none', background:T.v2, border:`1px solid rgba(108,99,255,.2)`, borderRadius:8, padding:'7px 16px', whiteSpace:'nowrap' }}>
          Join Luminary →
        </a>
      </div>

      {/* Card — full page */}
      <BusinessCardView profile={profile} currentUserId={currentUserId}/>
    </div>
  );
}
