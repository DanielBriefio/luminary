import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import StorageQuotaBar from '../components/StorageQuotaBar';

const SOURCE_GROUPS = [
  { kind: 'post',         label: 'Post attachments',      icon: '📝', deletable: true,  hint: 'Deleting leaves the post; the file is replaced with a placeholder.' },
  { kind: 'group_post',   label: 'Group post attachments', icon: '👥', deletable: true,  hint: 'Same as post attachments — the group post stays.' },
  { kind: 'library',      label: 'Library files',          icon: '📚', deletable: true,  hint: 'Deletes the library entry and the underlying file.' },
  { kind: 'avatar',        label: 'Profile photo',         icon: '🖼️', deletable: false, hint: 'Replace via Profile → upload a new photo.' },
  { kind: 'profile_cover', label: 'Profile cover',         icon: '🌅', deletable: false, hint: 'Replace via Profile → upload a new cover.' },
  { kind: 'group_avatar',  label: 'Group avatars',         icon: '🏷️', deletable: false, hint: 'Replace via Group profile.' },
  { kind: 'group_cover',   label: 'Group covers',          icon: '🎨', deletable: false, hint: 'Replace via Group profile.' },
  { kind: 'unknown',       label: 'Other',                  icon: '📎', deletable: true,  hint: 'Files we couldn\'t link back to a post or library entry.' },
];

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

function buildContextHref(file) {
  if (file.source_kind === 'post' && file.source_id) return `/s/${file.source_id}`;
  if (file.source_kind === 'group_post' && file.context_group_slug) return `/g/${file.context_group_slug}`;
  if (file.source_kind === 'group_avatar' && file.context_group_slug) return `/g/${file.context_group_slug}`;
  if (file.source_kind === 'group_cover'  && file.context_group_slug) return `/g/${file.context_group_slug}`;
  return null;
}

export default function LibraryFilesView({ isMobile = false }) {
  const [loading, setLoading]   = useState(true);
  const [usage,   setUsage]     = useState(null);
  const [quotaMb, setQuotaMb]   = useState(null);
  const [busyId,  setBusyId]    = useState(null);
  const [err,     setErr]       = useState('');

  const refresh = async () => {
    setLoading(true);
    setErr('');
    const [usageRes, quotaRes] = await Promise.all([
      supabase.rpc('get_my_storage_usage'),
      supabase.rpc('get_storage_quota_mb'),
    ]);
    if (usageRes.error) setErr(usageRes.error.message);
    else setUsage(usageRes.data);
    setQuotaMb(quotaRes.data || 50);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const grouped = useMemo(() => {
    const files = usage?.files || [];
    const out = {};
    for (const g of SOURCE_GROUPS) out[g.kind] = [];
    for (const f of files) {
      (out[f.source_kind] || (out['unknown'] = out['unknown'] || [])).push(f);
    }
    return out;
  }, [usage]);

  const deleteFile = async (file) => {
    const cfg = SOURCE_GROUPS.find(g => g.kind === file.source_kind);
    if (!cfg?.deletable) return;
    if (!window.confirm(`Delete "${file.context_label || file.file_name || 'this file'}"?\n\n${cfg.hint}`)) return;
    setBusyId(file.id);
    setErr('');
    const { data, error } = await supabase.rpc('delete_user_file', { p_id: file.id });
    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.bucket && row?.path) {
      await supabase.storage.from(row.bucket).remove([row.path]);
    }
    setBusyId(null);
    refresh();
  };

  if (loading) {
    return <div style={{ display:'flex', justifyContent:'center', padding:60 }}><Spinner/></div>;
  }
  if (!usage) {
    return <div style={{ padding:24, color:T.ro }}>{err || 'Could not load files.'}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ fontSize:16 }}>📎</span>
        <div style={{
          fontSize:11, fontWeight:700, color:T.mu, textTransform:'uppercase',
          letterSpacing:'.07em',
        }}>
          Files · All uploads
        </div>
      </div>
      <div style={{ fontSize:13, color:T.mu, marginBottom:18, lineHeight:1.6 }}>
        Every file you've uploaded — avatars, post attachments, library PDFs.
        Delete a post attachment and the post stays in place with a "file removed" placeholder.
      </div>

      {/* Total card */}
      <div style={{
        background:T.w, border:`1px solid ${T.bdr}`, borderRadius:14,
        padding:'16px 18px', marginBottom:18,
      }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:18, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.mu, letterSpacing:0.4, textTransform:'uppercase' }}>
              Total used
            </div>
            <div style={{ fontFamily:"'DM Serif Display', serif", fontSize: isMobile ? 26 : 30, color:T.text, lineHeight:1.1 }}>
              {fmtBytes(usage.total_bytes)}
            </div>
            <div style={{ fontSize:13, color:T.mu, marginTop:2 }}>
              {usage.total_files} {usage.total_files === 1 ? 'file' : 'files'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginLeft:'auto' }}>
            {(usage.buckets || []).map(b => (
              <div key={b.bucket} style={{
                background:T.s2, border:`1px solid ${T.bdr}`, borderRadius:10,
                padding:'7px 11px', fontSize:12,
              }}>
                <div style={{ fontWeight:700, color:T.text }}>{b.bucket}</div>
                <div style={{ color:T.mu, marginTop:1 }}>{fmtBytes(b.bytes)} · {b.files}</div>
              </div>
            ))}
          </div>
        </div>
        {quotaMb != null && (
          <div style={{ marginTop:14 }}>
            <StorageQuotaBar usedBytes={usage.total_bytes || 0} quotaBytes={quotaMb * 1024 * 1024} />
          </div>
        )}
      </div>

      {err && (
        <div style={{
          background:T.ro2, border:`1px solid ${T.ro}`, borderRadius:10,
          padding:'10px 14px', fontSize:13, color:T.ro, marginBottom:14,
        }}>{err}</div>
      )}

      {/* Groups */}
      {SOURCE_GROUPS.map(group => {
        const files = grouped[group.kind] || [];
        if (files.length === 0) return null;
        const groupBytes = files.reduce((s, f) => s + (f.size_bytes || 0), 0);
        return (
          <section key={group.kind} style={{ marginBottom:20 }}>
            <div style={{
              display:'flex', alignItems:'baseline', gap:10, marginBottom:8,
            }}>
              <div style={{ fontSize:16 }}>{group.icon}</div>
              <h2 style={{
                fontFamily:"'DM Serif Display', serif", fontSize:16, color:T.text,
                margin:0,
              }}>{group.label}</h2>
              <div style={{ fontSize:12, color:T.mu }}>
                {files.length} {files.length === 1 ? 'file' : 'files'} · {fmtBytes(groupBytes)}
              </div>
            </div>
            {!group.deletable && (
              <div style={{ fontSize:12, color:T.mu, marginBottom:8, fontStyle:'italic' }}>
                {group.hint}
              </div>
            )}
            <div style={{
              background:T.w, border:`1px solid ${T.bdr}`, borderRadius:12,
              overflow:'hidden',
            }}>
              {files.map((f, i) => {
                const href = buildContextHref(f);
                return (
                  <div key={f.id} style={{
                    display:'grid',
                    gridTemplateColumns: isMobile ? '1fr auto' : '1fr auto auto auto',
                    alignItems:'center', gap: isMobile ? 8 : 14,
                    padding: isMobile ? '10px 12px' : '12px 14px',
                    borderTop: i === 0 ? 'none' : `1px solid ${T.bdr}`,
                    opacity: f.already_deleted ? 0.6 : 1,
                  }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{
                        fontSize:13, fontWeight:600, color:T.text,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                      }}>
                        {f.context_label || f.file_name || f.path.split('/').pop()}
                        {f.already_deleted && (
                          <span style={{ fontSize:11, color:T.mu, fontWeight:500, marginLeft:8, fontStyle:'italic' }}>
                            · post placeholder shown
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11.5, color:T.mu, marginTop:2 }}>
                        {f.file_name || f.path.split('/').pop()} · {fmtDate(f.created_at)}
                        {isMobile && (
                          <span> · {fmtBytes(f.size_bytes)}</span>
                        )}
                      </div>
                    </div>
                    {!isMobile && (
                      <div style={{ fontSize:12, color:T.mu, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                        {fmtBytes(f.size_bytes)}
                      </div>
                    )}
                    {!isMobile && (
                      <div>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:12, color:T.v, fontWeight:600, whiteSpace:'nowrap' }}>
                            View ↗
                          </a>
                        ) : <span style={{ fontSize:12, color:T.mu }}>—</span>}
                      </div>
                    )}
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      {isMobile && href && (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize:12, color:T.v, fontWeight:600, whiteSpace:'nowrap' }}>
                          View ↗
                        </a>
                      )}
                      {group.deletable ? (
                        <button
                          onClick={() => deleteFile(f)}
                          disabled={busyId === f.id}
                          style={{
                            fontSize:12, color:T.ro, background:'transparent',
                            border:`1px solid ${T.ro}`, borderRadius:7,
                            padding:'4px 10px', cursor: busyId === f.id ? 'wait' : 'pointer',
                            fontFamily:'inherit',
                            opacity: busyId === f.id ? 0.5 : 1,
                          }}
                        >
                          {busyId === f.id ? '…' : 'Delete'}
                        </button>
                      ) : (
                        <span style={{ fontSize:11, color:T.mu, fontStyle:'italic' }}>replace via profile</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {(usage.files || []).length === 0 && (
        <div style={{ fontSize:13.5, color:T.mu, fontStyle:'italic', textAlign:'center', padding:40 }}>
          You haven't uploaded anything yet.
        </div>
      )}

      <div style={{ marginTop:18 }}>
        <Btn onClick={refresh}>↻ Refresh</Btn>
      </div>
    </div>
  );
}
