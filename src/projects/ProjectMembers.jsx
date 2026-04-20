import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

export default function ProjectMembers({ project, user, myRole }) {
  const [members,       setMembers]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [groupMembers,  setGroupMembers]  = useState([]);
  const [showAddPanel,  setShowAddPanel]  = useState(false);
  const [adding,        setAdding]        = useState(null);

  const isOwner = myRole === 'owner';
  const memberIds = new Set(members.map(m => m.user_id));

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('project_members')
      .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
      .eq('project_id', project.id)
      .order('joined_at');
    setMembers(data || []);
    setLoading(false);
  };

  const fetchGroupMembers = async () => {
    if (!project.group_id) return;
    const { data } = await supabase
      .from('group_members')
      .select('user_id, profiles(id, name, title, institution, avatar_color, avatar_url)')
      .eq('group_id', project.group_id)
      .in('role', ['admin', 'member']);
    setGroupMembers(data || []);
  };

  useEffect(() => {
    fetchMembers();
    fetchGroupMembers();
  }, [project.id]); // eslint-disable-line

  const addMember = async (userId) => {
    setAdding(userId);
    await supabase.from('project_members').insert({ project_id: project.id, user_id: userId, role: 'member' });
    setAdding(null);
    fetchMembers();
  };

  const removeMember = async (memberId) => {
    await supabase.from('project_members').delete().eq('id', memberId);
    fetchMembers();
  };

  const eligible = groupMembers.filter(gm => !memberIds.has(gm.user_id));

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner/></div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18 }}>
          Members <span style={{ fontSize: 13, fontWeight: 400, color: T.mu, fontFamily: 'inherit' }}>({members.length})</span>
        </div>
        {isOwner && project.group_id && eligible.length > 0 && (
          <button onClick={() => setShowAddPanel(p => !p)} style={{
            padding: '6px 14px', borderRadius: 9, border: `1.5px solid ${T.v}`,
            background: T.v2, color: T.v, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700,
          }}>
            + Add member
          </button>
        )}
      </div>

      {/* Add from group panel */}
      {showAddPanel && (
        <div style={{
          background: T.s2, borderRadius: 12, padding: '12px 14px', marginBottom: 16,
          border: `1px solid ${T.bdr}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.mu, marginBottom: 10 }}>
            Add from group members
          </div>
          {eligible.map(gm => (
            <div key={gm.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Av color={gm.profiles?.avatar_color} url={gm.profiles?.avatar_url} name={gm.profiles?.name} size={30}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{gm.profiles?.name}</div>
                <div style={{ fontSize: 11, color: T.mu }}>{gm.profiles?.title || gm.profiles?.institution || ''}</div>
              </div>
              <button onClick={() => addMember(gm.user_id)} disabled={adding === gm.user_id} style={{
                padding: '4px 12px', borderRadius: 8, border: 'none',
                background: T.v, color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              }}>
                {adding === gm.user_id ? '…' : 'Add'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Member list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {members.map(m => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: T.w, borderRadius: 12, padding: '12px 14px',
            border: `1px solid ${T.bdr}`,
          }}>
            <Av color={m.profiles?.avatar_color} url={m.profiles?.avatar_url} name={m.profiles?.name} size={36}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.profiles?.name}</div>
              <div style={{ fontSize: 11, color: T.mu }}>{m.profiles?.title || m.profiles?.institution || ''}</div>
            </div>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: m.role === 'owner' ? T.v2 : T.s3,
              color: m.role === 'owner' ? T.v : T.mu,
            }}>
              {m.role === 'owner' ? 'Owner' : 'Member'}
            </span>
            {isOwner && m.user_id !== user.id && (
              <button onClick={() => removeMember(m.id)} style={{
                fontSize: 11, color: T.ro, border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px',
              }}>Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
