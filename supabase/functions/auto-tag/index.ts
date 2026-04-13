import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const { content, paperTitle, paperJournal, paperAbstract, linkTitle } = body;

    console.log("📥 Received:", JSON.stringify({
      content: content?.slice(0,100),
      paperTitle: paperTitle?.slice(0,100),
      paperJournal,
      abstractLength: paperAbstract?.length || 0,
      linkTitle,
    }));

    const textToAnalyse = [
      paperTitle    && `Paper title: ${paperTitle}`,
      paperJournal  && `Journal: ${paperJournal}`,
      paperAbstract && `Abstract: ${paperAbstract.replace(/<[^>]+>/g,'').slice(0, 800)}`,
      linkTitle     && `Link title: ${linkTitle}`,
      content       && `Post text: ${content}`,
    ].filter(Boolean).join("\n");

    console.log("📝 Text length:", textToAnalyse.length);

    if (!textToAnalyse.trim()) {
      return new Response(JSON.stringify({ tags: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are a scientific content classifier for a medical and scientific community platform.

Analyse the following content and return 2-5 relevant scientific/medical field tags.

Rules:
- Use specific medical/scientific field names (e.g. "Cardiology" not "Medicine")
- Include disease areas, therapeutic areas, and methodology tags where relevant
- Use title case (e.g. "Medical Affairs", "Digital Health", "GLP-1 Agonists")
- Do not include generic tags like "Science" or "Research"
- Return ONLY a JSON array of strings. Example: ["Cardiology","Type 2 Diabetes","GLP-1 Agonists"]

Content to classify:
${textToAnalyse}

Return ONLY the JSON array:`
        }],
      }),
    });

    const responseText = await response.text();
    console.log("🤖 Claude raw:", responseText.slice(0, 300));

    if (!response.ok) throw new Error(`Claude API error: ${responseText}`);

    const data = JSON.parse(responseText);
    const raw  = data.content?.[0]?.text?.trim() || "[]";
    console.log("🏷️ Tags text:", raw);

    let tags = [];
    try {
      const cleaned = raw.replace(/```json?/g,'').replace(/```/g,'').trim();
      tags = JSON.parse(cleaned);
      if (!Array.isArray(tags)) tags = [];
      tags = tags.filter(t => typeof t === "string" && t.length > 0).map(t => t.trim().slice(0,40)).slice(0,6);
    } catch(e) {
      console.error("Parse error:", raw, e.message);
      tags = [];
    }

    console.log("✅ Final tags:", JSON.stringify(tags));

    return new Response(JSON.stringify({ tags }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auto-tag error:", err.message);
    return new Response(
      JSON.stringify({ tags: [], error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
