import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { GALLERY_TEMPLATES, GALLERY_FILTER_CATEGORIES } from '../lib/projectTemplates';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Btn from '../components/Btn';

export default function TemplateGallery({ onSelectTemplate, onBack, user }) {
  const [galleryMode,        setGalleryMode]        = useState('curated');
  const [activeFilter,       setActiveFilter]       = useState('all');
  const [previewTemplate,    setPreviewTemplate]    = useState(null);
  const [communityTemplates, setCommunityTemplates] = useState([]);
  const [pendingOwn,         setPendingOwn]         = useState([]);
  const [loadingCommunity,   setLoadingCommunity]   = useState(false);

  const filtered = activeFilter === 'all'
    ? GALLERY_TEMPLATES
    : GALLERY_TEMPLATES.filter(t => t.filterCategory === activeFilter);

  const fetchCommunityTemplates = async () => {
    setLoadingCommunity(true);
    const [{ data: approved }, { data: pending }] = await Promise.all([
      supabase
        .from('community_templates')
        .select('*, profiles(name, avatar_url, avatar_color)')
        .eq('status', 'approved')
        .order('rating_count', { ascending: false }),
      user ? supabase
        .from('community_templates')
        .select('*')
        .eq('submitted_by', user.id)
        .eq('status', 'pending') : { data: [] },
    ]);
    setCommunityTemplates(approved || []);
    setPendingOwn(pending || []);
    setLoadingCommunity(false);
  };

  useEffect(() => {
    if (galleryMode === 'community') fetchCommunityTemplates();
  }, [galleryMode]); // eslint-disable-line

  const openPreview = (template, isCommunity = false) => {
    if (isCommunity) {
      setPreviewTemplate({
        ...template,
        label:       template.name,
        folders:     JSON.parse(template.folders || '[]'),
        previewPosts: JSON.parse(template.preview_posts || '[]'),
        _isCommunity: true,
      });
    } else {
      setPreviewTemplate(template);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: T.s2, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', background: T.w,
        borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          fontSize: 13, color: T.mu, border: 'none',
          background: 'transparent', cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>Template Gallery</div>
          <div style={{ fontSize: 12.5, color: T.mu, marginTop: 2 }}>
            See how others use Luminary — pick a template to get started
          </div>
        </div>
      </div>

      {/* Mode toggle: Curated | Community */}
      <div style={{
        padding: '12px 24px 0', background: T.w,
        borderBottom: `1px solid ${T.bdr}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[
            { id: 'curated',   label: '⭐ Curated'  },
            { id: 'community', label: '👥 Community' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setGalleryMode(tab.id)} style={{
              padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
              border: `2px solid ${galleryMode === tab.id ? T.v : T.bdr}`,
              background: galleryMode === tab.id ? T.v2 : T.w,
              color: galleryMode === tab.id ? T.v : T.mu,
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter chips — curated mode only */}
        {galleryMode === 'curated' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 12 }}>
            {GALLERY_FILTER_CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setActiveFilter(cat.id)} style={{
                padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                border: `1.5px solid ${activeFilter === cat.id ? T.v : T.bdr}`,
                background: activeFilter === cat.id ? T.v2 : T.w,
                color: activeFilter === cat.id ? T.v : T.mu,
                transition: 'all .12s',
              }}>
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Template grid */}
      <div style={{
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
        alignContent: 'start',
      }}>
        {galleryMode === 'curated' && (
          <>
            {filtered.map(template => (
              <TemplateCard
                key={template.type}
                template={template}
                onUse={() => onSelectTemplate(template.type, null)}
                onPreview={() => openPreview(template)}
              />
            ))}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: T.mu }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 14 }}>No templates in this category yet.</div>
              </div>
            )}
          </>
        )}

        {galleryMode === 'community' && (
          <>
            {/* Own pending templates at top */}
            {pendingOwn.map(t => (
              <div key={t.id} style={{
                background: T.w, borderRadius: 16,
                border: `1.5px solid ${T.am}`, overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,.06)',
              }}>
                <div style={{ height: 5, background: t.color || T.v }}/>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 20, background: T.am2, color: '#92400e',
                      }}>
                        ⏳ Pending review
                      </span>
                    </div>
                  </div>
                  {t.description && (
                    <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.5 }}>{t.description}</div>
                  )}
                </div>
              </div>
            ))}

            {loadingCommunity ? (
              <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: 48 }}>
                <div style={{ fontSize: 24 }}>⏳</div>
              </div>
            ) : communityTemplates.length === 0 && pendingOwn.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 20px', color: T.mu }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🌱</div>
                <div style={{ fontSize: 16, fontFamily: "'DM Serif Display', serif", marginBottom: 8, color: T.text }}>
                  No community templates yet
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                  Be the first to share how you use Luminary. Save any of your projects as a template from the ··· menu on the project card.
                </div>
              </div>
            ) : (
              communityTemplates.map(template => (
                <CommunityTemplateCard
                  key={template.id}
                  template={template}
                  currentUserId={user?.id}
                  onUse={() => onSelectTemplate('community', template)}
                  onPreview={() => openPreview(template, true)}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Preview modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onUse={() => {
            setPreviewTemplate(null);
            if (previewTemplate._isCommunity) {
              onSelectTemplate('community', previewTemplate);
            } else {
              onSelectTemplate(previewTemplate.type, null);
            }
          }}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onUse, onPreview }) {
  return (
    <div style={{
      background: T.w, borderRadius: 16,
      border: `1px solid ${T.bdr}`,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 5, background: template.color || T.v }}/>
      <div style={{ padding: '16px 18px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>{template.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{template.label}</div>
            <div style={{ fontSize: 12.5, color: T.mu, lineHeight: 1.5 }}>{template.description}</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>👥</span>
          <span>{template.usedBy}</span>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {(template.keyActions || []).map(action => (
            <span key={action} style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 20,
              background: T.s2, color: T.mu, border: `1px solid ${T.bdr}`, fontWeight: 500,
            }}>
              {action}
            </span>
          ))}
        </div>
        {template.previewPosts?.[0] && (
          <div style={{
            background: T.s2, borderRadius: 9,
            padding: '10px 12px', marginBottom: 14,
            border: `1px solid ${T.bdr}`,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {template.previewPosts[0].author}
              <span style={{ fontSize: 10.5, color: T.mu, fontWeight: 400, marginLeft: 6 }}>
                in {template.previewPosts[0].folder}
              </span>
            </div>
            <div style={{
              fontSize: 12.5, color: T.mu, lineHeight: 1.55,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
            }}>
              {template.previewPosts[0].content}
            </div>
            <div style={{ fontSize: 11, color: T.mu, marginTop: 6, display: 'flex', gap: 10 }}>
              <span>❤️ {template.previewPosts[0].likes}</span>
              <span>💬 {template.previewPosts[0].comments}</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${T.bdr}`, display: 'flex', gap: 8, background: T.w }}>
        <Btn variant="s" onClick={onUse} style={{ flex: 1, justifyContent: 'center' }}>
          Use template
        </Btn>
        <Btn onClick={onPreview}>Preview</Btn>
      </div>
    </div>
  );
}

function CommunityTemplateCard({ template, currentUserId, onUse, onPreview }) {
  const [userRated,    setUserRated]    = useState(false);
  const [ratingCount,  setRatingCount]  = useState(template.rating_count || 0);

  useEffect(() => {
    if (!currentUserId) return;
    supabase.from('community_template_ratings')
      .select('id')
      .eq('template_id', template.id)
      .eq('user_id', currentUserId)
      .maybeSingle()
      .then(({ data }) => setUserRated(!!data));
  }, [template.id, currentUserId]);

  const toggleRating = async (e) => {
    e.stopPropagation();
    if (!currentUserId) return;
    if (userRated) {
      await supabase.from('community_template_ratings')
        .delete().eq('template_id', template.id).eq('user_id', currentUserId);
      await supabase.from('community_templates')
        .update({ rating_count: ratingCount - 1 }).eq('id', template.id);
      setRatingCount(r => r - 1);
      setUserRated(false);
    } else {
      await supabase.from('community_template_ratings')
        .insert({ template_id: template.id, user_id: currentUserId });
      await supabase.from('community_templates')
        .update({ rating_count: ratingCount + 1 }).eq('id', template.id);
      setRatingCount(r => r + 1);
      setUserRated(true);
    }
  };

  const previewPosts = JSON.parse(template.preview_posts || '[]');
  const folders      = JSON.parse(template.folders      || '[]');

  return (
    <div style={{
      background: T.w, borderRadius: 16,
      border: `1px solid ${T.bdr}`, overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 5, background: template.color || T.v }}/>
      <div style={{ padding: '16px 18px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 26 }}>{template.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{template.name}</div>
            <div style={{ fontSize: 12, color: T.mu, marginTop: 2, lineHeight: 1.5 }}>{template.description}</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Av size={18} color={template.profiles?.avatar_color} name={template.profiles?.name} url={template.profiles?.avatar_url || ''}/>
          <span>By {template.profiles?.name}</span>
          {template.used_by && <span>· {template.used_by}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 10 }}>{folders.length} folder{folders.length !== 1 ? 's' : ''}</div>
        {previewPosts[0] && (
          <div style={{
            background: T.s2, borderRadius: 9,
            padding: '10px 12px', marginBottom: 12,
            border: `1px solid ${T.bdr}`,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 4 }}>
              {previewPosts[0].author}
              <span style={{ fontSize: 10.5, color: T.mu, fontWeight: 400, marginLeft: 6 }}>
                in {previewPosts[0].folder}
              </span>
            </div>
            <div style={{
              fontSize: 12.5, color: T.mu, lineHeight: 1.5,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {previewPosts[0].content}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '10px 18px', borderTop: `1px solid ${T.bdr}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Btn variant="s" onClick={onUse} style={{ flex: 1, justifyContent: 'center' }}>Use template</Btn>
        <Btn onClick={onPreview}>Preview</Btn>
        <button onClick={toggleRating} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 10px', borderRadius: 9,
          border: `1.5px solid ${userRated ? T.am : T.bdr}`,
          background: userRated ? T.am2 : T.w,
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, color: userRated ? T.am : T.mu,
          fontWeight: userRated ? 700 : 400,
        }}>
          👍 {ratingCount}
        </button>
      </div>
    </div>
  );
}

function TemplatePreviewModal({ template, onUse, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: T.w, borderRadius: 18,
        maxWidth: 560, width: '100%',
        maxHeight: '85vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '18px 20px', borderBottom: `1px solid ${T.bdr}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 24 }}>{template.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{template.label}</div>
            <div style={{ fontSize: 12, color: T.mu }}>Example project preview</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
              Folders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(template.folders || []).map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: T.s2, fontSize: 13 }}>
                  <span>📁</span> {f.name}
                </div>
              ))}
            </div>
          </div>
          {(template.previewPosts || []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                Example activity
              </div>
              {template.previewPosts.map((post, i) => (
                <div key={i} style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${T.bdr}`, background: T.w, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    {post.author}
                    <span style={{ fontSize: 10.5, color: T.mu, fontWeight: 400, marginLeft: 6 }}>in {post.folder}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55, marginBottom: 6 }}>{post.content}</div>
                  <div style={{ fontSize: 11.5, color: T.mu, display: 'flex', gap: 10 }}>
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.bdr}`, background: T.w, flexShrink: 0 }}>
          <Btn variant="s" onClick={onUse} style={{ width: '100%', justifyContent: 'center' }}>
            Use this template →
          </Btn>
        </div>
      </div>
    </div>
  );
}
