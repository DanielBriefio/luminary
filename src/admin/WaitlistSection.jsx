import { useEffect, useMemo, useState } from 'react';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows) {
  const headers = ['Created', 'Name', 'Email', 'Institution', 'Role', 'Referral', 'Priority'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.created_at),
      csvEscape(r.full_name),
      csvEscape(r.email),
      csvEscape(r.institution),
      csvEscape(r.role_title),
      csvEscape(r.referral_source),
      r.is_priority ? 'yes' : 'no',
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const ts   = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `luminary-waitlist-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function WaitlistSection({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [rows,    setRows]    = useState([]);
  const [err,     setErr]     = useState('');
  const [search,  setSearch]  = useState('');
  const [priorityOnly, setPriorityOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_waitlist');
      if (error) setErr(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    let r = rows;
    if (priorityOnly) r = r.filter(x => x.is_priority);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(x =>
        (x.full_name       || '').toLowerCase().includes(q) ||
        (x.email           || '').toLowerCase().includes(q) ||
        (x.institution     || '').toLowerCase().includes(q) ||
        (x.role_title      || '').toLowerCase().includes(q) ||
        (x.referral_source || '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, search, priorityOnly]);

  if (loading) return <div style={{ padding: 40, display:'flex', justifyContent:'center' }}><Spinner/></div>;

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: T.text, margin: '0 0 6px' }}>
        Waitlist
      </h1>
      <div style={{ fontSize: 13, color: T.mu, marginBottom: 20 }}>
        Signups from <code>/</code> — people awaiting an invite. Emails are stored lowercase.
      </div>

      {err && (
        <div style={{ background: T.ro2, border: `1px solid ${T.ro}`, color: T.ro, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {err}
        </div>
      )}

      {/* Stats + actions */}
      <div style={{
        display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20,
        alignItems: 'flex-end',
      }}>
        <Stat label="Total"    value={rows.length} />
        <Stat label="Priority" value={rows.filter(r => r.is_priority).length} />
        <div style={{ flex: 1 }}/>
        <button
          onClick={() => downloadCsv(rows)}
          disabled={rows.length === 0}
          style={{
            padding: '9px 16px', borderRadius: 9,
            background: rows.length === 0 ? T.s3 : T.v,
            color: rows.length === 0 ? T.mu : '#fff',
            border: 'none', fontSize: 13, fontWeight: 600,
            cursor: rows.length === 0 ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, institution…"
          style={{
            flex: '1 1 280px', minWidth: 220, padding: '9px 12px',
            borderRadius: 8, border: `1px solid ${T.bdr}`, fontSize: 13,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.text, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={priorityOnly}
            onChange={e => setPriorityOnly(e.target.checked)}
          />
          Priority only
        </label>
      </div>

      {/* Table */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '110px 1.2fr 1.4fr 1.2fr 1fr 90px 80px',
          padding: '10px 16px', background: T.s2,
          borderBottom: `1px solid ${T.bdr}`,
          fontSize: 11, fontWeight: 700, color: T.mu,
          letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          <div>Joined</div>
          <div>Name</div>
          <div>Email</div>
          <div>Institution</div>
          <div>Role</div>
          <div>Referral</div>
          <div style={{ textAlign: 'right' }}>Priority</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 32, fontSize: 13, color: T.mu, textAlign: 'center' }}>
            {rows.length === 0 ? 'No waitlist signups yet.' : 'No matches.'}
          </div>
        ) : filtered.map(r => (
          <div key={r.id} style={{
            display: 'grid',
            gridTemplateColumns: '110px 1.2fr 1.4fr 1.2fr 1fr 90px 80px',
            padding: '10px 16px',
            borderBottom: `1px solid ${T.bdr}`,
            alignItems: 'center', fontSize: 13, color: T.text,
          }}>
            <div style={{ color: T.mu, fontSize: 12 }}>{fmtDate(r.created_at)}</div>
            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.full_name || '—'}</div>
            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              <a href={`mailto:${r.email}`} style={{ color: T.v, textDecoration: 'none' }}>{r.email}</a>
            </div>
            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: r.institution ? T.text : T.mu }}>
              {r.institution || '—'}
            </div>
            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: r.role_title ? T.text : T.mu }}>
              {r.role_title || '—'}
            </div>
            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: r.referral_source ? T.text : T.mu, fontSize: 12 }}>
              {r.referral_source || '—'}
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.is_priority && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700,
                  background: T.am2, color: T.am,
                  padding: '2px 8px', borderRadius: 20,
                  letterSpacing: 0.3,
                }}>
                  PRIORITY
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
      padding: '12px 16px', minWidth: 110,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: T.text, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
