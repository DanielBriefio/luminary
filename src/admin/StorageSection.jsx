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

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const SOURCE_ICONS = {
  post:           '📝',
  group_post:     '👥',
  library:        '📚',
  avatar:         '🖼️',
  profile_cover:  '🌅',
  group_avatar:   '🏷️',
  group_cover:    '🎨',
  unknown:        '📎',
};

function buildContextHref(file) {
  if (file.source_kind === 'post' && file.source_id) return `/s/${file.source_id}`;
  if (file.source_kind === 'group_post' && file.context_group_slug) return `/g/${file.context_group_slug}`;
  if (file.source_kind === 'group_avatar' && file.context_group_slug) return `/g/${file.context_group_slug}`;
  if (file.source_kind === 'group_cover'  && file.context_group_slug) return `/g/${file.context_group_slug}`;
  return null;
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
  const [expanded, setExpanded] = useState(null);  // user_id of currently expanded row
  const [filesByUser, setFilesByUser] = useState({});  // { user_id: { loading, files, err } }
  const [quotaMb,    setQuotaMb]    = useState('');
  const [quotaInput, setQuotaInput] = useState('');
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaMsg,   setQuotaMsg]   = useState('');

  useEffect(() => {
    (async () => {
      const [adminRes, quotaRes] = await Promise.all([
        supabase.rpc('get_admin_storage_usage'),
        supabase.rpc('get_admin_config', { p_key: 'storage_quota_mb' }),
      ]);
      if (adminRes.error) setErr(adminRes.error.message);
      else setData(adminRes.data);
      const v = quotaRes.data ?? 50;
      setQuotaMb(String(v));
      setQuotaInput(String(v));
      setLoading(false);
    })();
  }, [supabase]);

  const saveQuota = async () => {
    const n = parseInt(quotaInput, 10);
    if (isNaN(n) || n < 1) { setQuotaMsg('Enter a positive number.'); return; }
    setSavingQuota(true); setQuotaMsg('');
    const { error } = await supabase.rpc('set_admin_config', {
      p_key:   'storage_quota_mb',
      p_value: n,
    });
    setSavingQuota(false);
    if (error) { setQuotaMsg(error.message); return; }
    setQuotaMb(String(n));
    setQuotaMsg('Saved.');
    setTimeout(() => setQuotaMsg(''), 2500);
  };

  const sortedUsers = useMemo(() => {
    if (!data?.per_user) return [];
    return [...data.per_user].sort(SORTS[sort] || SORTS.bytes);
  }, [data, sort]);

  const toggleExpand = async (userId) => {
    if (expanded === userId) { setExpanded(null); return; }
    setExpanded(userId);
    if (filesByUser[userId]?.files) return;  // already loaded
    setFilesByUser(prev => ({ ...prev, [userId]: { loading: true } }));
    const { data: files, error } = await supabase.rpc('get_admin_user_storage_files', { p_user_id: userId });
    setFilesByUser(prev => ({
      ...prev,
      [userId]: { loading: false, files: files || [], err: error?.message || '' },
    }));
  };

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner/></div>;
  if (err)     return <div style={{ color: T.ro, fontSize: 13 }}>{err}</div>;
  if (!data)   return null;

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: T.text, margin: '0 0 6px' }}>
        Storage
      </h1>
      <div style={{ fontSize: 13, color: T.mu, marginBottom: 16 }}>
        Per-user breakdown of files tracked in <code>user_storage_files</code>. Click a row to view that user's files.
      </div>

      {/* Quota config */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
        padding: '14px 16px', marginBottom: 24,
        display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
            Per-user storage quota
          </div>
          <div style={{ fontSize: 12.5, color: T.mu, lineHeight: 1.5 }}>
            Hard cap applied to every user before each upload. Current value: <b>{quotaMb} MB</b>.
            On the Supabase free tier (1 GB project pool), 50 MB × 20 users ≈ project cap.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number" min={1}
            value={quotaInput}
            onChange={e => setQuotaInput(e.target.value)}
            style={{
              width: 90, padding: '7px 10px', borderRadius: 8,
              border: `1px solid ${T.bdr}`, fontSize: 13,
              fontFamily: 'inherit', outline: 'none', textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <span style={{ fontSize: 12.5, color: T.mu }}>MB</span>
          <button
            onClick={saveQuota}
            disabled={savingQuota || quotaInput === quotaMb}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: 'none', background: quotaInput === quotaMb ? T.s3 : T.v,
              color: quotaInput === quotaMb ? T.mu : '#fff',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              cursor: savingQuota || quotaInput === quotaMb ? 'default' : 'pointer',
              opacity: savingQuota ? 0.6 : 1,
            }}
          >
            {savingQuota ? '…' : 'Save'}
          </button>
          {quotaMsg && (
            <span style={{ fontSize: 12, color: quotaMsg === 'Saved.' ? T.gr : T.ro }}>
              {quotaMsg}
            </span>
          )}
        </div>
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
          gridTemplateColumns: '24px 36px 1fr 110px 80px',
          padding: '10px 16px',
          background: T.s2,
          borderBottom: `1px solid ${T.bdr}`,
          fontSize: 11, fontWeight: 700, color: T.mu,
          letterSpacing: 0.3, textTransform: 'uppercase',
        }}>
          <div></div>
          <div></div>
          <SortBtn active={sort === 'name'}  onClick={() => setSort('name')}>User</SortBtn>
          <SortBtn active={sort === 'bytes'} onClick={() => setSort('bytes')} align="right">Used</SortBtn>
          <SortBtn active={sort === 'files'} onClick={() => setSort('files')} align="right">Files</SortBtn>
        </div>

        {sortedUsers.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: T.mu, textAlign: 'center' }}>
            No tracked uploads yet.
          </div>
        ) : sortedUsers.map(u => {
          const isOpen = expanded === u.user_id;
          const detail = filesByUser[u.user_id];
          return (
            <div key={u.user_id} style={{ borderBottom: `1px solid ${T.bdr}` }}>
              <div
                onClick={() => toggleExpand(u.user_id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 36px 1fr 110px 80px',
                  padding: '10px 16px',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isOpen ? T.s2 : 'transparent',
                }}
              >
                <div style={{
                  fontSize: 12, color: T.mu,
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform .15s',
                }}>▶</div>
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
              {isOpen && (
                <div style={{ background: T.bg, padding: '10px 16px 14px 56px', borderTop: `1px solid ${T.bdr}` }}>
                  {detail?.loading && <div style={{ padding:10, display:'flex' }}><Spinner/></div>}
                  {detail?.err && <div style={{ color:T.ro, fontSize:12.5 }}>{detail.err}</div>}
                  {!detail?.loading && !detail?.err && (detail?.files?.length === 0
                    ? <div style={{ fontSize:12.5, color:T.mu, fontStyle:'italic' }}>No tracked files for this user.</div>
                    : (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {detail?.files?.map(f => {
                          const href = buildContextHref(f);
                          return (
                            <div key={f.id} style={{
                              display:'grid',
                              gridTemplateColumns:'22px 1fr auto auto auto',
                              alignItems:'center', gap:10,
                              padding:'8px 12px',
                              background:T.w,
                              border:`1px solid ${T.bdr}`,
                              borderRadius:8,
                              opacity: f.already_deleted ? 0.6 : 1,
                            }}>
                              <div style={{ fontSize:14 }}>{SOURCE_ICONS[f.source_kind] || SOURCE_ICONS.unknown}</div>
                              <div style={{ minWidth:0 }}>
                                <div style={{
                                  fontSize:12.5, fontWeight:600, color:T.text,
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                                }}>
                                  {f.context_label || f.file_name || f.path.split('/').pop()}
                                  {f.already_deleted && (
                                    <span style={{ fontSize:10.5, color:T.mu, fontWeight:500, marginLeft:6, fontStyle:'italic' }}>
                                      · placeholder
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize:11, color:T.mu, marginTop:1 }}>
                                  {f.source_kind} · {fmtDate(f.created_at)}
                                </div>
                              </div>
                              <div style={{ fontSize:11.5, color:T.mu, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                                {fmtBytes(f.size_bytes)}
                              </div>
                              <div>
                                {href ? (
                                  <a href={href} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize:11.5, color:T.v, fontWeight:600, whiteSpace:'nowrap' }}>
                                    View ↗
                                  </a>
                                ) : <span style={{ fontSize:11.5, color:T.mu }}>—</span>}
                              </div>
                              <div style={{
                                fontSize:11, color:T.mu, fontFamily:'monospace',
                                whiteSpace:'nowrap', maxWidth:180,
                                overflow:'hidden', textOverflow:'ellipsis',
                              }} title={`${f.bucket}/${f.path}`}>
                                {f.bucket}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
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
