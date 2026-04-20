import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
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

      {/* Gradient strip — always, no cover image */}
      <div style={{ height: 6, background: 'linear-gradient(90deg,#667eea,#764ba2,#f093fb)' }}/>

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

export default function GroupsScreen({ user, profile, onGroupSelect }) {
  const [myGroups,      setMyGroups]      = useState([]);
  const [discover,      setDiscover]      = useState([]);
  const [loadingMine,   setLoadingMine]   = useState(true);
  const [loadingDisc,   setLoadingDisc]   = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('');
  const [joining,       setJoining]       = useState(null);
  const [unreadCounts,  setUnreadCounts]  = useState({});

  const fetchMyGroups = useCallback(async () => {
    setLoadingMine(true);
    // Try with new columns first; fall back to core columns if migration hasn't run
    let { data, error } = await supabase
      .from('group_members')
      .select(`role, last_read_at, groups(id, name, slug, avatar_url, is_public, research_topic, tier1, tier2, institution, company, country, location)`)
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

    let q = supabase.from('groups').select('id, name, slug, description, research_topic, tier1, tier2, institution, company, country, location, avatar_url, is_public').limit(30);
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
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'member' });
    setJoining(null);
    onGroupSelect(group.id);
  };

  const filteredDiscover = discover.filter(g => {
    if (!discoverQuery.trim()) return true;
    const q = discoverQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.research_topic || '').toLowerCase().includes(q) || (g.tier1 || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: T.bg }}>
      {showCreate && (
        <CreateGroupModal user={user} onGroupCreated={id => { setShowCreate(false); onGroupSelect(id); }} onClose={() => setShowCreate(false)}/>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

          {/* My Groups */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              My Groups
            </div>
            {loadingMine ? <Spinner/> : myGroups.length === 0 ? (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🔬</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 6 }}>No groups yet</div>
                <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 14 }}>Create a group for your lab or research team.</div>
                <button onClick={() => setShowCreate(true)} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: T.v, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700 }}>
                  Create your first group →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            )}
          </div>

          {/* Discover Groups */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 12 }}>
              Discover Groups
            </div>
            <input
              value={discoverQuery}
              onChange={e => setDiscoverQuery(e.target.value)}
              placeholder="Search by name, topic, or discipline…"
              style={{
                width: '100%', background: T.w, border: `1.5px solid ${T.bdr}`,
                borderRadius: 10, padding: '8px 13px', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', color: T.text,
                boxSizing: 'border-box', marginBottom: 12,
              }}
            />
            {loadingDisc ? <Spinner/> : filteredDiscover.length === 0 ? (
              <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.mu }}>
                  {discoverQuery ? 'No groups match your search.' : 'No groups to discover yet.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filteredDiscover.map(g => (
                  <GroupBadgeCard
                    key={g.id}
                    group={g}
                    role={null}
                    memberCount={g.memberCount}
                    onSelect={() => joinGroup(g)}
                    actionButton={
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
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
