import { useState } from 'react';
import { GALLERY_TEMPLATES, GALLERY_FILTER_CATEGORIES } from '../lib/projectTemplates';
import { T } from '../lib/constants';
import Btn from '../components/Btn';

export default function TemplateGallery({ onSelectTemplate, onBack }) {
  const [activeFilter,     setActiveFilter]     = useState('all');
  const [previewTemplate,  setPreviewTemplate]  = useState(null);

  const filtered = activeFilter === 'all'
    ? GALLERY_TEMPLATES
    : GALLERY_TEMPLATES.filter(t => t.filterCategory === activeFilter);

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

      {/* Filter tabs */}
      <div style={{
        padding: '12px 24px', background: T.w,
        borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0,
      }}>
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

      {/* Template grid */}
      <div style={{
        padding: 24,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 16,
        alignContent: 'start',
      }}>
        {filtered.map(template => (
          <TemplateCard
            key={template.type}
            template={template}
            onUse={() => onSelectTemplate(template.type)}
            onPreview={() => setPreviewTemplate(template)}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '48px 0', color: T.mu }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14 }}>No templates in this category yet.</div>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onUse={() => { setPreviewTemplate(null); onSelectTemplate(previewTemplate.type); }}
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
      {/* Colour accent bar */}
      <div style={{ height: 5, background: template.color || T.v }}/>

      <div style={{ padding: '16px 18px', flex: 1 }}>
        {/* Icon + title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>{template.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{template.label}</div>
            <div style={{ fontSize: 12.5, color: T.mu, lineHeight: 1.5 }}>{template.description}</div>
          </div>
        </div>

        {/* Used by */}
        <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>👥</span>
          <span>{template.usedBy}</span>
        </div>

        {/* Key actions */}
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

        {/* Preview snippet — one example post */}
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

      {/* CTAs */}
      <div style={{
        padding: '12px 18px', borderTop: `1px solid ${T.bdr}`,
        display: 'flex', gap: 8, background: T.w,
      }}>
        <Btn variant="s" onClick={onUse} style={{ flex: 1, justifyContent: 'center' }}>
          Use template
        </Btn>
        <Btn onClick={onPreview}>
          Preview
        </Btn>
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

        {/* Modal header */}
        <div style={{
          padding: '18px 20px', borderBottom: `1px solid ${T.bdr}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ fontSize: 24 }}>{template.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{template.label}</div>
            <div style={{ fontSize: 12, color: T.mu }}>Example project preview</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, color: T.mu, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>

          {/* Folder structure */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
              Folders
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {template.folders.map(f => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 8, background: T.s2, fontSize: 13,
                }}>
                  <span>📁</span> {f.name}
                </div>
              ))}
            </div>
          </div>

          {/* Example posts */}
          {(template.previewPosts || []).length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                Example activity
              </div>
              {template.previewPosts.map((post, i) => (
                <div key={i} style={{
                  padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${T.bdr}`, background: T.w, marginBottom: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    {post.author}
                    <span style={{ fontSize: 10.5, color: T.mu, fontWeight: 400, marginLeft: 6 }}>
                      in {post.folder}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55, marginBottom: 6 }}>
                    {post.content}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.mu, display: 'flex', gap: 10 }}>
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.bdr}`, background: T.w, flexShrink: 0 }}>
          <Btn variant="s" onClick={onUse} style={{ width: '100%', justifyContent: 'center' }}>
            Use this template →
          </Btn>
        </div>
      </div>
    </div>
  );
}
