import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import GroupFeed from './GroupFeed';
import GroupMembers from './GroupMembers';
import GroupProfile from './GroupProfile';

// Shown when a non-member tries to view a closed group
function JoinRequestPanel({ group, user, onBack, onJoined }) {
  const [message,   setMessage]   = useState('');
  const [sent,      setSent]      = useState(false);
  const [sending,   setSending]   = useState(false);
  const [existing,  setExisting]  = useState(false);
  const [reqError,  setReqError]  = useState('');

  useEffect(() => {
    supabase.from('group_join_requests')
      .select('id').eq('group_id', group.id).eq('user_id', user.id).eq('status', 'pending').maybeSingle()
      .then(({ data }) => { if (data) setExisting(true); });
  }, [group.id, user.id]);

  const sendRequest = async () => {
    setSending(true); setReqError('');
    const { error: upsertErr } = await supabase.from('group_join_requests').upsert({
      group_id: group.id, user_id: user.id, message: message.trim(), status: 'pending',
    }, { onConflict: 'group_id,user_id' });
    if (upsertErr) { setReqError(upsertErr.message); setSending(false); return; }
    const { data: admins } = await supabase
      .from('group_members').select('user_id').eq('group_id', group.id).eq('role', 'admin');
    if (admins?.length) {
      await supabase.from('notifications').insert(
        admins.map(a => ({
          user_id:    a.user_id,
          actor_id:   user.id,
          notif_type: 'group_join_request',
          meta:       { group_id: group.id, group_name: group.name },
        }))
      );
    }
    setSending(false); setSent(true);
  };

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <GroupAvatar group={group} size={64}/>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text, marginTop: 16, marginBottom: 6 }}>{group.name}</div>
        {group.research_topic && <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>{group.research_topic}</div>}
        <div style={{ background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 12, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: T.mu, lineHeight: 1.6 }}>
          🔒 This is a <strong>closed group</strong>. You need admin approval to join and see its posts.
        </div>
        {sent || existing ? (
          <div style={{ background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 12, padding: '14px 16px', fontSize: 13, color: T.gr, fontWeight: 600 }}>
            ✓ {existing ? 'Your request is pending.' : 'Request sent! An admin will review it.'}
          </div>
        ) : (
          <div>
            {reqError && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '9px 13px', fontSize: 12.5, color: T.ro, marginBottom: 12 }}>{reqError}</div>}
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Optional: introduce yourself or explain your interest in joining…"
              style={{
                width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
                borderRadius: 12, padding: '10px 14px', fontSize: 13,
                fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                minHeight: 80, lineHeight: 1.6, marginBottom: 12, boxSizing: 'border-box',
              }}/>
            <button onClick={sendRequest} disabled={sending} style={{
              width: '100%', padding: '11px', borderRadius: 11, border: 'none',
              background: T.v, color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            }}>
              {sending ? 'Sending request…' : 'Request to join →'}
            </button>
          </div>
        )}
        <button onClick={onBack} style={{ marginTop: 14, fontSize: 12.5, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>← Back to groups</button>
      </div>
    </div>
  );
}

// Shown when a non-member views a public group
function PublicJoinPanel({ group, user, onBack, onJoined }) {
  const [joining, setJoining] = useState(false);
  const [error,   setError]   = useState('');
  const join = async () => {
    setJoining(true); setError('');
    const { error: e } = await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'member' });
    setJoining(false);
    if (e) { setError(e.message); return; }
    onJoined();
  };
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <GroupAvatar group={group} size={64}/>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text, marginTop: 16, marginBottom: 6 }}>{group.name}</div>
        {group.research_topic && <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>{group.research_topic}</div>}
        {group.description && <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>{group.description}</div>}
        <div style={{ background: T.s2, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: T.mu }}>
          Join this group to see posts and contribute.
        </div>
        {error && <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '9px 13px', fontSize: 12.5, color: T.ro, marginBottom: 12 }}>{error}</div>}
        <button onClick={join} disabled={joining} style={{
          width: '100%', padding: '11px', borderRadius: 11, border: 'none',
          background: T.v, color: '#fff', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
        }}>
          {joining ? 'Joining…' : 'Join group →'}
        </button>
        <button onClick={onBack} style={{ marginTop: 14, fontSize: 12.5, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>← Back to groups</button>
      </div>
    </div>
  );
}

function GroupAvatar({ group, size = 48 }) {
  const initials = group.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (group.avatar_url) {
    return (
      <div style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), overflow: 'hidden', flexShrink: 0 }}>
        <img src={group.avatar_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
      background: 'linear-gradient(135deg,#667eea,#764ba2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: '#fff',
    }}>{initials}</div>
  );
}

export default function GroupScreen({ groupId, user, profile, onBack, onViewPaper, onViewGroup, onMarkRead }) {
  const [group,      setGroup]      = useState(null);
  const [myRole,     setMyRole]     = useState(null);
  const [activeTab,  setActiveTab]  = useState('feed');
  const [loading,    setLoading]    = useState(true);
  const [stats,      setStats]      = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const fetchGroup = async () => {
    const [{ data: grp }, { data: mem }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', user.id).maybeSingle(),
    ]);
    setGroup(grp);
    const role = mem?.role || null;
    setMyRole(role);

    // Live stats
    const { data: s } = await supabase.from('group_stats').select('*').eq('group_id', groupId).single();
    setStats(s);

    setLoading(false);
  };

  useEffect(() => {
    fetchGroup();
    // If tab is 'feed' but user is alumni, switch to profile
  }, [groupId]); // eslint-disable-line

  // Switch alumni away from feed tab if they somehow land there
  useEffect(() => {
    if (myRole === 'alumni' && activeTab === 'feed') setActiveTab('profile');
  }, [myRole, activeTab]);

  const leaveGroup = async () => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    onBack();
  };

  const deleteGroup = async () => {
    setDeleting(true);
    await supabase.from('groups').delete().eq('id', groupId);
    setDeleting(false);
    onBack();
  };

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner/></div>;
  if (!group) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mu }}>Group not found.</div>;

  // Non-member access
  if (!myRole) {
    if (!group.is_public) {
      return <JoinRequestPanel group={group} user={user} onBack={onBack} onJoined={fetchGroup}/>;
    }
    return <PublicJoinPanel group={group} user={user} onBack={onBack} onJoined={fetchGroup}/>;
  }

  const isAlumni = myRole === 'alumni';
  const tabs = [
    ...(!isAlumni ? [{ id: 'feed',    icon: '📋', label: 'Feed' }] : []),
    { id: 'members', icon: '👥', label: 'Members' },
    { id: 'profile', icon: '🏛️', label: 'Profile' },
  ];

  const activeMemberCount = stats?.active_member_count || 0;
  const alumniCount       = stats?.alumni_count || 0;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Group sidebar */}
      <div style={{ width: 200, flexShrink: 0, background: T.w, borderRight: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column' }}>
        {/* Breadcrumb */}
        <div onClick={onBack} style={{
          fontSize: 11, color: T.mu, cursor: 'pointer',
          padding: '8px 14px 4px', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← All groups
        </div>

        {/* Group info */}
        <div style={{ padding: '14px', borderBottom: `1px solid ${T.bdr}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <GroupAvatar group={group} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{group.name}</div>
            </div>
          </div>
          {group.research_topic && <div style={{ fontSize: 10.5, color: T.mu, lineHeight: 1.5, marginBottom: 6 }}>{group.research_topic}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, color: T.mu }}>
              {activeMemberCount} active{alumniCount > 0 ? ` · ${alumniCount} alumni` : ''}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
              background: myRole === 'admin' ? T.v : isAlumni ? T.am2 : T.s3,
              color: myRole === 'admin' ? '#fff' : isAlumni ? T.am : T.mu,
            }}>
              {myRole === 'admin' ? 'Admin' : isAlumni ? 'Alumni' : 'Member'}
            </span>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{ padding: '8px 0', flex: 1 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              width: '100%', padding: '9px 12px', margin: '1px 0',
              border: 'none', background: activeTab === t.id ? T.v2 : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? T.v : T.mu,
              textAlign: 'left',
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Leave / Delete */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${T.bdr}` }}>
          {myRole !== 'admin' && (
            <button onClick={leaveGroup} style={{
              width: '100%', padding: '7px 10px', borderRadius: 9,
              border: `1.5px solid ${T.bdr}`, background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              color: T.mu, textAlign: 'left',
            }}>↩ Leave group</button>
          )}
          {myRole === 'admin' && !confirmDel && (
            <button onClick={() => setConfirmDel(true)} style={{
              width: '100%', padding: '7px 10px', borderRadius: 9,
              border: `1.5px solid rgba(244,63,94,.3)`, background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              color: T.ro, textAlign: 'left',
            }}>🗑️ Delete group</button>
          )}
          {myRole === 'admin' && confirmDel && (
            <div>
              <div style={{ fontSize: 11.5, color: T.text, marginBottom: 8, lineHeight: 1.5 }}>Delete group and all its posts?</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: '6px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', color: T.mu }}>Cancel</button>
                <button onClick={deleteGroup} disabled={deleting} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: T.ro, cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', fontWeight: 700, color: '#fff' }}>
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.bg }}>
        {/* Content header */}
        <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,.96)', borderBottom: `1px solid ${T.bdr}`, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{group.name}</div>
          {!group.is_public && <span style={{ marginLeft: 8, fontSize: 11, color: T.mu }}>🔒 Closed group</span>}
        </div>

        {activeTab === 'feed' && !isAlumni && (
          <GroupFeed
            groupId={groupId}
            groupName={group.name}
            user={user}
            profile={profile}
            myRole={myRole}
            onViewPaper={onViewPaper}
            onMarkRead={onMarkRead}
          />
        )}
        {activeTab === 'members' && (
          <GroupMembers
            groupId={groupId}
            group={group}
            user={user}
            myRole={myRole}
            onLeft={onBack}
          />
        )}
        {activeTab === 'profile' && (
          <GroupProfile
            groupId={groupId}
            group={group}
            user={user}
            myRole={myRole}
            onGroupUpdate={fetchGroup}
            onViewGroup={onViewGroup}
            onSwitchTab={setActiveTab}
          />
        )}
      </div>
    </div>
  );
}
