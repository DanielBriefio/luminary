import { useState } from 'react';
import { supabase } from '../supabase';
import { T, TIER1_LIST, getTier2 } from '../lib/constants';

const GROUP_TYPES = [
  { value: 'research',   label: '🔬 Research Group'  },
  { value: 'clinical',   label: '🏥 Clinical Team'   },
  { value: 'department', label: '🏛️ Department'      },
  { value: 'industry',   label: '💊 Industry Team'   },
  { value: 'other',      label: '✏️ Other'            },
];

export default function CreateGroupModal({ user, onGroupCreated, onClose }) {
  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [researchTopic,  setResearchTopic]  = useState('');
  const [groupType,      setGroupType]      = useState('research');
  const [departmentName, setDepartmentName] = useState('');
  const [patientPop,     setPatientPop]     = useState('');
  const [tier1,          setTier1]          = useState('');
  const [tier2,          setTier2]          = useState([]);
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
          name:              name.trim(),
          description:       description.trim(),
          research_topic:    researchTopic.trim(),
          group_type:        groupType,
          department_name:   departmentName.trim(),
          patient_population: patientPop.trim(),
          tier1:             tier1,
          tier2:             tier2,
          is_public:         isPublic,
          created_by:        user.id,
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
        width: 480, background: T.w, borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,.18)', border: `1px solid ${T.bdr}`,
        overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${T.bdr}`, flexShrink: 0,
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

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
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

          {/* Group type */}
          <div>
            <label style={labelStyle}>Group type</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {GROUP_TYPES.map(gt => (
                <button key={gt.value} type="button" onClick={() => setGroupType(gt.value)} style={{
                  padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 12, fontFamily: 'inherit', fontWeight: 500,
                  border: `1.5px solid ${groupType === gt.value ? T.v : T.bdr}`,
                  background: groupType === gt.value ? T.v2 : T.w,
                  color: groupType === gt.value ? T.v : T.text,
                }}>
                  {gt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clinical/department-specific fields */}
          {(groupType === 'clinical' || groupType === 'department') && (
            <>
              <div>
                <label style={labelStyle}>Department name <span style={{fontWeight:400,color:T.mu}}>(optional)</span></label>
                <input value={departmentName} onChange={e => setDepartmentName(e.target.value)}
                  placeholder="e.g. Department of Cardiology" style={inputStyle}/>
              </div>
              <div>
                <label style={labelStyle}>Patient population <span style={{fontWeight:400,color:T.mu}}>(optional)</span></label>
                <input value={patientPop} onChange={e => setPatientPop(e.target.value)}
                  placeholder="e.g. Adult cardiology, paediatric oncology" style={inputStyle}/>
              </div>
            </>
          )}

          {/* Taxonomy — Tier 1 */}
          <div>
            <label style={labelStyle}>Primary discipline</label>
            <select value={tier1} onChange={e => { setTier1(e.target.value); setTier2([]); }}
              style={{ ...inputStyle, appearance: 'none' }}>
              <option value="">Select primary discipline…</option>
              {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Tier 2 */}
          {tier1 && (
            <div>
              <label style={labelStyle}>Specialities <span style={{ fontWeight: 400, color: T.mu }}>(up to 3)</span></label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {getTier2(tier1).map(t => (
                  <button key={t}
                    type="button"
                    onClick={() => setTier2(prev =>
                      prev.includes(t) ? prev.filter(x => x !== t) : prev.length < 3 ? [...prev, t] : prev
                    )}
                    style={{
                      padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                      fontSize: 11.5, fontFamily: 'inherit', fontWeight: 500,
                      border: `1.5px solid ${tier2.includes(t) ? T.v : T.bdr}`,
                      background: tier2.includes(t) ? T.v2 : T.w,
                      color: tier2.includes(t) ? T.v : T.text,
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Research details (free text) */}
          <div>
            <label style={labelStyle}>Research details</label>
            <input value={researchTopic} onChange={e => setResearchTopic(e.target.value)}
              placeholder="e.g. GLP-1 Cardiovascular Outcomes — describe specific focus, methods, goals…"
              style={inputStyle}/>
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
                { val: true,  icon: '🌐', label: 'Public',  sub: 'Anyone can join instantly' },
                { val: false, icon: '🔒', label: 'Closed',  sub: 'Admin approves requests' },
              ].map(opt => (
                <button key={String(opt.val)} type="button" onClick={() => setIsPublic(opt.val)} style={{
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
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px', borderRadius: 10,
              border: `1.5px solid ${T.bdr}`, background: T.w,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.text,
            }}>Cancel</button>
            <button type="button" onClick={create} disabled={creating || !name.trim()} style={{
              flex: 2, padding: '10px', borderRadius: 10, border: 'none',
              background: !name.trim() ? T.bdr : T.v,
              color: !name.trim() ? T.mu : '#fff',
              cursor: name.trim() ? 'pointer' : 'default',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            }}>
              {creating ? 'Creating…' : 'Create group →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
