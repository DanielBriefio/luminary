import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T, PUB_TYPES, WORK_MODE_MAP } from '../lib/constants';
import Av from '../components/Av';
import FollowBtn from '../components/FollowBtn';
import ExpandableBio from '../components/ExpandableBio';
import Spinner from '../components/Spinner';
import PostCard from '../feed/PostCard';
import { formatDateRange } from '../lib/linkedInUtils';

export default function UserProfileScreen({ userId, currentUserId, currentProfile, onBack, onViewPaper, onMessage }) {
  const [profile,  setProfile]  = useState(null);
  const [pubs,     setPubs]     = useState([]);
  const [posts,    setPosts]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('about');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: pubRows }, { data: postRows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('publications').select('*').eq('user_id', userId)
          .order('year', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('posts_with_meta').select('*').eq('user_id', userId)
          .order('created_at', { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      setProfile(p || {});
      setPubs(pubRows || []);

      // attach user_liked flags if viewing as authenticated user
      let postsData = postRows || [];
      if (currentUserId && postsData.length) {
        const ids = postsData.map(p => p.id);
        const { data: ld } = await supabase.from('likes').select('post_id')
          .eq('user_id', currentUserId).in('post_id', ids);
        const liked = new Set((ld || []).map(l => l.post_id));
        postsData = postsData.map(p => ({ ...p, user_liked: liked.has(p.id) }));
      }
      if (!cancelled) setPosts(postsData);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, currentUserId]);

  const refreshPosts = useCallback(async () => {
    const { data } = await supabase.from('posts_with_meta').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
    let postsData = data || [];
    if (currentUserId && postsData.length) {
      const ids = postsData.map(p => p.id);
      const { data: ld } = await supabase.from('likes').select('post_id')
        .eq('user_id', currentUserId).in('post_id', ids);
      const liked = new Set((ld || []).map(l => l.post_id));
      postsData = postsData.map(p => ({ ...p, user_liked: liked.has(p.id) }));
    }
    setPosts(postsData);
  }, [userId, currentUserId]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <TopBar onBack={onBack} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
    </div>
  );

  const p = profile || {};
  const wh  = p.work_history   || [];
  const edu = p.education      || [];
  const vol = p.volunteering   || [];
  const org = p.organizations  || [];
  const hon = p.honors         || [];
  const lng = p.languages      || [];
  const skl = p.skills         || [];
  const pat = p.patents        || [];
  const grt = p.grants         || [];
  const hasAbout = wh.length || edu.length || vol.length || org.length || lng.length || skl.length || hon.length || pat.length || grt.length;

  const pubCount   = pubs.length;
  const citations  = pubs.map(r => r.citations || 0).sort((a, b) => b - a);
  const hIndex     = citations.reduce((h, c, i) => c >= (i + 1) ? i + 1 : h, 0);
  const totalCit   = citations.reduce((s, c) => s + c, 0);

  const pubTabLabel = (p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist' || p.work_mode === 'both')
    ? `Publications & Presentations (${pubCount})`
    : `Publications (${pubCount})`;

  const tabs = [
    ['about', 'About'],
    ['posts', `Posts (${posts.length})`],
    ...(pubs.length > 0 ? [['publications', pubTabLabel]] : []),
  ];

  const isOwnProfile = currentUserId === userId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <TopBar onBack={onBack} />

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: T.bg }}>
        <div style={{ maxWidth: 740, margin: '0 auto', padding: '20px 18px 48px' }}>

          {/* Banner + Avatar */}
          <div style={{ position: 'relative', marginBottom: 46 }}>
            <div style={{ height: 120, borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
              <svg width="100%" height="120" viewBox="0 0 740 120" preserveAspectRatio="xMidYMid slice">
                <defs><linearGradient id="ubg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea"/>
                  <stop offset="50%" stopColor="#764ba2"/>
                  <stop offset="100%" stopColor="#f093fb"/>
                </linearGradient></defs>
                <rect width="740" height="120" fill="url(#ubg)"/>
                <circle cx="80" cy="60" r="70" fill="white" opacity=".04"/>
                <circle cx="650" cy="20" r="55" fill="white" opacity=".06"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', bottom: -38, left: 20 }}>
              <div style={{ borderRadius: '50%', border: '4px solid white', boxShadow: '0 4px 18px rgba(108,99,255,.2)', display: 'inline-block' }}>
                <Av color={p.avatar_color || 'me'} size={76} name={p.name} url={p.avatar_url || ''} />
              </div>
            </div>
          </div>

          {/* Profile card */}
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '0 22px 18px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
            <div style={{ paddingTop: 48, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, lineHeight: 1.2, marginBottom: 3 }}>
                  {p.name_prefix && (
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: T.mu, marginRight: 5 }}>{p.name_prefix}</span>
                  )}
                  {p.name || 'Researcher'}
                  {p.name_suffix && (
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: T.mu, marginLeft: 5 }}>, {p.name_suffix}</span>
                  )}
                </div>
                {p.title && <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 3 }}>{p.title}</div>}
                {(p.identity_tier1 || p.identity_tier2) && (
                  <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Discipline</span>
                    {' '}
                    <span>{[p.identity_tier1, p.identity_tier2].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {p.work_mode && WORK_MODE_MAP[p.work_mode] && (
                  <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>Sector</span>
                    {' '}
                    <span>{WORK_MODE_MAP[p.work_mode].icon} {WORK_MODE_MAP[p.work_mode].label}</span>
                  </div>
                )}
                {(p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist' || p.work_mode === 'both') && (p.additional_quals || []).length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Qualifications</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
                      {p.additional_quals.map(q => (
                        <span key={q} style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: T.s2, color: T.text, border: `1px solid ${T.bdr}` }}>
                          {q}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {p.institution && <span>🏛️ {p.institution}</span>}
                  {p.location    && <span>📍 {p.location}</span>}
                  {p.orcid && (
                    <a href={`https://orcid.org/${p.orcid}`} target="_blank" rel="noopener noreferrer"
                      style={{ color: T.gr, textDecoration: 'none', fontWeight: 600 }}>ORCID ↗</a>
                  )}
                  {p.twitter && (
                    <a href={`https://twitter.com/${p.twitter.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                      style={{ color: T.bl, textDecoration: 'none', fontWeight: 600 }}>{p.twitter} ↗</a>
                  )}
                </div>

                {/* Clinical identity block — years in practice only */}
                {(p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist') && p.years_in_practice && (
                  <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 6 }}>
                    {p.years_in_practice} years in practice
                  </div>
                )}

                {p.bio && <div style={{ marginBottom: 12, maxWidth: 560 }}><ExpandableBio text={p.bio} /></div>}
              </div>
              {!isOwnProfile && (
                <div style={{ flexShrink: 0, marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {onMessage && (
                    <button
                      onClick={() => onMessage(userId)}
                      style={{
                        fontSize: 12, fontWeight: 600, color: T.v,
                        border: `1.5px solid ${T.v}`, background: T.v2,
                        borderRadius: 22, padding: '6px 14px',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      💬 Message
                    </button>
                  )}
                  <FollowBtn targetType="user" targetId={userId} currentUserId={currentUserId} />
                </div>
              )}
            </div>

            {/* Stats */}
            {(() => {
              const isClinician = p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist' || p.work_mode === 'both';
              const statItems = isClinician ? [
                [posts.length || '—', 'Posts'],
                [pubCount || '—', 'Publications'],
                ...(p.years_in_practice ? [[p.years_in_practice, 'Yrs Practice']] : []),
                ...(p.clinical_highlight_value ? [[p.clinical_highlight_value, p.clinical_highlight_label || 'Highlight']] : []),
              ] : [
                [posts.length || '—', 'Posts'],
                [pubCount || '—', 'Publications'],
                [hIndex > 0 ? `h${hIndex}` : '—', 'h-index'],
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${statItems.length},1fr)`, gap: 8, margin: '10px 0 16px' }}>
                  {statItems.map(([v, l]) => (
                    <div key={l} style={{ background: T.s2, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Serif Display',serif", color: T.v }}>{v}</div>
                      <div style={{ fontSize: 9.5, color: T.mu, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2, fontWeight: 600 }}>{l}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.bdr}`, margin: '0 -22px', padding: '0 22px' }}>
              {tabs.map(([k, l]) => (
                <div key={k} onClick={() => setTab(k)}
                  style={{ padding: '8px 14px', fontSize: 12.5, color: tab === k ? T.v : T.mu, cursor: 'pointer', borderBottom: `2.5px solid ${tab === k ? T.v : 'transparent'}`, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div style={{ marginTop: 0 }}>

            {tab === 'about' && (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '18px 22px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                {/* Research interests — all modes */}
                {(p.topic_interests || []).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Research Interests</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.topic_interests.map(t => (
                        <span key={t} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, background: T.v2, color: T.v, border: `1px solid rgba(108,99,255,.2)`, fontWeight: 600 }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clinical sections — clinician/both mode */}
                {(p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist') && p.patient_population && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Patient Population</div>
                    <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.6 }}>{p.patient_population}</div>
                  </div>
                )}
                {(p.work_mode === 'clinician' || p.work_mode === 'clinician_scientist') && (p.additional_quals || []).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Additional Qualifications</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {p.additional_quals.map(q => (
                        <span key={q} style={{ fontSize: 12.5, fontWeight: 600, padding: '4px 12px', borderRadius: 20, background: T.s2, color: T.text, border: `1px solid ${T.bdr}` }}>
                          {q}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {wh.length > 0 && <>
                  <SH label="Work Experience" />
                  {wh.map((e, i) => (
                    <Row key={i} logo="🏢">
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{e.title}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.v, marginBottom: 1 }}>{[e.company, e.location].filter(Boolean).join(' · ')}</div>
                      {(e.start || e.end) && <div style={{ fontSize: 11, color: T.mu }}>{formatDateRange(e.start, e.end)}</div>}
                      {e.description && <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6, marginTop: 3 }}>{e.description}</div>}
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
                      {pat.map((pt, i) => (
                        <Row key={i} logo="⚗️">
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 1 }}>{pt.title}</div>
                          {pt.number && <div style={{ fontSize: 12, color: T.mu }}>Patent {pt.number}</div>}
                          {pt.url    && <a href={pt.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: T.v }}>View ↗</a>}
                        </Row>
                      ))}
                    </div>
                  )}
                </>}

                {!hasAbout && (
                  <div style={{ textAlign: 'center', padding: '36px 0', color: T.mu }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                    <div style={{ fontSize: 14 }}>No profile information added yet.</div>
                  </div>
                )}
              </div>
            )}

            {tab === 'posts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {posts.length === 0 ? (
                  <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: 36, textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                    <div style={{ fontSize: 14, color: T.mu }}>No posts yet.</div>
                  </div>
                ) : posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    currentProfile={currentProfile}
                    onRefresh={refreshPosts}
                    onViewPaper={onViewPaper}
                  />
                ))}
              </div>
            )}

            {tab === 'publications' && (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '18px 22px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                {pubs.length === 0
                  ? <div style={{ textAlign: 'center', padding: '36px 0', color: T.mu }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
                      <div style={{ fontSize: 14 }}>No publications yet.</div>
                    </div>
                  : pubs.map((pub, i) => <PubRow key={i} pub={pub} />)
                }
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── small helpers ─────────────────────────────────────────────── */

function TopBar({ onBack }) {
  return (
    <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '0 18px', display: 'flex', alignItems: 'center', height: 48, flexShrink: 0 }}>
      <button onClick={onBack}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, color: T.v, padding: '6px 0' }}>
        ← Back
      </button>
    </div>
  );
}

function SH({ label }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', margin: '18px 0 10px', paddingBottom: 6, borderBottom: '2px solid ' + T.bdr }}>
      {label}
    </div>
  );
}

function Row({ logo, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid ' + T.bdr, alignItems: 'flex-start' }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, border: '1px solid ' + T.bdr, background: T.s2 }}>{logo}</div>
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
