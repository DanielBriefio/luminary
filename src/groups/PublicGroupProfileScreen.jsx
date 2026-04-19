import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import SafeHtml from '../components/SafeHtml';
import { timeAgo } from '../lib/utils';

function StatChip({ count, label }) {
  return (
    <div style={{ background: T.s2, borderRadius: 10, padding: '10px 16px', textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Serif Display',serif", color: T.v }}>{count}</div>
      <div style={{ fontSize: 10.5, color: T.mu, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function PublicGroupProfileScreen({ slug }) {
  const [group,        setGroup]        = useState(null);
  const [stats,        setStats]        = useState(null);
  const [leader,       setLeader]       = useState(null);
  const [posts,        setPosts]        = useState([]);
  const [publications, setPublications] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const qrRef = useRef(null);

  useEffect(() => {
    document.title = 'Luminary';
    return () => { document.title = 'Luminary'; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: grp } = await supabase
        .from('groups')
        .select('*')
        .eq('slug', slug)
        .eq('public_profile_enabled', true)
        .maybeSingle();

      if (cancelled) return;
      if (!grp) { setNotFound(true); setLoading(false); return; }

      setGroup(grp);
      if (grp.name) document.title = `${grp.name} — Luminary`;

      const [statsRes, leaderRes] = await Promise.all([
        supabase.from('group_stats').select('*').eq('group_id', grp.id).maybeSingle(),
        supabase.from('group_members')
          .select('display_role, profiles(name, avatar_url, avatar_color, title)')
          .eq('group_id', grp.id).eq('role', 'admin').limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setStats(statsRes.data);
      setLeader(leaderRes.data);

      if (grp.public_show_posts) {
        const { data: gp } = await supabase
          .from('group_posts_with_meta')
          .select('*')
          .eq('group_id', grp.id)
          .eq('is_reposted_public', true)
          .order('created_at', { ascending: false })
          .limit(6);
        if (!cancelled) setPosts(gp || []);
      }

      // Always fetch publications for the counter; list only shown if public_show_publications
      const { data: folderRows } = await supabase
        .from('library_folders').select('id').eq('group_id', grp.id);
      if (!cancelled && folderRows?.length) {
        const folderIds = folderRows.map(f => f.id);
        const { data: pubRows } = await supabase
          .from('library_items')
          .select('*')
          .in('folder_id', folderIds)
          .eq('is_group_publication', true)
          .order('year', { ascending: false });
        if (!cancelled) setPublications(pubRows || []);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!group?.slug || !group?.public_profile_enabled || !qrRef.current) return;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(
        qrRef.current,
        `https://luminary.to/g/${group.slug}`,
        { width: 140, margin: 1, color: { dark: '#1b1d36', light: '#ffffff' } }
      );
    }).catch(() => {});
  }, [group]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif" }}>
      <Spinner />
    </div>
  );

  if (notFound) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif", color: T.text, textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔬</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 8 }}>Group not found</div>
      <div style={{ fontSize: 14, color: T.mu, marginBottom: 24 }}>This group profile may not be public or doesn't exist.</div>
      <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '8px 18px' }}>
        ← Go to Luminary
      </a>
    </div>
  );

  const leaderProfile = leader?.profiles || {};

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.text }}>
      {/* Top bar */}
      <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, position: 'sticky', top: 0, zIndex: 10 }}>
        <a href="/" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, textDecoration: 'none', color: T.text }}>
          Lumi<span style={{ color: T.v }}>nary</span>
        </a>
        <a href="/" style={{ fontSize: 12.5, color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '7px 16px' }}>
          Join Luminary →
        </a>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 18px 64px' }}>

        {/* Cover */}
        <div style={{ height: 180, background: 'linear-gradient(135deg,#667eea,#764ba2)', overflow: 'hidden', position: 'relative' }}>
          {group.cover_url && <img src={group.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>}
        </div>

        {/* Card */}
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: '0 0 16px 16px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
          <div style={{ padding: 20 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: -36, marginBottom: 12 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18, overflow: 'hidden',
                border: `3px solid ${T.w}`, background: 'linear-gradient(135deg,#667eea,#764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {group.avatar_url
                  ? <img src={group.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  : group.name?.charAt(0).toUpperCase()
                }
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, lineHeight: 1.2 }}>{group.name}</div>
                {/* Taxonomy badges */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                  {group.tier1 && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f0ff', color: '#5b52cc', fontWeight: 700 }}>
                      {group.tier1}
                    </span>
                  )}
                  {(group.tier2 || []).map(t => (
                    <span key={t} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: T.v2, color: T.v, fontWeight: 600 }}>
                      {t}
                    </span>
                  ))}
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    background: group.is_public ? T.gr2 : T.am2,
                    color: group.is_public ? T.gr : T.am,
                  }}>
                    {group.is_public ? '🌐 Public' : '🔒 Closed'}
                  </span>
                </div>
              </div>
            </div>

            {/* Research details */}
            {(group.research_topic || group.research_details) && (
              <div style={{ marginBottom: 12 }}>
                {group.research_topic && (
                  <div style={{ fontSize: 13, color: T.v, fontWeight: 600, marginBottom: 4 }}>{group.research_topic}</div>
                )}
                {group.research_details && (
                  <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.7 }}>{group.research_details}</div>
                )}
              </div>
            )}

            {/* Contact row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 12 }}>
              {group.public_show_location && group.location && (
                <span style={{ fontSize: 12, color: T.mu }}>📍 {group.location}</span>
              )}
              {group.website_url && (
                <a href={group.website_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: T.v, fontWeight: 600, textDecoration: 'none' }}>🌐 Website</a>
              )}
              {group.public_show_contact && group.contact_email && (
                <a href={`mailto:${group.contact_email}`}
                  style={{ fontSize: 12, color: T.v, fontWeight: 600, textDecoration: 'none' }}>✉️ {group.contact_email}</a>
              )}
            </div>

            {/* Description */}
            {group.description && (
              <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.7, marginBottom: 12 }}>{group.description}</div>
            )}

            {/* Leader */}
            {group.public_show_leader && leader && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', background: T.s2, borderRadius: 10 }}>
                <Av color={leaderProfile.avatar_color || 'me'} size={36} name={leaderProfile.name} url={leaderProfile.avatar_url || ''}/>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{leaderProfile.name}</div>
                  <div style={{ fontSize: 11.5, color: T.mu }}>{leader.display_role || leaderProfile.title || 'Group Leader'}</div>
                </div>
              </div>
            )}

            {/* Stats */}
            {group.public_show_members && stats && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <StatChip count={stats.active_member_count || 0} label="Members" />
                <StatChip count={stats.alumni_count || 0} label="Alumni" />
                <StatChip count={publications.length} label="Publications" />
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/" style={{
                flex: 1, display: 'block', textAlign: 'center',
                background: T.v, color: '#fff', fontWeight: 700, fontSize: 13,
                textDecoration: 'none', borderRadius: 10, padding: '11px',
                boxShadow: '0 3px 14px rgba(108,99,255,.3)',
              }}>
                {group.is_public ? '+ Join this group' : '🔒 Request to join'}
              </a>
              <a href="/" style={{
                flex: 1, display: 'block', textAlign: 'center',
                background: T.w, color: T.v, fontWeight: 700, fontSize: 13,
                textDecoration: 'none', borderRadius: 10, padding: '11px',
                border: `1.5px solid ${T.v}`,
              }}>
                View on Luminary
              </a>
            </div>
          </div>
        </div>

        {/* Publications */}
        {group.public_show_publications && publications.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
              Publications ({publications.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {publications.map(pub => (
                <div key={pub.id} style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 3, color: T.text }}>
                    {pub.title}
                  </div>
                  {pub.authors && (
                    <div style={{ fontSize: 11, color: T.mu, marginBottom: 4 }}>
                      {pub.authors.slice(0, 120)}{pub.authors.length > 120 ? '…' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pub.journal && <span style={{ fontSize: 11.5, fontWeight: 600, color: T.v }}>{pub.journal}</span>}
                    {pub.year    && <span style={{ fontSize: 11, color: T.mu }}>· {pub.year}</span>}
                    {pub.cited_by_count > 0 && (
                      <span style={{ fontSize: 10, background: T.bl2, color: T.bl, padding: '1px 6px', borderRadius: 20, fontWeight: 600 }}>
                        {pub.cited_by_count} citations
                      </span>
                    )}
                    {pub.is_open_access && (
                      <span style={{ fontSize: 10, background: T.gr2, color: T.gr, padding: '1px 6px', borderRadius: 20, fontWeight: 700 }}>
                        Open Access
                      </span>
                    )}
                    {pub.doi && (
                      <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: T.v, fontWeight: 600, textDecoration: 'none', marginLeft: 'auto' }}>
                        DOI ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent posts */}
        {group.public_show_posts && posts.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
              Recent posts
            </div>
            {posts.map(p => (
              <div key={p.id} style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Av color={p.author_avatar || 'me'} size={32} name={p.author_name} url={p.author_avatar_url || ''}/>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.author_name}</div>
                    <div style={{ fontSize: 11, color: T.mu }}>{timeAgo(p.created_at)}</div>
                  </div>
                </div>
                {p.content && <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}><SafeHtml html={p.content}/></div>}
                {p.paper_title && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: T.v, marginTop: 6 }}>{p.paper_title}</div>
                )}
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5, color: T.mu }}>
                  <span>🤍 {p.like_count || 0}</span>
                  <span>💬 {p.comment_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '24px 0 0', color: T.mu, fontSize: 12 }}>
          <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none' }}>Luminary</a>
          {' '}— Research networking for scientists
        </div>
      </div>
    </div>
  );
}
