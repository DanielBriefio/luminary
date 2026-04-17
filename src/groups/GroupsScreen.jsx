import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import CreateGroupModal from './CreateGroupModal';

function GroupInitials({ name, size = 46 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      background: 'linear-gradient(135deg,#667eea,#764ba2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: '#fff',
    }}>{initials}</div>
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

  const fetchMyGroups = useCallback(async () => {
    setLoadingMine(true);
    const { data } = await supabase
      .from('group_members')
      .select(`role, display_role, groups(id, name, description, research_topic, is_public, avatar_url)`)
      .eq('user_id', user.id)
      .in('role', ['admin', 'member']);

    // Enrich with member count
    const rows = data || [];
    const groupIds = rows.map(r => r.groups?.id).filter(Boolean);
    let countMap = {};
    if (groupIds.length) {
      const { data: members } = await supabase
        .from('group_members')
        .select('group_id')
        .in('group_id', groupIds)
        .in('role', ['admin', 'member']);
      (members || []).forEach(m => { countMap[m.group_id] = (countMap[m.group_id] || 0) + 1; });
    }

    setMyGroups(rows.map(r => ({ ...r, memberCount: countMap[r.groups?.id] || 0 })));
    setLoadingMine(false);
  }, [user.id]);

  const fetchDiscover = useCallback(async () => {
    setLoadingDisc(true);
    const { data: myMemberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);
    const myIds = (myMemberships || []).map(r => r.group_id);

    let q = supabase.from('groups').select('*').limit(40);
    if (myIds.length) q = q.not('id', 'in', `(${myIds.join(',')})`);

    const { data: groups } = await q;
    const gs = groups || [];
    const gids = gs.map(g => g.id);
    let countMap = {};
    if (gids.length) {
      const { data: members } = await supabase
        .from('group_members').select('group_id').in('group_id', gids).in('role', ['admin', 'member']);
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

  const handleGroupCreated = (groupId) => {
    setShowCreate(false);
    onGroupSelect(groupId);
  };

  const filteredDiscover = discover.filter(g => {
    if (!discoverQuery.trim()) return true;
    const q = discoverQuery.toLowerCase();
    return g.name.toLowerCase().includes(q) || (g.research_topic || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px', background: T.bg }}>
      {showCreate && (
        <CreateGroupModal user={user} onGroupCreated={handleGroupCreated} onClose={() => setShowCreate(false)}/>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
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
                <button onClick={() => setShowCreate(true)} style={{
                  padding: '8px 18px', borderRadius: 9, border: 'none',
                  background: T.v, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
                }}>Create your first group →</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {myGroups.map(({ role, groups: g, memberCount }) => g && (
                  <button key={g.id} onClick={() => onGroupSelect(g.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 14, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${role === 'admin' ? 'rgba(108,99,255,.3)' : T.bdr}`,
                    background: role === 'admin' ? `linear-gradient(135deg,${T.v2},${T.bl2})` : T.w,
                    fontFamily: 'inherit', transition: 'box-shadow .15s', width: '100%',
                  }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(108,99,255,.15)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <GroupInitials name={g.name}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>{g.name}</div>
                      {g.research_topic && <div style={{ fontSize: 11, color: T.mu, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.research_topic}</div>}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10.5, color: T.mu }}>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                          background: role === 'admin' ? T.v : T.s3,
                          color: role === 'admin' ? '#fff' : T.mu,
                        }}>{role === 'admin' ? 'Admin' : 'Member'}</span>
                        {!g.is_public && <span style={{ fontSize: 10, color: T.mu }}>🔒 Closed</span>}
                      </div>
                    </div>
                    <span style={{ color: T.mu, fontSize: 14, flexShrink: 0 }}>→</span>
                  </button>
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
              placeholder="Search by name or topic…"
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredDiscover.map(g => (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 14, borderRadius: 14,
                    border: `1px solid ${T.bdr}`, background: T.w,
                  }}>
                    <GroupInitials name={g.name}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>{g.name}</div>
                      {g.research_topic && <div style={{ fontSize: 11, color: T.mu, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.research_topic}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10.5, color: T.mu }}>{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}</span>
                        {!g.is_public && <span style={{ fontSize: 10, color: T.mu }}>🔒 Closed</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => joinGroup(g)}
                      disabled={joining === g.id}
                      style={{
                        padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${T.v}`,
                        background: g.is_public ? T.v : T.w, color: g.is_public ? '#fff' : T.v,
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, flexShrink: 0,
                        opacity: joining === g.id ? .6 : 1,
                      }}>
                      {joining === g.id ? '…' : g.is_public ? 'Join' : 'View →'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
