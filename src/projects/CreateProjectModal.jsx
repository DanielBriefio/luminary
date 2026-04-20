import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { TEMPLATE_LIST, PROJECT_TEMPLATES, applyTemplate } from '../lib/projectTemplates';
import Btn from '../components/Btn';

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 10, padding: '9px 14px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', color: T.text,
  boxSizing: 'border-box',
};

export default function CreateProjectModal({ user, ownerId, isGroupProject = false, onProjectCreated, onClose }) {
  const [step,             setStep]             = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [projectName,      setProjectName]      = useState('');
  const [description,      setDescription]      = useState('');
  const [creating,         setCreating]         = useState('');
  const [error,            setError]            = useState('');

  const createProject = async () => {
    if (!projectName.trim() || creating) return;
    setCreating(true); setError('');

    try {
      const template = PROJECT_TEMPLATES[selectedTemplate];

      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          [isGroupProject ? 'group_id' : 'user_id']: ownerId,
          name:          projectName.trim(),
          description:   description.trim(),
          template_type: selectedTemplate,
          icon:          template.icon,
          cover_color:   template.color,
          created_by:    user.id,
        })
        .select()
        .single();

      if (projErr) throw projErr;

      await supabase.from('project_members').insert({
        project_id: project.id,
        user_id:    user.id,
        role:       'owner',
      });

      const { folders, posts } = applyTemplate(template, projectName.trim(), project.id, user.id);

      let folderIdMap = {};
      if (folders.length) {
        const { data: createdFolders } = await supabase
          .from('project_folders')
          .insert(folders)
          .select();
        (createdFolders || []).forEach(f => { folderIdMap[f.name] = f.id; });
      }

      if (posts.length) {
        const toInsert = posts.map(p => {
          const { _folderName, ...rest } = p;
          return { ...rest, folder_id: _folderName ? (folderIdMap[_folderName] || null) : null };
        });
        await supabase.from('project_posts').insert(toInsert);
      }

      onProjectCreated(project.id);
    } catch (e) {
      setError(e.message || 'Failed to create project.');
      setCreating(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, fontFamily: "'DM Sans',sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: T.w, borderRadius: 18, padding: 28,
        maxWidth: 520, width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,.2)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>
            {step === 1 ? 'Choose a template' : 'Name your project'}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: T.mu }}>✕</button>
        </div>

        {step === 1 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {TEMPLATE_LIST.map(t => (
                <button key={t.type} onClick={() => setSelectedTemplate(t.type)} style={{
                  padding: '16px 14px', borderRadius: 12,
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  border: `2px solid ${selectedTemplate === t.type ? t.color : T.bdr}`,
                  background: selectedTemplate === t.type ? `${t.color}22` : T.w,
                  transition: 'all .12s',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{t.label}</div>
                  <div style={{ fontSize: 11.5, color: T.mu, lineHeight: 1.5 }}>{t.description}</div>
                </button>
              ))}
            </div>
            <Btn variant="s" onClick={() => setStep(2)} style={{ width: '100%' }}>
              Continue →
            </Btn>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: T.s2, borderRadius: 10,
              marginBottom: 16, fontSize: 13,
            }}>
              <span style={{ fontSize: 22 }}>{PROJECT_TEMPLATES[selectedTemplate].icon}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{PROJECT_TEMPLATES[selectedTemplate].label}</div>
                <button onClick={() => setStep(1)} style={{
                  fontSize: 11.5, color: T.v, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                }}>
                  Change template
                </button>
              </div>
            </div>

            <input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && projectName.trim()) createProject(); }}
              placeholder="Project name…"
              autoFocus
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description (optional)"
              rows={2}
              style={{ ...inputStyle, resize: 'none', marginBottom: 16 }}
            />

            {error && (
              <div style={{ color: T.ro, fontSize: 12.5, marginBottom: 10 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={() => setStep(1)} style={{ flex: 1 }}>← Back</Btn>
              <Btn variant="s" onClick={createProject}
                disabled={!projectName.trim() || creating}
                style={{ flex: 2 }}>
                {creating
                  ? 'Creating…'
                  : `Create ${selectedTemplate === 'blank' ? 'project' : PROJECT_TEMPLATES[selectedTemplate]?.label}`}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
