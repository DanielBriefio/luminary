import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import CreateCodeModal from './CreateCodeModal';

const STATUS_STYLES = {
  active:    { bg: T.gr2,  color: T.gr,   label: 'Active'    },
  exhausted: { bg: T.bl2,  color: T.bl,   label: 'Exhausted' },
  expired:   { bg: T.ro2,  color: T.ro,   label: 'Expired'   },
  locked:    { bg: T.am2,  color: T.am,   label: 'Locked'    },
};

export default function InvitesSection({ supabase }) {
  const [codes, setCodes]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [treeData, setTreeData]     = useState({});
  const [treeLoading, setTreeLoading] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_invite_codes_with_stats');
    setCodes(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (code) => {
    if (expandedId === code.code) {
      setExpandedId(null);
      return;
    }
    setExpandedId(code.code);
    if (treeData[code.code]) return;

    setTreeLoading(prev => ({ ...prev, [code.code]: true }));
    const { data } = await supabase.rpc('get_invite_tree', { p_code: code.code });
    setTreeData(prev => ({ ...prev, [code.code]: data }));
    setTreeLoading(prev => ({ ...prev, [code.code]: false }));
  };

  const filtered = codes.filter(c => {
    const q = search.toLowerCase();
    return !q
      || c.code?.toLowerCase().includes(q)
      || c.label?.toLowerCase().includes(q)
      || c.batch_label?.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 32, color: T.text, margin: '0 0 4px',
          }}>
            Invites
          </h1>
          <div style={{ fontSize: 13, color: T.mu }}>
            {codes.filter(c => c.status === 'active').length} active ·{' '}
            {codes.reduce((n, c) => n + (c.uses_count || 0), 0)} total signups
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '9px 18px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + Create code
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="Search codes or labels…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '9px 12px', marginBottom: 14,
          borderRadius: 9, border: `1px solid ${T.bdr}`,
          background: T.s2, fontSize: 13, color: T.text,
          fontFamily: 'inherit', outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          color: T.mu, fontSize: 14,
        }}>
          {search ? 'No codes match your search.' : 'No invite codes yet.'}
        </div>
      ) : (
        <div style={{
          background: T.w, border: `1px solid ${T.bdr}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 80px 100px 90px 90px 80px',
            padding: '10px 16px',
            borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11.5, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            <div>Code</div>
            <div>Label</div>
            <div>Type</div>
            <div>Uses</div>
            <div>Expires</div>
            <div>Status</div>
            <div></div>
          </div>

          {filtered.map((code, i) => (
            <CodeRow
              key={code.id}
              code={code}
              isLast={i === filtered.length - 1}
              expanded={expandedId === code.code}
              onToggle={() => toggleExpand(code)}
              tree={treeData[code.code]}
              treeLoading={treeLoading[code.code]}
              supabase={supabase}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCodeModal
          supabase={supabase}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── CodeRow ─────────────────────────────────────────────────────────────────

function CodeRow({ code, isLast, expanded, onToggle, tree, treeLoading, supabase, onRefresh }) {
  const st = STATUS_STYLES[code.status] || STATUS_STYLES.active;
  const usesLabel = code.is_multi_use
    ? `${code.uses_count ?? 0}${code.max_uses != null ? ` / ${code.max_uses}` : ''}`
    : code.claimed_by ? '1 / 1' : '0 / 1';

  return (
    <>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 80px 100px 90px 90px 80px',
          padding: '12px 16px',
          borderBottom: (!isLast || expanded) ? `1px solid ${T.bdr}` : 'none',
          cursor: 'pointer',
          background: expanded ? T.s2 : 'transparent',
          alignItems: 'center',
          transition: 'background 0.15s',
        }}
      >
        {/* Code */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'monospace', fontSize: 13.5,
            fontWeight: 700, color: T.text,
          }}>
            {code.code}
          </span>
          <span style={{ fontSize: 12, color: T.mu }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {/* Label */}
        <div style={{ fontSize: 13, color: T.mu }}>
          {code.label || code.batch_label || '—'}
        </div>

        {/* Type */}
        <div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px',
            borderRadius: 20,
            background: code.is_multi_use ? T.v2 : T.s3,
            color: code.is_multi_use ? T.v3 : T.mu,
          }}>
            {code.is_multi_use ? 'Event' : 'Personal'}
          </span>
        </div>

        {/* Uses */}
        <div style={{ fontSize: 13, color: T.text }}>{usesLabel}</div>

        {/* Expires */}
        <div style={{ fontSize: 12, color: T.mu }}>
          {code.expires_at
            ? new Date(code.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
            : '—'}
        </div>

        {/* Status */}
        <div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 20, background: st.bg, color: st.color,
          }}>
            {st.label}
          </span>
        </div>

        {/* Actions */}
        <div onClick={e => e.stopPropagation()}>
          <CodeActions code={code} supabase={supabase} onRefresh={onRefresh} />
        </div>
      </div>

      {/* Inline expanded tree */}
      {expanded && (
        <div style={{
          borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`,
          background: T.s2, padding: '16px 20px',
        }}>
          {treeLoading ? (
            <div style={{ textAlign: 'center', padding: 16 }}><Spinner /></div>
          ) : tree ? (
            <InviteTree tree={tree} />
          ) : (
            <div style={{ color: T.mu, fontSize: 13 }}>No data yet.</div>
          )}
        </div>
      )}
    </>
  );
}

// ─── InviteTree ───────────────────────────────────────────────────────────────

function InviteTree({ tree }) {
  const s = tree.summary || {};
  const signups = tree.signups || [];

  return (
    <div>
      {/* Summary metrics */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 14,
        padding: '10px 14px', background: T.w,
        borderRadius: 9, border: `1px solid ${T.bdr}`,
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'Signups',           value: s.total ?? 0,           unit: '' },
          { label: 'Completed profile', value: s.pct_profile ?? 0,    unit: '%' },
          { label: 'First post',        value: s.pct_first_post ?? 0, unit: '%' },
          { label: 'Active 7d',         value: s.pct_active_7d ?? 0,  unit: '%' },
        ].map(m => (
          <div key={m.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 20, fontWeight: 700, color: T.v,
              fontFamily: "'DM Serif Display', serif",
            }}>
              {m.value}{m.unit}
            </div>
            <div style={{ fontSize: 11.5, color: T.mu }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Tree rows */}
      {signups.length === 0 ? (
        <div style={{ fontSize: 13, color: T.mu }}>No signups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signups.map(user => (
            <TreeUser key={user.user_id} user={user} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeUser({ user, depth }) {
  const invitees = user.invitees || [];
  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: depth === 0 ? T.w : T.s3,
        border: `1px solid ${T.bdr}`,
        marginBottom: invitees.length ? 6 : 0,
      }}>
        <Av size={26} name={user.name} color={user.avatar_color} url="" />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text }}>
          {user.name}
          <span style={{ fontSize: 11.5, color: T.mu, fontWeight: 400, marginLeft: 8 }}>
            {user.joined_at
              ? new Date(user.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              : ''}
          </span>
        </div>
        <ConversionPills user={user} />
      </div>
      {invitees.map(inv => (
        <TreeUser key={inv.user_id} user={inv} depth={depth + 1} />
      ))}
      {depth === 0 && invitees.length === 0 && (
        <div style={{ marginLeft: 36, fontSize: 11.5, color: T.mu, marginBottom: 4 }}>
          No invitees yet
        </div>
      )}
    </div>
  );
}

function ConversionPills({ user }) {
  const pills = [
    { label: 'Profile', ok: user.completed_profile },
    { label: 'Post',    ok: user.made_first_post    },
    { label: '7d',      ok: user.active_7d          },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {pills.map(p => (
        <span key={p.label} style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 20,
          background: p.ok ? T.gr2 : T.s3,
          color:      p.ok ? T.gr  : T.mu,
          fontWeight: 600,
        }}>
          {p.ok ? '✓' : '·'} {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── CodeActions ──────────────────────────────────────────────────────────────

function CodeActions({ code, supabase, onRefresh }) {
  const [open, setOpen] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code.code);
    setOpen(false);
  };

  const toggleLock = async () => {
    setOpen(false);
    await supabase
      .from('invite_codes')
      .update({ locked_at: code.locked_at ? null : new Date().toISOString() })
      .eq('id', code.id);
    onRefresh();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent', border: `1px solid ${T.bdr}`,
          borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
          fontSize: 15, color: T.mu, fontFamily: 'inherit',
        }}
      >
        ···
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div style={{
            position: 'absolute', right: 0, top: 32, zIndex: 20,
            background: T.w, border: `1px solid ${T.bdr}`,
            borderRadius: 10, padding: '6px 0', minWidth: 160,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          }}>
            {[
              { label: '📋 Copy code',                          action: copyCode   },
              { label: code.locked_at ? '🔓 Unlock' : '🔒 Lock', action: toggleLock },
            ].map(item => (
              <button key={item.label}
                onClick={item.action}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px', background: 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  color: T.text, fontFamily: 'inherit',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
