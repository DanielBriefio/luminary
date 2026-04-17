import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';

export default function CreateGroupModal({ user, onGroupCreated, onClose }) {
  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [researchTopic,  setResearchTopic]  = useState('');
  const [isPublic,       setIsPublic]       = useState(true);
  const [adminRole,      setAdminRole]      = useState('');
  const [creating,       setCreating]       = useState(false);
  const [error,          setError]          = useState('');

  const create = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    setCreating(true); setError('');
    try {
      const { data: group, error: ge } = await supabase
        .from('groups')
        .insert({
          name:           name.trim(),
          description:    description.trim(),
          research_topic: researchTopic.trim(),
          is_public:      isPublic,
          created_by:     user.id,
        })
        .select()
        .single();
      if (ge) throw ge;

      await supabase.from('group_members').insert({
        group_id:     group.id,
        user_id:      user.id,
        role:         'admin',
        display_role: adminRole.trim() || '',
      });

      onGroupCreated(group.id);
    } catch (e) {
      setError(e.message || 'Failed to create group.');
      setCreating(false);
    }
  };

  const inputStyle = {
    width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
    borderRadius: 10, padding: '9px 14px', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', color: T.text,
    boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 5 };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20, fontFamily: "'DM Sans',sans-serif",
      }}
    >
      <div style={{
        width: 460, background: T.w, borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)', border: `1px solid ${T.bdr}`,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${T.bdr}`,
        }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: T.text }}>
            Create a group
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: T.s2, cursor: 'pointer', fontSize: 16, color: T.mu,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 9, padding: '9px 13px', fontSize: 12.5, color: T.ro }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Group name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="König Lab · Medical Affairs" style={inputStyle}/>
          </div>

          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What does this group work on?"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 70, lineHeight: 1.6 }}/>
          </div>

          <div>
            <label style={labelStyle}>Research topic</label>
            <input value={researchTopic} onChange={e => setResearchTopic(e.target.value)}
              placeholder="e.g. GLP-1 Cardiovascular Outcomes" style={inputStyle}/>
          </div>

          <div>
            <label style={labelStyle}>Your role in this group</label>
            <input value={adminRole} onChange={e => setAdminRole(e.target.value)}
              placeholder="e.g. Principal Investigator, Lab Director" style={inputStyle}/>
          </div>

          {/* Public / Closed toggle */}
          <div>
            <label style={labelStyle}>Membership</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { val: true,  icon: '🌐', label: 'Public', sub: 'Anyone can join instantly' },
                { val: false, icon: '🔒', label: 'Closed', sub: 'Admin approves requests' },
              ].map(opt => (
                <button key={String(opt.val)} onClick={() => setIsPublic(opt.val)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
                  border: `${isPublic === opt.val ? 2 : 1.5}px solid ${isPublic === opt.val ? T.v : T.bdr}`,
                  background: isPublic === opt.val ? T.v2 : T.w,
                  fontFamily: 'inherit', textAlign: 'left',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 3 }}>{opt.icon}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: isPublic === opt.val ? T.v : T.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: T.mu }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '10px', borderRadius: 10,
              border: `1.5px solid ${T.bdr}`, background: T.w,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
            }}>Cancel</button>
            <button onClick={create} disabled={creating || !name.trim()} style={{
              flex: 2, padding: '10px', borderRadius: 10, border: 'none',
              background: !name.trim() ? T.bdr : T.v,
              color: !name.trim() ? T.mu : '#fff',
              cursor: name.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              transition: 'background .15s',
            }}>
              {creating ? 'Creating…' : 'Create group →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
