// Per-user storage quota helper.
//
// The per-user total quota is admin-configurable via
// admin_config.storage_quota_mb (default 50 MB) — read at runtime via
// the get_storage_quota_mb() RPC.
//
// Per-file size caps are enforced at each upload call site (they're
// already in place for posts / library / avatars / covers — see those
// files for the category-aware limits).
//
// Usage at an upload site:
//   import { checkRemainingQuota } from '../lib/storageQuota';
//   const err = await checkRemainingQuota(file.size, { skipForSingleton: false });
//   if (err) { alert(err); return; }
//   // ...continue with upload
//
// Singletons (avatar, profile_cover, group_avatar, group_cover) can
// pass skipForSingleton: true to bypass the total-quota check, since
// those files are cleaned up on replace via cleanup_replaced_storage_files.

import { supabase } from '../supabase';

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Returns {used_bytes, quota_bytes, percent}.
export async function fetchStorageStatus() {
  const [{ data: usage }, { data: quotaMb }] = await Promise.all([
    supabase.rpc('get_my_storage_usage'),
    supabase.rpc('get_storage_quota_mb'),
  ]);
  const used  = usage?.total_bytes || 0;
  const quota = (quotaMb || 50) * 1024 * 1024;
  return {
    used_bytes:  used,
    quota_bytes: quota,
    percent:     quota > 0 ? Math.round((used / quota) * 100) : 0,
  };
}

// Returns null on success, or a user-facing error string on rejection.
// Pass skipForSingleton: true for avatar / cover replacement uploads —
// the cleanup_replaced_storage_files RPC clears the orphan, so the
// net storage delta on those uploads is ~zero.
export async function checkRemainingQuota(fileSize, { skipForSingleton = false } = {}) {
  if (skipForSingleton) return null;
  const { used_bytes, quota_bytes } = await fetchStorageStatus();
  if (used_bytes + fileSize > quota_bytes) {
    const remaining = Math.max(0, quota_bytes - used_bytes);
    return `Not enough storage space (${formatBytes(remaining)} remaining of ${formatBytes(quota_bytes)}). ` +
           'Free up space in Library → Files.';
  }
  return null;
}
