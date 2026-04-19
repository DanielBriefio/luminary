const MONTH_ABBREVS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
