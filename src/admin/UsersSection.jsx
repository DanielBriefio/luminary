import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';
import UserDetailPanel from './UserDetailPanel';
import BulkNudgeModal from './BulkNudgeModal';

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

const WORK_MODE_LABELS = {
  researcher:          'Researcher',
  clinician:           'Clinician',
  industry:            'Industry',
  clinician_scientist: 'Clin. Scientist',
};

const STAGES = ['identified', 'credible', 'connected', 'active', 'visible'];
const GHOSTS = ['stuck', 'almost'];
const MODES  = ['researcher', 'clinician', 'industry', 'clinician_scientist'];

export default function UsersSection({ supabase, user: adminUser, initialParams = {} }) {
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState(initialParams.stageFilter || '');
  const [ghostFilter, setGhostFilter] = useState(initialParams.ghostFilter || '');
  const [modeFilter, setModeFilter]   = useState(initialParams.modeFilter  || '');
  const [selected, setSelected]       = useState(new Set());
  const [detailUser, setDetailUser]   = useState(null);
  const [showNudge, setShowNudge]     = useState(false);
  const [sortBy, setSortBy]           = useState('created_at');
  const [sortDir, setSortDir]         = useState('desc');

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_admin_user_list');
    setUsers(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter(u => {
    if (stageFilter && u.activation_stage !== stageFilter) return false;
    if (ghostFilter && u.ghost_segment    !== ghostFilter) return false;
    if (modeFilter  && u.work_mode        !== modeFilter)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.institution?.toLowerCase().includes(q) ||
        u.title?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    // Nulls sort last regardless of direction
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (sortBy === 'created_at' || sortBy === 'last_active') {
      const aT = new Date(aVal).getTime();
      const bT = new Date(bVal).getTime();
      return sortDir === 'asc' ? aT - bT : bT - aT;
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const allSelected  = sorted.length > 0 && sorted.every(u => selected.has(u.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map(u => u.id)));
    }
  };

  const handleDirectMessage = (userId) => {
    setSelected(new Set([userId]));
    setShowNudge(true);
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedUsers = users.filter(u => selected.has(u.id));

  return (
    <div style={{ paddingBottom: someSelected ? 80 : 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 16,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 32, color: T.text, margin: '0 0 4px',
          }}>
            Users
          </h1>
          <div style={{ fontSize: 13, color: T.mu }}>
            {users.length} total ·{' '}
            {users.filter(u => u.ghost_segment).length} ghost users
          </div>
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Search name, institution, title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: '8px 12px',
            borderRadius: 9, border: `1px solid ${T.bdr}`,
            background: T.s2, fontSize: 13, color: T.text,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <FilterSelect
          value={stageFilter}
          onChange={setStageFilter}
          placeholder="All stages"
          options={STAGES.map(s => ({ value: s, label: STAGE_STYLES[s].label }))}
        />
        <FilterSelect
          value={ghostFilter}
          onChange={setGhostFilter}
          placeholder="All users"
          options={GHOSTS.map(g => ({ value: g, label: GHOST_STYLES[g].label }))}
        />
        <FilterSelect
          value={modeFilter}
          onChange={setModeFilter}
          placeholder="All modes"
          options={MODES.map(m => ({ value: m, label: WORK_MODE_LABELS[m] }))}
        />
        {(stageFilter || ghostFilter || modeFilter || search) && (
          <button
            onClick={() => {
              setStageFilter(''); setGhostFilter('');
              setModeFilter(''); setSearch('');
            }}
            style={{
              padding: '8px 12px', borderRadius: 9,
              border: `1px solid ${T.bdr}`, background: T.w,
              color: T.mu, fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <div style={{
          background: T.w, border: `1px solid ${T.bdr}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLS,
            padding: '10px 14px',
            borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4,
            alignItems: 'center',
          }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ cursor: 'pointer' }}
            />
            <div>User</div>
            <div>Work mode</div>
            <SortableHeader label="Joined"      col="created_at"             sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Last active" col="last_active"            sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Posts"       col="posts_count"            sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Groups"      col="groups_count"           sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            <SortableHeader label="Codes"       col="invite_codes_remaining" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
            <div>Stage</div>
            <div>Ghost</div>
            <div></div>
          </div>

          {sorted.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: T.mu, fontSize: 14,
            }}>
              No users match your filters.
            </div>
          ) : (
            sorted.map((u, i) => (
              <UserRow
                key={u.id}
                user={u}
                isLast={i === sorted.length - 1}
                selected={selected.has(u.id)}
                onToggle={() => toggleOne(u.id)}
                onOpen={() => setDetailUser(u)}
                onDirectMessage={() => handleDirectMessage(u.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%',
          transform: 'translateX(-50%)',
          background: T.text, color: '#fff',
          borderRadius: 12, padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          zIndex: 50, fontSize: 14,
        }}>
          <span style={{ fontWeight: 600 }}>
            {selected.size} user{selected.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setShowNudge(true)}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              background: T.v, color: '#fff', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Send nudge
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: '7px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent', color: '#fff',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Detail panel */}
      {detailUser && (
        <UserDetailPanel
          user={detailUser}
          supabase={supabase}
          onClose={() => setDetailUser(null)}
          onNudge={() => {
            setSelected(new Set([detailUser.id]));
            setDetailUser(null);
            setShowNudge(true);
          }}
          onNotesUpdated={(notes) => {
            setUsers(prev => prev.map(u =>
              u.id === detailUser.id ? { ...u, admin_notes: notes } : u
            ));
          }}
          onUserUpdated={(patch) => {
            setUsers(prev => prev.map(u =>
              u.id === detailUser.id ? { ...u, ...patch } : u
            ));
          }}
        />
      )}

      {/* Bulk nudge modal */}
      {showNudge && (
        <BulkNudgeModal
          supabase={supabase}
          targetUsers={selectedUsers}
          onClose={() => setShowNudge(false)}
          onSent={() => {
            setShowNudge(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

function UserRow({ user, isLast, selected, onToggle, onOpen, onDirectMessage }) {
  const stage = STAGE_STYLES[user.activation_stage] || STAGE_STYLES.identified;
  const ghost = user.ghost_segment ? GHOST_STYLES[user.ghost_segment] : null;
  const codes = user.invite_codes_remaining ?? 0;
  const codesColor = codes >= 3 ? T.gr : codes >= 1 ? T.am : T.ro;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: GRID_COLS,
      padding: '11px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`,
      alignItems: 'center',
      background: selected ? T.v2 : 'transparent',
    }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ cursor: 'pointer' }}
      />

      <div
        onClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}
      >
        <Av size={30} name={user.name} color={user.avatar_color} url={user.avatar_url || ''} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
            {user.name || '—'}
          </div>
          {user.institution && (
            <div style={{ fontSize: 11.5, color: T.mu }}>{user.institution}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: T.mu }}>
        {WORK_MODE_LABELS[user.work_mode] || user.work_mode || '—'}
      </div>

      <div style={{ fontSize: 12, color: T.mu }}>
        {user.created_at
          ? new Date(user.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short',
            })
          : '—'}
      </div>

      <div style={{ fontSize: 12, color: T.mu }}>
        {user.last_active ? timeAgo(user.last_active) : 'Never'}
      </div>

      <div style={{ fontSize: 13, color: T.text, textAlign: 'center' }}>
        {user.posts_count ?? 0}
      </div>

      <div style={{ fontSize: 13, color: T.text, textAlign: 'center' }}>
        {user.groups_count ?? 0}
      </div>

      <div style={{
        fontSize: 13, fontWeight: 600, color: codesColor, textAlign: 'center',
      }}>
        {codes}
      </div>

      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px',
          borderRadius: 20, background: stage.bg, color: stage.color,
        }}>
          {stage.label}
        </span>
      </div>

      <div>
        {ghost && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
            borderRadius: 20, background: ghost.bg, color: ghost.color,
          }}>
            {ghost.label}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={onOpen}
          style={{
            padding: '5px 11px', borderRadius: 7,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.mu, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          View
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDirectMessage(); }}
          title="Send nudge"
          style={{
            padding: '5px 9px', borderRadius: 7,
            border: `1px solid ${T.v}`, background: T.w,
            color: T.v, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', lineHeight: 1,
          }}
        >
          ✉
        </button>
      </div>
    </div>
  );
}

const GRID_COLS = '32px 1fr 110px 90px 90px 50px 50px 60px 100px 80px 100px';

function SortableHeader({ label, col, sortBy, sortDir, onSort }) {
  const active = sortBy === col;
  return (
    <div
      onClick={() => onSort(col)}
      style={{
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 3,
        userSelect: 'none',
        color: active ? T.v : T.mu,
        fontWeight: active ? 700 : 600,
      }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.3 }}>
        {active && sortDir === 'asc' ? '▲' : '▼'}
      </span>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 10px', borderRadius: 9,
        border: `1px solid ${T.bdr}`, background: T.s2,
        fontSize: 13, color: value ? T.text : T.mu,
        fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
