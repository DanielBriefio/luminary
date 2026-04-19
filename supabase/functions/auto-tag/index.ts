import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TAXONOMY: Record<string, string[]> = {
  "Clinical Medicine": ["Cardiology & Cardiovascular Medicine","Oncology & Hematology","Neurology & Neuroscience","Endocrinology & Metabolism","Infectious Disease & Microbiology","Gastroenterology & Hepatology","Rheumatology & Immunology","Pulmonology & Critical Care","Nephrology & Urology","Dermatology","Ophthalmology","Psychiatry & Mental Health","Pediatrics & Neonatology","Obstetrics & Gynecology","Geriatrics & Palliative Care","Emergency & Trauma Medicine","Anesthesiology & Pain Medicine","Radiology & Medical Imaging","Rehabilitation & Sports Medicine","Cardiac & Thoracic Surgery","Neurosurgery","Orthopaedic & Trauma Surgery","General & Gastrointestinal Surgery","Vascular Surgery","Transplant Surgery","Plastic & Reconstructive Surgery","Minimally Invasive & Robotic Surgery"],
  "Basic Life Sciences": ["Molecular Biology & Genetics","Cell Biology","Biochemistry & Structural Biology","Immunology & Inflammation","Neurobiology","Microbiology & Virology","Cancer Biology","Developmental Biology & Stem Cells","Physiology","Epigenetics & Gene Regulation","Proteomics & Metabolomics","Genomics & Sequencing","Chemical Biology","Plant & Environmental Biology"],
  "Pharmacology & Therapeutics": ["Drug Discovery & Medicinal Chemistry","Pharmacokinetics & Pharmacodynamics","Toxicology & Safety","Clinical Pharmacology","Biologics & Antibody Engineering","Gene & Cell Therapy","Small Molecule Drug Development","Vaccines & Immunotherapeutics","Precision Medicine & Biomarkers","Formulation & Drug Delivery","Pharmacogenomics","Rare Disease & Orphan Drugs"],
  "Public Health & Epidemiology": ["Epidemiology & Disease Surveillance","Biostatistics & Research Methods","Global Health & Tropical Medicine","Health Policy & Systems","Environmental & Occupational Health","Nutritional Science & Dietetics","Mental Health & Behavioural Science","Infectious Disease Epidemiology","Cancer Epidemiology","Chronic Disease Prevention","Health Economics & Outcomes","Social Determinants of Health"],
  "Bioengineering & Informatics": ["Bioinformatics & Computational Biology","Artificial Intelligence & Machine Learning in Health","Biomedical Engineering","Imaging & Signal Processing","Genomics & Sequencing Technology","Synthetic Biology","Robotics & Surgical Technology Research","Health Data Science","Nanotechnology & Biomaterials","Digital Therapeutics Research"],
  "Pharmaceutical & Biotech Industry": ["Medical Affairs","Health Economics & Outcomes Research (HEOR)","Real-World Evidence & Data Science","Regulatory Affairs & Drug Approval","Market Access & Pricing","Pharmacovigilance & Drug Safety","Medical Communications & Publishing","Clinical Operations & Trial Management","Translational Medicine","Business Development & Licensing","Medical Information","Patient Advocacy & Engagement"],
  "Medical Devices & Diagnostics Industry": ["Device Design & Engineering","In Vitro Diagnostics (IVD)","Medical Imaging Systems","Surgical & Interventional Devices","Digital Health Products & Software as Medical Device (SaMD)","Wearables & Remote Patient Monitoring","Regulatory Affairs for Devices (MDR / FDA 510k / PMA)","Clinical Evidence & Post-Market Surveillance","Artificial Intelligence in Diagnostics","Point-of-Care & Rapid Testing","Cardiovascular Devices","Orthopaedic & Implantable Devices"],
  "Medical Education & Research Methods": ["Medical & Science Education","Systematic Review & Meta-Analysis","Clinical Research Methodology","Evidence-Based Medicine","Scientific Writing & Publishing","Bioethics & Research Integrity","Simulation & Training Technology","Continuing Medical Education","Peer Review & Journal Editing","Open Science & Data Sharing"]
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { content, paperTitle, paperAbstract, paperJournal } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const text = [
      paperTitle    && `Title: ${paperTitle}`,
      paperJournal  && `Journal: ${paperJournal}`,
      paperAbstract && `Abstract: ${paperAbstract}`,
      content       && `Post: ${content}`,
    ].filter(Boolean).join("\n").slice(0, 2000);

    if (!text.trim()) {
      return new Response(JSON.stringify({ tier1: "", tier2: [], tags: [], confidence: "low" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const taxonomyStr = Object.entries(TAXONOMY)
      .map(([t1, t2s]) => `${t1}:\n  ${t2s.join("\n  ")}`)
      .join("\n\n");

    const prompt = `Classify this research content using the taxonomy below.

TAXONOMY:
${taxonomyStr}

CONTENT TO CLASSIFY:
${text}

Return ONLY valid JSON — no markdown, no explanation:
{
  "tier1": "exact Tier 1 name from the taxonomy",
  "tier2": ["exact Tier 2 name", "exact Tier 2 name"],
  "tags": ["specific_term1", "specific_term2", "specific_term3"],
  "confidence": "high"
}

Rules:
- tier1: exactly ONE value, must be an exact key from the taxonomy
- tier2: 1 to 3 values, must be exact names from that tier1's list
- tags: 3 to 5 hyper-specific terms — gene names, drug names, protein
  names, specific pathways, specific conditions — lowercase_with_underscores
- confidence: "high" if the content clearly belongs to one discipline,
  "medium" if reasonably clear but some ambiguity,
  "low" if the content is too short, too vague, or off-topic for
  the taxonomy (e.g. a test post, a greeting, a very short comment)
- If confidence is "low", still return your best guess for the other
  fields but the caller will discard the result`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Claude API ${response.status}`);

    const data  = await response.json();
    const raw   = data.content?.[0]?.text?.trim() || "{}";
    const clean = raw.replace(/```json?/g, "").replace(/```/g, "").trim();

    let result = { tier1: "", tier2: [] as string[], tags: [] as string[], confidence: "low" };
    try {
      const parsed = JSON.parse(clean);

      result.confidence = ['high','medium','low'].includes(parsed.confidence)
        ? parsed.confidence : 'low';

      if (result.confidence !== 'low') {
        result.tier1 = Object.keys(TAXONOMY).includes(parsed.tier1) ? parsed.tier1 : "";
        result.tier2 = Array.isArray(parsed.tier2)
          ? parsed.tier2.filter((t: string) =>
              !result.tier1 || TAXONOMY[result.tier1]?.includes(t)
            ).slice(0, 3)
          : [];
        result.tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [];
      }
    } catch(e) {
      console.error("Parse error:", clean.slice(0, 200));
    }

    console.log(`Tagged: confidence="${result.confidence}" tier1="${result.tier1}" tier2=[${result.tier2.join(", ")}]`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("auto-tag error:", err.message);
    return new Response(
      JSON.stringify({ tier1: "", tier2: [], tags: [], confidence: "low" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
