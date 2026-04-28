import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T, TIER1_LIST, getTier2 } from '../lib/constants';
import { useWindowSize } from '../lib/useWindowSize';
import Spinner from '../components/Spinner';
import CreateGroupModal from './CreateGroupModal';

function GroupBadgeCard({ group, role, memberCount, unreadCount, onSelect, actionButton }) {
  const isAdmin  = role === 'admin';
  const isAlumni = role === 'alumni';
  const hasUnread = (unreadCount || 0) > 0;

  return (
    <div
      onClick={() => onSelect(group.id)}
      style={{
        position: 'relative', background: T.w, cursor: 'pointer',
        border: `1.5px solid ${hasUnread ? T.v : T.bdr}`,
        borderRadius: 16, overflow: 'hidden', transition: 'box-shadow .15s',
        boxShadow: hasUnread ? '0 2px 12px rgba(108,99,255,.15)' : '0 1px 4px rgba(0,0,0,.06)',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = hasUnread ? '0 2px 12px rgba(108,99,255,.15)' : '0 1px 4px rgba(0,0,0,.06)'}
    >
      {/* Unread badge */}
      {hasUnread && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 2,
          background: T.v, color: '#fff', fontSize: 10.5, fontWeight: 700,
          padding: '2px 7px', borderRadius: 20, minWidth: 20, textAlign: 'center',
        }}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}

      {/* Cover image if the group has one — gives the card a "business card"
          banner. Falls back to the gradient strip when absent. */}
      {group.cover_url ? (
        <div style={{ height: 96, position: 'relative', overflow: 'hidden' }}>
          <img src={group.cover_url} alt=""
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: group.cover_position || '50% 50%',
              display: 'block',
            }}/>
        </div>
      ) : (
        <div style={{ height: 6, background: 'linear-gradient(90deg,#667eea,#764ba2,#f093fb)' }}/>
      )}

      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: T.v2, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 20, fontWeight: 700,
            color: T.v, overflow: 'hidden', border: `2px solid ${T.w}`,
            boxShadow: '0 1px 4px rgba(0,0,0,.1)',
          }}>
            {group.avatar_url
              ? <img src={group.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : group.name?.charAt(0).toUpperCase()
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + role/visibility badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{group.name}</span>
              {isAdmin && (
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: T.v, color: '#fff', textTransform: 'uppercase', letterSpacing: '.05em' }}>Admin</span>
              )}
              {isAlumni && (
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: T.am2, color: T.am }}>Alumni</span>
              )}
              <span style={{
                fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 20,
                background: group.is_public ? T.gr2 : T.am2,
                color: group.is_public ? T.gr : T.am,
                border: `1px solid ${group.is_public ? 'rgba(16,185,129,.2)' : 'rgba(245,158,11,.2)'}`,
              }}>
                {group.is_public ? '🌐 Public' : '🔒 Closed'}
              </span>
            </div>

            {/* Taxonomy chips */}
            {(group.tier1 || group.tier2?.length > 0) && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {group.tier1 && (
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: '#f1f0ff', color: '#5b52cc', fontWeight: 600 }}>
                    {group.tier1}
                  </span>
                )}
                {(group.tier2 || []).slice(0, 2).map(t => (
                  <span key={t} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: T.v2, color: T.v, fontWeight: 600 }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Affiliation row */}
        {(group.institution || group.company || group.country || group.location) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginBottom: 7 }}>
            {group.institution && <span style={{ fontSize: 11.5, color: T.mu }}>🏛️ {group.institution}</span>}
            {group.company     && <span style={{ fontSize: 11.5, color: T.mu }}>🏢 {group.company}</span>}
            {group.country     && <span style={{ fontSize: 11.5, color: T.mu }}>🌍 {group.country}</span>}
            {group.location    && <span style={{ fontSize: 11.5, color: T.mu }}>📍 {group.location}</span>}
          </div>
        )}

        {/* Research topic */}
        {group.research_topic && (
          <div style={{
            fontSize: 11.5, color: T.mu, marginBottom: 8,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {group.research_topic}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 14, paddingTop: 8, borderTop: `1px solid ${T.bdr}` }}>
          <div style={{ fontSize: 11.5, color: T.mu }}>
            <strong style={{ color: T.text, fontWeight: 700 }}>{memberCount || 0}</strong> members
          </div>
        </div>

        {/* Optional action button (Discover section) */}
        {actionButton && <div style={{ marginTop: 10 }}>{actionButton}</div>}
      </div>
    </div>
  );
}

// Compact mobile card: tighter, no avatar, no chips. Just the gradient
// stripe + name + topic (2-line clamp) + a footer with member count and
// visibility/role/unread indicators. Optional Join action overlays the
// footer on Discover.
function CompactGroupCard({ group, role, memberCount, unreadCount, onSelect, joining, onJoin }) {
  const isAdmin  = role === 'admin';
  const isAlumni = role === 'alumni';
  const hasUnread = (unreadCount || 0) > 0;

  return (
    <div
      onClick={() => onSelect(group.id)}
      style={{
        position: 'relative', background: T.w, cursor: 'pointer',
        border: `1.5px solid ${hasUnread ? T.v : T.bdr}`,
        borderRadius: 12, overflow: 'hidden',
        boxShadow: hasUnread ? '0 2px 10px rgba(108,99,255,.12)' : 'none',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ height: 4, background: 'linear-gradient(90deg,#667eea,#764ba2,#f093fb)' }}/>
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.25,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
          }}>
            {group.name}
          </span>
          <span style={{ fontSize: 10.5, color: T.mu, flexShrink: 0 }}>
            {group.is_public ? '🌐' : '🔒'}
          </span>
        </div>
        {group.research_topic && (
          <div style={{
            fontSize: 11.5, color: T.mu, lineHeight: 1.45,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {group.research_topic}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
          <span style={{ fontSize: 11, color: T.mu }}>
            <strong style={{ color: T.text, fontWeight: 700 }}>{memberCount || 0}</strong> members
          </span>
          {isAdmin && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: T.v, color: '#fff', textTransform: 'uppercase', letterSpacing: '.05em' }}>Admin</span>
          )}
          {isAlumni && (
            <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: T.am2, color: T.am }}>Alumni</span>
          )}
          {hasUnread && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10, fontWeight: 700, background: T.v, color: '#fff',
              padding: '2px 7px', borderRadius: 20, minWidth: 20, textAlign: 'center',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        {onJoin && (
          <button
            onClick={e => { e.stopPropagation(); onJoin(group); }}
            disabled={joining}
            style={{
              padding: '6px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
              border: `1.5px solid ${T.v}`,
              background: group.is_public ? T.v : T.v2,
              color: group.is_public ? '#fff' : T.v,
            }}>
            {joining ? '…' : group.is_public ? '+ Join' : '🔒 Request'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function GroupsScreen({ user, profile, onGroupSelect }) {
  const { isMobile } = useWindowSize();
  const [myGroups,      setMyGroups]      = useState([]);
  const [discover,      setDiscover]      = useState([]);
  const [loadingMine,   setLoadingMine]   = useState(true);
  const [loadingDisc,   setLoadingDisc]   = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [joining,       setJoining]       = useState(null);
  const [unreadCounts,  setUnreadCounts]  = useState({});
  const [mobileTab,     setMobileTab]     = useState('mine');     // mobile only
  const [desktopTab,    setDesktopTab]    = useState('mine');     // desktop tab state
  const [tier1Filter,   setTier1Filter]   = useState('');         // explicit tier1 in Discover
  const [tier2Filter,   setTier2Filter]   = useState('');         // explicit tier2 in Discover

  const fetchMyGroups = useCallback(async () => {
    setLoadingMine(true);
    // Try with new columns first; fall back to core columns if migration hasn't run
    let { data, error } = await supabase
      .from('group_members')
      .select(`role, last_read_at, groups(id, name, slug, avatar_url, cover_url, cover_position, is_public, research_topic, tier1, tier2, institution, company, country, location)`)
      .eq('user_id', user.id)
      .in('role', ['admin', 'member', 'alumni']);
    if (error) {
      ({ data } = await supabase
        .from('group_members')
        .select(`role, groups(id, name, avatar_url, is_public, research_topic)`)
        .eq('user_id', user.id)
        .in('role', ['admin', 'member', 'alumni']));
    }

    const rows = data || [];
    const groupIds = rows.map(r => r.groups?.id).filter(Boolean);
    let countMap = {};
    if (groupIds.length) {
      const { data: members } = await supabase
        .from('group_members').select('group_id').in('group_id', groupIds).in('role', ['admin', 'member']);
      (members || []).forEach(m => { countMap[m.group_id] = (countMap[m.group_id] || 0) + 1; });
    }

    const enriched = rows.map(r => ({ ...r, memberCount: countMap[r.groups?.id] || 0 }));
    setMyGroups(enriched);
    setLoadingMine(false);

    // Fetch unread counts
    const counts = {};
    await Promise.all(
      enriched
        .filter(r => r.groups && r.role !== 'alumni')
        .map(async r => {
          // If last_read_at is null the tracking column hasn't been set yet — show 0
          if (!r.last_read_at) { counts[r.groups.id] = 0; return; }
          const { count } = await supabase
            .from('group_posts')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', r.groups.id)
            .gt('created_at', r.last_read_at);
          counts[r.groups.id] = count || 0;
        })
    );
    setUnreadCounts(counts);
  }, [user.id]);

  const fetchDiscover = useCallback(async () => {
    setLoadingDisc(true);
    const { data: myMemberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const myIds = (myMemberships || []).map(r => r.group_id);

    let q = supabase.from('groups').select('id, name, slug, description, research_topic, tier1, tier2, institution, company, country, location, avatar_url, cover_url, cover_position, is_public').limit(60);
    if (myIds.length) q = q.not('id', 'in', `(${myIds.join(',')})`);
    const { data: groups } = await q;

    const gs = groups || [];
    const gids = gs.map(g => g.id);
    let countMap = {};
    if (gids.length) {
      const { data: members } = await supabase.from('group_members').select('group_id').in('group_id', gids).in('role', ['admin', 'member']);
      (members || []).forEach(m => { countMap[m.group_id] = (countMap[m.group_id] || 0) + 1; });
    }
    setDiscover(gs.map(g => ({ ...g, memberCount: countMap[g.id] || 0 })));
    setLoadingDisc(false);
  }, [user.id]);

  useEffect(() => { fetchMyGroups(); fetchDiscover(); }, [fetchMyGroups, fetchDiscover]);

  const joinGroup = async (group) => {
    if (!group.is_public) { onGroupSelect(group.id); return; }
    setJoining(group.id);
    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'member' });
    setJoining(null);
    if (!error) capture('group_joined', { group_id: group.id });
    onGroupSelect(group.id);
  };

  const filteredDiscover = discover.filter(g => {
    if (!discoverQuery.trim()) return true;
    const q = discoverQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.research_topic || '').toLowerCase().includes(q) || (g.tier1 || '').toLowerCase().includes(q);
  });

  // ── Discover personalisation ────────────────────────────────────────
  // Score each group by how well it matches the viewer's profile tiers,
  // then bucket into "your field / related / other" sections. When the
  // user explicitly picks a tier1 (or tier1 + tier2) filter, sectioning
  // is bypassed and a single filtered list is shown instead.
  const userTier1  = profile?.identity_tier1 || '';
  const userTier2s = Array.isArray(profile?.identity_tier2)
    ? profile.identity_tier2
    : (profile?.identity_tier2 ? [profile.identity_tier2] : []);

  const matchesTierFilters = (g) => {
    if (tier1Filter && g.tier1 !== tier1Filter) return false;
    if (tier2Filter && !(g.tier2 || []).includes(tier2Filter)) return false;
    return true;
  };

  const groupRelevance = (g) => {
    let score = 0;
    if (userTier1 && g.tier1 === userTier1) score += 10;
    const overlap = (g.tier2 || []).filter(t => userTier2s.includes(t)).length;
    score += overlap;
    return score;
  };

  // Apply the same search + tier filters used everywhere
  const visibleDiscover = filteredDiscover.filter(matchesTierFilters);

  const explicitFilter = !!(tier1Filter || tier2Filter);
  const inYourField = !explicitFilter && userTier1
    ? visibleDiscover.filter(g => g.tier1 === userTier1)
    : [];
  const relatedField = !explicitFilter && userTier2s.length > 0
    ? visibleDiscover.filter(g => g.tier1 !== userTier1
        && (g.tier2 || []).some(t => userTier2s.includes(t)))
    : [];
  const otherField = !explicitFilter
    ? visibleDiscover.filter(g =>
        !inYourField.includes(g) && !relatedField.includes(g))
    : [];
  // Sort each section by relevance (mostly meaningful for "in your field"
  // when there are tier2 sub-matches stacking on top of tier1).
  inYourField.sort((a, b) => groupRelevance(b) - groupRelevance(a));
  relatedField.sort((a, b) => groupRelevance(b) - groupRelevance(a));

  // ── Mobile: tabs + 2-col grid of compact cards ─────────────────────────
  if (isMobile) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', background: T.bg }}>
        {showCreate && (
          <CreateGroupModal user={user} onGroupCreated={id => { setShowCreate(false); onGroupSelect(id); }} onClose={() => setShowCreate(false)}/>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: T.text }}>Groups</div>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '7px 14px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
          }}>+ Create</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 6, marginBottom: 14,
          borderBottom: `1px solid ${T.bdr}`,
        }}>
          {[
            { id: 'mine',     label: 'My Groups', count: myGroups.length },
            { id: 'discover', label: 'Discover',  count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setMobileTab(t.id)} style={{
              padding: '8px 4px', marginRight: 14,
              border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: mobileTab === t.id ? 700 : 500,
              color: mobileTab === t.id ? T.v : T.mu,
              borderBottom: `2px solid ${mobileTab === t.id ? T.v : 'transparent'}`,
              marginBottom: -1,
            }}>
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {mobileTab === 'mine' ? (
          loadingMine ? <Spinner/> : myGroups.length === 0 ? (
            <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15, marginBottom: 4 }}>No groups yet</div>
              <div style={{ fontSize: 12, color: T.mu, marginBottom: 14 }}>Create one for your lab or research team.</div>
              <button onClick={() => setShowCreate(true)} style={{
                padding: '7px 16px', borderRadius: 9, border: 'none',
                background: T.v, color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
              }}>Create your first group →</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {myGroups.map(m => m.groups && (
                <CompactGroupCard
                  key={m.groups.id}
                  group={m.groups}
                  role={m.role}
                  memberCount={m.memberCount}
                  unreadCount={unreadCounts[m.groups.id] || 0}
                  onSelect={onGroupSelect}
                />
              ))}
            </div>
          )
        ) : (
          <>
            <input
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
              placeholder="Search by name, topic, or discipline…"
              style={{
                width: '100%', background: T.w, border: `1.5px solid ${T.bdr}`,
                borderRadius: 9, padding: '8px 12px', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', color: T.text,
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            {loadingDisc ? <Spinner/> : filteredDiscover.length === 0 ? (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '20px 16px', textAlign: 'center', fontSize: 13, color: T.mu }}>
                {discoverQuery ? 'No groups match your search.' : 'No groups to discover yet.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {filteredDiscover.map(g => (
                  <CompactGroupCard
                    key={g.id}
                    group={g}
                    role={null}
                    memberCount={g.memberCount}
                    onSelect={() => joinGroup(g)}
                    onJoin={joinGroup}
                    joining={joining === g.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Helpers used inside the desktop Discover sections.
  const renderJoinAction = (g) => (
    <button
      onClick={e => { e.stopPropagation(); joinGroup(g); }}
      disabled={joining === g.id}
      style={{
        width: '100%', padding: '7px', borderRadius: 9, fontSize: 12, fontWeight: 700,
        fontFamily: 'inherit', cursor: 'pointer',
        border: `1.5px solid ${T.v}`,
        background: g.is_public ? T.v : T.v2,
        color: g.is_public ? '#fff' : T.v,
      }}>
      {joining === g.id ? '…' : g.is_public ? '+ Join group' : '🔒 Request to join'}
    </button>
  );

  const discoverGrid = (groups) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 14,
    }}>
      {groups.map(g => (
        <GroupBadgeCard
          key={g.id}
          group={g}
          role={null}
          memberCount={g.memberCount}
          onSelect={() => joinGroup(g)}
          actionButton={renderJoinAction(g)}
        />
      ))}
    </div>
  );

  const sectionLabel = (text, count) => (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      fontSize: 11, fontWeight: 700, color: T.mu,
      textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12,
    }}>
      <span>{text}</span>
      {count != null && <span style={{ color: T.v }}>·</span>}
      {count != null && <span style={{ color: T.mu }}>{count}</span>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: T.bg }}>
      {showCreate && (
        <CreateGroupModal user={user} onGroupCreated={id => { setShowCreate(false); onGroupSelect(id); }} onClose={() => setShowCreate(false)}/>
      )}

      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text }}>Research Groups</div>
            <div style={{ fontSize: 13, color: T.mu, marginTop: 2 }}>Private spaces for labs, teams, and departments</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '9px 20px', borderRadius: 10, border: 'none',
            background: T.v, color: '#fff', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
          }}>+ Create group</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 18, marginBottom: 18,
          borderBottom: `1px solid ${T.bdr}`,
        }}>
          {[
            { id: 'mine',     label: 'My Groups', count: myGroups.length },
            { id: 'discover', label: 'Discover',  count: null },
          ].map(t => (
            <button key={t.id} onClick={() => setDesktopTab(t.id)} style={{
              padding: '10px 4px',
              border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 14, fontWeight: desktopTab === t.id ? 700 : 500,
              color: desktopTab === t.id ? T.v : T.mu,
              borderBottom: `2px solid ${desktopTab === t.id ? T.v : 'transparent'}`,
              marginBottom: -1,
            }}>
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {desktopTab === 'mine' ? (
          loadingMine ? <Spinner/> : myGroups.length === 0 ? (
            <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔬</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 6 }}>No groups yet</div>
              <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 14 }}>Create a group for your lab or research team.</div>
              <button onClick={() => setShowCreate(true)} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: T.v, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700 }}>
                Create your first group →
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 14,
            }}>
              {myGroups.map(m => m.groups && (
                <GroupBadgeCard
                  key={m.groups.id}
                  group={m.groups}
                  role={m.role}
                  memberCount={m.memberCount}
                  unreadCount={unreadCounts[m.groups.id] || 0}
                  onSelect={onGroupSelect}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {/* Search + tier filter row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <input
                value={discoverQuery}
                onChange={e => setDiscoverQuery(e.target.value)}
                placeholder="Search by name, topic, or discipline…"
                style={{
                  flex: '1 1 280px', background: T.w, border: `1.5px solid ${T.bdr}`,
                  borderRadius: 10, padding: '9px 13px', fontSize: 13,
                  fontFamily: 'inherit', outline: 'none', color: T.text,
                  boxSizing: 'border-box',
                }}
              />
              <select
                value={tier1Filter}
                onChange={e => { setTier1Filter(e.target.value); setTier2Filter(''); }}
                style={{
                  padding: '9px 12px', borderRadius: 10,
                  border: `1.5px solid ${tier1Filter ? T.v : T.bdr}`,
                  background: tier1Filter ? T.v2 : T.w,
                  color: tier1Filter ? T.v : T.text,
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">All disciplines</option>
                {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(tier1Filter || tier2Filter) && (
                <button onClick={() => { setTier1Filter(''); setTier2Filter(''); }} style={{
                  fontSize: 12, color: T.mu, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  Clear
                </button>
              )}
            </div>

            {/* Tier-2 sub-chips appear when a tier1 is picked */}
            {tier1Filter && getTier2(tier1Filter).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {getTier2(tier1Filter).map(t2 => (
                  <button
                    key={t2}
                    onClick={() => setTier2Filter(t2 === tier2Filter ? '' : t2)}
                    style={{
                      padding: '5px 11px', borderRadius: 20,
                      border: `1.5px solid ${tier2Filter === t2 ? T.v : T.bdr}`,
                      background: tier2Filter === t2 ? T.v2 : T.w,
                      color: tier2Filter === t2 ? T.v : T.mu,
                      fontFamily: 'inherit', fontSize: 12,
                      fontWeight: tier2Filter === t2 ? 700 : 500,
                      cursor: 'pointer',
                    }}>
                    {t2}
                  </button>
                ))}
              </div>
            )}

            {loadingDisc ? <Spinner/> : visibleDiscover.length === 0 ? (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.mu }}>
                  {discoverQuery || tier1Filter ? 'No groups match your filters.' : 'No groups to discover yet.'}
                </div>
              </div>
            ) : explicitFilter ? (
              // Single filtered list when the user explicitly picked a tier.
              <>
                {sectionLabel(
                  tier2Filter ? `${tier1Filter} · ${tier2Filter}` : tier1Filter,
                  visibleDiscover.length
                )}
                {discoverGrid(visibleDiscover)}
              </>
            ) : (
              // Personalised sectioning by relevance to the viewer's profile.
              <>
                {inYourField.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    {sectionLabel(`In your field — ${userTier1}`, inYourField.length)}
                    {discoverGrid(inYourField)}
                  </div>
                )}
                {relatedField.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    {sectionLabel('Related disciplines', relatedField.length)}
                    {discoverGrid(relatedField)}
                  </div>
                )}
                {otherField.length > 0 && (
                  <div>
                    {sectionLabel(
                      (inYourField.length || relatedField.length) ? 'All other groups' : 'All groups',
                      otherField.length
                    )}
                    {discoverGrid(otherField)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
