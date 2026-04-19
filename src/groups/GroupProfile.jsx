import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T, TIER1_LIST, getTier2 } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import FollowBtn from '../components/FollowBtn';

export default function GroupProfile({ groupId, group, user, myRole, onGroupUpdate, onViewGroup, onSwitchTab }) {
  const [stats,         setStats]         = useState(null);
  const [leader,        setLeader]        = useState(null);
  const [collaborators, setCollaborators] = useState([]);
  const [publications,  setPublications]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Edit mode
  const [editing,      setEditing]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [editName,     setEditName]     = useState('');
  const [editDesc,     setEditDesc]     = useState('');
  const [editTopic,    setEditTopic]    = useState('');
  const [editTier1,    setEditTier1]    = useState('');
  const [editTier2,    setEditTier2]    = useState([]);
  const [editInstitution, setEditInstitution] = useState('');
  const [editCompany,     setEditCompany]     = useState('');
  const [editCountry,     setEditCountry]     = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editEmail,    setEditEmail]    = useState('');
  const [editWebsite,  setEditWebsite]  = useState('');
  const [editDispRole, setEditDispRole] = useState('');
  const [editCollabs,  setEditCollabs]  = useState([]);
  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults,setCollabResults]= useState([]);
  // Public profile settings
  const [editSlug,          setEditSlug]          = useState('');
  const [slugError,         setSlugError]         = useState('');
  const [editPublicEnabled, setEditPublicEnabled] = useState(false);
  const [editShowMembers,   setEditShowMembers]   = useState(true);
  const [editShowLeader,    setEditShowLeader]    = useState(true);
  const [editShowLocation,  setEditShowLocation]  = useState(true);
  const [editShowContact,   setEditShowContact]   = useState(false);
  const [editShowPosts,     setEditShowPosts]     = useState(true);
  const qrRef = useRef(null);

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

      // Fetch group publications (tagged items across all folders)
      const { data: folderRows } = await supabase
        .from('library_folders').select('id').eq('group_id', groupId);
      if (folderRows?.length) {
        const folderIds = folderRows.map(f => f.id);
        const { data: pubRows } = await supabase
          .from('library_items')
          .select('*')
          .in('folder_id', folderIds)
          .eq('is_group_publication', true)
          .order('year', { ascending: false });
        setPublications(pubRows || []);
      } else {
        setPublications([]);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [groupId, group]);

  const startEdit = async () => {
    setEditName(group.name || '');
    setEditDesc(group.description || '');
    setEditTopic(group.research_topic || '');
    setEditTier1(group.tier1 || '');
    setEditTier2(group.tier2 || []);
    setEditInstitution(group.institution || '');
    setEditCompany(group.company || '');
    setEditCountry(group.country || '');
    setEditLocation(group.location || '');
    setEditEmail(group.contact_email || '');
    setEditWebsite(group.website_url || '');
    setEditCollabs(group.collaborating_groups || []);
    setEditSlug(group.slug || '');
    setEditPublicEnabled(group.public_profile_enabled || false);
    setEditShowMembers(group.public_show_members ?? true);
    setEditShowLeader(group.public_show_leader ?? true);
    setEditShowLocation(group.public_show_location ?? true);
    setEditShowContact(group.public_show_contact ?? false);
    setEditShowPosts(group.public_show_posts ?? true);
    setSlugError('');
    const { data: mem } = await supabase
      .from('group_members').select('display_role')
      .eq('group_id', groupId).eq('user_id', user.id).maybeSingle();
    setEditDispRole(mem?.display_role || '');
    setEditing(true);
  };

  useEffect(() => {
    if (!group?.slug || !group?.public_profile_enabled || !qrRef.current) return;
    import('qrcode').then(QRCode => {
      QRCode.toCanvas(qrRef.current, `https://luminary.to/g/${group.slug}`,
        { width: 140, margin: 1, color: { dark: '#1b1d36', light: '#ffffff' } });
    }).catch(() => {});
  }, [group?.slug, group?.public_profile_enabled]);

  const cancelEdit = () => { setEditing(false); setCollabSearch(''); setCollabResults([]); };

  const updateSlug = async () => {
    if (!editSlug.trim()) return;
    const clean = editSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    setEditSlug(clean);
    const { error } = await supabase.from('groups').update({ slug: clean }).eq('id', groupId);
    if (error?.code === '23505') { setSlugError('This slug is already taken.'); }
    else { setSlugError(''); onGroupUpdate?.(); }
  };

  const saveEdit = async () => {
    setSaving(true);
    await supabase.from('groups').update({
      name:                   editName,
      description:            editDesc,
      research_topic:         editTopic,
      tier1:                  editTier1,
      tier2:                  editTier2,
      institution:            editInstitution,
      company:                editCompany,
      country:                editCountry,
      location:               editLocation,
      contact_email:          editEmail,
      website_url:            editWebsite,
      collaborating_groups:   editCollabs,
      public_profile_enabled: editPublicEnabled,
      public_show_members:    editShowMembers,
      public_show_leader:     editShowLeader,
      public_show_location:   editShowLocation,
      public_show_contact:    editShowContact,
      public_show_posts:      editShowPosts,
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!myRole && user && (
              <FollowBtn targetType="group" targetId={groupId} currentUserId={user.id}/>
            )}
            {isAdmin && !editing && (
              <button onClick={startEdit} style={{
                padding: '7px 16px', borderRadius: 20,
                border: `1.5px solid ${T.bdr}`, background: T.w,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: T.mu,
              }}>
                Edit profile
              </button>
            )}
          </div>
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

          {editing ? (
            /* ── Edit form ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Group name */}
              <div>
                <FieldLabel>Group name</FieldLabel>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  style={inputStyle} placeholder="e.g. Computational Neuroscience Lab"/>
              </div>

              {/* Research area */}
              <div>
                <FieldLabel>Research area</FieldLabel>
                <select value={editTier1} onChange={e => { setEditTier1(e.target.value); setEditTier2([]); }}
                  style={{ ...inputStyle, marginBottom: 8, appearance: 'none', WebkitAppearance: 'none' }}>
                  <option value="">Select primary discipline…</option>
                  {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {editTier1 && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                    {getTier2(editTier1).map(t => (
                      <button key={t} type="button"
                        onClick={() => setEditTier2(prev =>
                          prev.includes(t) ? prev.filter(x => x !== t) : prev.length < 3 ? [...prev, t] : prev
                        )}
                        style={{
                          padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                          fontSize: 11.5, fontFamily: 'inherit',
                          border: `1.5px solid ${editTier2.includes(t) ? T.v : T.bdr}`,
                          background: editTier2.includes(t) ? T.v2 : T.w,
                          color: editTier2.includes(t) ? T.v : T.text,
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <FieldLabel>Research details</FieldLabel>
                <input value={editTopic} onChange={e => setEditTopic(e.target.value)}
                  style={inputStyle} placeholder="Specific focus, methods, goals…"/>
              </div>

              {/* Affiliation */}
              <div>
                <FieldLabel>Affiliation</FieldLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editInstitution} onChange={e => setEditInstitution(e.target.value)}
                    style={inputStyle} placeholder="Institution (e.g. Harvard Medical School)"/>
                  <input value={editCompany} onChange={e => setEditCompany(e.target.value)}
                    style={inputStyle} placeholder="Company (e.g. Pfizer Research)"/>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                      style={inputStyle} placeholder="City"/>
                    <input value={editCountry} onChange={e => setEditCountry(e.target.value)}
                      style={inputStyle} placeholder="Country"/>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div>
                <FieldLabel>Contact</FieldLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)}
                    style={inputStyle} placeholder="Website URL"/>
                  <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    style={inputStyle} placeholder="Contact email"/>
                </div>
              </div>

              {/* Your role */}
              <div>
                <FieldLabel>Your role in this group</FieldLabel>
                <input value={editDispRole} onChange={e => setEditDispRole(e.target.value)}
                  style={inputStyle} placeholder="e.g. PI, Lab Director, Research Lead"/>
              </div>

            </div>
          ) : (
            /* ── View mode ── */
            <div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: T.text, marginBottom: 6 }}>
                {group.name}
              </div>

              {/* Taxonomy */}
              {(group.tier1 || group.tier2?.length > 0) && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
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
                </div>
              )}
              {group.research_topic && (
                <div style={{ fontSize: 13, color: T.v, fontWeight: 600, marginBottom: 4 }}>{group.research_topic}</div>
              )}

              {/* Affiliation + contact */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 16px', marginBottom: 8 }}>
                {group.institution   && <span style={{ fontSize: 12, color: T.mu }}>🏛️ {group.institution}</span>}
                {group.company       && <span style={{ fontSize: 12, color: T.mu }}>🏢 {group.company}</span>}
                {group.location      && <span style={{ fontSize: 12, color: T.mu }}>📍 {group.location}</span>}
                {group.country       && <span style={{ fontSize: 12, color: T.mu }}>🌍 {group.country}</span>}
                {group.website_url   && (
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
              [stats?.active_member_count || 0, 'Members',      'members'],
              [stats?.alumni_count || 0,         'Alumni',       'members'],
              [publications.length,              'Publications', 'library'],
            ].map(([count, label, tab]) => (
              <div key={label}
                onClick={() => tab && onSwitchTab?.(tab)}
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

        {/* Public profile settings — admin edit mode only */}
        {isAdmin && editing && (
          <div style={{ marginBottom: 20, background: T.s2, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.bdr}` }}>
            <SectionLabel>Public profile</SectionLabel>

            {/* Enable toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={editPublicEnabled} onChange={e => setEditPublicEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: T.v, cursor: 'pointer' }}/>
              <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                Enable public profile at <span style={{ color: T.v }}>luminary.to/g/{editSlug || '…'}</span>
              </span>
            </label>

            {editPublicEnabled && (
              <>
                {/* Slug editor */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 4 }}>URL slug</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={editSlug} onChange={e => { setEditSlug(e.target.value); setSlugError(''); }}
                      style={{ ...inputStyle, flex: 1 }} placeholder="group-slug"/>
                    <button onClick={updateSlug} style={{
                      padding: '8px 14px', borderRadius: 9, border: 'none',
                      background: T.v, color: '#fff', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 700, flexShrink: 0,
                    }}>Save slug</button>
                  </div>
                  {slugError && <div style={{ fontSize: 11.5, color: T.ro, marginTop: 4 }}>{slugError}</div>}
                </div>

                {/* Visibility toggles */}
                <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 6 }}>Show on public profile:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', marginBottom: 12 }}>
                  {[
                    ['editShowMembers',  editShowMembers,  setEditShowMembers,  'Member count'],
                    ['editShowLeader',   editShowLeader,   setEditShowLeader,   'Group leader'],
                    ['editShowLocation', editShowLocation, setEditShowLocation, 'Location'],
                    ['editShowContact',  editShowContact,  setEditShowContact,  'Contact email'],
                    ['editShowPosts',    editShowPosts,    setEditShowPosts,    'Public posts'],
                  ].map(([key, val, setter, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)}
                        style={{ accentColor: T.v, cursor: 'pointer' }}/>
                      <span style={{ fontSize: 12, color: T.text }}>{label}</span>
                    </label>
                  ))}
                </div>

                {/* QR + copy link */}
                {group.slug && group.public_profile_enabled && (
                  <div style={{ textAlign: 'center', paddingTop: 8 }}>
                    <canvas ref={qrRef} style={{ borderRadius: 10, display: 'block', margin: '0 auto 8px' }}/>
                    <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 8 }}>
                      luminary.to/g/{group.slug}
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(`https://luminary.to/g/${group.slug}`)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${T.v}`,
                        background: T.v2, color: T.v, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      }}>
                      Copy link
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Public profile info — view mode */}
        {isAdmin && !editing && group.public_profile_enabled && group.slug && (
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Public profile</SectionLabel>
            <div style={{ background: T.gr2, border: `1px solid ${T.gr}`, borderRadius: 10, padding: '10px 14px', fontSize: 12.5 }}>
              ✅ Public at{' '}
              <a href={`/g/${group.slug}`} target="_blank" rel="noopener noreferrer"
                style={{ color: T.v, fontWeight: 700, textDecoration: 'none' }}>
                luminary.to/g/{group.slug}
              </a>
            </div>
          </div>
        )}

        {/* Group publications */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Publications ({publications.length})
            </div>
            {publications.length > 0 && (
              <button onClick={() => onSwitchTab?.('library')} style={{
                fontSize: 11, color: T.v, fontWeight: 600, border: 'none',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              }}>
                View in Library →
              </button>
            )}
          </div>
          {publications.length === 0 ? (
            <div style={{
              background: T.s2, borderRadius: 12, padding: '16px', textAlign: 'center',
              color: T.mu, fontSize: 12.5, lineHeight: 1.6,
            }}>
              No publications yet. Tag papers as "Mark as ours" in the Library to show them here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {publications.map(pub => (
                <div key={pub.id} style={{
                  background: T.s2, borderRadius: 10, padding: '11px 14px',
                  border: `1px solid ${T.bdr}`,
                }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, marginBottom: 3, color: T.text }}>
                    {pub.title}
                  </div>
                  {pub.authors && (
                    <div style={{ fontSize: 11, color: T.mu, marginBottom: 3 }}>
                      {pub.authors.slice(0, 100)}{pub.authors.length > 100 ? '…' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pub.journal && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.v }}>{pub.journal}</span>
                    )}
                    {pub.year && (
                      <span style={{ fontSize: 11, color: T.mu }}>· {pub.year}</span>
                    )}
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
          )}
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

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.mu,
      marginBottom: 5, letterSpacing: '.02em',
    }}>{children}</div>
  );
}

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 9, padding: '8px 11px', fontSize: 13, fontFamily: 'inherit',
  outline: 'none', color: T.text, display: 'block',
};
