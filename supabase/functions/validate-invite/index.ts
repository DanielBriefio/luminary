import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let code: string | undefined;

  try {
    const body = await req.json();
    code = body.code;
    if (!code) throw new Error("No code provided");

    // Use service role to bypass RLS for this server-side operation
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invite, error } = await supabase
      .from("invite_codes")
      .select("id, claimed_by, attempts, locked_at")
      .eq("code", code.trim().toUpperCase())
      .single();

    // Code not found — can't track attempts for non-existent codes
    if (error || !invite) {
      return new Response(
        JSON.stringify({ valid: false, reason: "Code not found or already used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Locked
    if (invite.locked_at || invite.attempts >= MAX_ATTEMPTS) {
      return new Response(
        JSON.stringify({ valid: false, reason: "locked" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already claimed — increment attempts and return invalid
    if (invite.claimed_by) {
      await supabase.rpc("increment_invite_attempts", { p_code: code.trim() });
      return new Response(
        JSON.stringify({ valid: false, reason: "This code has already been used." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Valid — reset attempts on successful validation
    await supabase
      .from("invite_codes")
      .update({ attempts: 0 })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    // On unexpected error, increment attempts for the provided code (best-effort)
    if (code) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase.rpc("increment_invite_attempts", { p_code: code });
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({ valid: false, reason: "Validation failed." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
