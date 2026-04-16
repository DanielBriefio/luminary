import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url    = new URL(req.url);
  const code   = url.searchParams.get("code");
  const appUrl = Deno.env.get("APP_URL") || "https://luminary.to";

  const isProduction = Deno.env.get("ORCID_ENV") === "production";
  const orcidBase    = isProduction
    ? "https://orcid.org"
    : "https://sandbox.orcid.org";
  const orcidApiBase = isProduction
    ? "https://pub.orcid.org/v3.0"
    : "https://pub.sandbox.orcid.org/v3.0";

  const clientId     = Deno.env.get("ORCID_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ORCID_CLIENT_SECRET")!;
  const redirectUri  = Deno.env.get("ORCID_REDIRECT_URI")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const redirectError = (msg: string) =>
    Response.redirect(`${appUrl}?orcid_error=${encodeURIComponent(msg)}`, 302);

  try {
    if (!code) return redirectError("No authorisation code received from ORCID.");

    // ── Step 1: Exchange code for access token ───────────────────────────────
    const tokenResp = await fetch(`${orcidBase}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("Token exchange failed:", err);
      return redirectError("ORCID authentication failed. Please try again.");
    }

    const tokenData  = await tokenResp.json();
    const orcidId    = tokenData.orcid;
    const accessToken = tokenData.access_token;

    if (!orcidId) return redirectError("Could not retrieve ORCID iD.");

    // ── Step 2: Fetch full ORCID record ──────────────────────────────────────
    const recordResp = await fetch(`${orcidApiBase}/${orcidId}/record`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const record = recordResp.ok ? await recordResp.json() : null;

    // Parse person info
    const person   = record?.person || {};
    const given    = person.name?.["given-names"]?.value || "";
    const family   = person.name?.["family-name"]?.value || "";
    const fullName = `${given} ${family}`.trim();
    const bio      = person.biography?.content || "";
    const keywords = (person.keywords?.keyword || [])
      .map((k: any) => k.content).filter(Boolean);

    // Parse employment
    const employments = (record?.["activities-summary"]?.employments
      ?.["affiliation-group"] || [])
      .flatMap((g: any) => g.summaries || [])
      .map((s: any) => s["employment-summary"] || s)
      .map((e: any) => ({
        title:    e["role-title"] || "",
        company:  e.organization?.name || "",
        location: [
          e.organization?.address?.city,
          e.organization?.address?.country,
        ].filter(Boolean).join(", "),
        start: e["start-date"]?.year?.value
          ? `${e["start-date"].year.value}-${String(e["start-date"].month?.value || 1).padStart(2, "0")}`
          : "",
        end: e["end-date"]?.year?.value
          ? `${e["end-date"].year.value}-${String(e["end-date"].month?.value || 1).padStart(2, "0")}`
          : "",
        description: "",
      }))
      .filter((e: any) => e.company || e.title);

    // Parse education
    const educations = (record?.["activities-summary"]?.educations
      ?.["affiliation-group"] || [])
      .flatMap((g: any) => g.summaries || [])
      .map((s: any) => s["education-summary"] || s)
      .map((e: any) => ({
        school: e.organization?.name || "",
        degree: e["role-title"] || "",
        field:  "",
        start:  e["start-date"]?.year?.value || "",
        end:    e["end-date"]?.year?.value   || "",
      }))
      .filter((e: any) => e.school);

    // Current institution (most recent employment)
    const currentInstitution = employments[0]?.company || "";
    const currentTitle       = employments[0]?.title   || "";

    // Parse publications
    const works = record?.["activities-summary"]?.works?.group || [];
    const publications = works.map((g: any) => {
      const ws  = g["work-summary"]?.[0];
      if (!ws) return null;
      const doi  = (ws["external-ids"]?.["external-id"] || [])
        .find((x: any) => x["external-id-type"] === "doi");
      const pmid = (ws["external-ids"]?.["external-id"] || [])
        .find((x: any) => x["external-id-type"] === "pmid");
      return {
        title:   ws.title?.title?.value || "",
        journal: ws["journal-title"]?.value || "",
        year:    ws["publication-date"]?.year?.value || "",
        doi:     doi?.["external-id-value"] || "",
        pmid:    pmid?.["external-id-value"] || "",
        source:  "orcid",
      };
    }).filter((p: any) => p && p.title);

    // ── Step 3: Check if ORCID already registered ────────────────────────────
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("orcid", orcidId)
      .single();

    if (existing) {
      // User already has an account — generate a magic link to sign them in
      const { data: authUser } = await supabase.auth.admin.getUserById(existing.id);
      if (!authUser?.user?.email) {
        return redirectError("Account found but could not sign in. Please use email/password.");
      }

      const { data: magicLink } = await supabase.auth.admin.generateLink({
        type:  "magiclink",
        email: authUser.user.email,
      });

      if (magicLink?.properties?.action_link) {
        return Response.redirect(magicLink.properties.action_link, 302);
      }
      return redirectError("Account found. Please sign in with your email and password.");
    }

    // ── Step 4: Store ORCID data in temp table, redirect back to app ─────────
    const tempToken = crypto.randomUUID();
    await supabase.from("orcid_pending").insert({
      token:        tempToken,
      orcid_id:     orcidId,
      name:         fullName,
      bio,
      institution:  currentInstitution,
      title:        currentTitle,
      work_history: JSON.stringify(employments),
      education:    JSON.stringify(educations),
      publications: JSON.stringify(publications),
      keywords:     JSON.stringify(keywords),
      expires_at:   new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    });

    return Response.redirect(
      `${appUrl}?orcid_token=${tempToken}&orcid_name=${encodeURIComponent(fullName)}`,
      302
    );

  } catch (err: any) {
    console.error("ORCID callback error:", err.message);
    return redirectError("Something went wrong. Please try again.");
  }
});
