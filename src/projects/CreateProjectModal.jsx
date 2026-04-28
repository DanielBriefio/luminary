import { useState } from 'react';
import { supabase } from '../supabase';
import { capture, captureLumensEarned } from '../lib/analytics';
import { T, LUMENS_ENABLED } from '../lib/constants';
import { FAST_TEMPLATES, PROJECT_TEMPLATES, applyTemplate } from '../lib/projectTemplates';
import Btn from '../components/Btn';

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 10, padding: '9px 14px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', color: T.text,
  boxSizing: 'border-box',
};

export default function CreateProjectModal({
  user, ownerId, isGroupProject = false, onProjectCreated, onClose,
  preselectedTemplate, communityTemplateSource, onOpenGallery,
}) {
  const [step,             setStep]             = useState(preselectedTemplate ? 2 : 1);
  const [selectedTemplate, setSelectedTemplate] = useState(preselectedTemplate || 'blank');
  const [projectName,      setProjectName]      = useState('');
  const [description,      setDescription]      = useState('');
  const [creating,         setCreating]         = useState(false);
  const [error,            setError]            = useState('');

  const isCommunity = selectedTemplate === 'community';

  const getTemplateDisplay = () => {
    if (isCommunity && communityTemplateSource) {
      return {
        icon:  communityTemplateSource.icon  || '✏️',
        label: communityTemplateSource.name  || 'Community template',
        color: communityTemplateSource.color || T.v,
      };
    }
    const t = PROJECT_TEMPLATES[selectedTemplate];
    return t ? { icon: t.icon, label: t.label, color: t.color } : { icon: '✏️', label: 'Blank', color: T.v };
  };

  const applyCommunityTemplate = async (projectId) => {
    const src = communityTemplateSource;
    const folders      = JSON.parse(src.folders      || '[]');
    const starterPosts = JSON.parse(src.starter_posts || '[]');

    let folderIdMap = {};
    if (folders.length) {
      const { data: createdFolders } = await supabase
        .from('project_folders')
        .insert(folders.map((f, i) => ({
          project_id: projectId,
          name:       f.name,
          sort_order: f.sort_order ?? i,
        })))
        .select();
      (createdFolders || []).forEach(f => { folderIdMap[f.name] = f.id; });
    }

    if (starterPosts.length) {
      await supabase.from('project_posts').insert(
        starterPosts.map(sp => ({
          project_id: projectId,
          user_id:    user.id,
          post_type:  'text',
          is_starter: true,
          is_sticky:  sp.is_sticky || false,
          content:    sp.content || '',
          folder_id:  sp.folder ? (folderIdMap[sp.folder] || null) : null,
        }))
      );
    }
  };

  const createProject = async () => {
    if (!projectName.trim() || creating) return;
    setCreating(true); setError('');

    try {
      const tpl = getTemplateDisplay();

      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          [isGroupProject ? 'group_id' : 'user_id']: ownerId,
          name:          projectName.trim(),
          description:   description.trim(),
          template_type: selectedTemplate,
          icon:          tpl.icon,
          cover_color:   tpl.color,
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

      if (isCommunity && communityTemplateSource) {
        await applyCommunityTemplate(project.id);
      } else {
        const template = PROJECT_TEMPLATES[selectedTemplate];
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
            return { ...rest, is_starter: true, folder_id: _folderName ? (folderIdMap[_folderName] || null) : null };
          });
          await supabase.from('project_posts').insert(toInsert);
        }
      }

      capture('project_created', { template_type: selectedTemplate || 'blank' });
      if (LUMENS_ENABLED) {
        try {
          supabase.rpc('award_lumens', {
            p_user_id:  user.id,
            p_amount:   10,
            p_reason:   'project_created',
            p_category: 'creation',
            p_meta:     { project_id: project.id },
          }).then(() => {}, () => {});
          captureLumensEarned({ reason: 'project_created', amount: 10, meta: { project_id: project.id } });
        } catch {}
      }
      onProjectCreated(project.id);
    } catch (e) {
      setError(e.message || 'Failed to create project.');
      setCreating(false);
    }
  };

  const tplDisplay = getTemplateDisplay();

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {FAST_TEMPLATES.map(t => (
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

            {onOpenGallery && (
              <button onClick={onOpenGallery} style={{
                width: '100%', marginBottom: 16, padding: '8px',
                border: `1px dashed ${T.bdr}`, borderRadius: 9,
                background: 'transparent', cursor: 'pointer',
                fontSize: 12.5, color: T.mu, fontFamily: 'inherit',
              }}>
                🗂️ Browse all templates →
              </button>
            )}

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
              <span style={{ fontSize: 22 }}>{tplDisplay.icon}</span>
              <div>
                <div style={{ fontWeight: 700 }}>{tplDisplay.label}</div>
                {!isCommunity && (
                  <button onClick={() => setStep(1)} style={{
                    fontSize: 11.5, color: T.v, border: 'none', background: 'transparent',
                    cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                  }}>
                    Change template
                  </button>
                )}
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
              {!isCommunity && <Btn onClick={() => setStep(1)} style={{ flex: 1 }}>← Back</Btn>}
              <Btn variant="s" onClick={createProject}
                disabled={!projectName.trim() || creating}
                style={{ flex: isCommunity ? 1 : 2 }}>
                {creating ? 'Creating…' : `Create ${selectedTemplate === 'blank' ? 'project' : tplDisplay.label}`}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
