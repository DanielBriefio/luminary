import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Aggressively extract JSON from Claude's response even with extra text around it
function extractJson(raw: string, expectArray: boolean): any {
  if (!raw) return expectArray ? [] : {};

  // 1. Strip markdown fences
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // 2. Direct parse
  try { return JSON.parse(s); } catch(_) {}

  // 3. Find outermost { } or [ ]
  const open  = expectArray ? "[" : "{";
  const close = expectArray ? "]" : "}";
  const start = s.indexOf(open);
  const end   = s.lastIndexOf(close);
  if (start !== -1 && end > start) {
    const candidate = s.slice(start, end + 1);

    // 3a. Direct parse of extracted block
    try { return JSON.parse(candidate); } catch(_) {}

    // 3b. Sanitise common issues then retry
    const sanitised = candidate
      .replace(/,\s*([}\]])/g, "$1")   // trailing commas
      .replace(/([^\\])\n/g, "$1 ")    // literal newlines inside strings
      .replace(/\r/g, "")              // carriage returns
      .replace(/\t/g, " ");            // tabs
    try { return JSON.parse(sanitised); } catch(_) {}
  }

  // 4. For full_cv: extract each top-level section independently
  if (!expectArray) {
    const result: Record<string, any> = {};
    const sections = ["profile","work_history","education","honors","languages","skills","publications"];
    for (const section of sections) {
      // Match "section": { ... } or "section": [ ... ]
      const idx = s.indexOf(`"${section}"`);
      if (idx === -1) continue;
      const afterColon = s.indexOf(":", idx) + 1;
      const trimmed    = s.slice(afterColon).trim();
      const isArr      = trimmed.startsWith("[");
      const openB      = isArr ? "[" : "{";
      const closeB     = isArr ? "]" : "}";
      let depth = 0, inStr = false, escape = false, i = 0;
      for (; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (escape)          { escape = false; continue; }
        if (ch === "\\")     { escape = true; continue; }
        if (ch === '"')      { inStr = !inStr; continue; }
        if (!inStr && ch === openB)  depth++;
        if (!inStr && ch === closeB) { depth--; if (depth === 0) break; }
      }
      if (i < trimmed.length) {
        const block = trimmed.slice(0, i + 1);
        try {
          result[section] = JSON.parse(block);
        } catch(_) {
          try {
            const san = block.replace(/,\s*([}\]])/g,"$1").replace(/([^\\])\n/g,"$1 ");
            result[section] = JSON.parse(san);
          } catch(_) {}
        }
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

  console.error("Could not extract JSON. Start:", s.slice(0, 400));
  return expectArray ? [] : {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { base64, mediaType, text, mode } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const isFullCV = mode === "full_cv";

    const FULL_CV_PROMPT = `You are a precise JSON extractor. Extract all structured data from this researcher CV.

Output ONLY raw valid JSON — no markdown fences, no commentary, no explanation.

Use this exact schema:
{"profile":{"name":"","title":"","bio":"","location":"","orcid":"","email":""},"work_history":[{"title":"","company":"","location":"","start":"","end":"","description":""}],"education":[{"school":"","degree":"","field":"","start":"","end":""}],"honors":[{"title":"","issuer":"","date":""}],"languages":[{"name":"","proficiency":""}],"skills":[{"name":""}],"publications":[{"title":"","authors":"","year":"","journal":"","venue":"","doi":"","pub_type":"journal","notes":""}]}

JSON rules:
- pub_type: journal | conference | poster | lecture | book | review | preprint | other
- Dates: YYYY-MM if possible, YYYY if month unknown, empty string if unknown
- Current positions: "end" = empty string
- Escape internal double-quotes with backslash: \\"
- No literal newlines inside string values — replace with a space
- No trailing commas
- Empty array [] for missing sections, empty string for missing fields
- Extract EVERY publication, presentation, poster, lecture, invited talk, book chapter`;

    const PUBS_PROMPT = `Extract all publications, presentations, posters, lectures, and book chapters from this document.

Output ONLY a raw JSON array — no markdown, no commentary:
[{"title":"","authors":"","year":"","journal":"","venue":"","doi":"","pub_type":"journal","notes":""}]

pub_type: journal | conference | poster | lecture | book | review | preprint | other
Escape internal double-quotes. No literal newlines in strings. No trailing commas.`;

    const PROMPT = isFullCV ? FULL_CV_PROMPT : PUBS_PROMPT;

    const messageContent = (base64 && mediaType)
      ? [
          { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT }
        ]
      : `${PROMPT}\n\nDocument:\n${(text || "").slice(0, 15000)}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    const responseText = await response.text();
    if (!response.ok) throw new Error(`Claude API error: ${responseText.slice(0, 300)}`);

    const apiData = JSON.parse(responseText);
    const raw     = apiData.content?.[0]?.text?.trim() || "";
    console.log("Claude response length:", raw.length, "Start:", raw.slice(0, 100));

    if (isFullCV) {
      const parsed = extractJson(raw, false);
      const result = {
        profile:      (parsed.profile && typeof parsed.profile === "object" && !Array.isArray(parsed.profile)) ? parsed.profile : {},
        work_history: Array.isArray(parsed.work_history)  ? parsed.work_history  : [],
        education:    Array.isArray(parsed.education)     ? parsed.education     : [],
        honors:       Array.isArray(parsed.honors)        ? parsed.honors        : [],
        languages:    Array.isArray(parsed.languages)     ? parsed.languages     : [],
        skills:       Array.isArray(parsed.skills)        ? parsed.skills        : [],
        publications: Array.isArray(parsed.publications)  ? parsed.publications  : [],
      };
      console.log(`Full CV: ${result.publications.length} pubs, ${result.work_history.length} jobs, ${result.education.length} edu`);
      return new Response(JSON.stringify({ result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      const parsed = extractJson(raw, true);
      const publications = Array.isArray(parsed) ? parsed : [];
      console.log(`Publications: ${publications.length} items`);
      return new Response(JSON.stringify({ publications }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    console.error("Function error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message, result: {}, publications: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
