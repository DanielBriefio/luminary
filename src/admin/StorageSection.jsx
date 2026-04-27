import { useEffect, useMemo, useState } from 'react';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import Av from '../components/Av';

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const SORTS = {
  bytes: (a, b) => (b.bytes || 0) - (a.bytes || 0),
  files: (a, b) => (b.files || 0) - (a.files || 0),
  name:  (a, b) => (a.user_name || '').localeCompare(b.user_name || ''),
};

export default function StorageSection({ supabase }) {
  const [loading, setLoading] = useState(true);
  const [data,    setData]    = useState(null);
  const [err,     setErr]     = useState('');
  const [sort,    setSort]    = useState('bytes');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_admin_storage_usage');
      if (error) setErr(error.message);
      else setData(data);
      setLoading(false);
    })();
  }, [supabase]);

  const sortedUsers = useMemo(() => {
    if (!data?.per_user) return [];
    return [...data.per_user].sort(SORTS[sort] || SORTS.bytes);
  }, [data, sort]);

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner/></div>;
  if (err)     return <div style={{ color: T.ro, fontSize: 13 }}>{err}</div>;
  if (!data)   return null;

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: T.text, margin: '0 0 6px' }}>
        Storage
      </h1>
      <div style={{ fontSize: 13, color: T.mu, marginBottom: 24 }}>
        Per-user breakdown of files tracked in <code>user_storage_files</code>.
      </div>

      {/* Totals */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Total used" value={fmtBytes(data.total_bytes)} sub={`${data.total_files} files`} />
        {(data.per_bucket || []).map(b => (
          <Stat key={b.bucket} label={b.bucket} value={fmtBytes(b.bytes)} sub={`${b.files} files`} />
        ))}
      </div>

      {/* Per-user table */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '36px 1fr 110px 80px',
          padding: '10px 16px',
          background: T.s2,
          borderBottom: `1px solid ${T.bdr}`,
          fontSize: 11, fontWeight: 700, color: T.mu,
          letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          <div></div>
          <SortBtn active={sort === 'name'}  onClick={() => setSort('name')}>User</SortBtn>
          <SortBtn active={sort === 'bytes'} onClick={() => setSort('bytes')} align="right">Used</SortBtn>
          <SortBtn active={sort === 'files'} onClick={() => setSort('files')} align="right">Files</SortBtn>
        </div>

        {sortedUsers.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: T.mu, textAlign: 'center' }}>
            No tracked uploads yet.
          </div>
        ) : sortedUsers.map(u => (
          <div key={u.user_id} style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 110px 80px',
            padding: '10px 16px',
            borderBottom: `1px solid ${T.bdr}`,
            alignItems: 'center',
          }}>
            <Av name={u.user_name} color={u.avatar_color} url={u.avatar_url} size={28} />
            <div style={{ fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.user_name || '(unknown user)'}
              {u.user_slug && (
                <span style={{ fontSize: 11.5, color: T.mu, marginLeft: 6 }}>/p/{u.user_slug}</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {fmtBytes(u.bytes)}
            </div>
            <div style={{ fontSize: 13, color: T.mu, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {u.files}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
      padding: '12px 16px', minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: T.text, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: T.mu, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function SortBtn({ children, onClick, active, align }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none', padding: 0,
        fontSize: 11, fontWeight: 700, color: active ? T.v3 : T.mu,
        letterSpacing: 0.3, textTransform: 'uppercase',
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: align || 'left',
      }}
    >
      {children}{active ? ' ↓' : ''}
    </button>
  );
}
