import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T, PUB_TYPES } from '../lib/constants';
import Av from '../components/Av';
import ExpandableBio from '../components/ExpandableBio';
import Spinner from '../components/Spinner';
import { formatDateRange } from '../lib/linkedInUtils';
import { BusinessCardView } from './BusinessCardView';

export default function PublicProfilePage({ slug }) {
  const [profile,  setProfile]  = useState(null);
  const [pubs,     setPubs]     = useState([]);
  const [pubStats, setPubStats] = useState({ hIndex: 0, totalCitations: 0, pubCount: 0 });
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab,      setTab]      = useState('about');
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    document.title = 'Luminary';
    // Silently check if the viewer is logged in (for owner nudge)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) setCurrentUserId(data.session.user.id);
    });
    return () => { document.title = 'Luminary'; };
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
      if (p.name) {
        const displayName = [p.name_prefix, p.name, p.name_suffix ? p.name_suffix : null].filter(Boolean).join(' ');
        document.title = `${displayName} — Luminary`;
      }

      const vis = p.profile_visibility || {};
      if (vis.publications !== false) {
        const { data: pubRows } = await supabase
          .from('publications').select('*').eq('user_id', p.id)
          .order('year', { ascending: false })
          .order('created_at', { ascending: false });
        if (!cancelled) {
          const list = pubRows || [];
          setPubs(list);
          const counts = list.map(r => r.citations || 0).sort((a, b) => b - a);
          const hIndex = counts.reduce((h, c, i) => c >= (i + 1) ? i + 1 : h, 0);
          setPubStats({ hIndex, totalCitations: counts.reduce((s, c) => s + c, 0), pubCount: list.length });
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif" }}>
      <Spinner />
    </div>
  );

  if (notFound) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif", color: T.text, textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 8 }}>Profile not found</div>
      <div style={{ fontSize: 14, color: T.mu, marginBottom: 24 }}>This profile doesn't exist or hasn't been made public yet.</div>
      <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '8px 18px' }}>
        ← Go to Luminary
      </a>
    </div>
  );

  const vis  = profile.profile_visibility || {};
  const wh   = vis.work_history  !== false ? (profile.work_history   || []) : [];
  const edu  = vis.education     !== false ? (profile.education      || []) : [];
  const vol  = vis.volunteering  !== false ? (profile.volunteering   || []) : [];
  const org  = vis.organizations !== false ? (profile.organizations  || []) : [];
  const hon  = vis.skills        !== false ? (profile.honors         || []) : [];
  const lng  = vis.skills        !== false ? (profile.languages      || []) : [];
  const skl  = vis.skills        !== false ? (profile.skills         || []) : [];
  const pat  = vis.skills        !== false ? (profile.patents        || []) : [];
  const grt  = vis.grants        !== false ? (profile.grants         || []) : [];
  const showPubs = vis.publications !== false;

  const tabs = [
    ['about', 'About'],
    ...(showPubs && pubs.length > 0 ? [['publications', `Publications (${pubs.length})`]] : []),
    ['card', 'Contact Details'],
  ];

  const hasAbout = wh.length || edu.length || vol.length || org.length || lng.length || skl.length || hon.length || pat.length || grt.length;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.text }}>
      {/* Top bar */}
      <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, height: 52, position: 'sticky', top: 0, zIndex: 10 }}>
        {/* Back / home button — especially useful in PWA standalone mode */}
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; }}
          title="Back"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: `1px solid ${T.bdr}`, background: T.s2, cursor: 'pointer', color: T.mu, flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <a href="/" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, textDecoration: 'none', color: T.text, flex: 1 }}>
          Lumi<span style={{ color: T.v }}>nary</span>
        </a>
        <a href="/" style={{ fontSize: 12.5, color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '7px 16px', whiteSpace: 'nowrap' }}>
          Join Luminary →
        </a>
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 18px 48px' }}>
        {/* Banner + Avatar */}
        <div style={{ position: 'relative', marginBottom: 46 }}>
          <div style={{ height: 148, borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
            <svg width="100%" height="148" viewBox="0 0 760 148" preserveAspectRatio="xMidYMid slice">
              <defs><linearGradient id="cov" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#667eea"/><stop offset="45%" stopColor="#764ba2"/><stop offset="100%" stopColor="#f093fb"/></linearGradient></defs>
              <rect width="760" height="148" fill="url(#cov)"/>
              <circle cx="95" cy="74" r="85" fill="white" opacity=".04"/>
              <circle cx="665" cy="30" r="65" fill="white" opacity=".06"/>
            </svg>
          </div>
          <div style={{ position: 'absolute', bottom: -43, left: 22 }}>
            <div style={{ borderRadius: '50%', border: '4px solid white', boxShadow: '0 4px 18px rgba(108,99,255,.2)', display: 'inline-block' }}>
              <Av color={profile.avatar_color || 'me'} size={84} name={profile.name} url={profile.avatar_url || ''} />
            </div>
          </div>
        </div>

        {/* Profile card */}
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '0 24px 20px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
          <div style={{ paddingTop: 56 }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, lineHeight: 1.2, marginBottom: 4 }}>
              {profile.name_prefix && (
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: T.mu, marginRight: 6 }}>{profile.name_prefix}</span>
              )}
              {profile.name || 'Researcher'}
              {profile.name_suffix && (
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: T.mu, marginLeft: 6 }}>, {profile.name_suffix}</span>
              )}
            </div>
            {profile.title && (
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{profile.title}</div>
            )}
            {(profile.identity_tier1 || profile.identity_tier2) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {profile.identity_tier1 && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: '#f1f0ff', color: '#5b52cc', border: '1px solid rgba(108,99,255,.2)' }}>
                    {profile.identity_tier1}
                  </span>
                )}
                {profile.identity_tier2 && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: T.v2, color: T.v, border: `1px solid rgba(108,99,255,.25)` }}>
                    {profile.identity_tier2}
                  </span>
                )}
              </div>
            )}
            <div style={{ fontSize: 13, color: T.mu, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {profile.institution && <span>🏛️ {profile.institution}</span>}
              {profile.location    && <span>📍 {profile.location}</span>}
              {profile.orcid && (
                <a href={`https://orcid.org/${profile.orcid}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: T.gr, textDecoration: 'none', fontWeight: 600 }}>ORCID ↗</a>
              )}
              {profile.twitter && (
                <a href={`https://twitter.com/${profile.twitter.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                  style={{ color: T.bl, textDecoration: 'none', fontWeight: 600 }}>{profile.twitter} ↗</a>
              )}
            </div>
            {profile.bio && <div style={{ marginBottom: 14, maxWidth: 620 }}><ExpandableBio text={profile.bio} /></div>}

            {profile.topic_interests?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Research Interests</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {profile.topic_interests.map(t => (
                    <span key={t} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1.5px solid rgba(108,99,255,.2)', background: T.v2, color: T.v, fontWeight: 700 }}>
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9, margin: '14px 0' }}>
              {[
                ['—', 'Followers'],
                ['—', 'Following'],
                [pubStats.pubCount || '—', 'Publications'],
                [pubStats.totalCitations || '—', 'Citations'],
                [pubStats.hIndex > 0 ? `h${pubStats.hIndex}` : '—', 'h-index'],
              ].map(([v, l]) => (
                <div key={l} style={{ background: T.s2, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "'DM Serif Display',serif", color: T.v }}>{v}</div>
                  <div style={{ fontSize: 9.5, color: T.mu, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2, fontWeight: 600 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${T.bdr}`, margin: '16px 0 0' }}>
            {tabs.map(([k, l]) => (
              <div key={k} onClick={() => setTab(k)}
                style={{ padding: '8px 16px', fontSize: 12.5, color: tab === k ? T.v : T.mu, cursor: 'pointer', borderBottom: `2.5px solid ${tab === k ? T.v : 'transparent'}`, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: tab === 'card' ? '0' : '20px 24px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>

          {tab === 'card' && (
            <BusinessCardView profile={profile} currentUserId={currentUserId}/>
          )}

          {tab === 'about' && (
            <div>
              {wh.length > 0 && <>
                <SH label="Work Experience" />
                {wh.map((p, i) => (
                  <Row key={i} logo="🏢">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{p.title}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 1 }}>{[p.company, p.location].filter(Boolean).join(' · ')}</div>
                    {(p.start || p.end) && <div style={{ fontSize: 11, color: T.mu }}>{formatDateRange(p.start, p.end)}</div>}
                    {p.description && <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginTop: 3 }}>{p.description}</div>}
                  </Row>
                ))}
              </>}

              {edu.length > 0 && <>
                <SH label="Education" />
                {edu.map((e, i) => (
                  <Row key={i} logo="🎓">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{e.school}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 1 }}>{[e.degree, e.field].filter(Boolean).join(', ')}</div>
                    {(e.start || e.end) && <div style={{ fontSize: 11, color: T.mu }}>{formatDateRange(e.start, e.end)}</div>}
                  </Row>
                ))}
              </>}

              {vol.length > 0 && <>
                <SH label="Volunteering" />
                {vol.map((v, i) => (
                  <Row key={i} logo="🤝">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{v.role || 'Volunteer'}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 1 }}>{v.org}</div>
                    {(v.start || v.end) && <div style={{ fontSize: 11, color: T.mu }}>{formatDateRange(v.start, v.end)}</div>}
                  </Row>
                ))}
              </>}

              {org.length > 0 && <>
                <SH label="Organizations &amp; Memberships" />
                {org.map((o, i) => (
                  <Row key={i} logo="🏛️">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{o.name}</div>
                    {o.role && <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 1 }}>{o.role}</div>}
                    {(o.start || o.end) && <div style={{ fontSize: 11, color: T.mu }}>{formatDateRange(o.start, o.end)}</div>}
                  </Row>
                ))}
              </>}

              {grt.length > 0 && <>
                <SH label="Grants &amp; Funding" />
                {grt.map((g, i) => (
                  <Row key={i} logo="💰">
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{g.title}</div>
                    {g.agency && <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 2 }}>{g.agency}</div>}
                    <div style={{ fontSize: 11.5, color: T.mu, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {g.grant_number && <span>#{g.grant_number}</span>}
                      {g.amount_value && <span style={{ fontWeight: 600, color: T.gr }}>{g.amount_value}{g.amount_currency ? ' ' + g.amount_currency : ''}</span>}
                      {g.role && <span>{g.role}</span>}
                      {(g.start || g.end) && <span>{formatDateRange(g.start, g.end)}</span>}
                    </div>
                  </Row>
                ))}
              </>}

              {(lng.length > 0 || skl.length > 0 || hon.length > 0 || pat.length > 0) && <>
                <SH label="Skills &amp; Achievements" />
                {lng.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 7, color: T.text }}>Languages</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {lng.map((l, i) => <Pill key={i} label={l.name + (l.proficiency ? ` · ${l.proficiency}` : '')} color="v" />)}
                    </div>
                  </div>
                )}
                {skl.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 7, color: T.text }}>Skills</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {skl.map((s, i) => <Pill key={i} label={s.name} />)}
                    </div>
                  </div>
                )}
                {hon.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 7, color: T.text }}>Honors &amp; Awards</div>
                    {hon.map((h, i) => (
                      <Row key={i} logo="🏅">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{h.title}</div>
                        {h.issuer && <div style={{ fontSize: 12, color: T.mu }}>{h.issuer}</div>}
                        {h.date   && <div style={{ fontSize: 11, color: T.mu }}>{h.date}</div>}
                      </Row>
                    ))}
                  </div>
                )}
                {pat.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 7, color: T.text }}>Patents</div>
                    {pat.map((p, i) => (
                      <Row key={i} logo="⚗️">
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{p.title}</div>
                        {p.number && <div style={{ fontSize: 12, color: T.mu }}>Patent {p.number}</div>}
                        {p.url    && <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: T.v }}>View ↗</a>}
                      </Row>
                    ))}
                  </div>
                )}
              </>}

              {!hasAbout && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: T.mu }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                  <div style={{ fontSize: 14 }}>No public information available yet.</div>
                </div>
              )}
            </div>
          )}

          {tab === 'publications' && (
            <div>
              {pubs.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px 0', color: T.mu }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
                    <div style={{ fontSize: 14 }}>No publications yet.</div>
                  </div>
                : pubs.map((pub, i) => <PubRow key={i} pub={pub} />)
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '28px 0 0', color: T.mu, fontSize: 12 }}>
          Profile hosted on{' '}
          <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none' }}>Luminary</a>
          {' '}— Research networking for scientists
        </div>
      </div>
    </div>
  );
}

/* ── small helpers ────────────────────────────────────────────── */

function SH({ label }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', margin: '20px 0 10px', paddingBottom: 6, borderBottom: '2px solid ' + T.bdr }}>
      {label}
    </div>
  );
}

function Row({ logo, children }) {
  return (
    <div style={{ display: 'flex', gap: 13, padding: '13px 0', borderBottom: '1px solid ' + T.bdr, alignItems: 'flex-start' }}>
      <div style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, border: '1px solid ' + T.bdr, background: T.s2 }}>{logo}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Pill({ label, color }) {
  const bg  = color === 'v' ? T.v2 : T.s2;
  const fg  = color === 'v' ? T.v  : T.mu;
  const bdr = color === 'v' ? '1px solid rgba(108,99,255,.15)' : '1px solid ' + T.bdr;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: bg, border: bdr, borderRadius: 20, padding: '4px 12px', fontSize: 12.5, fontWeight: 600, color: fg }}>
      {label}
    </span>
  );
}

function PubRow({ pub }) {
  const typeInfo = PUB_TYPES.find(t => t.id === pub.pub_type) || PUB_TYPES[0];
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid ' + T.bdr }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{typeInfo.icon}</span>
        <div style={{ flex: 1 }}>
          {pub.doi
            ? <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, fontWeight: 700, color: T.text, textDecoration: 'none', lineHeight: 1.4, display: 'block' }}>
                {pub.title}
              </a>
            : <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{pub.title}</div>
          }
          {pub.authors && <div style={{ fontSize: 11.5, color: T.mu, marginTop: 2 }}>{pub.authors}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {pub.journal  && <span style={{ fontSize: 11.5, color: T.v, fontWeight: 600 }}>{pub.journal}</span>}
            {pub.year     && <span style={{ fontSize: 11, color: T.mu }}>{pub.year}</span>}
            {pub.citations > 0 && <span style={{ fontSize: 11, color: T.mu }}>Cited by {pub.citations}</span>}
            {pub.doi      && <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.te, textDecoration: 'none', fontWeight: 600 }}>DOI ↗</a>}
          </div>
        </div>
      </div>
    </div>
  );
}
