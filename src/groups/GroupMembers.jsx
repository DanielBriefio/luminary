import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Av from '../components/Av';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

export default function GroupMembers({ groupId, group, user, myRole, onLeft }) {
  const [members,       setMembers]       = useState([]);
  const [alumni,        setAlumni]        = useState([]);
  const [requests,      setRequests]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [actionId,      setActionId]      = useState(null);
  const [confirmLeave,  setConfirmLeave]  = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [confirmAlumni, setConfirmAlumni] = useState(null); // { id, userId, name }
  const [showInvite,    setShowInvite]    = useState(false);
  const [activeInvite,  setActiveInvite]  = useState(null);
  const [inviteToken,   setInviteToken]   = useState('');
  const [inviteCopied,  setInviteCopied]  = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const isAdmin = myRole === 'admin';

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const [{ data: active }, { data: alum }] = await Promise.all([
      supabase.from('group_members')
        .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
        .eq('group_id', groupId).in('role', ['admin', 'member'])
        .order('joined_at', { ascending: true }),
      supabase.from('group_members')
        .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
        .eq('group_id', groupId).eq('role', 'alumni')
        .order('joined_at', { ascending: true }),
    ]);
    setMembers(active || []);
    setAlumni(alum || []);

    if (isAdmin) {
      const { data: reqs } = await supabase
        .from('group_join_requests')
        .select('*, profiles(id, name, title, institution, avatar_color, avatar_url)')
        .eq('group_id', groupId).eq('status', 'pending');
      setRequests(reqs || []);

      // Fetch latest active invite
      const { data: inv } = await supabase
        .from('group_invites').select('*').eq('group_id', groupId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (inv) { setActiveInvite(inv); setInviteToken(inv.token); }
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

  const grantAlumni = async ({ id: memberId, userId, name }) => {
    setActionId(userId);
    await supabase.from('group_members').update({ role: 'alumni' }).eq('id', memberId);
    const groupName = group?.name || '';
    await supabase.from('notifications').insert({
      user_id:    userId,
      actor_id:   user.id,
      notif_type: 'group_alumni_granted',
      target_id:  groupId,
      meta:       { group_id: groupId, group_name: groupName },
    });
    setActionId(null);
    setConfirmAlumni(null);
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
    // Notify admins
    const { data: admins } = await supabase.from('group_members').select('user_id')
      .eq('group_id', groupId).eq('role', 'admin').neq('user_id', user.id);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.user_id, actor_id: user.id, notif_type: 'group_member_left',
        target_id: groupId, meta: { group_id: groupId, group_name: group?.name || '' },
      })));
    }
    onLeft?.();
  };

  const approveRequest = async (req) => {
    setActionId(req.user_id);
    await supabase.from('group_members').insert({ group_id: groupId, user_id: req.user_id, role: 'member' });
    await supabase.from('group_join_requests').update({ status: 'approved' }).eq('id', req.id);
    const groupName = group?.name || '';
    await supabase.from('notifications').insert({
      user_id: req.user_id, actor_id: user.id,
      notif_type: 'group_request_approved',
      meta: { group_id: groupId, group_name: groupName },
    });
    // Notify other admins
    const { data: admins } = await supabase.from('group_members').select('user_id')
      .eq('group_id', groupId).eq('role', 'admin').neq('user_id', user.id);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.user_id, actor_id: req.user_id, notif_type: 'group_member_joined',
        target_id: groupId, meta: { group_id: groupId, group_name: groupName },
      })));
    }
    setActionId(null);
    fetchMembers();
  };

  const rejectRequest = async (req) => {
    await supabase.from('group_join_requests').update({ status: 'rejected' }).eq('id', req.id);
    fetchMembers();
  };

  const generateInviteLink = async () => {
    setInviteLoading(true);
    const { data } = await supabase.from('group_invites')
      .insert({ group_id: groupId, created_by: user.id }).select().single();
    if (data) { setActiveInvite(data); setInviteToken(data.token); }
    setInviteLoading(false);
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}?join_token=${inviteToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    });
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

      {/* Invite panel (admin only) */}
      {isAdmin && (
        <div style={{ background: T.s2, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showInvite ? 12 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Invite members</div>
            <button onClick={() => setShowInvite(v => !v)} style={{
              fontSize: 12, color: T.v, fontWeight: 600, border: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {showInvite ? 'Hide ▲' : 'Show ▼'}
            </button>
          </div>
          {showInvite && (
            <>
              <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 8, lineHeight: 1.5 }}>
                Share this link — it expires in 7 days and can be used up to 10 times:
              </div>
              {inviteToken ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{
                      flex: 1, fontSize: 12, fontFamily: 'monospace',
                      background: T.w, border: `1px solid ${T.bdr}`,
                      borderRadius: 8, padding: '8px 12px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {`${window.location.origin}?join_token=${inviteToken}`}
                    </div>
                    <Btn onClick={copyInviteLink}>{inviteCopied ? 'Copied ✓' : 'Copy'}</Btn>
                    <Btn onClick={generateInviteLink} disabled={inviteLoading}>New link</Btn>
                  </div>
                  {activeInvite && (
                    <div style={{ fontSize: 11.5, color: T.mu, marginTop: 6 }}>
                      Used {activeInvite.use_count} / {activeInvite.max_uses} times
                      · Expires {new Date(activeInvite.expires_at).toLocaleDateString()}
                    </div>
                  )}
                </>
              ) : (
                <Btn variant="s" onClick={generateInviteLink} disabled={inviteLoading}>
                  {inviteLoading ? 'Generating…' : 'Generate invite link'}
                </Btn>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Alumni grant confirmation modal */}
      {confirmAlumni && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans',sans-serif",
        }}>
          <div style={{ background: T.w, borderRadius: 16, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 10px 40px rgba(0,0,0,.15)' }}>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, marginBottom: 8 }}>Move to alumni?</div>
            <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: 20 }}>
              This will remove <strong>{confirmAlumni.name}'s</strong> access to the group feed.
              They will still be able to view the group profile. Continue?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmAlumni(null)} style={{
                padding: '8px 16px', borderRadius: 20, border: `1px solid ${T.bdr}`,
                background: T.w, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit', color: T.mu,
              }}>Cancel</button>
              <button onClick={() => grantAlumni(confirmAlumni)} style={{
                padding: '8px 16px', borderRadius: 20, border: 'none',
                background: T.am, color: '#fff', cursor: 'pointer',
                fontSize: 12.5, fontFamily: 'inherit', fontWeight: 700,
              }}>Grant alumni status</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Members */}
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.mu, marginBottom: 4 }}>
          Active members ({members.length})
        </div>
        {members.length === 0 ? (
          <div style={{ fontSize: 13, color: T.mu, padding: '20px 0', textAlign: 'center' }}>No active members yet.</div>
        ) : members.map(m => (
          <MemberCard
            key={m.id}
            m={m}
            user={user}
            myRole={myRole}
            isAdmin={isAdmin}
            actionId={actionId}
            confirmRemove={confirmRemove}
            confirmLeave={confirmLeave}
            setConfirmLeave={setConfirmLeave}
            setConfirmRemove={setConfirmRemove}
            setConfirmAlumni={setConfirmAlumni}
            onSetRole={setRole}
            onRemove={removeFromGroup}
            onLeave={leaveGroup}
          />
        ))}
      </div>

      {/* Alumni */}
      {(alumni.length > 0 || isAdmin) && (
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.mu, marginBottom: 4 }}>
            Alumni ({alumni.length})
          </div>
          {alumni.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mu, padding: '12px 0', textAlign: 'center' }}>No alumni yet.</div>
          ) : alumni.map(m => (
            <AlumniCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberCard({ m, user, myRole, isAdmin, actionId, confirmRemove, confirmLeave,
  setConfirmLeave, setConfirmRemove, setConfirmAlumni, onSetRole, onRemove, onLeave }) {
  const isMe = m.user_id === user.id;
  const p = m.profiles || {};
  const busy = actionId === m.user_id;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.bdr}` }}>
      <Av color={p.avatar_color || 'me'} size={38} name={p.name} url={p.avatar_url || ''}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name || 'Member'}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
            background: m.role === 'admin' ? T.v : T.s3,
            color: m.role === 'admin' ? '#fff' : T.mu,
          }}>{m.role === 'admin' ? 'Admin' : 'Member'}</span>
          {m.display_role && (
            <span style={{ fontSize: 10.5, color: T.mu }}>{m.display_role}</span>
          )}
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
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {m.role === 'member' && (
            <button onClick={() => onSetRole(m.user_id, 'admin')} disabled={busy} style={smallBtnStyle(T.v)}>
              {busy ? '…' : 'Make admin'}
            </button>
          )}
          {m.role === 'admin' && (
            <button onClick={() => onSetRole(m.user_id, 'member')} disabled={busy} style={smallBtnStyle(T.mu)}>
              {busy ? '…' : 'Demote'}
            </button>
          )}
          <button onClick={() => setConfirmAlumni({ id: m.id, userId: m.user_id, name: p.name || 'this member' })}
            style={smallBtnStyle(T.am)}>Alumni</button>
          {confirmRemove === m.user_id ? (
            <>
              <button onClick={() => onRemove(m.user_id)} disabled={busy} style={smallBtnStyle(T.ro)}>Confirm</button>
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
            <button onClick={onLeave} style={smallBtnStyle(T.ro)}>Confirm leave</button>
            <button onClick={() => setConfirmLeave(false)} style={smallBtnStyle(T.mu)}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmLeave(true)} style={smallBtnStyle(T.ro)}>Leave group</button>
        )
      )}
    </div>
  );
}

function AlumniCard({ m }) {
  const p = m.profiles || {};
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${T.bdr}`, opacity: 0.75 }}>
      <Av color={p.avatar_color || 'me'} size={38} name={p.name} url={p.avatar_url || ''}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name || 'Alumni'}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
            background: T.am2, color: T.am,
          }}>Alumni</span>
        </div>
        {(p.title || p.institution) && (
          <div style={{ fontSize: 11, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[p.title, p.institution].filter(Boolean).join(' · ')}
          </div>
        )}
        {m.joined_at && <div style={{ fontSize: 10.5, color: T.bdr, marginTop: 2 }}>Joined {timeAgo(m.joined_at)}</div>}
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
