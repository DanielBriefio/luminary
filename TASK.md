# Task: Admin Panel — User Management (Phase 6C)

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task builds the User Management section of the Super Admin Panel.
It includes a full searchable/filterable user table, a slide-in detail
panel per user, and a bulk nudge system that sends DMs + notifications
from a dedicated "Luminary Team" bot account.

Scope:

1. Prerequisites — bot account setup (manual, done by user before this task)
2. SQL migration — `admin_notes` on profiles, four RPCs
3. `src/lib/constants.js` — add `LUMINARY_TEAM_USER_ID`
4. `src/admin/UsersSection.jsx` — full user table with filters + bulk select
5. `src/admin/UserDetailPanel.jsx` — slide-in right panel
6. `src/admin/BulkNudgeModal.jsx` — compose + send nudge
7. `src/admin/AdminShell.jsx` — wire UsersSection for `section === 'users'`

No delete/suspend functionality — deferred (requires service role key).
No private post nudge — separate task immediately after this one.

---

## Prerequisites — bot account setup (user does this manually first)

Before Claude Code runs this task, the following must be done in
Supabase Dashboard:

**Step 1 — Create the bot user:**
Supabase Dashboard → Authentication → Users → "Add user"
- Email: `team@luminary.app` (or any address — it never receives mail)
- Set a strong random password (not needed again)
- Note the UUID Supabase assigns — call it `<BOT_UUID>`

**Step 2 — Create the bot profile:**
Run in Supabase SQL Editor:
```sql
insert into profiles (id, name, title, avatar_color, onboarding_completed)
values (
  '<BOT_UUID>',
  'Luminary Team',
  'Official Luminary Account',
  '#6c63ff',
  true
)
on conflict (id) do nothing;
```

**Step 3 — Note the UUID.** It goes into `constants.js` in Step 3 below.

---

## Step 1 — SQL migration

Create `migration_admin_users.sql`:

```sql
-- Admin notes on profiles (simple internal field, never shown to users)
alter table profiles
  add column if not exists admin_notes text;

-- RPC: get_admin_user_list
-- Returns all users with computed activity, stage, ghost segment
create or replace function get_admin_user_list()
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
        p.id,
        p.name,
        p.title,
        p.institution,
        p.work_mode,
        p.avatar_color,
        p.avatar_url,
        p.profile_slug,
        p.onboarding_completed,
        p.admin_notes,
        p.created_at,

        -- Last active: max created_at across posts, comments, likes
        greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id)
        ) as last_active,

        -- Counts
        (select count(*) from posts        where user_id = p.id)::int as posts_count,
        (select count(*) from group_members where user_id = p.id)::int as groups_count,

        -- Invite code used at signup
        coalesce(
          (select ic.code from invite_codes ic
           where ic.claimed_by = p.id limit 1),
          (select ic.code from invite_code_uses icu
           join invite_codes ic on ic.id = icu.code_id
           where icu.user_id = p.id limit 1)
        ) as invite_code_used,

        -- Activation stage (highest reached)
        case
          when exists(select 1 from posts where user_id = p.id)
            and p.profile_slug is not null
            then 'visible'
          when exists(select 1 from posts where user_id = p.id)
            then 'active'
          when exists(select 1 from follows where follower_id = p.id)
            or exists(select 1 from group_members where user_id = p.id)
            then 'connected'
          when coalesce(p.onboarding_completed, false) = true
            or exists(select 1 from publications where user_id = p.id)
            then 'credible'
          else 'identified'
        end as activation_stage,

        -- Ghost segment
        case
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) = 0 then 'stuck'
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) <= 2
          and greatest(
            (select max(created_at) from posts    where user_id = p.id),
            (select max(created_at) from comments where user_id = p.id),
            (select max(created_at) from likes    where user_id = p.id)
          ) < now() - interval '5 days'
          then 'almost'
          else null
        end as ghost_segment

      from profiles p
      -- Exclude the bot account from the user list
      where p.id != (
        select id from profiles where name = 'Luminary Team' limit 1
      )
    ) t
  );
end;
$$;

-- RPC: get_user_activation_stages (real implementation — replaces Phase 6A stub)
-- Returns funnel counts for Overview dashboard
create or replace function get_user_activation_stages()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total      int;
  v_credible   int;
  v_connected  int;
  v_active     int;
  v_visible    int;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  select count(*) into v_total from profiles
  where name != 'Luminary Team';

  select count(*) into v_credible from profiles p
  where (coalesce(p.onboarding_completed, false) = true
    or exists(select 1 from publications where user_id = p.id))
    and p.name != 'Luminary Team';

  select count(*) into v_connected from profiles p
  where (exists(select 1 from follows where follower_id = p.id)
    or exists(select 1 from group_members where user_id = p.id))
    and p.name != 'Luminary Team';

  select count(*) into v_active from profiles p
  where exists(select 1 from posts where user_id = p.id)
    and p.name != 'Luminary Team';

  select count(*) into v_visible from profiles p
  where exists(select 1 from posts where user_id = p.id)
    and p.profile_slug is not null
    and p.name != 'Luminary Team';

  return jsonb_build_array(
    jsonb_build_object('stage', 'Identified',  'count', v_total),
    jsonb_build_object('stage', 'Credible',    'count', v_credible),
    jsonb_build_object('stage', 'Connected',   'count', v_connected),
    jsonb_build_object('stage', 'Active',      'count', v_active),
    jsonb_build_object('stage', 'Visible',     'count', v_visible)
  );
end;
$$;

-- RPC: get_ghost_users (real implementation — replaces Phase 6A stub)
create or replace function get_ghost_users()
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
    select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    from (
      select
        p.id,
        p.name,
        p.avatar_color,
        p.created_at,
        case
          when (
            (select count(*) from posts         where user_id = p.id) +
            (select count(*) from comments      where user_id = p.id) +
            (select count(*) from likes         where user_id = p.id) +
            (select count(*) from follows       where follower_id = p.id) +
            (select count(*) from group_members where user_id = p.id)
          ) = 0 then 'stuck'
          else 'almost'
        end as ghost_segment
      from profiles p
      where p.name != 'Luminary Team'
        and (
          -- stuck
          (select count(*) from posts         where user_id = p.id) +
          (select count(*) from comments      where user_id = p.id) +
          (select count(*) from likes         where user_id = p.id) +
          (select count(*) from follows       where follower_id = p.id) +
          (select count(*) from group_members where user_id = p.id)
        ) <= 2
        and greatest(
          (select max(created_at) from posts    where user_id = p.id),
          (select max(created_at) from comments where user_id = p.id),
          (select max(created_at) from likes    where user_id = p.id),
          p.created_at
        ) < now() - interval '5 days'
      order by p.created_at desc
    ) t
  );
end;
$$;

-- RPC: send_admin_nudge
-- Sends a DM + notification from the Luminary Team bot to each target user.
-- Runs as SECURITY DEFINER so it can insert messages with sender_id = bot,
-- bypassing the normal RLS requirement that sender_id = auth.uid().
create or replace function send_admin_nudge(
  p_target_user_ids  uuid[],
  p_message          text,
  p_bot_user_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id  uuid;
  v_conv_id    uuid;
  v_uid_a      uuid;
  v_uid_b      uuid;
begin
  if not (select is_admin from profiles where id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_message is null or trim(p_message) = '' then
    raise exception 'message cannot be empty';
  end if;

  foreach v_target_id in array p_target_user_ids loop
    -- Canonical conversation ID sort (matches startConversation() helper)
    if p_bot_user_id < v_target_id then
      v_uid_a := p_bot_user_id;
      v_uid_b := v_target_id;
    else
      v_uid_a := v_target_id;
      v_uid_b := p_bot_user_id;
    end if;

    -- Find or create conversation
    select id into v_conv_id
    from conversations
    where user_id_a = v_uid_a and user_id_b = v_uid_b
    limit 1;

    if v_conv_id is null then
      insert into conversations (user_id_a, user_id_b, last_message, last_message_at)
      values (v_uid_a, v_uid_b, p_message, now())
      returning id into v_conv_id;
    else
      update conversations
      set last_message = p_message, last_message_at = now()
      where id = v_conv_id;
    end if;

    -- Insert message from bot
    insert into messages (conversation_id, sender_id, content)
    values (v_conv_id, p_bot_user_id, p_message);

    -- Insert notification
    insert into notifications (user_id, actor_id, notif_type, target_type, target_id, read)
    values (v_target_id, p_bot_user_id, 'new_message', 'conversation', v_conv_id::text, false);

  end loop;

  return jsonb_build_object('sent', array_length(p_target_user_ids, 1));
end;
$$;

grant execute on function get_admin_user_list()                        to authenticated;
grant execute on function get_user_activation_stages()                 to authenticated;
grant execute on function get_ghost_users()                            to authenticated;
grant execute on function send_admin_nudge(uuid[], text, uuid)         to authenticated;
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Update constants.js

In `src/lib/constants.js`, add the bot account UUID at the top of the
file alongside other constants. Claude Code should not guess the UUID —
it must ask the user to provide it, since it was created manually in
the Supabase Dashboard in the Prerequisites step.

Add:
```javascript
// Luminary Team bot account — used for admin nudge DMs
// Set this to the UUID from Supabase Auth → Users → Luminary Team
export const LUMINARY_TEAM_USER_ID = '<BOT_UUID>';
```

---

## Step 3 — UsersSection.jsx

Create `src/admin/UsersSection.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';
import { timeAgo } from '../../lib/utils';
import UserDetailPanel from './UserDetailPanel';
import BulkNudgeModal from './BulkNudgeModal';

const STAGE_STYLES = {
  visible:    { bg: T.v2,   color: T.v3,  label: 'Visible'    },
  active:     { bg: T.gr2,  color: T.gr,  label: 'Active'     },
  connected:  { bg: T.bl2,  color: T.bl,  label: 'Connected'  },
  credible:   { bg: T.te2,  color: T.te,  label: 'Credible'   },
  identified: { bg: T.s3,   color: T.mu,  label: 'Identified' },
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

const STAGES   = ['identified', 'credible', 'connected', 'active', 'visible'];
const GHOSTS   = ['stuck', 'almost'];
const MODES    = ['researcher', 'clinician', 'industry', 'clinician_scientist'];

export default function UsersSection({ supabase, user: adminUser }) {
  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [ghostFilter, setGhostFilter] = useState('');
  const [modeFilter, setModeFilter]   = useState('');
  const [selected, setSelected]       = useState(new Set());
  const [detailUser, setDetailUser]   = useState(null);
  const [showNudge, setShowNudge]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_admin_user_list');
    setUsers(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Filtered list
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

  // Bulk select helpers
  const allSelected   = filtered.length > 0 && filtered.every(u => selected.has(u.id));
  const someSelected  = selected.size > 0;
  const toggleAll     = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(u => u.id)));
    }
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
      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
      }}>
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
            gridTemplateColumns: '32px 1fr 110px 90px 90px 50px 50px 100px 80px 80px',
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
            <div>Joined</div>
            <div>Last active</div>
            <div>Posts</div>
            <div>Groups</div>
            <div>Stage</div>
            <div>Ghost</div>
            <div></div>
          </div>

          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              color: T.mu, fontSize: 14,
            }}>
              No users match your filters.
            </div>
          ) : (
            filtered.map((u, i) => (
              <UserRow
                key={u.id}
                user={u}
                isLast={i === filtered.length - 1}
                selected={selected.has(u.id)}
                onToggle={() => toggleOne(u.id)}
                onOpen={() => setDetailUser(u)}
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
          adminUser={adminUser}
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

// ─── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({ user, isLast, selected, onToggle, onOpen }) {
  const stage = STAGE_STYLES[user.activation_stage] || STAGE_STYLES.identified;
  const ghost = user.ghost_segment ? GHOST_STYLES[user.ghost_segment] : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 110px 90px 90px 50px 50px 100px 80px 80px',
        padding: '11px 14px',
        borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`,
        alignItems: 'center',
        background: selected ? T.v2 : 'transparent',
        cursor: 'default',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ cursor: 'pointer' }}
      />

      {/* Name + avatar */}
      <div
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: 'pointer',
        }}
      >
        <Av
          size={30}
          name={user.name}
          color={user.avatar_color}
          url={user.avatar_url || ''}
        />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
            {user.name || '—'}
          </div>
          {user.institution && (
            <div style={{ fontSize: 11.5, color: T.mu }}>
              {user.institution}
            </div>
          )}
        </div>
      </div>

      {/* Work mode */}
      <div style={{ fontSize: 12, color: T.mu }}>
        {WORK_MODE_LABELS[user.work_mode] || user.work_mode || '—'}
      </div>

      {/* Joined */}
      <div style={{ fontSize: 12, color: T.mu }}>
        {user.created_at
          ? new Date(user.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short',
            })
          : '—'}
      </div>

      {/* Last active */}
      <div style={{ fontSize: 12, color: T.mu }}>
        {user.last_active ? timeAgo(user.last_active) : 'Never'}
      </div>

      {/* Posts */}
      <div style={{ fontSize: 13, color: T.text, textAlign: 'center' }}>
        {user.posts_count ?? 0}
      </div>

      {/* Groups */}
      <div style={{ fontSize: 13, color: T.text, textAlign: 'center' }}>
        {user.groups_count ?? 0}
      </div>

      {/* Stage */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px',
          borderRadius: 20, background: stage.bg, color: stage.color,
        }}>
          {stage.label}
        </span>
      </div>

      {/* Ghost */}
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

      {/* Actions */}
      <div>
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
      </div>
    </div>
  );
}

// ─── FilterSelect ─────────────────────────────────────────────────────────────

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
```

---

## Step 4 — UserDetailPanel.jsx

Create `src/admin/UserDetailPanel.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { T } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';
import { timeAgo } from '../../lib/utils';

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
  user, supabase, onClose, onNudge, onNotesUpdated,
}) {
  const [posts, setPosts]       = useState([]);
  const [groups, setGroups]     = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [notes, setNotes]       = useState(user.admin_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

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
  }, [user.id]);

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
            <div style={{
              fontSize: 16, fontWeight: 700, color: T.text,
              marginBottom: 2,
            }}>
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
                ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—' },
              { label: 'Last active', value: user.last_active ? timeAgo(user.last_active) : 'Never' },
              { label: 'Posts',       value: user.posts_count  ?? 0 },
              { label: 'Groups',      value: user.groups_count ?? 0 },
              { label: 'Invite code', value: user.invite_code_used || '—' },
              { label: 'Work mode',   value: user.work_mode || '—' },
            ].map(s => (
              <div key={s.label} style={{
                background: T.s2, borderRadius: 8, padding: '9px 12px',
                border: `1px solid ${T.bdr}`,
              }}>
                <div style={{ fontSize: 11, color: T.mu, marginBottom: 2 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                  {String(s.value)}
                </div>
              </div>
            ))}
          </div>

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
                      <span style={{ color: T.mu, fontSize: 12 }}>
                        {gm.role}
                      </span>
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
              <div style={{ fontSize: 11, color: T.mu, marginTop: 4 }}>
                Saving…
              </div>
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
    <div style={{ fontSize: 13, color: T.mu, fontStyle: 'italic' }}>
      {children}
    </div>
  );
}
```

---

## Step 5 — BulkNudgeModal.jsx

Create `src/admin/BulkNudgeModal.jsx`:

```jsx
import React, { useState } from 'react';
import { T, LUMINARY_TEAM_USER_ID } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';

const TEMPLATES = [
  {
    label: '👋 Welcome',
    text: `Welcome to Luminary! We're glad you're here. If you have any questions or need help getting started, just reply to this message — we're happy to help.`,
  },
  {
    label: '📄 Complete profile',
    text: `Hi! We noticed you haven't finished setting up your Luminary profile yet. Adding your publications and work history helps other researchers find and connect with you. It only takes a few minutes!`,
  },
  {
    label: '✍️ First post',
    text: `Hi! Why not share your first thought on Luminary? It could be a paper you've been reading, a question for the community, or something from your own research. We'd love to hear from you.`,
  },
  {
    label: '🔄 Come back',
    text: `Hi! We've missed you on Luminary. There's been some great activity in the community lately — come take a look when you get a chance.`,
  },
];

export default function BulkNudgeModal({ supabase, targetUsers, onClose, onSent }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  const handleSend = async () => {
    if (!message.trim()) {
      setError('Message cannot be empty.');
      return;
    }
    setSending(true);
    setError('');

    const { error: rpcError } = await supabase.rpc('send_admin_nudge', {
      p_target_user_ids: targetUsers.map(u => u.id),
      p_message:         message.trim(),
      p_bot_user_id:     LUMINARY_TEAM_USER_ID,
    });

    setSending(false);
    if (rpcError) {
      setError(rpcError.message || 'Failed to send nudge.');
      return;
    }

    setSent(true);
    setTimeout(onSent, 1200);
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)', zIndex: 300,
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: T.w, borderRadius: 14, zIndex: 301,
        width: 500, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        padding: '24px',
      }}>
        <div style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 22, color: T.text, marginBottom: 6,
        }}>
          Send nudge
        </div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>
          Sending to {targetUsers.length} user{targetUsers.length > 1 ? 's' : ''} as Luminary Team
        </div>

        {/* Recipient avatars */}
        {targetUsers.length <= 8 && (
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16,
          }}>
            {targetUsers.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: T.s2, borderRadius: 20, padding: '4px 10px 4px 4px',
                fontSize: 12, color: T.text,
              }}>
                <Av size={20} name={u.name} color={u.avatar_color} url="" />
                {u.name}
              </div>
            ))}
          </div>
        )}

        {/* Template buttons */}
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 7,
          }}>
            Quick templates
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => setMessage(t.text)}
                style={{
                  padding: '5px 11px', borderRadius: 20,
                  border: `1px solid ${T.bdr}`, background: T.s2,
                  color: T.text, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message compose */}
        <textarea
          value={message}
          onChange={e => { setMessage(e.target.value); setError(''); }}
          rows={6}
          placeholder="Write your message to these users…"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.s2,
            fontSize: 13, color: T.text, fontFamily: 'inherit',
            resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            marginBottom: 8,
          }}
        />

        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.ro2, color: T.ro, fontSize: 13, marginBottom: 8,
          }}>
            {error}
          </div>
        )}

        {sent && (
          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: T.gr2, color: T.gr, fontSize: 13,
            fontWeight: 600, marginBottom: 8, textAlign: 'center',
          }}>
            ✓ Nudge sent to {targetUsers.length} user{targetUsers.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          marginTop: 12,
        }}>
          <button onClick={onClose} style={{
            padding: '9px 16px', borderRadius: 9,
            border: `1px solid ${T.bdr}`, background: T.w,
            color: T.text, fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent}
            style={{
              padding: '9px 20px', borderRadius: 9, border: 'none',
              background: T.v, color: '#fff', fontWeight: 600,
              fontSize: 13, cursor: (sending || sent) ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: (sending || sent) ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {sending ? <><Spinner size={14} /> Sending…</> : `Send to ${targetUsers.length} user${targetUsers.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </>
  );
}
```

---

## Step 6 — Wire UsersSection in AdminShell.jsx

Add the import:

```javascript
import UsersSection from './UsersSection';
```

Extend the content area conditional to handle 'users':

```jsx
{/* Main content area */}
<div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
  {section === 'invites'
    ? <InvitesSection supabase={supabase} />
    : section === 'users'
    ? <UsersSection supabase={supabase} user={user} />
    : <AdminSectionPlaceholder section={section} />
  }
</div>
```

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- `groups.owner_id`, `groups.is_private` (legacy fields)
- `projects.user_id` (legacy, coexists with `created_by`)
- Any existing feed, profile, groups, projects, library, messages screens
- Existing InvitesSection — do not modify
- No delete/suspend functionality — deliberately excluded
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Complete the Prerequisites (bot account + profile) — do this first
#    before running any code changes.

# 2. Add LUMINARY_TEAM_USER_ID to constants.js manually with the bot UUID.

# 3. Run migration_admin_users.sql in Supabase SQL Editor

# 4. Verify:
#    select count(*) from profiles where name = 'Luminary Team';
#    -- should return 1
#
#    select get_admin_user_list();
#    -- should return JSON array of users (bot excluded)

# 5. Deploy:
git add . && git commit -m "Phase 6C: Admin user management — table, detail panel, bulk nudge, bot account" && git push
```

---

## Remind the user

**Before testing nudge, make sure:**
1. `LUMINARY_TEAM_USER_ID` in `constants.js` matches the actual UUID from
   Supabase Auth → Users → Luminary Team row.
2. The bot has a profile row (run the Prerequisites SQL if not done).

**Testing nudge end-to-end:**
1. In admin panel → Users, check one user's checkbox
2. Click "Send nudge" in sticky bar
3. Write a message or pick a template
4. Click send
5. Log in as that user in a separate browser session
6. Check Messages — should see a conversation from "Luminary Team"
7. Check notification bell — should have an unread notification

**If nudge fails with "not authorized":**
Confirm `is_admin = true` on your profile and that `LUMINARY_TEAM_USER_ID`
is a valid UUID (not the placeholder string `'<BOT_UUID>'`).

---

## Testing checklist

**Prerequisites:**
- [ ] Luminary Team user exists in Supabase Auth → Users
- [ ] Luminary Team profile row exists in profiles table
- [ ] `LUMINARY_TEAM_USER_ID` in constants.js matches the Supabase UUID
- [ ] Not a placeholder string

**Migration:**
- [ ] `migration_admin_users.sql` runs cleanly
- [ ] `profiles.admin_notes` column exists
- [ ] `get_admin_user_list()` returns JSON array (bot excluded from results)
- [ ] `get_user_activation_stages()` returns array of 5 stage objects with counts
- [ ] `get_ghost_users()` returns array (may be empty if no ghost users)
- [ ] `send_admin_nudge()` exists in DB

**Users table:**
- [ ] Navigating to Users in AdminShell renders UsersSection (not "Coming soon")
- [ ] All users load with correct columns
- [ ] Name + avatar + institution display correctly
- [ ] Work mode column shows correct label
- [ ] Joined date shows correctly
- [ ] Last active shows "Never" for users with no activity
- [ ] Posts + groups counts are accurate
- [ ] Activation stage pill shows correct colour and label
- [ ] Ghost segment pill appears only for stuck/almost users
- [ ] Bot account (Luminary Team) does NOT appear in the user list

**Filters + search:**
- [ ] Search filters by name, institution, title
- [ ] Stage filter works for each of the 5 stages
- [ ] Ghost filter shows only stuck / almost users
- [ ] Work mode filter works for each mode
- [ ] Clear button resets all filters
- [ ] Filters combine correctly (e.g. stage=active + mode=clinician)

**Bulk select:**
- [ ] Checkbox on each row selects/deselects that user
- [ ] Header checkbox selects all visible (filtered) users
- [ ] Sticky bar appears when ≥1 user selected
- [ ] Sticky bar shows correct count
- [ ] "Clear" in sticky bar deselects all
- [ ] Selecting then filtering updates the count correctly

**User detail panel:**
- [ ] Clicking "View" or username opens slide-in panel
- [ ] Clicking backdrop closes panel
- [ ] Avatar, name, title, institution display correctly
- [ ] Stage + ghost badges match the table row
- [ ] Stats grid shows correct joined, last active, posts, groups, invite code, work mode
- [ ] Recent posts (up to 5) load and display
- [ ] Groups list loads and displays
- [ ] Admin notes textarea saves on blur (check DB after)
- [ ] Notes persist after closing and reopening the panel
- [ ] "View profile ↗" opens `/p/:slug` in new tab (only shown if slug exists)
- [ ] "Send nudge" in panel opens BulkNudgeModal with just this user

**Bulk nudge:**
- [ ] Modal opens with correct user count in header
- [ ] Recipient avatars shown for ≤8 users
- [ ] Template buttons populate the message textarea
- [ ] Empty message shows validation error
- [ ] Successful send shows green confirmation + auto-closes
- [ ] Target user receives DM from "Luminary Team" in Messages screen
- [ ] Target user receives unread notification
- [ ] Non-admin calling `send_admin_nudge` RPC returns "not authorized"

**Isolation:**
- [ ] No changes to existing feed, profile, groups, projects, library screens
- [ ] InvitesSection still works after AdminShell change
- [ ] `npm run build` succeeds with no new warnings
