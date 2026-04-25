import React, { useState, useEffect } from 'react';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo, randomInviteSuffix } from '../lib/utils';

const STAGE_STYLES = {
  visible:    { bg: T.v2,  color: T.v3, label: 'Visible'    },
  active:     { bg: T.gr2, color: T.gr, label: 'Active'     },
  connected:  { bg: T.bl2, color: T.bl, label: 'Connected'  },
  credible:   { bg: T.te2, color: T.te, label: 'Credible'   },
  identified: { bg: T.s3,  color: T.mu, label: 'Identified' },
};

const GHOST_STYLES = {
  stuck:  { bg: T.ro2, color: T.ro, label: '👻 Stuck'  },
  almost: { bg: T.am2, color: T.am, label: '⚡ Almost' },
};

export default function UserDetailPanel({
  user, supabase, onClose, onNudge, onNotesUpdated, onUserUpdated,
}) {
  const [posts, setPosts]             = useState([]);
  const [groups, setGroups]           = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [notes, setNotes]             = useState(user.admin_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [codesRemaining, setCodesRemaining] = useState(user.invite_codes_remaining ?? 0);
  const [topUpCount, setTopUpCount]   = useState(1);
  const [toppingUp, setToppingUp]     = useState(false);

  useEffect(() => {
    setCodesRemaining(user.invite_codes_remaining ?? 0);
  }, [user.id, user.invite_codes_remaining]);

  const handleTopUp = async () => {
    if (toppingUp) return;
    setToppingUp(true);
    const rows = Array.from({ length: topUpCount }, () => ({
      code:         randomInviteSuffix(8),
      created_by:   user.id,
      is_multi_use: false,
      max_uses:     1,
      uses_count:   0,
      label:        'Admin top-up',
    }));
    const { error } = await supabase.from('invite_codes').insert(rows);
    setToppingUp(false);
    if (!error) {
      const next = codesRemaining + topUpCount;
      setCodesRemaining(next);
      setTopUpCount(1);
      onUserUpdated?.({ invite_codes_remaining: next });
    }
  };

  useEffect(() => {
    const fetchDetail = async () => {
      setLoadingDetail(true);

      const [postsRes, groupsRes] = await Promise.all([
        supabase
          .from('posts')
          .select('id, content, post_type, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('group_members')
          .select('group_id, role, groups(name)')
          .eq('user_id', user.id),
      ]);

      setPosts(postsRes.data || []);
      setGroups(groupsRes.data || []);
      setLoadingDetail(false);
    };

    fetchDetail();
    setNotes(user.admin_notes || '');
  }, [user.id]); // eslint-disable-line

  const saveNotes = async () => {
    setSavingNotes(true);
    await supabase
      .from('profiles')
      .update({ admin_notes: notes })
      .eq('id', user.id);
    setSavingNotes(false);
    onNotesUpdated(notes);
  };

  const stage = STAGE_STYLES[user.activation_stage] || STAGE_STYLES.identified;
  const ghost = user.ghost_segment ? GHOST_STYLES[user.ghost_segment] : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.25)', zIndex: 200,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 400, background: T.w, zIndex: 201,
        borderLeft: `1px solid ${T.bdr}`,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${T.bdr}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Av
            size={44}
            name={user.name}
            color={user.avatar_color}
            url={user.avatar_url || ''}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 2 }}>
              {user.name || '—'}
            </div>
            <div style={{
              fontSize: 12, color: T.mu,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {[user.title, user.institution].filter(Boolean).join(' · ')}
            </div>
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
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

          {/* Stage + ghost badges */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, padding: '3px 10px',
              borderRadius: 20, background: stage.bg, color: stage.color,
            }}>
              {stage.label}
            </span>
            {ghost && (
              <span style={{
                fontSize: 11.5, fontWeight: 700, padding: '3px 10px',
                borderRadius: 20, background: ghost.bg, color: ghost.color,
              }}>
                {ghost.label}
              </span>
            )}
          </div>

          {/* Stats grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, marginBottom: 18,
          }}>
            {[
              { label: 'Joined',      value: user.created_at
                ? new Date(user.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                : '—' },
              { label: 'Last active', value: user.last_active ? timeAgo(user.last_active) : 'Never' },
              { label: 'Posts',       value: user.posts_count  ?? 0 },
              { label: 'Groups',      value: user.groups_count ?? 0 },
              {
                label: 'Codes left',
                value: codesRemaining,
                color: codesRemaining >= 3 ? T.gr : codesRemaining >= 1 ? T.am : T.ro,
              },
              { label: 'Invite used', value: user.invite_code_used || '—' },
              { label: 'Work mode',   value: user.work_mode || '—' },
            ].map(s => (
              <div key={s.label} style={{
                background: T.s2, borderRadius: 8, padding: '9px 12px',
                border: `1px solid ${T.bdr}`,
              }}>
                <div style={{ fontSize: 11, color: T.mu, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.color || T.text }}>
                  {String(s.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Top up invite codes — only when below 5 */}
          {codesRemaining < 5 && (
            <div style={{
              marginBottom: 20, padding: '12px 14px',
              background: T.s2, borderRadius: 10,
              border: `1px solid ${T.bdr}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: T.mu,
                textTransform: 'uppercase', letterSpacing: 0.4,
                marginBottom: 8,
              }}>
                Invite codes
              </div>
              <div style={{ fontSize: 13, color: T.mu, marginBottom: 10 }}>
                {codesRemaining} of 5 codes remaining
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={topUpCount}
                  onChange={e => setTopUpCount(Number(e.target.value))}
                  style={{
                    padding: '6px 10px', borderRadius: 7,
                    border: `1px solid ${T.bdr}`, background: T.w,
                    fontSize: 13, color: T.text, fontFamily: 'inherit',
                    outline: 'none',
                  }}
                >
                  {Array.from({ length: 5 - codesRemaining }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>+{n} code{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
                <button
                  onClick={handleTopUp}
                  disabled={toppingUp}
                  style={{
                    padding: '6px 14px', borderRadius: 7, border: 'none',
                    background: T.v, color: '#fff', fontSize: 13,
                    fontWeight: 600, cursor: toppingUp ? 'default' : 'pointer',
                    fontFamily: 'inherit', opacity: toppingUp ? 0.7 : 1,
                  }}
                >
                  {toppingUp ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          )}

          {loadingDetail ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
          ) : (
            <>
              {/* Recent posts */}
              <Section title="Recent posts">
                {posts.length === 0 ? (
                  <Empty>No posts yet</Empty>
                ) : (
                  posts.map(post => (
                    <div key={post.id} style={{
                      padding: '8px 0',
                      borderBottom: `1px solid ${T.bdr}`,
                      fontSize: 13, color: T.text,
                    }}>
                      <div style={{
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', marginBottom: 2,
                      }}>
                        {post.content?.replace(/<[^>]+>/g, '').slice(0, 80) || '(no content)'}
                      </div>
                      <div style={{ fontSize: 11, color: T.mu }}>
                        {post.post_type} · {timeAgo(post.created_at)}
                      </div>
                    </div>
                  ))
                )}
              </Section>

              {/* Groups */}
              <Section title="Groups">
                {groups.length === 0 ? (
                  <Empty>Not in any groups</Empty>
                ) : (
                  groups.map(gm => (
                    <div key={gm.group_id} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '7px 0', borderBottom: `1px solid ${T.bdr}`,
                      fontSize: 13,
                    }}>
                      <span style={{ color: T.text }}>
                        {gm.groups?.name || gm.group_id}
                      </span>
                      <span style={{ color: T.mu, fontSize: 12 }}>{gm.role}</span>
                    </div>
                  ))
                )}
              </Section>
            </>
          )}

          {/* Admin notes */}
          <Section title="Admin notes (internal only)">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={4}
              placeholder="Add internal notes about this user…"
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 8,
                border: `1px solid ${T.bdr}`, background: T.s2,
                fontSize: 13, color: T.text, fontFamily: 'inherit',
                resize: 'vertical', outline: 'none', boxSizing: 'border-box',
              }}
            />
            {savingNotes && (
              <div style={{ fontSize: 11, color: T.mu, marginTop: 4 }}>Saving…</div>
            )}
          </Section>
        </div>

        {/* Footer actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: `1px solid ${T.bdr}`,
          display: 'flex', gap: 8,
        }}>
          {user.profile_slug && (
            <a
              href={`/p/${user.profile_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1, padding: '9px 0', borderRadius: 9,
                border: `1px solid ${T.bdr}`, background: T.w,
                color: T.text, fontSize: 13, fontWeight: 600,
                textDecoration: 'none', textAlign: 'center',
              }}
            >
              View profile ↗
            </a>
          )}
          <button
            onClick={onNudge}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
              background: T.v, color: '#fff', fontSize: 13,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Send nudge
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.mu,
        textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ fontSize: 13, color: T.mu, fontStyle: 'italic' }}>{children}</div>
  );
}
