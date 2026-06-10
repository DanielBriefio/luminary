const MONTH_ABBREVS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Random invite code suffix — Crockford-ish base32 (no I/O/0/1) for legibility.
export function randomInviteSuffix(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

export function buildCitationFromEpmc(r) {
  if (!r) return '';
  const ji     = r.journalInfo || {};
  const abbrev = ji.journal?.medlineAbbreviation || ji.journal?.isoabbreviation || r.journalTitle || '';
  const dateStr = ji.dateOfPublication || (r.pubYear ? String(r.pubYear) : '');
  const volume  = ji.volume || '';
  const issue   = ji.issue  || '';
  const pages   = r.pageInfo || '';
  const doi     = r.doi || '';
  let cite = abbrev ? abbrev + '.' : '';
  if (dateStr) cite += ' ' + dateStr;
  if (volume)  { cite += ';' + volume; if (issue) cite += '(' + issue + ')'; }
  if (pages)   cite += ':' + pages;
  if (doi)     cite += '. doi: ' + doi;
  return cite.trim();
}

// Pull the corresponding author's email + name out of an EuropePMC core
// result. EuropePMC doesn't expose a structured "corresponding author"
// field — the email lives inside each author's `affiliation` string,
// usually tagged "Electronic address: foo@bar.edu" (PubMed convention)
// for the corresponding author specifically. We prefer that tagged form,
// fall back to an explicit `email` field if present, then to any email
// found in any affiliation. Coverage is roughly 40–60 % of papers
// (best for recent open-access biomed); callers must handle empty.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const ELECTRONIC_RE = /Electronic address:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;

function authorDisplayName(a) {
  return (a?.fullName || `${a?.firstName || ''} ${a?.lastName || ''}`).trim();
}

// All affiliation strings attached to an EPMC author. The JSON `core`
// response nests them under authorAffiliationDetailsList.authorAffiliation[],
// not a flat author.affiliation field (which is what the XML form uses).
// We collect from both shapes so the extractor is robust to either.
function authorAffiliations(a) {
  const out = [];
  if (a?.affiliation) out.push(String(a.affiliation));
  const nested = a?.authorAffiliationDetailsList?.authorAffiliation || [];
  for (const x of nested) {
    if (x?.affiliation) out.push(String(x.affiliation));
  }
  return out;
}

export function extractCorrespondingAuthorFromEpmc(result) {
  const authors = result?.authorList?.author || [];
  // Pass 1: PubMed "Electronic address:" tag — explicit corresp-author marker.
  for (const a of authors) {
    for (const aff of authorAffiliations(a)) {
      const m = aff.match(ELECTRONIC_RE);
      if (m) return { email: m[1], name: authorDisplayName(a) };
    }
  }
  // Pass 2: explicit email field on the author (rare in JSON core).
  for (const a of authors) {
    if (a?.email) {
      const m = String(a.email).match(EMAIL_RE);
      if (m) return { email: m[0], name: authorDisplayName(a) };
    }
  }
  // Pass 3: any email in any affiliation string.
  for (const a of authors) {
    for (const aff of authorAffiliations(a)) {
      const m = aff.match(EMAIL_RE);
      if (m) return { email: m[0], name: authorDisplayName(a) };
    }
  }
  // Pass 4: top-level affiliation string (older results).
  const flat = String(result?.affiliation || '').match(EMAIL_RE);
  if (flat) return { email: flat[0], name: '' };
  return { email: '', name: '' };
}

// OpenAlex is the open scholarly index that maintains live citation
// counts for ~250M works. Free, no auth needed. We look up by DOI and
// pull `cited_by_count` + `type` to keep `publications.citations` and
// `publications.pub_type` current.
// Returns `{ citations, pubType }` (both may be null) or null if the
// DOI isn't indexed / the request fails. Callers must handle nulls
// gracefully (never overwrite a value with null).
export async function fetchOpenAlexWorkByDoi(doi) {
  if (!doi) return null;
  const clean = String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  if (!clean) return null;
  try {
    const r = await fetch(
      `https://api.openalex.org/works/doi:${encodeURIComponent(clean)}` +
      `?select=cited_by_count,type`
    );
    if (!r.ok) return null;
    const j = await r.json();
    const citations = Number.isFinite(j?.cited_by_count) ? j.cited_by_count : null;
    const pubType   = openAlexTypeToPubType(j?.type);
    return { citations, pubType };
  } catch { return null; }
}

// Back-compat shim — the older helper name only returned the count.
// Anything still calling it gets the same result.
export async function fetchOpenAlexCitationsByDoi(doi) {
  const w = await fetchOpenAlexWorkByDoi(doi);
  return w?.citations ?? null;
}

// Map OpenAlex's `type` enum to Luminary's pub_type values.
// OpenAlex types: article / book / book-chapter / dissertation /
// preprint / proceedings-article / report / dataset / other / etc.
// Luminary types: journal / review / preprint / conference / poster /
// book / lecture / other.
// We can't distinguish journal vs. review from OpenAlex (both come
// back as "article"), so we leave "review" alone — only set it on
// genuine misclassifications (e.g. an OpenAlex "book" stored as
// "journal" in Luminary). Returns null when OpenAlex's type is
// missing or doesn't map cleanly.
function openAlexTypeToPubType(t) {
  if (!t) return null;
  const v = String(t).toLowerCase();
  if (v === 'article')              return 'journal';
  if (v === 'preprint')             return 'preprint';
  if (v === 'book')                 return 'book';
  if (v === 'book-chapter')         return 'book';
  if (v === 'proceedings-article')  return 'conference';
  if (v === 'proceedings')          return 'conference';
  if (v === 'dissertation')         return 'other';
  if (v === 'report')               return 'other';
  if (v === 'dataset')              return 'other';
  return null;
}

// PubMed-style author string ("Smith J, Jones A, Brown B") from a
// CrossRef work's `author` array. CrossRef gives structured names,
// we reduce to "Family Initials" — first letter of each given
// name word. ORCID-imported rows arrive with authors=''; this is
// how the Refresh path fills them in.
export function authorsFromCrossRef(work) {
  const authors = work?.author || [];
  if (!authors.length) return '';
  return authors.map(a => {
    const family = (a.family || a.name || '').trim();
    const initials = (a.given || '')
      .split(/\s+/).filter(Boolean)
      .map(g => g[0])
      .join('');
    return family + (initials ? ' ' + initials : '');
  }).filter(s => s.trim()).join(', ');
}

// CrossRef returns canonical bibliographic data (journal short name,
// volume, issue, pages) we use to build the formal Vancouver-style
// `citation` string. Free, no auth. Returns the work object or null.
export async function fetchCrossRefWorkByDoi(doi) {
  if (!doi) return null;
  const clean = String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  if (!clean) return null;
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.message || null;
  } catch { return null; }
}

// Fire-and-forget OpenAlex + CrossRef enrichment for newly-inserted
// publications. Rows must come from a .select() chained on the insert
// so we have ids to update. Optional onUpdate callback fires per-row
// so the UI can merge the new patch as it arrives. The patch may
// include `citations`, `pub_type`, and `citation` (the formal
// Vancouver string). Won't overwrite user choices on pub_type, and
// won't refetch a citation that's already populated. Never throws.
export async function enrichPublicationsWithOpenAlex(rows, supabase, onUpdate) {
  if (!rows?.length) return;
  const candidates = rows.filter(r => r?.id && r?.doi);
  if (!candidates.length) return;
  try {
    await mapWithConcurrency(candidates, async (r) => {
      const needsCitation = !r.citation || !r.citation.trim();
      const needsAuthors  = !r.authors  || !r.authors.trim();
      const wantCrossRef  = needsCitation || needsAuthors;
      const [w, cr] = await Promise.all([
        fetchOpenAlexWorkByDoi(r.doi),
        wantCrossRef ? fetchCrossRefWorkByDoi(r.doi) : Promise.resolve(null),
      ]);
      const patch = {};
      if (w?.citations != null && w.citations !== (r.citations || 0)) {
        patch.citations = w.citations;
      }
      const isDefault = !r.pub_type || r.pub_type === 'journal';
      if (w?.pubType && isDefault && w.pubType !== r.pub_type) {
        patch.pub_type = w.pubType;
      }
      if (cr) {
        if (needsCitation) {
          const citation = buildCitationFromCrossRef(cr, r.doi);
          if (citation) patch.citation = citation;
        }
        if (needsAuthors) {
          const authors = authorsFromCrossRef(cr);
          if (authors) patch.authors = authors;
        }
      }
      if (!Object.keys(patch).length) return;
      await supabase.from('publications').update(patch).eq('id', r.id);
      if (onUpdate) onUpdate(r.id, patch);
    }, 5);
  } catch { /* fire-and-forget */ }
}

// Bounded-concurrency map for the bulk enrichment path — OpenAlex is
// fine with 10/sec without an API key, so 5 in flight is comfortably
// under that even with retries.
export async function mapWithConcurrency(items, fn, concurrency = 5) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

export function buildCitationFromCrossRef(w, doi) {
  if (!w) return '';
  const journal = w['short-container-title']?.[0] || w['container-title']?.[0] || '';
  const dp = w.published?.['date-parts']?.[0]
    || w['published-print']?.['date-parts']?.[0]
    || w['published-online']?.['date-parts']?.[0] || [];
  const year   = dp[0] ? String(dp[0]) : '';
  const month  = dp[1] ? MONTH_ABBREVS[dp[1] - 1] : '';
  const volume = w.volume || '';
  const issue  = w.issue  || '';
  const pages  = w.page   || '';
  let cite = journal ? journal + '.' : '';
  if (year)   { cite += ' ' + year; if (month) cite += ' ' + month; }
  if (volume) { cite += ';' + volume; if (issue) cite += '(' + issue + ')'; }
  if (pages)  cite += ':' + pages;
  if (doi)    cite += '. doi: ' + doi;
  return cite.trim();
}

export function timeAgo(ts) {
  const s=Math.floor((Date.now()-new Date(ts))/1000);
  if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;
  if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;
}

export function normForMatch(s) {
  return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}

export function tokenOverlap(a, b) {
  const ta = new Set(normForMatch(a).split(' ').filter(t=>t.length>2));
  const tb = new Set(normForMatch(b).split(' ').filter(t=>t.length>2));
  if(!ta.size || !tb.size) return 0;
  let n=0; ta.forEach(t=>{ if(tb.has(t)) n++; });
  return n / Math.max(ta.size, tb.size);
}

export function datesOverlap(startA, endA, startB, endB) {
  const toNum = d => d ? parseInt((d+'').replace(/\D/g,'').padEnd(6,'0').slice(0,6)) : null;
  const sa=toNum(startA), ea=toNum(endA)||999999, sb=toNum(startB), eb=toNum(endB)||999999;
  if(!sa||!sb) return null;
  return sa<=eb && sb<=ea;
}

export function scoreWorkMatch(a, b) {
  const comp  = tokenOverlap(a.company||a.name||'', b.company||b.name||'');
  const title = tokenOverlap(a.title||'', b.title||'');
  const ov    = datesOverlap(a.start, a.end, b.start, b.end);
  const date  = ov===true ? 1 : ov===null ? 0.3 : 0;
  return comp*0.50 + date*0.35 + title*0.15;
}

export function scoreEduMatch(a, b) {
  const school  = tokenOverlap(a.school||'', b.school||'');
  const degree  = tokenOverlap(a.degree||'', b.degree||'');
  const ov      = datesOverlap(a.start, a.end, b.start, b.end);
  const date    = ov===true ? 1 : ov===null ? 0.3 : 0;
  return school*0.55 + date*0.30 + degree*0.15;
}

export function isDescriptionOnlyDiff(a, b, type='work') {
  if(type==='work') {
    const compA = normForMatch(a.company||a.name||'');
    const compB = normForMatch(b.company||b.name||'');
    if(!compA || !compB) return false;
    if(compA === compB) return true;
    const compOk = tokenOverlap(compA, compB) >= 0.75;
    if(!compOk) return false;
    const titA = normForMatch(a.title||''), titB = normForMatch(b.title||'');
    const titleOk = !titA || !titB || titA===titB || tokenOverlap(titA,titB) >= 0.60;
    const dateOk  = datesOverlap(a.start, a.end, b.start, b.end) !== false;
    return titleOk && dateOk;
  }
  const schA = normForMatch(a.school||''), schB = normForMatch(b.school||'');
  if(!schA || !schB) return false;
  if(schA === schB) return true;
  const schoolOk = tokenOverlap(schA, schB) >= 0.70;
  if(!schoolOk) return false;
  const degA = normForMatch(a.degree||''), degB = normForMatch(b.degree||'');
  const degOk = !degA || !degB || degA===degB
    || degA.includes(degB.slice(0,4)) || degB.includes(degA.slice(0,4))
    || tokenOverlap(degA, degB) >= 0.50;
  const dateOk = datesOverlap(a.start, a.end, b.start, b.end) !== false;
  return degOk && dateOk;
}

export function mergeRicher(incoming, existing) {
  const pick = (a,b) => (a&&a.length>=(b?.length||0)) ? a : (b||a||'');
  return {
    ...existing,
    title:       pick(existing.title,       incoming.title),
    company:     pick(existing.company||existing.name||'', incoming.company||incoming.name||''),
    school:      pick(existing.school,      incoming.school),
    degree:      pick(existing.degree,      incoming.degree),
    field:       pick(existing.field,       incoming.field),
    location:    pick(existing.location,    incoming.location),
    description: pick(existing.description, incoming.description),
    start: existing.start || incoming.start,
    end:   existing.end   || incoming.end,
  };
}

export function deduplicateSectionFuzzy(incoming=[], existing=[], scoreFn, type='work') {
  const autoMerged   = [...existing];
  const conflicts    = [];
  const newItems     = [];

  for(const item of incoming) {
    let bestScore=-1, bestIdx=-1;
    autoMerged.forEach((e,i)=>{ const s=scoreFn(item,e); if(s>bestScore){bestScore=s;bestIdx=i;} });

    if(bestScore < 0.35 || bestIdx < 0) {
      newItems.push(item);
    } else if(isDescriptionOnlyDiff(item, autoMerged[bestIdx], type)) {
      const pick=(a,b)=>(a&&a.length>=(b?.length||0))?a:(b||a||'');
      autoMerged[bestIdx]={...autoMerged[bestIdx], description:pick(autoMerged[bestIdx].description, item.description)};
    } else {
      conflicts.push({incoming:item, existing:autoMerged[bestIdx], existingIdx:bestIdx, score:bestScore});
    }
  }
  return { autoMerged, conflicts, newItems };
}

export function deduplicatePubs(incoming, existing) {
  const result = [...existing];
  for (const pub of incoming) {
    const doi = normForMatch(pub.doi);
    if (doi && result.some(p => normForMatch(p.doi) === doi)) continue;
    const title = normForMatch(pub.title);
    const titleMatch = result.some(p => {
      const t = normForMatch(p.title);
      if (!t || !title) return false;
      const shorter = t.length < title.length ? t : title;
      return shorter.length > 10 && (t.includes(shorter) || title.includes(shorter));
    });
    if (titleMatch) continue;
    result.push(pub);
  }
  return result;
}

export async function getCachedTagsByDoi(doi, supabase) {
  if (!doi?.trim()) return null;
  const cleanDoi = doi.trim().toLowerCase();

  const { data: post } = await supabase
    .from('posts')
    .select('tier1, tier2, tags')
    .eq('paper_doi', cleanDoi)
    .not('tier1', 'is', null)
    .neq('tier1', '')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (post?.tier1) {
    console.log(`Auto-tag cache hit for DOI: ${cleanDoi}`);
    return { tier1: post.tier1, tier2: post.tier2 || [], tags: post.tags || [] };
  }

  const { data: pub } = await supabase
    .from('publications')
    .select('tier1, tier2, tags')
    .eq('doi', cleanDoi)
    .not('tier1', 'is', null)
    .neq('tier1', '')
    .limit(1)
    .single();

  if (pub?.tier1) {
    console.log(`Auto-tag cache hit in publications for DOI: ${cleanDoi}`);
    return { tier1: pub.tier1, tier2: pub.tier2 || [], tags: pub.tags || [] };
  }

  return null;
}
