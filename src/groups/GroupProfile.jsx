import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

export default function GroupProfile({ groupId, group, user, myRole, onGroupUpdate, onViewGroup, onSwitchTab }) {
  const [stats,         setStats]         = useState(null);
  const [leader,        setLeader]        = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Edit mode
  const [editing,      setEditing]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editDesc,     setEditDesc]     = useState('');
  const [editTopic,    setEditTopic]    = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editEmail,    setEditEmail]    = useState('');
  const [editWebsite,  setEditWebsite]  = useState('');
  const [editDispRole, setEditDispRole] = useState('');
  const [editCollabs,  setEditCollabs]  = useState([]);
  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults,setCollabResults]= useState([]);

  // Image uploads
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading,  setCoverUploading]  = useState(false);
  const [uploadError,     setUploadError]     = useState('');
  const avatarRef = useRef();
  const coverRef  = useRef();

  const isAdmin = myRole === 'admin';
  const isAlumni = myRole === 'alumni';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [statsRes, leaderRes] = await Promise.all([
        supabase.from('group_stats').select('*').eq('group_id', groupId).single(),
        supabase.from('group_members')
          .select('display_role, profiles(name, avatar_url, avatar_color, title)')
          .eq('group_id', groupId).eq('role', 'admin').limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setStats(statsRes.data);
      setLeader(leaderRes.data);

      // Fetch collaborating groups
      const ids = (group.collaborating_groups || []).map(g => g.id).filter(Boolean);
      if (ids.length) {
        const { data } = await supabase.from('groups').select('id, name, research_topic, avatar_url').in('id', ids);
        setCollaborators(data || []);
      } else {
        setCollaborators([]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [groupId, group]);

  const startEdit = async () => {
    setEditName(group.name || '');
    setEditDesc(group.description || '');
    setEditTopic(group.research_topic || '');
    setEditLocation(group.location || '');
    setEditEmail(group.contact_email || '');
    setEditWebsite(group.website_url || '');
    setEditCollabs(group.collaborating_groups || []);
    // Fetch current admin's display_role
    const { data: mem } = await supabase
      .from('group_members').select('display_role')
      .eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
    setEditDispRole(mem?.display_role || '');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setCollabSearch(''); setCollabResults([]); };

  const saveEdit = async () => {
    setSaving(true);
    await supabase.from('groups').update({
      name:                 editName,
      description:          editDesc,
      research_topic:       editTopic,
      location:             editLocation,
      contact_email:        editEmail,
      website_url:          editWebsite,
      collaborating_groups: editCollabs,
    }).eq('id', groupId);
    await supabase.from('group_members').update({ display_role: editDispRole })
      .eq('group_id', groupId).eq('user_id', user.id);
    setSaving(false);
    setEditing(false);
    setCollabSearch(''); setCollabResults([]);
    onGroupUpdate?.();
  };

  const searchCollabs = async (q) => {
    setCollabSearch(q);
    if (!q.trim()) { setCollabResults([]); return; }
    const { data } = await supabase.from('groups').select('id, name, research_topic')
      .ilike('name', `%${q}%`).neq('id', groupId).limit(5);
    setCollabResults(data || []);
  };

  const addCollab = (g) => {
    if (!editCollabs.find(c => c.id === g.id)) {
      setEditCollabs(prev => [...prev, { id: g.id, name: g.name }]);
    }
    setCollabSearch(''); setCollabResults([]);
  };

  const removeCollab = (id) => setEditCollabs(prev => prev.filter(c => c.id !== id));

  const uploadAvatar = async (file) => {
    if (!file) return;
    setAvatarUploading(true);
    setUploadError('');
    const ext  = file.name.split('.').pop();
    const path = `group-avatars/${groupId}.${ext}`;
    const { data: upData, error: uploadErr } = await supabase.storage
      .from('post-files').upload(path, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      setUploadError(`Avatar upload failed: ${uploadErr.message}`);
      setAvatarUploading(false);
      return;
    }
    const { data } = supabase.storage.from('post-files').getPublicUrl(upData.path);
    await supabase.from('groups').update({ avatar_url: data.publicUrl }).eq('id', groupId);
    setAvatarUploading(false);
    onGroupUpdate?.();
  };

  const uploadCover = async (file) => {
    if (!file) return;
    setCoverUploading(true);
    setUploadError('');
    const ext  = file.name.split('.').pop();
    const path = `group-covers/${groupId}.${ext}`;
    const { data: upData, error: uploadErr } = await supabase.storage
      .from('post-files').upload(path, file, { contentType: file.type, upsert: true });
    if (uploadErr) {
      setUploadError(`Cover upload failed: ${uploadErr.message}`);
      setCoverUploading(false);
      return;
    }
    const { data } = supabase.storage.from('post-files').getPublicUrl(upData.path);
    await supabase.from('groups').update({ cover_url: data.publicUrl }).eq('id', groupId);
    setCoverUploading(false);
    onGroupUpdate?.();
  };

  const removeSelf = async () => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    onGroupUpdate?.();
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>;

  const leaderProfile = leader?.profiles || {};

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* Cover image */}
      <div style={{ position: 'relative', height: 160, background: 'linear-gradient(135deg,#667eea,#764ba2)', overflow: 'hidden' }}>
        {group.cover_url && (
          <img src={group.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        )}
        {editing && (
          <>
            <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => uploadCover(e.target.files[0])}/>
            <button onClick={() => coverRef.current?.click()} disabled={coverUploading} style={{
              position: 'absolute', bottom: 8, right: 8,
              padding: '5px 12px', borderRadius: 20, border: 'none',
              background: 'rgba(0,0,0,.5)', color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700,
            }}>
              {coverUploading ? 'Uploading…' : '📷 Change cover'}
            </button>
          </>
        )}
      </div>

      {/* Avatar overlapping cover */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -36 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 18, overflow: 'hidden',
              border: `3px solid ${T.w}`, background: 'linear-gradient(135deg,#667eea,#764ba2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 700, color: '#fff',
            }}>
              {group.avatar_url
                ? <img src={group.avatar_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                : group.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
              }
            </div>
            {editing && (
              <>
                <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={e => uploadAvatar(e.target.files[0])}/>
                <button onClick={() => avatarRef.current?.click()} disabled={avatarUploading} style={{
                  position: 'absolute', bottom: 0, right: -4,
                  width: 22, height: 22, borderRadius: '50%', border: `2px solid ${T.w}`,
                  background: T.v, color: '#fff', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {avatarUploading ? '…' : '✏'}
                </button>
              </>
            )}
          </div>
          {isAdmin && !editing && (
            <button onClick={startEdit} style={{
              padding: '7px 16px', borderRadius: 20,
              border: `1.5px solid ${T.bdr}`, background: T.w,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: T.mu,
            }}>
              Edit profile
            </button>
          )}
          {editing && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelEdit} style={{
                padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${T.bdr}`,
                background: T.w, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: T.mu,
              }}>Cancel</button>
              <button onClick={saveEdit} disabled={saving} style={{
                padding: '7px 16px', borderRadius: 20, border: 'none',
                background: T.v, color: '#fff', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          )}
        </div>

        {uploadError && (
          <div style={{
            background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 10,
            padding: '10px 14px', marginTop: 10, fontSize: 12.5, color: T.ro,
          }}>
            {uploadError}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {/* Name */}
          {editing ? (
            <input value={editName} onChange={e => setEditName(e.target.value)}
              style={inputStyle} placeholder="Group name"/>
          ) : (
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text, marginBottom: 2 }}>
              {group.name}
            </div>
          )}

          {/* Research topic */}
          {editing ? (
            <input value={editTopic} onChange={e => setEditTopic(e.target.value)}
              style={{ ...inputStyle, marginTop: 6 }} placeholder="Research focus area"/>
          ) : group.research_topic ? (
            <div style={{ fontSize: 13, color: T.v, fontWeight: 600, marginBottom: 8 }}>{group.research_topic}</div>
          ) : null}

          {/* Contact row */}
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                style={inputStyle} placeholder="📍 Location (e.g. Tokyo, Japan)"/>
              <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)}
                style={inputStyle} placeholder="🌐 Website URL"/>
              <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                style={inputStyle} placeholder="✉️ Contact email"/>
              <input value={editDispRole} onChange={e => setEditDispRole(e.target.value)}
                style={inputStyle} placeholder="Your display role (e.g. PI, Lab Director)"/>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginBottom: 8 }}>
              {group.location && <span style={{ fontSize: 12, color: T.mu }}>📍 {group.location}</span>}
              {group.website_url && (
                <a href={group.website_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: T.v, textDecoration: 'none', fontWeight: 600 }}>
                  🌐 Website
                </a>
              )}
              {group.contact_email && (
                <a href={`mailto:${group.contact_email}`}
                  style={{ fontSize: 12, color: T.v, textDecoration: 'none', fontWeight: 600 }}>
                  ✉️ {group.contact_email}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Alumni banner */}
        {isAlumni && (
          <div style={{
            background: T.am2, border: `1px solid ${T.am}`, borderRadius: 12,
            padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, fontSize: 13, color: T.text }}>
              You are an <strong>alumni</strong> of this group.
            </div>
            <button onClick={removeSelf} style={{
              padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${T.am}`,
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 11.5, fontWeight: 700, color: T.am, flexShrink: 0,
            }}>
              Remove myself
            </button>
          </div>
        )}

        {/* Leader */}
        {(leader || editing) && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Group leader</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Av color={leaderProfile.avatar_color || 'me'} size={38} name={leaderProfile.name} url={leaderProfile.avatar_url || ''}/>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{leaderProfile.name || 'Admin'}</div>
                <div style={{ fontSize: 11.5, color: T.mu }}>
                  {leader?.display_role || leaderProfile.title || 'Group Admin'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel>Stats</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {[
              [stats?.active_member_count || 0, 'Members', 'members'],
              [stats?.alumni_count || 0,        'Alumni',  'members'],
              [0,                                'Publications', null],
            ].map(([count, label, tab]) => (
              <div key={label}
                onClick={() => tab && onSwitchTab?.('members')}
                style={{
                  background: T.s2, borderRadius: 10, padding: '10px 16px', textAlign: 'center',
                  cursor: tab ? 'pointer' : 'default',
                }}>
                <div style={{
                  fontSize: 20, fontWeight: 700,
                  fontFamily: "'DM Serif Display',serif", color: T.v,
                }}>{count}</div>
                <div style={{
                  fontSize: 10.5, color: T.mu, textTransform: 'uppercase',
                  letterSpacing: '.05em', fontWeight: 600, marginTop: 2,
                }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* About / Description */}
        {(group.description || editing) && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>About</SectionLabel>
            {editing ? (
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)}
                placeholder="Group description…"
                style={{
                  width: '100%', boxSizing: 'border-box', background: T.s2,
                  border: `1.5px solid ${T.bdr}`, borderRadius: 10, padding: '10px 12px',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  resize: 'vertical', minHeight: 80, lineHeight: 1.6, color: T.text,
                }}/>
            ) : (
              <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.7 }}>{group.description}</div>
            )}
          </div>
        )}

        {/* Collaborating groups */}
        {(collaborators.length > 0 || editing) && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Collaborating groups</SectionLabel>
            {editing && (
              <div style={{ marginBottom: 8, position: 'relative' }}>
                <input value={collabSearch} onChange={e => searchCollabs(e.target.value)}
                  placeholder="Search groups to add…"
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}/>
                {collabResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 10,
                    boxShadow: '0 4px 16px rgba(0,0,0,.1)', overflow: 'hidden',
                  }}>
                    {collabResults.map(g => (
                      <div key={g.id} onClick={() => addCollab(g)} style={{
                        padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                        borderBottom: `1px solid ${T.bdr}`,
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = T.s2}
                        onMouseLeave={e => e.currentTarget.style.background = T.w}>
                        <strong>{g.name}</strong>
                        {g.research_topic && <span style={{ color: T.mu, fontSize: 11.5 }}> · {g.research_topic}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {editing && editCollabs.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {editCollabs.map(c => (
                  <span key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: T.v2, color: T.v, borderRadius: 20, padding: '4px 10px',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {c.name}
                    <button onClick={() => removeCollab(c.id)} style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: T.v, fontFamily: 'inherit', padding: 0, fontSize: 13, lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
            )}
            {!editing && collaborators.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {collaborators.map(g => (
                  <div key={g.id}
                    onClick={() => onViewGroup?.(g.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', background: T.s2, borderRadius: 10,
                      cursor: onViewGroup ? 'pointer' : 'default',
                      border: `1px solid ${T.bdr}`,
                    }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
                      background: 'linear-gradient(135deg,#667eea,#764ba2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: '#fff',
                    }}>
                      {g.avatar_url
                        ? <img src={g.avatar_url} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        : g.name?.charAt(0).toUpperCase()
                      }
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{g.name}</div>
                      {g.research_topic && <div style={{ fontSize: 11.5, color: T.mu }}>{g.research_topic}</div>}
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.v, fontWeight: 600 }}>View →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Publications placeholder */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel>Recent publications</SectionLabel>
          <div style={{
            background: T.s2, borderRadius: 12, padding: '16px', textAlign: 'center',
            color: T.mu, fontSize: 12.5, lineHeight: 1.6,
          }}>
            Publications will appear here once added to the Group Library.
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 700, color: T.mu,
      textTransform: 'uppercase', letterSpacing: '.06em',
      marginBottom: 8,
    }}>{children}</div>
  );
}

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 9, padding: '8px 11px', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', color: T.text, display: 'block',
};
