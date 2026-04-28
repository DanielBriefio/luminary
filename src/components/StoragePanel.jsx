import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from './Btn';
import Spinner from './Spinner';
import StorageQuotaBar from './StorageQuotaBar';

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function StoragePanel({ onOpenStorage }) {
  const [loading, setLoading] = useState(true);
  const [usage,   setUsage]   = useState(null);
  const [quotaMb, setQuotaMb] = useState(null);
  const [err,     setErr]     = useState('');

  useEffect(() => {
    (async () => {
      const [usageRes, quotaRes] = await Promise.all([
        supabase.rpc('get_my_storage_usage'),
        supabase.rpc('get_storage_quota_mb'),
      ]);
      if (usageRes.error) setErr(usageRes.error.message);
      else setUsage(usageRes.data);
      setQuotaMb(quotaRes.data || 50);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}><Spinner/></div>;
  }
  if (!usage) {
    return <div style={{ fontSize: 12.5, color: T.ro }}>{err || 'Could not load storage usage.'}</div>;
  }

  const total      = usage.total_bytes || 0;
  const totalFiles = usage.total_files || 0;
  const buckets    = usage.buckets || [];

  return (
    <div>
      <div style={{
        background: T.v2, border: `1px solid ${T.v}30`, borderRadius: 12,
        padding: '14px 16px',
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {buckets.map(b => (
              <div key={b.bucket} style={{
                background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 8,
                padding: '5px 9px', fontSize: 11.5, color: T.text,
              }}>
                <span style={{ fontWeight: 700 }}>{b.bucket}</span>
                <span style={{ color: T.mu, marginLeft: 5 }}>
                  {fmtBytes(b.bytes)}
                </span>
              </div>
            ))}
          </div>
        )}

        {quotaMb != null && (
          <div style={{ marginTop: 12 }}>
            <StorageQuotaBar usedBytes={total} quotaBytes={quotaMb * 1024 * 1024} compact />
          </div>
        )}

        {onOpenStorage && (
          <div style={{ marginTop: 12 }}>
            <Btn variant="v" onClick={onOpenStorage}>Open Library → Files</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
