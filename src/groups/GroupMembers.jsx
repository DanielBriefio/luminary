import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

export default function GroupMembers({ groupId, user, myRole, onLeft }) {
  const [members,      setMembers]      = useState([]);
  const [requests,     setRequests]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [actionId,     setActionId]     = useState(null);  // userId being actioned
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove,setConfirmRemove]= useState(null);  // userId

  const isAdmin = myRole === 'admin';

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('group_members')
      .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
      .eq('group_id', groupId)
      .in('role', ['admin', 'member'])
      .order('joined_at', { ascending: true });
    setMembers(data || []);

    if (isAdmin) {
      const { data: reqs } = await supabase
        .from('group_join_requests')
        .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
        .eq('group_id', groupId)
        .eq('status', 'pending');
      setRequests(reqs || []);
    }

    setLoading(false);
  }, [groupId, isAdmin]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const setRole = async (userId, role) => {
    setActionId(userId);
    await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
    setActionId(null);
    fetchMembers();
  };

  const removeFromGroup = async (userId) => {
    setActionId(userId);
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
    setActionId(null); setConfirmRemove(null);
    fetchMembers();
  };

  const leaveGroup = async () => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    onLeft?.();
  };

  const approveRequest = async (req) => {
    setActionId(req.user_id);
    await supabase.from('group_members').insert({ group_id: groupId, user_id: req.user_id, role: 'member' });
    await supabase.from('group_join_requests').update({ status: 'approved' }).eq('id', req.id);
    // Notify the approved user
    const { data: grp } = await supabase.from('groups').select('name').eq('id', groupId).single();
    await supabase.from('notifications').insert({
      user_id:    req.user_id,
      actor_id:   user.id,
      notif_type: 'group_request_approved',
      meta:       { group_id: groupId, group_name: grp?.name || '' },
    });
    setActionId(null);
    fetchMembers();
  };

  const rejectRequest = async (req) => {
    await supabase.from('group_join_requests').update({ status: 'rejected' }).eq('id', req.id);
    fetchMembers();
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>;

  const MemberCard = ({ m }) => {
    const isMe = m.user_id === user.id;
    const p = m.profiles || {};
    const busy = actionId === m.user_id;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.bdr}` }}>
        <Av color={p.avatar_color || 'me'} size={38} name={p.name} url={p.avatar_url || ''}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name || 'Member'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
              background: m.role === 'admin' ? T.v : T.s3,
              color: m.role === 'admin' ? '#fff' : T.mu,
            }}>{m.display_role || (m.role === 'admin' ? 'Admin' : 'Member')}</span>
            {isMe && <span style={{ fontSize: 10, color: T.mu }}>(you)</span>}
          </div>
          {(p.title || p.institution) && (
            <div style={{ fontSize: 11, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[p.title, p.institution].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ fontSize: 10.5, color: T.bdr, marginTop: 2 }}>Joined {timeAgo(m.joined_at)}</div>
        </div>

        {/* Admin controls */}
        {isAdmin && !isMe && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {m.role === 'member' && (
              <button onClick={() => setRole(m.user_id, 'admin')} disabled={busy} style={smallBtnStyle(T.v)}>
                {busy ? '…' : 'Make admin'}
              </button>
            )}
            {m.role === 'admin' && (
              <button onClick={() => setRole(m.user_id, 'member')} disabled={busy} style={smallBtnStyle(T.mu)}>
                {busy ? '…' : 'Demote'}
              </button>
            )}
            {confirmRemove === m.user_id ? (
              <>
                <button onClick={() => removeFromGroup(m.user_id)} disabled={busy} style={smallBtnStyle(T.ro)}>Confirm remove</button>
                <button onClick={() => setConfirmRemove(null)} style={smallBtnStyle(T.mu)}>Cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmRemove(m.user_id)} style={smallBtnStyle(T.ro)}>Remove</button>
            )}
          </div>
        )}

        {/* Leave button for self (non-admin) */}
        {isMe && myRole !== 'admin' && (
          confirmLeave ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={leaveGroup} style={smallBtnStyle(T.ro)}>Confirm leave</button>
              <button onClick={() => setConfirmLeave(false)} style={smallBtnStyle(T.mu)}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmLeave(true)} style={smallBtnStyle(T.ro)}>Leave group</button>
          )
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

      {/* Pending join requests (admin only) */}
      {isAdmin && requests.length > 0 && (
        <div style={{ background: T.am2, border: `1px solid ${T.am}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.am, marginBottom: 12 }}>
            🔔 {requests.length} pending {requests.length === 1 ? 'request' : 'requests'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(req => {
              const p = req.profiles || {};
              return (
                <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.w, borderRadius: 10, padding: '10px 12px' }}>
                  <Av color={p.avatar_color || 'me'} size={34} name={p.name} url={p.avatar_url || ''}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{p.name || 'Researcher'}</div>
                    {p.institution && <div style={{ fontSize: 11, color: T.mu }}>{p.institution}</div>}
                    {req.message && <div style={{ fontSize: 11, color: T.mu, marginTop: 3, fontStyle: 'italic' }}>"{req.message}"</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => approveRequest(req)} disabled={actionId === req.user_id} style={smallBtnStyle(T.gr)}>
                      {actionId === req.user_id ? '…' : 'Approve'}
                    </button>
                    <button onClick={() => rejectRequest(req)} style={smallBtnStyle(T.mu)}>Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Members list */}
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.mu, marginBottom: 4 }}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </div>
        {members.length === 0 ? (
          <div style={{ fontSize: 13, color: T.mu, padding: '20px 0', textAlign: 'center' }}>No members yet.</div>
        ) : members.map(m => <MemberCard key={m.id} m={m}/>)}
      </div>
    </div>
  );
}

function smallBtnStyle(color) {
  return {
    padding: '5px 12px', borderRadius: 20,
    border: `1.5px solid ${color}`, background: 'transparent',
    color, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 11.5, fontWeight: 700, flexShrink: 0,
    transition: 'background .12s',
  };
}
