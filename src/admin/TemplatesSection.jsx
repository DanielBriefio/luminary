import React, { useState, useEffect, useCallback } from 'react';
import { T, LUMENS_ENABLED } from '../lib/constants';
import { capture, captureLumensEarned } from '../lib/analytics';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';

const STATUS_TABS = [
  { id: 'pending',  label: 'Pending',  color: T.am },
  { id: 'approved', label: 'Approved', color: T.gr },
  { id: 'rejected', label: 'Rejected', color: T.mu },
];

const CATEGORY_LABELS = {
  research:      '🔬 Research',
  clinical:      '🏥 Clinical',
  industry:      '💊 Industry',
  collaboration: '🤝 Collaboration',
};

export default function TemplatesSection({ supabase }) {
  const [tab, setTab]             = useState('pending');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [preview, setPreview]     = useState(null);
  const [acting, setActing]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('community_templates')
      .select(`
        id, name, description, used_by, filter_category,
        icon, color, folders, starter_posts, preview_posts,
        rating_count, status, created_at, submitted_by,
        profiles:submitted_by (
          name, avatar_color, avatar_url, institution
        )
      `)
      .eq('status', tab)
      .order('created_at', { ascending: false });

    setTemplates(data || []);
    setLoading(false);
  }, [supabase, tab]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setActing(id);
    // Look up the submitter so we can award them on approval.
    const { data: tpl } = await supabase
      .from('community_templates')
      .select('submitted_by')
      .eq('id', id)
      .maybeSingle();
    await supabase.from('community_templates').update({ status: 'approved' }).eq('id', id);
    capture('template_approved');
    if (LUMENS_ENABLED && tpl?.submitted_by) {
      try {
        supabase.rpc('award_lumens', {
          p_user_id:  tpl.submitted_by,
          p_amount:   50,
          p_reason:   'template_approved',
          p_category: 'recognition',
          p_meta:     { template_id: id },
        }).then(() => {}, () => {});
        // Cross-user — admin awarding the submitter, no tier event from this session.
        captureLumensEarned({ reason: 'template_approved', amount: 50, meta: { template_id: id, recipient_id: tpl.submitted_by } });
      } catch {}
    }
    setActing(null);
    load();
  };

  const reject = async (id) => {
    setActing(id);
    await supabase.from('community_templates').update({ status: 'rejected' }).eq('id', id);
    setActing(null);
    load();
  };

  const restore = async (id) => {
    setActing(id);
    await supabase.from('community_templates').update({ status: 'pending' }).eq('id', id);
    setActing(null);
    load();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 32, color: T.text, margin: '0 0 4px',
        }}>
          Templates
        </h1>
        <div style={{ fontSize: 13, color: T.mu }}>
          Review community template submissions
        </div>
      </div>

      {/* Status tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: `1px solid ${T.bdr}`,
      }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 18px', border: 'none',
              cursor: 'pointer', background: 'transparent',
              fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? t.color : T.mu,
              borderBottom: tab === t.id
                ? `2px solid ${t.color}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Template list */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.mu }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>
            {tab === 'pending' ? '🎉' : tab === 'approved' ? '✓' : '—'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            {tab === 'pending'
              ? 'No pending submissions'
              : tab === 'approved'
              ? 'No approved templates yet'
              : 'No rejected templates'}
          </div>
          <div style={{ fontSize: 13 }}>
            {tab === 'pending'
              ? 'New submissions will appear here for review.'
              : tab === 'approved'
              ? 'Approved templates appear in the community gallery.'
              : 'Rejected submissions are archived here.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {templates.map(tpl => (
            <TemplateRow
              key={tpl.id}
              tpl={tpl}
              tab={tab}
              acting={acting === tpl.id}
              onPreview={() => setPreview(tpl)}
              onApprove={() => approve(tpl.id)}
              onReject={()  => reject(tpl.id)}
              onRestore={() => restore(tpl.id)}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <TemplatePreviewModal
          tpl={preview}
          tab={tab}
          onClose={() => setPreview(null)}
          onApprove={() => { approve(preview.id); setPreview(null); }}
          onReject={()  => { reject(preview.id);  setPreview(null); }}
        />
      )}
    </div>
  );
}

// ─── TemplateRow ──────────────────────────────────────────────────────────────

function TemplateRow({ tpl, tab, acting, onPreview, onApprove, onReject, onRestore }) {
  const folders      = safeParseJson(tpl.folders,      []);
  const starterPosts = safeParseJson(tpl.starter_posts, []);
  const submitter    = tpl.profiles;

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '16px 18px',
      display: 'flex', alignItems: 'flex-start', gap: 16,
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: tpl.color || T.v2,
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 22,
      }}>
        {tpl.icon || '📁'}
      </div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 8, marginBottom: 4, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
            {tpl.name}
          </div>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 20,
            background: T.s3, color: T.mu,
          }}>
            {CATEGORY_LABELS[tpl.filter_category] || tpl.filter_category}
          </span>
        </div>

        {tpl.description && (
          <div style={{
            fontSize: 13, color: T.mu, marginBottom: 8,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {tpl.description}
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 14, flexWrap: 'wrap',
        }}>
          {submitter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Av
                size={18}
                name={submitter.name}
                color={submitter.avatar_color}
                url={submitter.avatar_url || ''}
              />
              <span style={{ fontSize: 12, color: T.mu }}>
                {submitter.name}
                {submitter.institution ? ` · ${submitter.institution}` : ''}
              </span>
            </div>
          )}
          <span style={{ fontSize: 12, color: T.mu }}>
            {folders.length} folder{folders.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 12, color: T.mu }}>
            {starterPosts.length} starter post{starterPosts.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 12, color: T.mu }}>
            Submitted {timeAgo(tpl.created_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center',
      }}>
        <button
          onClick={onPreview}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.text, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Preview
        </button>

        {tab === 'pending' && (
          <>
            <button
              onClick={onApprove}
              disabled={acting}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: 'none', background: T.gr,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: acting ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: acting ? 0.6 : 1,
              }}
            >
              {acting ? '…' : '✓ Approve'}
            </button>
            <button
              onClick={onReject}
              disabled={acting}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${T.ro}`, background: T.w,
                color: T.ro, fontSize: 13, fontWeight: 600,
                cursor: acting ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: acting ? 0.6 : 1,
              }}
            >
              {acting ? '…' : 'Reject'}
            </button>
          </>
        )}

        {tab === 'approved' && (
          <button
            onClick={onReject}
            disabled={acting}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${T.bdr}`, background: T.w,
              color: T.mu, fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit', opacity: acting ? 0.6 : 1,
            }}
          >
            Unpublish
          </button>
        )}

        {tab === 'rejected' && (
          <button
            onClick={onRestore}
            disabled={acting}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${T.bdr}`, background: T.w,
              color: T.v, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              opacity: acting ? 0.6 : 1,
            }}
          >
            Restore to pending
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TemplatePreviewModal ─────────────────────────────────────────────────────

function TemplatePreviewModal({ tpl, tab, onClose, onApprove, onReject }) {
  const folders      = safeParseJson(tpl.folders,      []);
  const starterPosts = safeParseJson(tpl.starter_posts, []);

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', zIndex: 200,
      }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: T.w, borderRadius: 14, zIndex: 201,
        width: 540, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.20)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: `1px solid ${T.bdr}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 9, flexShrink: 0,
            background: tpl.color || T.v2,
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 20,
          }}>
            {tpl.icon || '📁'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>
              {tpl.name}
            </div>
            {tpl.used_by && (
              <div style={{ fontSize: 12, color: T.mu }}>{tpl.used_by}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            fontSize: 20, cursor: 'pointer', color: T.mu,
            padding: '0 4px', lineHeight: 1,
          }}>
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
          {tpl.description && (
            <div style={{
              fontSize: 13.5, color: T.text, lineHeight: 1.6, marginBottom: 18,
            }}>
              {tpl.description}
            </div>
          )}

          <div style={{
            fontSize: 11.5, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
          }}>
            Folders ({folders.length})
          </div>
          {folders.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>
              No folders
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {folders.map((f, i) => (
                <span key={i} style={{
                  fontSize: 12.5, padding: '4px 12px', borderRadius: 20,
                  background: T.s2, border: `1px solid ${T.bdr}`, color: T.text,
                }}>
                  📁 {f.name || f}
                </span>
              ))}
            </div>
          )}

          <div style={{
            fontSize: 11.5, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
          }}>
            Starter posts ({starterPosts.length})
          </div>
          {starterPosts.length === 0 ? (
            <div style={{ fontSize: 13, color: T.mu }}>No starter posts</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {starterPosts.map((post, i) => (
                <div key={i} style={{
                  background: T.s2, borderRadius: 9,
                  padding: '10px 13px', border: `1px solid ${T.bdr}`,
                }}>
                  {post.folder && (
                    <div style={{
                      fontSize: 11, color: T.mu, marginBottom: 4, fontWeight: 600,
                    }}>
                      📁 {post.folder}
                      {post.is_sticky && (
                        <span style={{ marginLeft: 6, color: T.am }}>📌 Sticky</span>
                      )}
                    </div>
                  )}
                  <div style={{
                    fontSize: 13, color: T.text, lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
                  }}>
                    {stripHtml(post.content) || '(empty)'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions — pending only */}
        {tab === 'pending' && (
          <div style={{
            padding: '14px 22px',
            borderTop: `1px solid ${T.bdr}`,
            display: 'flex', gap: 8, justifyContent: 'flex-end',
          }}>
            <button onClick={onReject} style={{
              padding: '9px 18px', borderRadius: 9,
              border: `1px solid ${T.ro}`, background: T.w,
              color: T.ro, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Reject
            </button>
            <button onClick={onApprove} style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: T.gr, color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              ✓ Approve
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}
