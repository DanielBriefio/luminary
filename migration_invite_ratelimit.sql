-- IP-based rate limiting for invite code validation.
-- Blocks brute-force attempts on non-existent codes (which per-code attempt
-- tracking cannot cover). Uses fixed 15-minute windows to avoid unbounded growth.

-- ── 1. Rate limit table ───────────────────────────────────────────────────────
create table if not exists invite_rate_limits (
  ip           text        not null,
  window_start timestamptz not null,  -- truncated to 15-min buckets
  attempts     integer     not null default 0,
  primary key (ip, window_start)
);

-- No RLS needed — only ever accessed via service role from the Edge Function.

-- ── 2. Atomic increment function ─────────────────────────────────────────────
-- Upserts the row for (ip, window) and returns the new attempt count.
create or replace function increment_ip_rate_limit(p_ip text, p_window timestamptz)
returns integer language plpgsql as $$
declare
  new_count integer;
begin
  insert into invite_rate_limits (ip, window_start, attempts)
  values (p_ip, p_window, 1)
  on conflict (ip, window_start)
  do update set attempts = invite_rate_limits.attempts + 1
  returning attempts into new_count;
  return new_count;
end;
$$;

-- ── 3. Optional: prune old windows ───────────────────────────────────────────
-- Run periodically (e.g. daily) to keep the table tidy.
-- Rows older than 1 hour are irrelevant — all windows are 15 minutes.
create or replace function cleanup_invite_rate_limits()
returns void language sql as $$
  delete from invite_rate_limits
  where window_start < now() - interval '1 hour';
$$;
