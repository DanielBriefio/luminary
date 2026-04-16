import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;       // per-code lockout threshold
const MAX_IP_ATTEMPTS = 20;   // per-IP per-window threshold
const WINDOW_MINUTES = 15;

/** Truncate a Date to the current 15-minute bucket. */
function windowStart(): string {
  const ms = WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

/** Best-effort extraction of the real client IP. */
function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let code: string | undefined;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const ip = clientIp(req);
  const window = windowStart();

  try {
    // ── IP rate limit check (read-only, before touching invite_codes) ─────────
    const { data: rl } = await supabase
      .from("invite_rate_limits")
      .select("attempts")
      .eq("ip", ip)
      .eq("window_start", window)
      .maybeSingle();

    if (rl && rl.attempts >= MAX_IP_ATTEMPTS) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Too many attempts. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request ─────────────────────────────────────────────────────────
    const body = await req.json();
    code = body.code;
    if (!code) throw new Error("No code provided");

    const { data: invite, error } = await supabase
      .from("invite_codes")
      .select("id, claimed_by, attempts, locked_at")
      .eq("code", code.trim().toUpperCase())
      .single();

    // Code not found — count against IP limit and return generic message
    if (error || !invite) {
      await supabase.rpc("increment_ip_rate_limit", { p_ip: ip, p_window: window });
      return new Response(
        JSON.stringify({ valid: false, reason: "Code not found or already used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-code locked
    if (invite.locked_at || invite.attempts >= MAX_ATTEMPTS) {
      await supabase.rpc("increment_ip_rate_limit", { p_ip: ip, p_window: window });
      return new Response(
        JSON.stringify({ valid: false, reason: "locked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already claimed — increment both per-code and per-IP counters
    if (invite.claimed_by) {
      await Promise.all([
        supabase.rpc("increment_invite_attempts", { p_code: code.trim() }),
        supabase.rpc("increment_ip_rate_limit", { p_ip: ip, p_window: window }),
      ]);
      return new Response(
        JSON.stringify({ valid: false, reason: "This code has already been used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Valid — reset per-code attempts; do NOT increment IP counter
    await supabase
      .from("invite_codes")
      .update({ attempts: 0 })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    // Unexpected error — still charge the IP
    await supabase.rpc("increment_ip_rate_limit", { p_ip: ip, p_window: window }).catch(() => {});

    // Best-effort per-code increment too
    if (code) {
      await supabase.rpc("increment_invite_attempts", { p_code: code }).catch(() => {});
    }

    return new Response(
      JSON.stringify({ valid: false, reason: "Validation failed." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
