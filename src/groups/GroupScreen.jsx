import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import GroupFeed from './GroupFeed';
import GroupMembers from './GroupMembers';

function GroupInitials({ name, size = 48 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 14, flexShrink: 0,
      background: 'linear-gradient(135deg,#667eea,#764ba2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.3, fontWeight: 700, color: '#fff',
    }}>{initials}</div>
  );
}

// Shown when a non-member tries to view a closed group
function JoinRequestPanel({ group, user, onBack, onJoined }) {
  const [message,   setMessage]   = useState('');
  const [sent,      setSent]      = useState(false);
  const [sending,   setSending]   = useState(false);
  const [existing,  setExisting]  = useState(false);

  useEffect(() => {
    supabase.from('group_join_requests')
      .select('id').eq('group_id', group.id).eq('user_id', user.id).eq('status', 'pending').maybeSingle()
      .then(({ data }) => { if (data) setExisting(true); });
  }, [group.id, user.id]);

  const sendRequest = async () => {
    setSending(true);
    await supabase.from('group_join_requests').upsert({
      group_id: group.id, user_id: user.id, message: message.trim(), status: 'pending',
    }, { onConflict: 'group_id,user_id' });
    setSending(false); setSent(true);
  };

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <GroupInitials name={group.name} size={64}/>
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

// Shown when a non-member views a public group (can see the name/info, must join to see posts)
function PublicJoinPanel({ group, user, onBack, onJoined }) {
  const [joining, setJoining] = useState(false);
  const join = async () => {
    setJoining(true);
    await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'member' });
    setJoining(false);
    onJoined();
  };
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <GroupInitials name={group.name} size={64}/>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text, marginTop: 16, marginBottom: 6 }}>{group.name}</div>
        {group.research_topic && <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>{group.research_topic}</div>}
        {group.description && <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>{group.description}</div>}
        <div style={{ background: T.s2, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: T.mu }}>
          Join this group to see posts and contribute.
        </div>
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

export default function GroupScreen({ groupId, user, profile, onBack, onViewPaper }) {
  const [group,      setGroup]      = useState(null);
  const [myRole,     setMyRole]     = useState(null);    // 'admin' | 'member' | null
  const [activeTab,  setActiveTab]  = useState('feed');
  const [loading,    setLoading]    = useState(true);
  const [memberCount,setMemberCount]= useState(0);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const fetchGroup = async () => {
    const [{ data: grp }, { data: mem }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).single(),
      supabase.from('group_members').select('role').eq('group_id', groupId).eq('user_id', user.id).maybeSingle(),
    ]);
    setGroup(grp);
    setMyRole(mem?.role || null);

    // Member count
    const { count } = await supabase.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId).in('role', ['admin', 'member']);
    setMemberCount(count || 0);
    setLoading(false);
  };

  useEffect(() => { fetchGroup(); }, [groupId]); // eslint-disable-line

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

  const tabs = [
    { id: 'feed',    icon: '📋', label: 'Feed' },
    { id: 'members', icon: '👥', label: 'Members' },
  ];

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Group sidebar */}
      <div style={{ width: 200, flexShrink: 0, background: T.w, borderRight: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column' }}>
        {/* Back */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bdr}` }}>
          <button onClick={onBack} style={{ fontSize: 12, color: T.v, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0 }}>← All groups</button>
        </div>

        {/* Group info */}
        <div style={{ padding: '14px', borderBottom: `1px solid ${T.bdr}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg,#667eea,#764ba2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
              {group.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{group.name}</div>
            </div>
          </div>
          {group.research_topic && <div style={{ fontSize: 10.5, color: T.mu, lineHeight: 1.5, marginBottom: 6 }}>{group.research_topic}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: T.mu }}>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
              background: myRole === 'admin' ? T.v : T.s3,
              color: myRole === 'admin' ? '#fff' : T.mu,
            }}>{myRole === 'admin' ? 'Admin' : 'Member'}</span>
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

        {activeTab === 'feed' && (
          <GroupFeed
            groupId={groupId}
            groupName={group.name}
            user={user}
            profile={profile}
            myRole={myRole}
            onViewPaper={onViewPaper}
          />
        )}
        {activeTab === 'members' && (
          <GroupMembers
            groupId={groupId}
            user={user}
            myRole={myRole}
            onLeft={onBack}
          />
        )}
      </div>
    </div>
  );
}
