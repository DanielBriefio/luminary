# Task: Admin Panel — Invite Management (Phase 6B)

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task builds the Invite Management section of the Super Admin Panel
and extends the invite system to support two code types:

- **Personal codes** (existing): random string (e.g. `X7K2-PLMQ`),
  single-use, `claimed_by` stores the one person who used it. Unchanged.
- **Event codes** (new): memorable string (e.g. `AHA2026`), multi-use,
  tracks every person who joined with it, supports max_uses cap + expiry.

Scope:

1. SQL migration — extend `invite_codes`, new `invite_code_uses` table,
   two RPCs (`get_invite_codes_with_stats`, updated `get_invite_tree`)
2. `AuthScreen.jsx` — update invite gate to handle both code types
3. `src/admin/InvitesSection.jsx` — admin table with inline expand
4. `src/admin/CreateCodeModal.jsx` — three-mode creation UI
5. `src/admin/AdminShell.jsx` — wire InvitesSection for `section === 'invites'`

> ⚠️ **Critical:** Step 2 touches the live signup flow. Read the existing
> validation logic in AuthScreen.jsx carefully before making any changes.
> Test both code types end-to-end before deploying.

---

## Step 1 — SQL migration

Create `migration_admin_invites.sql`:

```sql
-- Extend invite_codes with new fields
alter table invite_codes
  add column if not exists label       text,
  add column if not exists max_uses    integer default 1,
  add column if not exists notes       text,
  add column if not exists expires_at  timestamptz,
  add column if not exists is_multi_use boolean default false,
  add column if not exists uses_count  integer default 0;

-- Backfill: personal codes already claimed count as 1 use
update invite_codes
set uses_count = 1
where claimed_by is not null and is_multi_use = false;

-- New table: tracks every individual use of a multi-use event code
create table if not exists invite_code_uses (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid references invite_codes(id) on delete cascade not null,
  user_id     uuid references profiles(id) on delete cascade not null,
  claimed_at  timestamptz default now(),
  unique(code_id, user_id)
);

alter table invite_code_uses enable row level security;

-- User can record their own use; admin can read all
create policy "icu_insert" on invite_code_uses for insert
  with check (auth.uid() = user_id);

create policy "icu_select" on invite_code_uses for select
  using (
    auth.uid() = user_id or
    (select is_admin from profiles where id = auth.uid())
  );

create index if not exists idx_icu_code_id
  on invite_code_uses(code_id);
create index if not exists idx_icu_user_id
  on invite_code_uses(user_id);

-- RPC: get_invite_codes_with_stats
-- Returns all invite codes with computed status and creator name
create or replace function get_invite_codes_with_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    from (
      select
        ic.id,
        ic.code,
        ic.label,
        ic.batch_label,
        ic.is_multi_use,
        ic.max_uses,
        ic.uses_count,
        ic.expires_at,
        ic.locked_at,
        ic.created_at,
        ic.notes,
        ic.claimed_by,
        ic.claimed_at,
        case
          when ic.locked_at is not null then 'locked'
          when ic.expires_at is not null and ic.expires_at < now() then 'expired'
          when ic.is_multi_use
            and ic.max_uses is not null
            and ic.uses_count >= ic.max_uses then 'exhausted'
          when not ic.is_multi_use
            and ic.claimed_by is not null then 'exhausted'
          else 'active'
        end as status,
        p.name as created_by_name
      from invite_codes ic
      left join profiles p on p.id = ic.created_by
    ) t
  );
end;
$$;

-- RPC: get_invite_tree (replaces Phase 6A stub with real implementation)
-- Takes a code string, returns signups + conversion metrics + level-2 invitees
create or replace function get_invite_tree(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row  invite_codes;
  v_signups   jsonb;
  v_summary   jsonb;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select * into v_code_row from invite_codes where code = p_code;
  if not found then
    return null;
  end if;

  -- Build signup list depending on code type
  if v_code_row.is_multi_use then
    -- Event code: get users from invite_code_uses
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',          p.id,
        'name',             p.name,
        'avatar_color',     p.avatar_color,
        'joined_at',        icu.claimed_at,
        'completed_profile', coalesce(p.onboarding_completed, false),
        'made_first_post',  exists(
          select 1 from posts where user_id = p.id limit 1
        ),
        'active_7d',        exists(
          select 1 from posts
          where user_id = p.id
            and created_at >= icu.claimed_at
            and created_at <  icu.claimed_at + interval '7 days'
          limit 1
        ),
        'invitees', (
          -- Level 2: codes this user created + who claimed them
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'user_id',           p2.id,
              'name',              p2.name,
              'avatar_color',      p2.avatar_color,
              'joined_at',         coalesce(ic2.claimed_at, icu2.claimed_at),
              'completed_profile', coalesce(p2.onboarding_completed, false),
              'made_first_post',   exists(
                select 1 from posts where user_id = p2.id limit 1
              ),
              'active_7d',         exists(
                select 1 from posts
                where user_id = p2.id
                  and created_at >= coalesce(ic2.claimed_at, icu2.claimed_at)
                  and created_at <  coalesce(ic2.claimed_at, icu2.claimed_at) + interval '7 days'
                limit 1
              )
            )
          ), '[]'::jsonb)
          from invite_codes ic2
          left join profiles p2         on p2.id  = ic2.claimed_by
          left join invite_code_uses icu2 on icu2.code_id = ic2.id
          where ic2.created_by = p.id
            and (ic2.claimed_by is not null or icu2.user_id is not null)
        )
      )
    ), '[]'::jsonb) into v_signups
    from invite_code_uses icu
    join profiles p on p.id = icu.user_id
    where icu.code_id = v_code_row.id;

  else
    -- Personal code: get from claimed_by
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'user_id',          p.id,
        'name',             p.name,
        'avatar_color',     p.avatar_color,
        'joined_at',        ic.claimed_at,
        'completed_profile', coalesce(p.onboarding_completed, false),
        'made_first_post',  exists(
          select 1 from posts where user_id = p.id limit 1
        ),
        'active_7d',        exists(
          select 1 from posts
          where user_id = p.id
            and created_at >= ic.claimed_at
            and created_at <  ic.claimed_at + interval '7 days'
          limit 1
        ),
        'invitees', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'user_id',           p2.id,
              'name',              p2.name,
              'avatar_color',      p2.avatar_color,
              'joined_at',         coalesce(ic2.claimed_at, icu2.claimed_at),
              'completed_profile', coalesce(p2.onboarding_completed, false),
              'made_first_post',   exists(
                select 1 from posts where user_id = p2.id limit 1
              ),
              'active_7d',         exists(
                select 1 from posts
                where user_id = p2.id
                  and created_at >= coalesce(ic2.claimed_at, icu2.claimed_at)
                  and created_at <  coalesce(ic2.claimed_at, icu2.claimed_at) + interval '7 days'
                limit 1
              )
            )
          ), '[]'::jsonb)
          from invite_codes ic2
          left join profiles p2           on p2.id  = ic2.claimed_by
          left join invite_code_uses icu2 on icu2.code_id = ic2.id
          where ic2.created_by = p.id
            and (ic2.claimed_by is not null or icu2.user_id is not null)
        )
      )
    ), '[]'::jsonb) into v_signups
    from invite_codes ic
    join profiles p on p.id = ic.claimed_by
    where ic.code = p_code;
  end if;

  -- Compute summary metrics across all signups
  select jsonb_build_object(
    'total',             jsonb_array_length(coalesce(v_signups, '[]'::jsonb)),
    'pct_profile',       case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'completed_profile')::boolean) /
                           jsonb_array_length(v_signups)) end,
    'pct_first_post',    case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'made_first_post')::boolean) /
                           jsonb_array_length(v_signups)) end,
    'pct_active_7d',     case when jsonb_array_length(coalesce(v_signups,'[]'::jsonb)) = 0 then 0
                         else round(100.0 *
                           (select count(*) from jsonb_array_elements(v_signups) s
                            where (s->>'active_7d')::boolean) /
                           jsonb_array_length(v_signups)) end
  ) into v_summary;

  return jsonb_build_object(
    'code',         v_code_row.code,
    'label',        v_code_row.label,
    'is_multi_use', v_code_row.is_multi_use,
    'uses_count',   v_code_row.uses_count,
    'max_uses',     v_code_row.max_uses,
    'summary',      v_summary,
    'signups',      coalesce(v_signups, '[]'::jsonb)
  );
end;
$$;

grant execute on function get_invite_codes_with_stats() to authenticated;
grant execute on function get_invite_tree(text)         to authenticated;
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Update invite gate in AuthScreen.jsx

> ⚠️ Read the existing invite validation logic in AuthScreen.jsx carefully
> before modifying. Locate the section that validates the invite code at
> signup and the section that marks the code as used after signup.
> Make surgical changes only — do not restructure the auth flow.

### Validation (before signup)

Find the code that checks whether an invite code is valid. It currently
checks something like `claimed_by is null` (single-use model). Replace
the validity check with logic that handles both code types:

```javascript
// Fetch the code row (existing pattern — keep whatever query method is used)
const { data: codeRow, error: codeError } = await supabase
  .from('invite_codes')
  .select('id, code, is_multi_use, max_uses, uses_count, expires_at, locked_at, claimed_by')
  .eq('code', inviteCode.trim().toUpperCase())
  .single();

if (codeError || !codeRow) {
  // Invalid code — show existing error UI
  return;
}

// Check if locked
if (codeRow.locked_at) {
  // Show "This code has been locked" error
  return;
}

// Check expiry
if (codeRow.expires_at && new Date(codeRow.expires_at) < new Date()) {
  // Show "This invite code has expired" error
  return;
}

if (codeRow.is_multi_use) {
  // Event code: check capacity
  if (codeRow.max_uses != null && codeRow.uses_count >= codeRow.max_uses) {
    // Show "This invite code is no longer available" error
    return;
  }
  // Valid event code — proceed to signup
} else {
  // Personal code: must be unclaimed
  if (codeRow.claimed_by) {
    // Show existing "code already used" error
    return;
  }
  // Valid personal code — proceed to signup
}
```

### Post-signup: mark code as used

Find the section that runs after `supabase.auth.signUp()` succeeds and
marks the code as used. It currently sets `claimed_by` and `claimed_at`.
Update it to handle both types:

```javascript
if (codeRow.is_multi_use) {
  // Event code: insert into invite_code_uses + increment uses_count
  await supabase.from('invite_code_uses').insert({
    code_id:    codeRow.id,
    user_id:    newUser.id,        // the newly created user's id
    claimed_at: new Date().toISOString(),
  });
  await supabase
    .from('invite_codes')
    .update({ uses_count: (codeRow.uses_count || 0) + 1 })
    .eq('id', codeRow.id);
} else {
  // Personal code: mark as claimed (existing logic — keep as-is)
  await supabase
    .from('invite_codes')
    .update({
      claimed_by: newUser.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', codeRow.id);
}
```

Pass `codeRow` into the post-signup handler — store it in a `useRef` or
local variable that persists from validation to post-signup. Match
whatever pattern is already used to pass the code row between those two
steps.

---

## Step 3 — InvitesSection.jsx

Create `src/admin/InvitesSection.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';
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
  const [treeData, setTreeData]     = useState({});   // code → tree result
  const [treeLoading, setTreeLoading] = useState({}); // code → bool
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
    if (treeData[code.code]) return; // already loaded

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
          { label: 'Signups',         value: s.total ?? 0,          unit: '' },
          { label: 'Completed profile', value: s.pct_profile ?? 0,  unit: '%' },
          { label: 'First post',       value: s.pct_first_post ?? 0, unit: '%' },
          { label: 'Active 7d',        value: s.pct_active_7d ?? 0, unit: '%' },
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
            style={{
              position: 'fixed', inset: 0, zIndex: 10,
            }}
          />
          <div style={{
            position: 'absolute', right: 0, top: 32, zIndex: 20,
            background: T.w, border: `1px solid ${T.bdr}`,
            borderRadius: 10, padding: '6px 0', minWidth: 160,
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          }}>
            {[
              { label: '📋 Copy code',   action: copyCode },
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
```

---

## Step 4 — CreateCodeModal.jsx

Create `src/admin/CreateCodeModal.jsx`:

```jsx
import React, { useState } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';

const MODES = [
  { id: 'personal', label: '👤 Personal',  desc: 'One code, one person' },
  { id: 'batch',    label: '📦 Batch',     desc: 'Multiple codes, same label' },
  { id: 'event',    label: '🎤 Event',     desc: 'Memorable code, many people' },
];

// Generates a random uppercase alphanumeric string (no I, O, 0, 1)
const randomSuffix = (len = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

export default function CreateCodeModal({ supabase, onClose, onCreated }) {
  const [mode, setMode]         = useState('personal');
  const [label, setLabel]       = useState('');
  const [eventCode, setEventCode] = useState('');
  const [maxUses, setMaxUses]   = useState('');
  const [quantity, setQuantity] = useState('10');
  const [prefix, setPrefix]     = useState('');
  const [expires, setExpires]   = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleCreate = async () => {
    setError('');
    setSaving(true);

    try {
      if (mode === 'personal') {
        // Single random code
        const code = randomSuffix(8);
        const { error: e } = await supabase.from('invite_codes').insert({
          code,
          label:      label || null,
          max_uses:   1,
          is_multi_use: false,
          uses_count: 0,
          expires_at: expires || null,
          notes:      notes || null,
        });
        if (e) throw e;
      }

      if (mode === 'batch') {
        // N random codes sharing a batch_label
        const qty = parseInt(quantity, 10);
        if (!qty || qty < 1 || qty > 200) throw new Error('Quantity must be 1–200');
        const batchLabel = label || `BATCH-${randomSuffix(4)}`;
        const rows = Array.from({ length: qty }, () => ({
          code:        prefix ? `${prefix.toUpperCase()}-${randomSuffix(6)}` : randomSuffix(8),
          label:       batchLabel,
          batch_label: batchLabel,
          max_uses:    1,
          is_multi_use: false,
          uses_count:  0,
          expires_at:  expires || null,
          notes:       notes || null,
        }));
        const { error: e } = await supabase.from('invite_codes').insert(rows);
        if (e) throw e;
      }

      if (mode === 'event') {
        // Custom memorable code, multi-use
        const code = eventCode.trim().toUpperCase().replace(/\s+/g, '');
        if (!code) throw new Error('Event code cannot be empty');
        if (code.length < 4) throw new Error('Event code must be at least 4 characters');
        const mu = maxUses ? parseInt(maxUses, 10) : null;
        const { error: e } = await supabase.from('invite_codes').insert({
          code,
          label:       label || code,
          max_uses:    mu,
          is_multi_use: true,
          uses_count:  0,
          expires_at:  expires || null,
          notes:       notes || null,
        });
        if (e) {
          if (e.code === '23505') throw new Error('That code already exists — choose a different one');
          throw e;
        }
      }

      onCreated();
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: T.w, borderRadius: 14, zIndex: 101,
        width: 460, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        padding: '24px 24px 20px',
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22, color: T.text, marginBottom: 18,
        }}>
          Create invite code
        </div>

        {/* Mode picker */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20,
        }}>
          {MODES.map(m => (
            <button key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                flex: 1, padding: '9px 8px', borderRadius: 9, border: 'none',
                background: mode === m.id ? T.v2 : T.s2,
                color: mode === m.id ? T.v3 : T.mu,
                fontWeight: mode === m.id ? 700 : 500,
                fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'center',
              }}
            >
              <div>{m.label}</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Label (all modes) */}
          <Field label={mode === 'batch' ? 'Batch label' : 'Label'}>
            <input value={label} onChange={e => setLabel(e.target.value)}
              placeholder={
                mode === 'event'    ? 'e.g. AHA Annual Conference 2026' :
                mode === 'batch'    ? 'e.g. JSC2026_CARDIOLOGY' :
                                     'e.g. For Dr. Chen'
              }
              style={inputStyle} />
          </Field>

          {/* Event code: custom code string */}
          {mode === 'event' && (
            <Field label="Event code (memorable)">
              <input value={eventCode} onChange={e => setEventCode(e.target.value)}
                placeholder="e.g. AHA2026"
                style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700 }} />
            </Field>
          )}

          {/* Batch: prefix + quantity */}
          {mode === 'batch' && (
            <>
              <Field label="Prefix (optional)">
                <input value={prefix} onChange={e => setPrefix(e.target.value)}
                  placeholder="e.g. JSC26 → JSC26-A4X2K8"
                  style={inputStyle} />
              </Field>
              <Field label="Quantity">
                <input value={quantity} onChange={e => setQuantity(e.target.value)}
                  type="number" min="1" max="200" placeholder="10"
                  style={inputStyle} />
              </Field>
            </>
          )}

          {/* Event: max uses */}
          {mode === 'event' && (
            <Field label="Max uses (leave blank for unlimited)">
              <input value={maxUses} onChange={e => setMaxUses(e.target.value)}
                type="number" min="1" placeholder="e.g. 200"
                style={inputStyle} />
            </Field>
          )}

          {/* Expiry (event + batch) */}
          {(mode === 'event' || mode === 'batch') && (
            <Field label="Expires (optional)">
              <input value={expires} onChange={e => setExpires(e.target.value)}
                type="date" style={inputStyle} />
            </Field>
          )}

          {/* Notes (all modes) */}
          <Field label="Notes (internal, not shown to users)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Distributed at AHA booth, April 2026"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          marginTop: 20,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.text, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600,
            fontSize: 13, cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? <Spinner size={14} /> : (
              mode === 'batch'
                ? `Generate ${quantity || '?'} codes`
                : 'Create code'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: T.mu,
        marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 11px', borderRadius: 8,
  border: `1px solid ${T.bdr}`, background: T.s2,
  fontSize: 13, color: T.text, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
};
```

---

## Step 5 — Wire InvitesSection in AdminShell.jsx

In `src/admin/AdminShell.jsx`, add the import:

```javascript
import InvitesSection from './InvitesSection';
```

Replace the single `<AdminSectionPlaceholder section={section} />` render
with a conditional that renders the real component for 'invites':

```jsx
{/* Main content area */}
<div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
  {section === 'invites'
    ? <InvitesSection supabase={supabase} />
    : <AdminSectionPlaceholder section={section} />
  }
</div>
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- Personal code validation / claiming logic in AuthScreen — only extend
  it for multi-use codes; do not restructure the existing flow
- `groups.owner_id`, `groups.is_private` (legacy fields)
- Any existing RPC functions other than `get_invite_tree` (which is
  being replaced from stub to real implementation)
- Any existing feed, profile, groups, projects, library, messages screens
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_admin_invites.sql in Supabase SQL Editor

# 2. Verify new columns exist:
#    select column_name from information_schema.columns
#    where table_name = 'invite_codes'
#    order by ordinal_position;
#    → should include: label, max_uses, notes, expires_at, is_multi_use, uses_count

# 3. Verify invite_code_uses table exists:
#    select count(*) from invite_code_uses;  -- should return 0

# 4. Deploy:
git add . && git commit -m "Phase 6B: Invite management — event codes, admin UI, invite tree, conversion metrics" && git push
```

---

## Remind the user

**Creating your first event code for testing:**

From the admin panel → Invites → Create code → Event mode:
- Label: "Test Event"
- Event code: `TEST2026`
- Max uses: 10
- No expiry

Then open an incognito window, go to the signup page, and enter `TEST2026`.
After signup verify in the admin panel that:
- Uses count incremented from 0 to 1
- Your test user appears in the invite tree
- Conversion metrics show 0% (no profile/post completed yet)

**Creating your first personal code:**

From Create code → Personal mode:
- Label: "For Daniel's colleague"
- Copy the generated code
- Redeem it in incognito → verify `claimed_by` is set and status shows Exhausted

---

## Testing checklist

**Migration:**
- [ ] `migration_admin_invites.sql` runs cleanly
- [ ] `invite_codes` has new columns: label, max_uses, notes, expires_at, is_multi_use, uses_count
- [ ] `invite_code_uses` table exists with correct columns and RLS
- [ ] `get_invite_codes_with_stats()` RPC returns JSON array
- [ ] `get_invite_tree()` RPC returns tree structure (not empty stub)

**Auth gate — personal codes (existing behaviour, must not regress):**
- [ ] Valid unclaimed personal code → signup succeeds
- [ ] Already-claimed personal code → rejected with error
- [ ] Locked code → rejected
- [ ] Invalid code (not in DB) → rejected

**Auth gate — event codes (new behaviour):**
- [ ] Valid event code `TEST2026` → signup succeeds
- [ ] After signup: `invite_code_uses` row exists for this user + code
- [ ] After signup: `uses_count` on `invite_codes` incremented by 1
- [ ] Event code at max_uses → rejected with appropriate error
- [ ] Expired event code → rejected with appropriate error

**Admin UI — Invites section:**
- [ ] Navigating to Invites in AdminShell renders InvitesSection (not "Coming soon")
- [ ] Code table loads and shows all codes with correct columns
- [ ] Status pills show correct colour: Active/Exhausted/Expired/Locked
- [ ] Event codes show "Event" badge; personal codes show "Personal" badge
- [ ] Search filters by code string and label
- [ ] Clicking a row expands the inline tree; clicking again collapses
- [ ] Expanded tree shows summary metrics (Signups, % profile, % first post, % 7d)
- [ ] Tree shows level-1 users with conversion pills
- [ ] Level-2 invitees (indented) shown under each level-1 user
- [ ] "No invitees yet" shown for users who haven't invited anyone
- [ ] ··· menu: "Copy code" copies to clipboard
- [ ] ··· menu: "Lock" sets locked_at; "Unlock" clears it; status updates on refresh
- [ ] Header summary ("X active · Y total signups") is accurate

**Create code modal:**
- [ ] "+ Create code" button opens modal
- [ ] Three mode tabs switch correctly
- [ ] Personal mode: creates one random code; appears in table on refresh
- [ ] Batch mode: generates correct quantity; all share batch_label; appear in table
- [ ] Event mode: creates memorable code; `is_multi_use = true` in DB
- [ ] Event mode: duplicate code → shows "already exists" error
- [ ] Event mode: code < 4 chars → validation error
- [ ] Batch mode: quantity > 200 → validation error
- [ ] Cancel closes modal without creating anything
- [ ] `npm run build` succeeds
