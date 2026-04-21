import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

const ICON_OPTIONS = ['🔬', '🧬', '📚', '🎓', '💡', '🔗', '📊', '🏥', '🤝', '🚀', '✏️', '📝'];
const COLOR_OPTIONS = ['#6c63ff', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];
const CATEGORY_OPTIONS = [
  { id: 'research',      label: '🔬 Research'      },
  { id: 'clinical',      label: '🏥 Clinical'      },
  { id: 'industry',      label: '💊 Industry'      },
  { id: 'collaboration', label: '🤝 Collaboration' },
];

const inputStyle = {
  width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
  borderRadius: 10, padding: '9px 14px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none', color: T.text,
  boxSizing: 'border-box',
};

export default function SaveAsTemplateModal({ project, user, onClose }) {
  const [step,           setStep]           = useState(1);
  const [templateName,   setTemplateName]   = useState(project.name);
  const [description,    setDescription]    = useState('');
  const [usedBy,         setUsedBy]         = useState('');
  const [filterCategory, setFilterCategory] = useState('collaboration');
  const [selectedIcon,   setSelectedIcon]   = useState(project.icon || '✏️');
  const [selectedColor,  setSelectedColor]  = useState(project.cover_color || '#6c63ff');
  const [draftPosts,     setDraftPosts]     = useState([]);
  const [loadingPosts,   setLoadingPosts]   = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [done,           setDone]           = useState(false);

  const loadProjectPosts = async () => {
    setLoadingPosts(true);
    const [{ data: fols }, { data: starterRows }] = await Promise.all([
      supabase.from('project_folders').select('id, name').eq('project_id', project.id).order('sort_order'),
      supabase.from('project_posts').select('*').eq('project_id', project.id).eq('is_starter', true).order('created_at', { ascending: true }).limit(5),
    ]);

    const folderMap = {};
    (fols || []).forEach(f => { folderMap[f.id] = f.name; });

    let posts = starterRows || [];
    if (!posts.length) {
      const { data: recent } = await supabase
        .from('project_posts')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: true })
        .limit(5);
      posts = recent || [];
    }

    setDraftPosts(posts.map(p => ({
      ...p,
      folder_name:    folderMap[p.folder_id] || null,
      _isSticky:      p.is_sticky || false,
      _editedContent: p.content?.replace(/<[^>]+>/g, '') || '',
    })));
    setLoadingPosts(false);
  };

  const goToStep2 = () => {
    if (!templateName.trim()) return;
    loadProjectPosts();
    setStep(2);
  };

  const updateDraftPost = (i, changes) => {
    setDraftPosts(prev => prev.map((p, idx) => idx === i ? { ...p, ...changes } : p));
  };

  const removeDraftPost = (i) => {
    setDraftPosts(prev => prev.filter((_, idx) => idx !== i));
  };

  const addEmptyPost = () => {
    setDraftPosts(prev => [...prev, {
      id: `new_${Date.now()}`,
      folder_name: null,
      _isSticky: false,
      _editedContent: '',
    }]);
  };

  const submitTemplate = async () => {
    if (!templateName.trim()) return;
    setSubmitting(true);

    const { data: folders } = await supabase
      .from('project_folders')
      .select('name, sort_order')
      .eq('project_id', project.id)
      .order('sort_order');

    const starterPosts = draftPosts
      .filter(p => p._editedContent?.trim())
      .map(p => ({
        folder:    p.folder_name || null,
        is_sticky: p._isSticky || false,
        content:   `<p>${p._editedContent.trim()}</p>`,
      }));

    const previewPosts = draftPosts.slice(0, 2)
      .filter(p => p._editedContent?.trim())
      .map(p => ({
        author:   user.name || 'Example user',
        folder:   p.folder_name || 'General',
        content:  p._editedContent.trim(),
        likes:    Math.floor(Math.random() * 8) + 2,
        comments: Math.floor(Math.random() * 5) + 1,
      }));

    const { error } = await supabase.from('community_templates').insert({
      submitted_by:    user.id,
      status:          'pending',
      name:            templateName.trim(),
      description:     description.trim(),
      used_by:         usedBy.trim(),
      filter_category: filterCategory,
      icon:            selectedIcon,
      color:           selectedColor,
      folders:         JSON.stringify(folders || []),
      starter_posts:   JSON.stringify(starterPosts),
      preview_posts:   JSON.stringify(previewPosts),
    });

    setSubmitting(false);
    if (!error) setDone(true);
  };

  if (done) {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: T.w, borderRadius: 18, padding: 32,
          maxWidth: 440, width: '92%', textAlign: 'center',
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🌱</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, marginBottom: 10 }}>Template submitted!</div>
          <div style={{ fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: 24 }}>
            Your template is pending review. It will appear in the Community gallery once approved. You can check its status in the Community tab.
          </div>
          <Btn variant="s" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Done</Btn>
        </div>
      </div>
    );
  }

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
            {step === 1 ? 'Share as community template' : 'Review starter posts'}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: T.mu }}>✕</button>
        </div>

        {step === 1 && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 5 }}>Template name</label>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name…"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 5 }}>Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does this template help with?"
                rows={2}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 5 }}>Used by (optional)</label>
              <input
                value={usedBy}
                onChange={e => setUsedBy(e.target.value)}
                placeholder="e.g. Lab groups, PhD students, Medical Affairs teams"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 8 }}>Category</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORY_OPTIONS.map(cat => (
                  <button key={cat.id} onClick={() => setFilterCategory(cat.id)} style={{
                    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                    border: `1.5px solid ${filterCategory === cat.id ? T.v : T.bdr}`,
                    background: filterCategory === cat.id ? T.v2 : T.w,
                    color: filterCategory === cat.id ? T.v : T.mu,
                  }}>{cat.label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 8 }}>Icon</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ICON_OPTIONS.map(icon => (
                  <button key={icon} onClick={() => setSelectedIcon(icon)} style={{
                    fontSize: 22, padding: '6px 10px', borderRadius: 9,
                    border: `2px solid ${selectedIcon === icon ? T.v : T.bdr}`,
                    background: selectedIcon === icon ? T.v2 : T.w,
                    cursor: 'pointer',
                  }}>{icon}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: T.mu, display: 'block', marginBottom: 8 }}>Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {COLOR_OPTIONS.map(color => (
                  <button key={color} onClick={() => setSelectedColor(color)} style={{
                    width: 32, height: 32, borderRadius: '50%', background: color, cursor: 'pointer',
                    border: `3px solid ${selectedColor === color ? T.text : 'transparent'}`,
                    boxSizing: 'border-box',
                  }}/>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
              <Btn variant="s" onClick={goToStep2} disabled={!templateName.trim()} style={{ flex: 2 }}>
                Next: Review posts →
              </Btn>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 14, lineHeight: 1.5 }}>
              These posts will be shown to users as starter content when they use your template. Edit or remove anything you don't want to share.
            </div>

            {loadingPosts ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner/></div>
            ) : (
              <>
                {draftPosts.map((post, i) => (
                  <div key={post.id || i} style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                    <div style={{
                      padding: '6px 12px', background: T.s2,
                      fontSize: 11.5, color: T.mu, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span>📁 {post.folder_name || 'No folder'}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 400 }}>
                          <input
                            type="checkbox"
                            checked={post._isSticky || false}
                            onChange={e => updateDraftPost(i, { _isSticky: e.target.checked })}
                            style={{ accentColor: T.v }}
                          />
                          Sticky
                        </label>
                        <button onClick={() => removeDraftPost(i)} style={{ fontSize: 11, color: T.ro, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={post._editedContent || ''}
                      onChange={e => updateDraftPost(i, { _editedContent: e.target.value })}
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 12px', border: 'none', outline: 'none',
                        fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55,
                        resize: 'vertical', background: T.w, boxSizing: 'border-box',
                      }}
                      placeholder="Edit this post content before sharing as a template…"
                    />
                  </div>
                ))}

                <button onClick={addEmptyPost} style={{
                  fontSize: 12.5, color: T.v, fontWeight: 600,
                  border: `1px dashed ${T.v}`, borderRadius: 9,
                  background: T.v2, padding: '8px 14px',
                  cursor: 'pointer', fontFamily: 'inherit',
                  width: '100%', marginBottom: 16,
                }}>
                  + Add a starter post
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn onClick={() => setStep(1)} style={{ flex: 1 }}>← Back</Btn>
                  <Btn variant="s" onClick={submitTemplate} disabled={submitting || !templateName.trim()} style={{ flex: 2 }}>
                    {submitting ? 'Submitting…' : 'Submit for review →'}
                  </Btn>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
