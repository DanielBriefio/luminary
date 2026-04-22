import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import CreateCodeModal from './CreateCodeModal';

const STATUS_STYLES = {
  active:    { bg: T.gr2, color: T.gr,  label: 'Active'    },
  exhausted: { bg: T.bl2, color: T.bl,  label: 'Exhausted' },
  expired:   { bg: T.ro2, color: T.ro,  label: 'Expired'   },
  locked:    { bg: T.am2, color: T.am,  label: 'Locked'    },
};

function codeType(c) {
  if (c.is_multi_use) return 'event';
  if (c.batch_label)  return 'batch';
  return 'personal';
}

export default function InvitesSection({ supabase }) {
  const [codes, setCodes]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [expandedId, setExpandedId]   = useState(null);
  const [treeData, setTreeData]       = useState({});
  const [treeLoading, setTreeLoading] = useState({});
  const [showCreate, setShowCreate]   = useState(false);
  const [search, setSearch]           = useState('');

  // Column filters: null = no filter
  const [colFilters, setColFilters] = useState({ type: null, status: null, createdBy: null });

  // Multi-select
  const [selected, setSelected]         = useState(new Set());
  const [bulkWorking, setBulkWorking]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_invite_codes_with_stats');
    setCodes(data || []);
    setLoading(false);
    setSelected(new Set());
    setConfirmDelete(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Per-creator usage stats
  const creatorStats = useMemo(() => {
    const stats = {};
    codes.filter(c => !c.is_multi_use).forEach(c => {
      const key = c.created_by_name || '—';
      if (!stats[key]) stats[key] = { total: 0, used: 0 };
      stats[key].total++;
      if (c.claimed_by || c.uses_count > 0) stats[key].used++;
    });
    return stats;
  }, [codes]);

  // Unique filter option lists
  const typeOptions    = ['personal', 'batch', 'event'];
  const statusOptions  = ['active', 'exhausted', 'expired', 'locked'];
  const creatorOptions = useMemo(() =>
    [...new Set(codes.map(c => c.created_by_name).filter(Boolean))].sort()
  , [codes]);

  // Filter + search
  const filtered = useMemo(() => codes.filter(c => {
    if (colFilters.type     && codeType(c) !== colFilters.type)        return false;
    if (colFilters.status   && c.status    !== colFilters.status)       return false;
    if (colFilters.createdBy && c.created_by_name !== colFilters.createdBy) return false;
    const q = search.toLowerCase();
    return !q
      || c.code?.toLowerCase().includes(q)
      || c.label?.toLowerCase().includes(q)
      || c.batch_label?.toLowerCase().includes(q);
  }), [codes, colFilters, search]);

  const setFilter = (key, val) => {
    setColFilters(prev => ({ ...prev, [key]: prev[key] === val ? null : val }));
    setSelected(new Set());
    setConfirmDelete(false);
  };
  const clearAllFilters = () => { setColFilters({ type: null, status: null, createdBy: null }); };
  const activeFilterCount = Object.values(colFilters).filter(Boolean).length;

  // Expand / tree
  const toggleExpand = async (code) => {
    if (expandedId === code.code) { setExpandedId(null); return; }
    setExpandedId(code.code);
    if (treeData[code.code]) return;
    setTreeLoading(prev => ({ ...prev, [code.code]: true }));
    const { data } = await supabase.rpc('get_invite_tree', { p_code: code.code });
    setTreeData(prev => ({ ...prev, [code.code]: data }));
    setTreeLoading(prev => ({ ...prev, [code.code]: false }));
  };

  // Select helpers
  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setConfirmDelete(false);
  };
  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));
  const toggleSelectAll = () => {
    setConfirmDelete(false);
    if (allSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(c => n.delete(c.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(c => n.add(c.id)); return n; });
    }
  };

  // Bulk actions
  const bulkLock = async (lock) => {
    setBulkWorking(true);
    await supabase.from('invite_codes').update({ locked_at: lock ? new Date().toISOString() : null }).in('id', [...selected]);
    await load(); setBulkWorking(false);
  };
  const bulkDelete = async () => {
    setBulkWorking(true);
    await supabase.from('invite_codes').delete().in('id', [...selected]);
    await load(); setBulkWorking(false);
  };
  const selectedCodes = codes.filter(c => selected.has(c.id));
  const anyLocked   = selectedCodes.some(c => c.locked_at);
  const anyUnlocked = selectedCodes.some(c => !c.locked_at);

  const GRID = '36px 1fr 1fr 160px 80px 90px 80px 80px 64px';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: T.text, margin: '0 0 4px' }}>
            Invites
          </h1>
          <div style={{ fontSize: 13, color: T.mu }}>
            {codes.filter(c => c.status === 'active').length} active ·{' '}
            {codes.reduce((n, c) => n + (c.uses_count || 0), 0)} total signups
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          padding: '9px 18px', borderRadius: 9, border: 'none',
          background: T.v, color: '#fff', fontWeight: 600,
          fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Create code
        </button>
      </div>

      {/* Search + active filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <input
          placeholder="Search codes or labels…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '9px 12px',
            borderRadius: 9, border: `1px solid ${T.bdr}`,
            background: T.s2, fontSize: 13, color: T.text,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        {activeFilterCount > 0 && (
          <button onClick={clearAllFilters} style={{
            padding: '7px 12px', borderRadius: 9, border: `1px solid ${T.bdr}`,
            background: T.w, color: T.mu, fontSize: 12.5, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            ✕ Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 12,
          background: T.v2, borderRadius: 10, border: `1px solid ${T.bdr}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.v3, marginRight: 4 }}>
            {selected.size} selected
          </span>
          {anyUnlocked && <BulkBtn disabled={bulkWorking} onClick={() => bulkLock(true)}>🔒 Lock</BulkBtn>}
          {anyLocked   && <BulkBtn disabled={bulkWorking} onClick={() => bulkLock(false)}>🔓 Unlock</BulkBtn>}
          {!confirmDelete ? (
            <BulkBtn disabled={bulkWorking} danger onClick={() => setConfirmDelete(true)}>🗑 Delete</BulkBtn>
          ) : (
            <>
              <span style={{ fontSize: 12.5, color: T.ro, fontWeight: 600 }}>
                Delete {selected.size} code{selected.size > 1 ? 's' : ''}? This cannot be undone.
              </span>
              <BulkBtn disabled={bulkWorking} danger onClick={bulkDelete}>{bulkWorking ? 'Deleting…' : 'Confirm delete'}</BulkBtn>
              <BulkBtn disabled={bulkWorking} onClick={() => setConfirmDelete(false)}>Cancel</BulkBtn>
            </>
          )}
          <button onClick={() => { setSelected(new Set()); setConfirmDelete(false); }} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            cursor: 'pointer', fontSize: 13, color: T.mu, fontFamily: 'inherit',
          }}>✕ Clear</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: T.mu, fontSize: 14 }}>
          {search || activeFilterCount ? 'No codes match the current filters.' : 'No invite codes yet.'}
        </div>
      ) : (
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Column headers with filter dropdowns */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID,
            padding: '10px 16px', borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11.5, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, alignItems: 'center',
          }}>
            <div>
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                style={{ accentColor: T.v, cursor: 'pointer' }} />
            </div>
            <div>Code</div>
            <div>Label</div>
            <FilterHeader
              label="Created by"
              options={creatorOptions}
              active={colFilters.createdBy}
              onSelect={v => setFilter('createdBy', v)}
            />
            <FilterHeader
              label="Type"
              options={typeOptions}
              active={colFilters.type}
              onSelect={v => setFilter('type', v)}
              capitalize
            />
            <div>Uses</div>
            <div>Expires</div>
            <FilterHeader
              label="Status"
              options={statusOptions}
              active={colFilters.status}
              onSelect={v => setFilter('status', v)}
              capitalize
            />
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
              selected={selected.has(code.id)}
              onSelect={() => toggleSelect(code.id)}
              creatorStat={creatorStats[code.created_by_name || '—']}
              gridTemplate={GRID}
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

// ─── FilterHeader ─────────────────────────────────────────────────────────────

function FilterHeader({ label, options, active, onSelect, capitalize }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: active ? T.v3 : T.mu }}>{label}</span>
      <button
        onClick={() => setOpen(o => !o)}
        title="Filter"
        style={{
          background: active ? T.v2 : 'transparent',
          border: active ? `1px solid ${T.v3}` : `1px solid transparent`,
          borderRadius: 5, padding: '1px 5px', cursor: 'pointer',
          fontSize: 10, color: active ? T.v3 : T.mu, lineHeight: 1,
          fontFamily: 'inherit',
        }}
      >
        {active ? `= ${capitalize ? active.charAt(0).toUpperCase() + active.slice(1) : active}` : '▾'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 30,
          background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 10,
          padding: '6px 0', minWidth: 140,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          marginTop: 4,
        }}>
          {active && (
            <button onClick={() => { onSelect(active); setOpen(false); }} style={ddItem(true)}>
              ✕ Clear filter
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onSelect(opt); setOpen(false); }}
              style={ddItem(active === opt)}
            >
              {capitalize ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt}
              {active === opt && <span style={{ marginLeft: 'auto', paddingLeft: 8 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ddItem = (active) => ({
  display: 'flex', width: '100%', textAlign: 'left',
  padding: '7px 14px', background: active ? T.v2 : 'transparent',
  border: 'none', cursor: 'pointer', fontSize: 12.5,
  color: active ? T.v3 : T.text, fontFamily: 'inherit',
  fontWeight: active ? 600 : 400,
});

function BulkBtn({ children, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '5px 12px', borderRadius: 7, border: 'none',
      background: danger ? T.ro2 : T.w, color: danger ? T.ro : T.text,
      fontWeight: 600, fontSize: 12.5,
      cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

// ─── CodeRow ─────────────────────────────────────────────────────────────────

function CodeRow({ code, isLast, expanded, onToggle, tree, treeLoading, supabase, onRefresh, selected, onSelect, creatorStat, gridTemplate }) {
  const st = STATUS_STYLES[code.status] || STATUS_STYLES.active;
  const usesLabel = code.is_multi_use
    ? `${code.uses_count ?? 0}${code.max_uses != null ? ` / ${code.max_uses}` : ''}`
    : code.claimed_by ? '1 / 1' : '0 / 1';

  const showPromoterBadge = !code.is_multi_use && creatorStat && creatorStat.total > 1;
  const promoterRatio = creatorStat ? creatorStat.used / creatorStat.total : 0;
  const promoterColor = promoterRatio >= 0.6 ? T.gr : promoterRatio >= 0.2 ? T.am : T.mu;

  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: gridTemplate,
        padding: '11px 16px',
        borderBottom: (!isLast || expanded) ? `1px solid ${T.bdr}` : 'none',
        background: selected ? T.v2 : expanded ? T.s2 : 'transparent',
        alignItems: 'center', transition: 'background 0.12s',
      }}>
        <div onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onSelect}
            style={{ accentColor: T.v, cursor: 'pointer' }} />
        </div>

        <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 13.5, fontWeight: 700, color: T.text }}>{code.code}</span>
          <span style={{ fontSize: 11, color: T.mu }}>{expanded ? '▲' : '▼'}</span>
        </div>

        <div onClick={onToggle} style={{ fontSize: 13, color: T.mu, cursor: 'pointer' }}>
          {code.label || code.batch_label || '—'}
        </div>

        <div onClick={onToggle} style={{ cursor: 'pointer' }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 500, lineHeight: 1.3 }}>
            {code.created_by_name || '—'}
          </div>
          {showPromoterBadge && (
            <div style={{ fontSize: 11, color: promoterColor, fontWeight: 600, marginTop: 2 }}>
              {creatorStat.used}/{creatorStat.total} shared
            </div>
          )}
        </div>

        <div onClick={onToggle} style={{ cursor: 'pointer' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
            background: code.is_multi_use ? T.v2 : T.s3,
            color: code.is_multi_use ? T.v3 : T.mu,
          }}>
            {code.is_multi_use ? 'Event' : (code.batch_label ? 'Batch' : 'Personal')}
          </span>
        </div>

        <div onClick={onToggle} style={{ fontSize: 13, color: T.text, cursor: 'pointer' }}>{usesLabel}</div>

        <div onClick={onToggle} style={{ fontSize: 12, color: T.mu, cursor: 'pointer' }}>
          {code.expires_at
            ? new Date(code.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
            : '—'}
        </div>

        <div onClick={onToggle} style={{ cursor: 'pointer' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 20, background: st.bg, color: st.color,
          }}>
            {st.label}
          </span>
        </div>

        <div onClick={e => e.stopPropagation()}>
          <CodeActions code={code} supabase={supabase} onRefresh={onRefresh} />
        </div>
      </div>

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
      <div style={{
        display: 'flex', gap: 24, marginBottom: 14, padding: '10px 14px',
        background: T.w, borderRadius: 9, border: `1px solid ${T.bdr}`, flexWrap: 'wrap',
      }}>
        {[
          { label: 'Signups',           value: s.total ?? 0,           unit: '' },
          { label: 'Completed profile', value: s.pct_profile ?? 0,    unit: '%' },
          { label: 'First post',        value: s.pct_first_post ?? 0, unit: '%' },
          { label: 'Active 7d',         value: s.pct_active_7d ?? 0,  unit: '%' },
        ].map(m => (
          <div key={m.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.v, fontFamily: "'DM Serif Display', serif" }}>
              {m.value}{m.unit}
            </div>
            <div style={{ fontSize: 11.5, color: T.mu }}>{m.label}</div>
          </div>
        ))}
      </div>
      {signups.length === 0 ? (
        <div style={{ fontSize: 13, color: T.mu }}>No signups yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signups.map(user => <TreeUser key={user.user_id} user={user} depth={0} />)}
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
        background: depth === 0 ? T.w : T.s3, border: `1px solid ${T.bdr}`,
        marginBottom: invitees.length ? 6 : 0,
      }}>
        <Av size={26} name={user.name} color={user.avatar_color} url="" />
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text }}>
          {user.name}
          <span style={{ fontSize: 11.5, color: T.mu, fontWeight: 400, marginLeft: 8 }}>
            {user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
          </span>
        </div>
        <ConversionPills user={user} />
      </div>
      {invitees.map(inv => <TreeUser key={inv.user_id} user={inv} depth={depth + 1} />)}
      {depth === 0 && invitees.length === 0 && (
        <div style={{ marginLeft: 36, fontSize: 11.5, color: T.mu, marginBottom: 4 }}>No invitees yet</div>
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
          background: p.ok ? T.gr2 : T.s3, color: p.ok ? T.gr : T.mu, fontWeight: 600,
        }}>
          {p.ok ? '✓' : '·'} {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── CodeActions ──────────────────────────────────────────────────────────────

function CodeActions({ code, supabase, onRefresh }) {
  const [open, setOpen]     = useState(false);
  const [editing, setEditing] = useState(false);

  const copyCode = () => { navigator.clipboard.writeText(code.code); setOpen(false); };

  const toggleLock = async () => {
    setOpen(false);
    await supabase.from('invite_codes').update({ locked_at: code.locked_at ? null : new Date().toISOString() }).eq('id', code.id);
    onRefresh();
  };

  const deleteCode = async () => {
    setOpen(false);
    if (!window.confirm(`Delete code ${code.code}? This cannot be undone.`)) return;
    await supabase.from('invite_codes').delete().eq('id', code.id);
    onRefresh();
  };

  if (editing) return (
    <EditCodeForm code={code} supabase={supabase} onDone={() => { setEditing(false); onRefresh(); }} />
  );

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: 'transparent', border: `1px solid ${T.bdr}`,
        borderRadius: 7, padding: '4px 10px', cursor: 'pointer',
        fontSize: 15, color: T.mu, fontFamily: 'inherit',
      }}>
        ···
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div style={{
            position: 'absolute', right: 0, top: 32, zIndex: 20,
            background: T.w, border: `1px solid ${T.bdr}`,
            borderRadius: 10, padding: '6px 0', minWidth: 160,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          }}>
            {[
              { label: '📋 Copy code',                            action: copyCode,                    danger: false },
              { label: '✏️ Edit',                                 action: () => { setOpen(false); setEditing(true); }, danger: false },
              { label: code.locked_at ? '🔓 Unlock' : '🔒 Lock', action: toggleLock,                  danger: false },
              { label: '🗑 Delete',                               action: deleteCode,                  danger: true  },
            ].map(item => (
              <button key={item.label} onClick={item.action} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px', background: 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 13,
                color: item.danger ? T.ro : T.text, fontFamily: 'inherit',
              }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── EditCodeForm ─────────────────────────────────────────────────────────────

function EditCodeForm({ code, supabase, onDone }) {
  const toDateInput = (iso) => iso ? iso.slice(0, 10) : '';
  const [label,     setLabel]     = useState(code.label || '');
  const [maxUses,   setMaxUses]   = useState(code.max_uses != null ? String(code.max_uses) : '');
  const [expires,   setExpires]   = useState(toDateInput(code.expires_at));
  const [saving,    setSaving]    = useState(false);

  const save = async () => {
    setSaving(true);
    const updates = {
      label:      label.trim() || null,
      expires_at: expires || null,
    };
    if (code.is_multi_use) {
      updates.max_uses = maxUses ? parseInt(maxUses, 10) : null;
    }
    await supabase.from('invite_codes').update(updates).eq('id', code.id);
    onDone();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={onDone} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        position: 'relative', background: T.w, borderRadius: 14, zIndex: 1,
        width: 380, padding: '22px 22px 18px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: T.text, marginBottom: 16 }}>
          Edit <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{code.code}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <EF label="Label">
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="Optional label" style={efInput} />
          </EF>
          {code.is_multi_use && (
            <EF label="Max uses (blank = unlimited)">
              <input value={maxUses} onChange={e => setMaxUses(e.target.value)}
                type="number" min="1" placeholder="Unlimited" style={efInput} />
            </EF>
          )}
          <EF label="Expiry date (blank = never)">
            <input value={expires} onChange={e => setExpires(e.target.value)}
              type="date" style={efInput} />
          </EF>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onDone} style={{
            padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.bdr}`,
            background: T.w, color: T.text, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EF({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.mu, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      {children}
    </div>
  );
}

const efInput = {
  width: '100%', padding: '8px 11px', borderRadius: 8,
  border: `1px solid ${T.bdr}`, background: T.s2,
  fontSize: 13, color: T.text, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};
