import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from './Btn';
import Spinner from './Spinner';

const SOURCE_LABELS = {
  post:         { icon: '📝', label: 'Post attachment',  deletable: true  },
  group_post:   { icon: '👥', label: 'Group post',       deletable: true  },
  library:      { icon: '📚', label: 'Library file',     deletable: true  },
  avatar:       { icon: '🖼️', label: 'Profile photo',    deletable: false },
  group_avatar: { icon: '🏷️', label: 'Group avatar',     deletable: false },
  group_cover:  { icon: '🎨', label: 'Group cover',      deletable: false },
  unknown:      { icon: '📎', label: 'Other',            deletable: true  },
};

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function StoragePanel() {
  const [loading, setLoading] = useState(true);
  const [usage,   setUsage]   = useState(null);
  const [busyId,  setBusyId]  = useState(null);
  const [err,     setErr]     = useState('');

  const refresh = async () => {
    setLoading(true);
    setErr('');
    const { data, error } = await supabase.rpc('get_my_storage_usage');
    if (error) setErr(error.message);
    else setUsage(data);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const deleteFile = async (file) => {
    const cfg = SOURCE_LABELS[file.source_kind] || SOURCE_LABELS.unknown;
    if (!cfg.deletable) return;
    if (!window.confirm(`Delete "${file.file_name || 'this file'}"? Posts will stay; the file will be removed and replaced with a "file removed" placeholder.`)) return;
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
    return <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner/></div>;
  }
  if (!usage) {
    return <div style={{ fontSize: 12.5, color: T.ro }}>{err || 'Could not load storage usage.'}</div>;
  }

  const total      = usage.total_bytes || 0;
  const totalFiles = usage.total_files || 0;
  const buckets    = usage.buckets || [];
  const files      = usage.files   || [];

  return (
    <div>
      {/* Total card */}
      <div style={{
        background: T.v2, border: `1px solid ${T.v}30`, borderRadius: 12,
        padding: '14px 16px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.v3, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>
          Total used
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: T.text }}>
          {fmtBytes(total)}
        </div>
        <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
          across {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
        </div>

        {buckets.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
            {buckets.map(b => (
              <div key={b.bucket} style={{
                background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 8,
                padding: '6px 10px', fontSize: 12, color: T.text,
              }}>
                <span style={{ fontWeight: 700 }}>{b.bucket}</span>
                <span style={{ color: T.mu, marginLeft: 6 }}>
                  {fmtBytes(b.bytes)} · {b.files}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && (
        <div style={{
          background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 8,
          padding: '8px 12px', fontSize: 12.5, color: T.ro, marginBottom: 12,
        }}>{err}</div>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.mu, fontStyle: 'italic' }}>
          No tracked uploads yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map(f => {
            const cfg = SOURCE_LABELS[f.source_kind] || SOURCE_LABELS.unknown;
            return (
              <div key={f.id} style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr auto auto',
                alignItems: 'center', gap: 10,
                padding: '10px 12px',
                border: `1px solid ${T.bdr}`, borderRadius: 10, background: T.w,
              }}>
                <div style={{ fontSize: 18 }}>{cfg.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{f.file_name || f.path.split('/').pop()}</div>
                  <div style={{ fontSize: 11.5, color: T.mu, marginTop: 1 }}>
                    {cfg.label} · {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtBytes(f.size_bytes)}
                </div>
                <div>
                  {cfg.deletable ? (
                    <button
                      onClick={() => deleteFile(f)}
                      disabled={busyId === f.id}
                      style={{
                        fontSize: 12, color: T.ro, background: 'transparent',
                        border: `1px solid ${T.ro}`, borderRadius: 6,
                        padding: '4px 10px', cursor: busyId === f.id ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: busyId === f.id ? 0.5 : 1,
                      }}
                    >
                      {busyId === f.id ? '...' : 'Delete'}
                    </button>
                  ) : (
                    <span style={{ fontSize: 11, color: T.mu }}>replace via {cfg.label.toLowerCase()}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Btn onClick={refresh}>↻ Refresh</Btn>
      </div>
    </div>
  );
}
