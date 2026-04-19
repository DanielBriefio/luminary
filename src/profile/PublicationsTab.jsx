import { useState, useEffect, useRef } from 'react';

// ─── Export helpers ───────────────────────────────────────────────────────────

function splitAuthors(str) {
  if (!str?.trim()) return [];
  // PubMed/EPMC format: "Smith J, Jones A, Brown B"
  // Split on ", " — handles "Last FI, Last FI" correctly
  return str.split(/\s*;\s*|\s*,\s*(?=[A-Z\u00C0-\u024F])/)
    .map(a => a.trim()).filter(Boolean);
}

function formatAuthorsVancouver(authorsStr) {
  const parts = splitAuthors(authorsStr);
  if (!parts.length) return '';
  if (parts.length <= 6) return parts.join(', ');
  return parts.slice(0, 6).join(', ') + ', et al.';
}

function formatVancouver(pub) {
  const segs = [];
  const authors = formatAuthorsVancouver(pub.authors);
  if (authors) segs.push(authors + '.');
  if (pub.title) segs.push(pub.title.replace(/[.\s]+$/, '') + '.');
  const venue = pub.journal || pub.venue;
  if (venue) segs.push(venue + '.');
  if (pub.year)  segs.push(pub.year + '.');
  const extras = [];
  if (pub.doi) {
    const doi = pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`;
    extras.push(`doi: ${doi}`);
  }
  if (pub.pmid) extras.push(`PubMed PMID: ${pub.pmid}`);
  if (extras.length) segs.push(extras.join('; ') + '.');
  return segs.join(' ');
}

function bibKey(pub) {
  const first = splitAuthors(pub.authors)[0] || '';
  const lastName = first.split(/\s+/).slice(-1)[0].replace(/[^a-zA-Z]/g, '') || 'Unknown';
  const year = pub.year || '0000';
  const titleWord = (pub.title || '').split(/\s+/)[0].replace(/[^a-zA-Z]/g, '') || 'untitled';
  return `${lastName}${year}${titleWord}`;
}

function pubToBib(pub) {
  const type = ['journal','review','preprint'].includes(pub.pub_type) ? 'article'
    : ['conference','poster'].includes(pub.pub_type) ? 'inproceedings'
    : pub.pub_type === 'book' ? 'incollection'
    : 'misc';
  const venue = pub.journal || pub.venue || '';
  const doi = pub.doi
    ? pub.doi.startsWith('http') ? pub.doi.replace(/https?:\/\/doi\.org\//i,'') : pub.doi
    : '';
  const authorsBib = splitAuthors(pub.authors).join(' and ');
  const fields = [
    authorsBib && `  author    = {${authorsBib}}`,
    pub.title  && `  title     = {${pub.title.replace(/[{}]/g,'')}}`,
    type === 'article'        && venue && `  journal   = {${venue}}`,
    type === 'inproceedings'  && venue && `  booktitle = {${venue}}`,
    type === 'incollection'   && venue && `  booktitle = {${venue}}`,
    type === 'misc'           && venue && `  howpublished = {${venue}}`,
    pub.year   && `  year      = {${pub.year}}`,
    doi        && `  doi       = {${doi}}`,
    pub.pmid   && `  note      = {PubMed PMID: ${pub.pmid}}`,
  ].filter(Boolean);
  return `@${type}{${bibKey(pub)},\n${fields.join(',\n')}\n}`;
}

function doExportBib(pubs, authorName) {
  const header = `% Publications — ${authorName || 'Author'}\n% Exported ${new Date().toLocaleDateString()}\n\n`;
  const content = header + pubs.map(pubToBib).join('\n\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'publications.bib'; a.click();
  URL.revokeObjectURL(url);
}

function doExportPdf(pubs, authorName) {
  const groups = [
    ['Journal Articles &amp; Reviews',   pubs.filter(p => !p.pub_type || ['journal','review','preprint'].includes(p.pub_type))],
    ['Presentations &amp; Posters',       pubs.filter(p => ['conference','poster','lecture'].includes(p.pub_type))],
    ['Book Chapters',                     pubs.filter(p => p.pub_type === 'book')],
    ['Other',                             pubs.filter(p => p.pub_type === 'other')],
  ].filter(([, items]) => items.length > 0);

  let counter = 1;
  const sectionsHtml = groups.map(([title, items]) => {
    const rows = items.map(pub => {
      const n = counter++;
      const cite = formatVancouver(pub)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const doiUrl = pub.doi
        ? (pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`)
        : null;
      const withLink = doiUrl
        ? cite.replace(
            /(doi: )(https?:\/\/[^\s.]+\.?)/,
            `$1<a href="${doiUrl}" style="color:#6c63ff">${doiUrl}</a>`
          )
        : cite;
      return `<tr><td class="num">${n}.</td><td>${withLink}</td></tr>`;
    }).join('\n');
    return `<h2>${title}</h2><table>${rows}</table>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Publications — ${authorName || 'Author'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: 'DM Sans', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1b1d36;
    margin: 0;
    padding: 44px 56px;
    max-width: 820px;
  }
  header { border-bottom: 2.5px solid #6c63ff; padding-bottom: 10px; margin-bottom: 8px; }
  h1 {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 24pt; font-weight: 400; margin: 0 0 2px;
  }
  .meta { font-size: 9.5pt; color: #7a7fa8; margin: 0; }
  h2 {
    font-family: 'DM Serif Display', Georgia, serif;
    font-size: 13pt; font-weight: 400;
    color: #6c63ff;
    text-transform: uppercase; letter-spacing: .07em;
    margin: 28px 0 6px;
    border-bottom: 1px solid #e3e5f5; padding-bottom: 4px;
  }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  td { vertical-align: top; padding: 4px 0; }
  td.num { width: 28px; color: #7a7fa8; font-size: 9pt; padding-top: 5px; white-space: nowrap; }
  a { color: #6c63ff; }
  @media print {
    body { padding: 20px 30px; }
    h2 { page-break-after: avoid; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<header>
  <h1>${authorName || 'Publications'}</h1>
  <p class="meta">Publication list · ${new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})} · ${pubs.length} item${pubs.length !== 1 ? 's' : ''}</p>
</header>
${sectionsHtml}
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give fonts a moment to load before print dialog
  setTimeout(() => w.print(), 600);
}
function doExportRis(pubs) {
  const TY_MAP = {
    journal:'JOUR', review:'JOUR', preprint:'JOUR',
    conference:'CONF', poster:'ABST', lecture:'CONF',
    book:'CHAP', other:'GEN',
  };
  const entries = pubs.map(pub => {
    const ty = TY_MAP[pub.pub_type] || 'JOUR';
    const doi = pub.doi?.startsWith('http')
      ? pub.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      : (pub.doi || '');
    const lines = [`TY  - ${ty}`];
    if (pub.title) lines.push(`TI  - ${pub.title}`);
    for (const au of splitAuthors(pub.authors)) lines.push(`AU  - ${au}`);
    const venue = pub.journal || pub.venue || '';
    if (venue) lines.push((ty === 'CONF' || ty === 'ABST') ? `BT  - ${venue}` : `JO  - ${venue}`);
    if (pub.year)  lines.push(`PY  - ${pub.year}`);
    if (doi)       lines.push(`DO  - ${doi}`);
    if (pub.pmid)  lines.push(`AN  - ${pub.pmid}`);
    lines.push('ER  - ');
    return lines.join('\n');
  });
  const blob = new Blob([entries.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'publications.ris'; a.click();
  URL.revokeObjectURL(url);
}

import { supabase } from '../supabase';
import { T, PUB_TYPES, EDGE_FN, EDGE_HEADERS } from '../lib/constants';
import { normForMatch, deduplicateSectionFuzzy, scoreWorkMatch, scoreEduMatch, mergeRicher, buildCitationFromEpmc, buildCitationFromCrossRef } from '../lib/utils';
import { parseRis, parseBib, buildCitationFromRef } from '../lib/referenceUtils';
import { typeIcon, typeLabel } from '../lib/pubUtils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import ConflictResolverModal from '../components/ConflictResolverModal';
import SectionGroup from './SectionGroup';

export default function PublicationsTab({ user, profile, setProfile, pendingCvPubs=[], onPendingConsumed, initialMode }) {
  const [pubs,      setPubs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [searching, setSearching] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [confirmed, setConfirmed] = useState(new Set());
  const [rejected,  setRejected]  = useState(new Set());
  const [showSearch,setShowSearch]= useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [showImport,setShowImport]= useState(false);
  const [importing, setImporting] = useState(false);
  const [importProposals, setImportProposals] = useState([]);
  const [importConfirmed, setImportConfirmed] = useState(new Set());
  const [importRejected,  setImportRejected]  = useState(new Set());
  const [newPub,    setNewPub]    = useState({title:'',authors:'',journal:'',year:'',doi:'',pub_type:'journal',venue:'',citation:''});
  const [saving,    setSaving]    = useState(false);
  const [nameVariants, setNameVariants] = useState('');
  // Add-publication panel state
  const [addMode,          setAddMode]          = useState('search'); // 'search' | 'doi' | 'manual'
  const [addSearchTerm,    setAddSearchTerm]    = useState('');
  const [addAuthor,        setAddAuthor]        = useState('');
  const [addYearFrom,      setAddYearFrom]      = useState('');
  const [addYearTo,        setAddYearTo]        = useState('');
  const [addJournal,       setAddJournal]       = useState('');
  const [showAddAdv,       setShowAddAdv]       = useState(false);
  const [addSearchResults, setAddSearchResults] = useState([]);
  const [addNextCursor,    setAddNextCursor]    = useState(null);
  const [addHasMore,       setAddHasMore]       = useState(false);
  const [addLoadingMore,   setAddLoadingMore]   = useState(false);
  const [addSearching,     setAddSearching]     = useState(false);
  const [addSearchError,   setAddSearchError]   = useState('');
  const [addTotal,         setAddTotal]         = useState(null);
  const [addDoi,           setAddDoi]           = useState('');
  const [addDoiFetching,   setAddDoiFetching]   = useState(false);
  const [addSelected,      setAddSelected]      = useState(false);
  // Author-search panel extra filters
  const [epSearchYearFrom,    setEpSearchYearFrom]    = useState('');
  const [epSearchYearTo,      setEpSearchYearTo]      = useState('');
  const [epSearchJournal,     setEpSearchJournal]     = useState('');
  const [showEpSearchAdv,     setShowEpSearchAdv]     = useState(false);
  const [epSearchCursor,      setEpSearchCursor]      = useState(null);
  const [epSearchHasMore,     setEpSearchHasMore]     = useState(false);
  const [epSearchLoadingMore, setEpSearchLoadingMore] = useState(false);
  const [epSearchTotal,       setEpSearchTotal]       = useState(null);
  const [showRisImport, setShowRisImport] = useState(false);
  const [risProposals,  setRisProposals]  = useState([]);
  const [risFileName,   setRisFileName]   = useState('');
  const [risSaving,     setRisSaving]     = useState(false);
  const [showExport,   setShowExport]   = useState(false);
  const exportRef = useRef(null);

  useEffect(()=>{
    if(!user) return;
    supabase.from('publications').select('*').eq('user_id',user.id)
      .order('year',{ascending:false}).order('created_at',{ascending:false})
      .then(({data})=>{ setPubs(data||[]); setLoading(false); });
    if(profile?.name){
      const n = profile.name.replace(/^Dr\.?\s*/i,'').trim();
      const parts = n.split(/\s+/);
      const last  = parts[parts.length-1];
      const first = parts[0];
      const initials = parts.slice(0,-1).map(p=>p[0]).join('');
      const variants = [
        `${last} ${first}`,
        `${last} ${initials}`,
        `${last} ${parts.slice(0,-1).map(p=>p[0]).join('')}`,
      ].filter((v,i,a)=>v.trim()&&a.indexOf(v)===i).join(', ');
      setNameVariants(variants);
    }
  },[user, profile?.name]);

  useEffect(()=>{
    if(!pendingCvPubs?.length || !user) return;
    const insert = async () => {
      const existingDois   = new Set(pubs.map(p=>(p.doi||'').toLowerCase()).filter(Boolean));
      const existingTitles = new Set(pubs.map(p=>normForMatch(p.title).slice(0,40)));
      const toInsert = pendingCvPubs.filter(p=>{
        if(!p.title?.trim()) return false;
        if(p.doi && existingDois.has(p.doi.toLowerCase())) return false;
        if(existingTitles.has(normForMatch(p.title).slice(0,40))) return false;
        return true;
      });
      if(toInsert.length) {
        const {data} = await supabase.from('publications').insert(
          toInsert.map(p=>({ user_id:user.id, title:p.title||'', journal:p.journal||'',
            year:String(p.year||''), doi:p.doi||'', authors:p.authors||'',
            pmid:'', pub_type:p.pub_type||'journal', venue:p.venue||'', source:'cv' }))
        ).select();
        if(data) setPubs(prev=>[...data,...prev].sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
      }
      onPendingConsumed?.();
    };
    insert();
  },[pendingCvPubs]);

  // Auto-open the add panel if coming from onboarding
  useEffect(() => {
    if (!initialMode) return;
    setShowAdd(true);
    setAddMode(initialMode === 'doi_lookup' ? 'doi' : 'search');
  }, []); // eslint-disable-line

  const buildEpSearchQuery = () => {
    const variants = nameVariants.split(',').map(v => v.trim()).filter(Boolean);
    const parts = [];
    if (variants.length) parts.push('(' + variants.map(v => `AUTH:"${v}"`).join(' OR ') + ')');
    if (epSearchJournal.trim()) parts.push(`JOURNAL:"${epSearchJournal.trim()}"`);
    if (epSearchYearFrom.trim() || epSearchYearTo.trim()) {
      const from = epSearchYearFrom.trim() || epSearchYearTo.trim();
      const to   = epSearchYearTo.trim()   || epSearchYearFrom.trim();
      parts.push(from === to ? `(PUB_YEAR:${from})` : `(PUB_YEAR:[${from} TO ${to}])`);
    }
    return parts.join(' AND ');
  };

  const mapEpmcResult = (r, existingPmids, existingDois) => {
    const pmid = r.pmid || '';
    const doi  = (r.doi || '').toLowerCase();
    if (pmid && existingPmids.has(pmid)) return null;
    if (doi  && existingDois.has(doi))   return null;
    const pt = (r.pubType || '').toLowerCase();
    let pub_type = 'journal';
    if (pt.includes('preprint') || r.source === 'PPR') pub_type = 'preprint';
    else if (pt.includes('review')) pub_type = 'review';
    else if (pt.includes('book'))   pub_type = 'book';
    const ftUrls = r.fullTextUrlList?.fullTextUrl || [];
    const fullTextUrl =
      ftUrls.find(u => u.availability === 'Open access' && u.documentStyle === 'html')?.url ||
      ftUrls.find(u => u.availability === 'Open access')?.url ||
      ftUrls.find(u => u.documentStyle === 'html')?.url ||
      ftUrls[0]?.url || '';
    return {
      pmid, epmc_id: r.id || '',
      title:    (r.title || '').replace(/<[^>]+>/g, ''),
      journal:  r.journalTitle || r.journalInfo?.journal?.title || r.bookTitle || '',
      year:     r.pubYear || '',
      authors:  r.authorString || '',
      doi:      r.doi || '',
      pub_type, venue: '',
      citations:      r.citedByCount || 0,
      is_open_access: r.isOpenAccess === 'Y',
      full_text_url:  fullTextUrl,
      citation:       buildCitationFromEpmc(r),
    };
  };

  const doEpSearchFetch = async (cursor, append) => {
    const query = buildEpSearchQuery();
    if (!query) return;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=20&cursorMark=${encodeURIComponent(cursor || '*')}`;
    const res = await fetch(url);
    const data = await res.json();
    const articles = data.resultList?.result || [];
    const next = data.nextCursorMark;
    const existingPmids = new Set(pubs.map(p => p.pmid).filter(Boolean));
    const existingDois  = new Set(pubs.map(p => (p.doi || '').toLowerCase()).filter(Boolean));
    const results = articles.map(r => mapEpmcResult(r, existingPmids, existingDois)).filter(Boolean);
    if (append) setProposals(prev => [...prev, ...results]);
    else { setProposals(results); setEpSearchTotal(data.hitCount || 0); }
    setEpSearchCursor(next || null);
    setEpSearchHasMore(!!next && next !== cursor && articles.length === 20);
  };

  const searchEPMC = async () => {
    if (!nameVariants.trim() || searching) return;
    setSearching(true);
    setProposals([]); setConfirmed(new Set()); setRejected(new Set());
    setEpSearchCursor(null); setEpSearchHasMore(false); setEpSearchTotal(null);
    try { await doEpSearchFetch('*', false); }
    catch(e) { console.warn('[EPMC] error:', e); }
    setSearching(false);
  };

  const loadMoreEpSearch = async () => {
    if (!epSearchCursor || epSearchLoadingMore) return;
    setEpSearchLoadingMore(true);
    try { await doEpSearchFetch(epSearchCursor, true); }
    catch(e) { console.warn('[EPMC] load more error:', e); }
    setEpSearchLoadingMore(false);
  };

  const confirmPub = async (pub) => {
    setConfirmed(s=>new Set([...s, pub.pmid||pub.epmc_id||pub.title]));
    const { data } = await supabase.from('publications').insert({
      user_id:user.id, title:pub.title, journal:pub.journal, year:pub.year,
      doi:pub.doi, authors:pub.authors, pmid:pub.pmid||'',
      pub_type:pub.pub_type||'journal', venue:pub.venue||'', source:'europepmc',
      citations:pub.citations||0, is_open_access:pub.is_open_access||false,
      full_text_url:pub.full_text_url||'', citation:pub.citation||'',
    }).select().single();
    if(data) setPubs(p=>[data,...p].sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
  };

  const rejectPub = (key) => setRejected(s=>new Set([...s, key]));

  const [cvPreview,    setCvPreview]    = useState(null);
  const [showCvPreview,setShowCvPreview]= useState(false);
  const [cvImporting,  setCvImporting]  = useState(false);
  const [cvSaving,     setCvSaving]     = useState(false);
  const [cvSel,        setCvSel]        = useState({profile:true,work:true,edu:true,honors:true,skills:true,languages:true,publications:true});
  const [conflicts,    setConflicts]    = useState([]);
  const [showConflicts,setShowConflicts]= useState(false);
  const [pendingImport,setPendingImport]= useState(null);

  const handleFullCvUpload = async (file) => {
    if(!file) return;
    setCvImporting(true);
    setCvPreview(null);
    try {
      const payload = await prepareFile(file);
      const resp = await fetch(EDGE_FN, {
        method:'POST', headers:EDGE_HEADERS,
        body: JSON.stringify({ ...payload, mode:'full_cv' })
      });
      if(!resp.ok) { const t=await resp.text(); throw new Error(`Edge Function ${resp.status}: ${t.slice(0,200)}`); }
      const rd = await resp.json();
      if(rd.error) throw new Error(rd.error);
      setCvPreview(rd.result);
      setShowCvPreview(true);
    } catch(e) {
      console.error('CV import error:', e);
      alert('CV import failed: ' + e.message);
    }
    setCvImporting(false);
  };

  const applyFullCv = async () => {
    if(!cvPreview) return;
    setCvSaving(true);

    const existingWH  = profile?.work_history || [];
    const existingEdu = profile?.education    || [];

    const whResult  = cvSel.work ? deduplicateSectionFuzzy(cvPreview.work_history||[], existingWH,  scoreWorkMatch, 'work') : { autoMerged:existingWH, conflicts:[], newItems:[] };
    const eduResult = cvSel.edu  ? deduplicateSectionFuzzy(cvPreview.education||[],    existingEdu, scoreEduMatch,  'edu' ) : { autoMerged:existingEdu, conflicts:[], newItems:[] };

    const allConflicts = [
      ...whResult.conflicts.map(c=>({...c, field:'work_history', fieldLabel:'Work Experience'})),
      ...eduResult.conflicts.map(c=>({...c, field:'education',   fieldLabel:'Education'})),
    ].map((c,i)=>({...c, id:i, resolution:'keep_existing'}));

    if(allConflicts.length > 0) {
      setPendingImport({
        whAutoMerged:  whResult.autoMerged,
        whNewItems:    whResult.newItems,
        eduAutoMerged: eduResult.autoMerged,
        eduNewItems:   eduResult.newItems,
      });
      setConflicts(allConflicts);
      setShowCvPreview(false);
      setShowConflicts(true);
      setCvSaving(false);
      return;
    }

    await saveFullCvImport({
      whFinal:  [...whResult.autoMerged, ...whResult.newItems],
      eduFinal: [...eduResult.autoMerged, ...eduResult.newItems],
      resolvedConflicts: [],
    });
    setCvSaving(false);
  };

  const applyResolvedConflicts = async (resolvedConflicts) => {
    if(!pendingImport) return;
    setCvSaving(true);
    let whFinal  = [...pendingImport.whAutoMerged];
    let eduFinal = [...pendingImport.eduAutoMerged];
    for(const c of resolvedConflicts) {
      const { resolution, field, incoming, existing, existingIdx } = c;
      const arr = field==='work_history' ? whFinal : eduFinal;
      if(resolution==='use_incoming')  arr[existingIdx] = incoming;
      else if(resolution==='merge')    arr[existingIdx] = mergeRicher(incoming, existing);
      else if(resolution==='keep_both') arr.push(incoming);
    }
    await saveFullCvImport({
      whFinal:  [...whFinal,  ...pendingImport.whNewItems],
      eduFinal: [...eduFinal, ...pendingImport.eduNewItems],
    });
    setCvSaving(false);
    setShowConflicts(false);
    setConflicts([]);
    setPendingImport(null);
  };

  const saveFullCvImport = async ({ whFinal, eduFinal }) => {
    const norm = normForMatch;
    const updates = {};

    if(cvSel.profile && cvPreview?.profile) {
      const p = cvPreview.profile;
      if(p.name     && !profile?.name)     updates.name     = p.name;
      if(p.title    && !profile?.title)    updates.title    = p.title;
      if(p.bio      && !profile?.bio)      updates.bio      = p.bio;
      if(p.location && !profile?.location) updates.location = p.location;
      if(p.orcid    && !profile?.orcid)    updates.orcid    = p.orcid;
    }

    if(cvSel.work && whFinal.length)
      updates.work_history = whFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));

    if(cvSel.edu && eduFinal.length)
      updates.education = eduFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));

    if(cvSel.honors && cvPreview?.honors?.length) {
      const existing = profile?.honors || [];
      const incoming = cvPreview.honors.filter(h=>!existing.some(e=>norm(e.title)===norm(h.title)));
      updates.honors = [...existing, ...incoming];
    }

    if(cvSel.languages && cvPreview?.languages?.length) {
      const existing = profile?.languages || [];
      const incoming = cvPreview.languages.filter(l=>!existing.some(e=>norm(e.name)===norm(l.name)));
      updates.languages = [...existing, ...incoming];
    }

    if(cvSel.skills && cvPreview?.skills?.length) {
      const existing = profile?.skills || [];
      const incoming = cvPreview.skills.filter(s=>!existing.some(e=>norm(e.name)===norm(s.name)));
      updates.skills = [...existing, ...incoming];
    }

    if(Object.keys(updates).length) {
      const { data } = await supabase.from('profiles').update(updates).eq('id',user.id).select().single();
      if(data) setProfile(data);
    }

    if(cvSel.publications && cvPreview?.publications?.length) {
      const existingDois   = new Set(pubs.map(p=>(p.doi||'').toLowerCase()).filter(Boolean));
      const existingTitles = new Set(pubs.map(p=>norm(p.title).slice(0,40)));
      const toInsert = cvPreview.publications.filter(p => {
        if(!p.title?.trim()) return false;
        if(p.doi && existingDois.has(p.doi.toLowerCase())) return false;
        if(existingTitles.has(norm(p.title).slice(0,40))) return false;
        return true;
      });
      if(toInsert.length) {
        const { data } = await supabase.from('publications').insert(
          toInsert.map(p=>({ user_id:user.id, title:p.title||'', journal:p.journal||'',
            year:String(p.year||''), doi:p.doi||'', authors:p.authors||'',
            pmid:'', pub_type:p.pub_type||'journal', venue:p.venue||'', source:'cv' }))
        ).select();
        if(data) setPubs(prev=>[...data,...prev].sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
      }
    }

    setShowCvPreview(false);
    setCvPreview(null);
  };

  // Close export dropdown on outside click
  useEffect(() => {
    if (!showExport) return;
    const handler = (e) => { if (!exportRef.current?.contains(e.target)) setShowExport(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExport]);

  const handleDocUpload = async (file) => {
    if(!file) return;
    setImporting(true);
    setImportProposals([]);
    setImportConfirmed(new Set());
    setImportRejected(new Set());
    try {
      const payload = await prepareFile(file);
      const resp = await fetch(EDGE_FN, {
        method:'POST', headers:EDGE_HEADERS,
        body: JSON.stringify({ ...payload, mode:'publications' })
      });
      if(!resp.ok) { const t=await resp.text(); throw new Error(`Edge Function ${resp.status}: ${t.slice(0,200)}`); }
      const rd = await resp.json();
      if(rd.error) throw new Error(rd.error);
      handleExtracted(rd.publications || []);
    } catch(e) {
      console.error('Document import error:', e);
      alert('Import failed: ' + e.message);
    }
    setImporting(false);
  };

  const handleExtracted = (publications) => {
    const existingDois   = new Set(pubs.map(p=>(p.doi||'').toLowerCase()).filter(Boolean));
    const existingTitles = new Set(pubs.map(p=>(p.title||'').toLowerCase().slice(0,40)));
    const filtered = (publications||[]).filter(p => {
      if(p.doi && existingDois.has(p.doi.toLowerCase())) return false;
      if(existingTitles.has((p.title||'').toLowerCase().slice(0,40))) return false;
      return !!p.title?.trim();
    });
    setImportProposals(filtered);
  };

  const confirmImportPub = async (pub, idx) => {
    setImportConfirmed(s=>new Set([...s,idx]));
    const { data } = await supabase.from('publications').insert({
      user_id:user.id, title:pub.title||'', journal:pub.journal||'',
      year:String(pub.year||''), doi:pub.doi||'', authors:pub.authors||'',
      pmid:'', pub_type:pub.pub_type||'other', venue:pub.venue||pub.journal||'',
      source:'document'
    }).select().single();
    if(data) setPubs(p=>[data,...p].sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
  };

  const rejectImportPub = (idx) => setImportRejected(s=>new Set([...s,idx]));

  const handleRisFile = (file) => {
    if (!file) return;
    setRisFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = file.name.toLowerCase().endsWith('.bib') ? parseBib(text) : parseRis(text);
        const existingDois   = new Set(pubs.map(p => (p.doi||'').toLowerCase()).filter(Boolean));
        const existingTitles = new Set(pubs.map(p => normForMatch(p.title).slice(0, 40)));
        const filtered = parsed.filter(p => {
          if (!p.title?.trim()) return false;
          if (p.doi && existingDois.has(p.doi.toLowerCase())) return false;
          if (existingTitles.has(normForMatch(p.title).slice(0, 40))) return false;
          return true;
        });
        setRisProposals(filtered);
        setShowRisImport(true);
      } catch {
        alert('Failed to parse file. Check that it is a valid .ris or .bib file.');
      }
    };
    reader.readAsText(file);
  };

  const importAllRis = async () => {
    if (!risProposals.length || risSaving) return;
    setRisSaving(true);
    const { data } = await supabase.from('publications').insert(
      risProposals.map(p => ({
        user_id:  user.id,
        title:    p.title    || '',
        authors:  p.authors  || '',
        journal:  p.journal  || '',
        year:     p.year     || '',
        doi:      p.doi      || '',
        pub_type: p.pub_type || 'journal',
        venue:    '',
        pmid:     '',
        source:   'ris_bib',
        citation: buildCitationFromRef(p),
      }))
    ).select();
    if (data) setPubs(prev => [...data, ...prev].sort((a, b) => (b.year||'').localeCompare(a.year||'')));
    setRisSaving(false);
    setShowRisImport(false);
    setRisProposals([]);
  };

  const buildAddQuery = () => {
    const parts = [];
    if (addSearchTerm.trim()) parts.push(addSearchTerm.trim());
    if (addAuthor.trim())     parts.push(`AUTH:"${addAuthor.trim()}"`);
    if (addJournal.trim())    parts.push(`JOURNAL:"${addJournal.trim()}"`);
    if (addYearFrom.trim() || addYearTo.trim()) {
      const from = addYearFrom.trim() || addYearTo.trim();
      const to   = addYearTo.trim()   || addYearFrom.trim();
      parts.push(from === to ? `(PUB_YEAR:${from})` : `(PUB_YEAR:[${from} TO ${to}])`);
    }
    return parts.join(' ');
  };

  const doAddFetch = async (cursor, append) => {
    const q = buildAddQuery();
    if (!q) return;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&resultType=core&pageSize=10&format=json&cursorMark=${encodeURIComponent(cursor || '*')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error();
    const data = await resp.json();
    const rows = data.resultList?.result || [];
    const next = data.nextCursorMark;
    if (append) setAddSearchResults(prev => [...prev, ...rows]);
    else { setAddSearchResults(rows); setAddTotal(data.hitCount || 0); }
    setAddNextCursor(next || null);
    setAddHasMore(!!next && next !== cursor && rows.length === 10);
    if (!rows.length && !append) setAddSearchError('No results. Try different keywords or a DOI.');
  };

  const searchEPMCKeyword = async () => {
    const q = buildAddQuery();
    if (!q || addSearching) return;
    setAddSearching(true); setAddSearchError(''); setAddSearchResults([]);
    setAddNextCursor(null); setAddHasMore(false); setAddTotal(null);
    try { await doAddFetch('*', false); }
    catch { setAddSearchError('Search failed. Check your connection.'); }
    setAddSearching(false);
  };

  const loadMoreAdd = async () => {
    if (!addNextCursor || addLoadingMore) return;
    setAddLoadingMore(true);
    try { await doAddFetch(addNextCursor, true); }
    catch { setAddSearchError('Failed to load more results.'); }
    setAddLoadingMore(false);
  };

  const lookupAddDoi = async (doi) => {
    const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
    if (!clean || addDoiFetching) return;
    setAddDoiFetching(true); setAddSearchError('');
    try {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
      if (!r.ok) throw new Error();
      const w = (await r.json()).message;
      const authors = (w.author||[]).slice(0,5).map(a=>`${a.given||''} ${a.family||''}`.trim()).join(', ') + ((w.author||[]).length>5?' et al.':'');
      setNewPub(p=>({
        ...p,
        title:   w.title?.[0] || p.title,
        journal: w['container-title']?.[0] || p.journal,
        year:    w.published?.['date-parts']?.[0]?.[0]?.toString() || p.year,
        authors: authors || p.authors,
        doi:     clean,
        citation: buildCitationFromCrossRef(w, clean),
      }));
      setAddSelected(true);
    } catch { setAddSearchError('DOI not found in CrossRef. Try a different DOI or fill in manually.'); }
    setAddDoiFetching(false);
  };

  const selectAddResult = (r) => {
    const pt = (r.pubType||'').toLowerCase();
    let pub_type = 'journal';
    if (pt.includes('preprint') || r.source === 'PPR') pub_type = 'preprint';
    else if (pt.includes('review')) pub_type = 'review';
    setNewPub({
      title:   (r.title||'').replace(/<[^>]+>/g,''),
      authors: r.authorString||'',
      journal: r.journalTitle||'',
      year:    r.pubYear||'',
      doi:     r.doi||'',
      pub_type,
      venue:   '',
      citation: buildCitationFromEpmc(r),
    });
    setAddSelected(true);
    setAddSearchResults([]);
    setAddSearchTerm('');
  };

  const closeAddPanel = () => {
    setShowAdd(false);
    setAddSelected(false);
    setAddSearchTerm(''); setAddSearchResults([]); setAddSearchError('');
    setAddAuthor(''); setAddYearFrom(''); setAddYearTo(''); setAddJournal('');
    setShowAddAdv(false); setAddNextCursor(null); setAddHasMore(false); setAddTotal(null);
    setAddDoi(''); setAddDoiFetching(false);
    setNewPub({title:'',authors:'',journal:'',year:'',doi:'',pub_type:'journal',venue:'',citation:''});
  };

  const addManual = async () => {
    if(!newPub.title.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('publications').insert({
      user_id:user.id, ...newPub, pmid:'', source:'manual'
    }).select().single();
    if(data) setPubs(p=>[data,...p].sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
    setSaving(false);
    closeAddPanel();
  };

  if(loading) return <Spinner/>;

  const visibleProposals  = proposals.filter(p=>!confirmed.has(p.pmid||p.epmc_id||p.title)&&!rejected.has(p.pmid||p.epmc_id||p.title));
  const visibleImport     = importProposals.filter((_,i)=>!importConfirmed.has(i)&&!importRejected.has(i));

  const journals      = pubs.filter(p=>!p.pub_type||p.pub_type==='journal'||p.pub_type==='review'||p.pub_type==='preprint');
  const presentations = pubs.filter(p=>['conference','poster','lecture'].includes(p.pub_type));
  const books         = pubs.filter(p=>p.pub_type==='book');
  const others        = pubs.filter(p=>p.pub_type==='other');

  return (
    <div>
      {showConflicts && conflicts.length > 0 && (
        <ConflictResolverModal
          conflicts={conflicts}
          saving={cvSaving}
          onApply={applyResolvedConflicts}
          onCancel={()=>{setShowConflicts(false);setConflicts([]);setPendingImport(null);}}
        />
      )}

      {showCvPreview && cvPreview && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px 0'}}>
          <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:620,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:4}}>CV import preview</div>
            <div style={{fontSize:13,color:T.mu,marginBottom:20}}>Select what to import. Existing data is preserved — only new items are added.</div>

            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:20}}>
              {[
                cvPreview.work_history?.length      && `${cvPreview.work_history.length} work entries`,
                cvPreview.education?.length         && `${cvPreview.education.length} education entries`,
                cvPreview.publications?.length      && `${cvPreview.publications.length} publications`,
                cvPreview.honors?.length            && `${cvPreview.honors.length} honors`,
                cvPreview.languages?.length         && `${cvPreview.languages.length} languages`,
                cvPreview.skills?.length            && `${cvPreview.skills.length} skills`,
              ].filter(Boolean).map(s=>(
                <span key={s} style={{background:T.gr2,border:`1px solid rgba(16,185,129,.25)`,borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600,color:T.gr}}>{s}</span>
              ))}
            </div>

            {[
              ['profile',    'Profile info (name, title, bio, location)',  cvPreview.profile && (cvPreview.profile.name||cvPreview.profile.bio)],
              ['work',       'Work history',                                cvPreview.work_history?.length > 0],
              ['edu',        'Education',                                   cvPreview.education?.length > 0],
              ['honors',     'Honors & Awards',                             cvPreview.honors?.length > 0],
              ['languages',  'Languages',                                   cvPreview.languages?.length > 0],
              ['skills',     'Skills',                                      cvPreview.skills?.length > 0],
              ['publications','Publications & Presentations',               cvPreview.publications?.length > 0],
            ].filter(([,,hasData])=>hasData).map(([key,label])=>(
              <label key={key} style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer',marginBottom:10,padding:'9px 12px',background:cvSel[key]?T.gr2:T.s2,borderRadius:9,border:`1px solid ${cvSel[key]?'rgba(16,185,129,.2)':T.bdr}`}}>
                <input type="checkbox" checked={cvSel[key]||false} onChange={()=>setCvSel(s=>({...s,[key]:!s[key]}))} style={{width:16,height:16,accentColor:T.gr}}/>
                <span style={{fontSize:13,fontWeight:600,color:cvSel[key]?T.gr:T.text}}>{label}</span>
                {key==='publications'&&<span style={{fontSize:11,color:T.mu,marginLeft:'auto'}}>Duplicates auto-skipped</span>}
                {(key==='work'||key==='edu')&&<span style={{fontSize:11,color:T.mu,marginLeft:'auto'}}>Merged with existing</span>}
              </label>
            ))}

            {cvSel.work && cvPreview.work_history?.length>0 && (
              <div style={{marginTop:12,maxHeight:160,overflowY:'auto',display:'flex',flexDirection:'column',gap:5}}>
                {cvPreview.work_history.slice(0,5).map((e,i)=>(
                  <div key={i} style={{background:T.s2,borderRadius:8,padding:'7px 11px',fontSize:12}}>
                    <div style={{fontWeight:700}}>{e.title}</div>
                    <div style={{color:T.mu}}>{e.company}{e.location?` · ${e.location}`:''}{e.start?` · ${e.start.slice(0,4)}`:''}</div>
                  </div>
                ))}
                {cvPreview.work_history.length>5&&<div style={{fontSize:11,color:T.mu,padding:'4px 4px'}}>+{cvPreview.work_history.length-5} more</div>}
              </div>
            )}

            {cvSel.publications && cvPreview.publications?.length>0 && (
              <div style={{marginTop:12,maxHeight:160,overflowY:'auto',display:'flex',flexDirection:'column',gap:5}}>
                {cvPreview.publications.slice(0,5).map((p,i)=>(
                  <div key={i} style={{background:T.s2,borderRadius:8,padding:'7px 11px',fontSize:12}}>
                    <div style={{fontWeight:700,lineHeight:1.4}}>{p.title}</div>
                    <div style={{color:T.mu}}>{p.journal||p.venue}{p.year?` · ${p.year}`:''}</div>
                  </div>
                ))}
                {cvPreview.publications.length>5&&<div style={{fontSize:11,color:T.mu,padding:'4px 4px'}}>+{cvPreview.publications.length-5} more</div>}
              </div>
            )}

            <div style={{display:'flex',gap:9,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:`1px solid ${T.bdr}`}}>
              <Btn onClick={()=>{setShowCvPreview(false);setCvPreview(null);}}>Cancel</Btn>
              <Btn variant="s" onClick={applyFullCv} disabled={cvSaving} style={{background:T.gr,borderColor:T.gr}}>
                {cvSaving?'Checking for duplicates...':'Import selected →'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:20,flexWrap:'wrap'}}>
        <div style={{fontWeight:700,fontSize:13,flex:1}}>{pubs.length} publication{pubs.length!==1?'s':''}</div>
        {pubs.length > 0 && (
          <div ref={exportRef} style={{position:'relative'}}>
            <button
              onClick={()=>setShowExport(v=>!v)}
              style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:22,cursor:'pointer',fontSize:12,fontWeight:600,border:`1.5px solid ${T.bdr}`,background:showExport?T.s2:'transparent',color:T.mu,fontFamily:'inherit'}}>
              ↓ Export
            </button>
            {showExport && (
              <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',background:T.w,border:`1px solid ${T.bdr}`,borderRadius:10,boxShadow:'0 4px 20px rgba(0,0,0,.12)',minWidth:180,zIndex:100,overflow:'hidden'}}>
                <button
                  onClick={()=>{ doExportBib(pubs, profile?.name); setShowExport(false); }}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',fontSize:12.5,fontWeight:600,fontFamily:'inherit',border:'none',background:'transparent',cursor:'pointer',borderBottom:`1px solid ${T.bdr}`,color:T.text}}>
                  <span style={{marginRight:8}}>📑</span>BibTeX (.bib)
                </button>
                <button
                  onClick={()=>{ doExportRis(pubs); setShowExport(false); }}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',fontSize:12.5,fontWeight:600,fontFamily:'inherit',border:'none',background:'transparent',cursor:'pointer',borderBottom:`1px solid ${T.bdr}`,color:T.text}}>
                  <span style={{marginRight:8}}>📄</span>RIS (.ris)
                </button>
                <button
                  onClick={()=>{ doExportPdf(pubs, profile?.name); setShowExport(false); }}
                  style={{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',fontSize:12.5,fontWeight:600,fontFamily:'inherit',border:'none',background:'transparent',cursor:'pointer',color:T.text}}>
                  <span style={{marginRight:8}}>🖨️</span>PDF (Vancouver / NLM)
                </button>
              </div>
            )}
          </div>
        )}
        <Btn onClick={()=>{setShowSearch(!showSearch);if(!showSearch&&!proposals.length)searchEPMC();}} style={{fontSize:12}}>🔍 Search Europe PMC</Btn>
        <label style={{cursor:'pointer'}}>
          <input type="file" accept=".pdf,.docx,.txt,.md" onChange={e=>{ if(e.target.files?.[0]){setShowImport(true);handleDocUpload(e.target.files[0]);} }} style={{display:'none'}}/>
          <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:22,cursor:'pointer',fontSize:12,fontWeight:600,border:`1.5px solid ${T.bdr}`,background:'transparent',color:T.mu}}>
            🤖 AI publication import
          </span>
        </label>
        <label style={{cursor:'pointer'}}>
          <input type="file" accept=".ris,.bib" onChange={e=>{ if(e.target.files?.[0]) handleRisFile(e.target.files[0]); e.target.value=''; }} style={{display:'none'}}/>
          <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:22,cursor:'pointer',fontSize:12,fontWeight:600,border:`1.5px solid ${T.bdr}`,background:'transparent',color:T.mu}}>
            📑 Import .ris / .bib
          </span>
        </label>
        <Btn variant="v" onClick={()=>{ if(showAdd) closeAddPanel(); else setShowAdd(true); }} style={{fontSize:12}}>+ Add publication</Btn>
      </div>

      {showSearch&&(
        <div style={{background:`linear-gradient(135deg,${T.v2},${T.bl2})`,borderRadius:12,padding:16,marginBottom:20,border:`1px solid rgba(108,99,255,.15)`}}>
          <div style={{fontSize:12,fontWeight:700,color:T.v,marginBottom:8}}>Europe PMC search — name variants</div>
          <div style={{fontSize:11.5,color:T.mu,marginBottom:10}}>
            Add all the name formats you've published under, comma-separated. Searches PubMed, PubMed Central, preprints, and more — with citation data.
          </div>
          <div style={{display:'flex',gap:8,marginBottom:6}}>
            <input value={nameVariants} onChange={e=>setNameVariants(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&searchEPMC()}
              placeholder="Ruzicka Daniel, Ruzicka D, Ruzicka DJ"
              style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
            <Btn variant="s" onClick={searchEPMC} disabled={searching||!nameVariants.trim()} style={{whiteSpace:'nowrap'}}>
              {searching?'Searching...':'Search →'}
            </Btn>
          </div>
          <button onClick={()=>setShowEpSearchAdv(s=>!s)} style={{fontSize:11.5,color:T.v,fontWeight:600,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',padding:0,marginBottom:showEpSearchAdv?8:10}}>
            {showEpSearchAdv?'▲ Hide filters':'▼ Year, journal filters…'}
          </button>
          {showEpSearchAdv && (
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12,padding:'10px 12px',background:'rgba(255,255,255,.6)',borderRadius:9,border:`1px solid rgba(108,99,255,.15)`}}>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <label style={{fontSize:11.5,color:T.mu,width:52,flexShrink:0}}>Year</label>
                <input value={epSearchYearFrom} onChange={e=>setEpSearchYearFrom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMC()} placeholder="From (e.g. 2020)"
                  style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
                <span style={{fontSize:12,color:T.mu,flexShrink:0}}>–</span>
                <input value={epSearchYearTo} onChange={e=>setEpSearchYearTo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMC()} placeholder="To (e.g. 2024)"
                  style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <label style={{fontSize:11.5,color:T.mu,width:52,flexShrink:0}}>Journal</label>
                <input value={epSearchJournal} onChange={e=>setEpSearchJournal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMC()} placeholder="e.g. Nature"
                  style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
              </div>
            </div>
          )}
          {searching&&<Spinner/>}
          {!searching&&epSearchTotal!==null&&(
            <div style={{fontSize:11.5,color:T.mu,marginBottom:8}}>{epSearchTotal.toLocaleString()} results · showing {proposals.length}</div>
          )}
          {!searching&&visibleProposals.length===0&&proposals.length>0&&(
            <div style={{fontSize:12.5,color:T.mu,textAlign:'center',padding:'12px 0'}}>All proposals reviewed.</div>
          )}
          {!searching&&proposals.length===0&&(
            <div style={{fontSize:12.5,color:T.mu,textAlign:'center',padding:'8px 0'}}>Run the search to see proposals.</div>
          )}
          {!searching&&visibleProposals.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {visibleProposals.map(pub=>(
                <div key={pub.pmid||pub.epmc_id||pub.title} style={{background:'rgba(255,255,255,.85)',borderRadius:10,padding:'11px 13px',display:'flex',alignItems:'flex-start',gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3,flexWrap:'wrap'}}>
                      <span style={{fontSize:13}}>{typeIcon(pub.pub_type)}</span>
                      <span style={{fontSize:10,color:T.mu,background:T.s2,borderRadius:8,padding:'1px 6px'}}>{typeLabel(pub.pub_type)}</span>
                      {pub.is_open_access&&<span style={{fontSize:10,color:'#059669',background:'#d1fae5',borderRadius:8,padding:'1px 6px',fontWeight:600}}>Open Access</span>}
                      {pub.citations>0&&<span style={{fontSize:10,color:T.mu}}>{pub.citations} citations</span>}
                    </div>
                    <div style={{fontSize:12.5,fontWeight:700,lineHeight:1.4,marginBottom:2}}>{pub.title}</div>
                    {(pub.citation || pub.journal) && (
                      <div style={{fontSize:11,color:T.mu,marginBottom:2}}>{pub.citation || [pub.journal, pub.year].filter(Boolean).join(' · ')}</div>
                    )}
                    {pub.authors&&<div style={{fontSize:10.5,color:T.mu}}>{pub.authors}</div>}
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button onClick={()=>confirmPub(pub)} style={{padding:'5px 11px',borderRadius:20,border:'none',background:T.gr,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>✓ Mine</button>
                    <button onClick={()=>rejectPub(pub.pmid||pub.epmc_id||pub.title)} style={{padding:'5px 11px',borderRadius:20,border:`1px solid ${T.bdr}`,background:T.w,color:T.mu,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✕ Not mine</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!searching&&epSearchHasMore&&(
            <div style={{textAlign:'center',paddingTop:10}}>
              <Btn onClick={loadMoreEpSearch} disabled={epSearchLoadingMore}>
                {epSearchLoadingMore?'Loading...':'Show next 20'}
              </Btn>
            </div>
          )}
        </div>
      )}

      {showImport&&(
        <div style={{background:T.s2,borderRadius:12,padding:16,marginBottom:20,border:`1px solid ${T.bdr}`}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,flex:1}}>📄 Extracted from document</div>
            <button onClick={()=>setShowImport(false)} style={{fontSize:12,color:T.mu,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit'}}>Close</button>
          </div>
          {importing&&(
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'16px 0'}}>
              <Spinner/>
              <div style={{fontSize:13,color:T.mu}}>Claude is reading your document and extracting publications...</div>
            </div>
          )}
          {!importing&&importProposals.length===0&&(
            <div style={{fontSize:12.5,color:T.mu,textAlign:'center',padding:'12px 0'}}>
              No publications extracted, or all have been reviewed. Try a different document or add manually.
            </div>
          )}
          {!importing&&visibleImport.length>0&&(
            <>
              <div style={{fontSize:11.5,color:T.mu,marginBottom:10}}>
                Found {importProposals.length} items. Confirm the ones that are yours — type is auto-detected by Claude.
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {visibleImport.map((pub,origIdx)=>{
                  const idx = importProposals.indexOf(pub);
                  return (
                    <div key={idx} style={{background:T.w,borderRadius:10,padding:'11px 13px',display:'flex',alignItems:'flex-start',gap:10,border:`1px solid ${T.bdr}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                          <span style={{fontSize:14}}>{typeIcon(pub.pub_type)}</span>
                          <span style={{fontSize:10.5,color:T.mu,background:T.s2,borderRadius:10,padding:'1px 8px'}}>{typeLabel(pub.pub_type)}</span>
                          {pub.year&&<span style={{fontSize:10.5,color:T.mu}}>{pub.year}</span>}
                        </div>
                        <div style={{fontSize:12.5,fontWeight:700,lineHeight:1.4,marginBottom:2}}>{pub.title}</div>
                        {pub.authors&&<div style={{fontSize:11,color:T.mu,marginBottom:1}}>{pub.authors}</div>}
                        {(pub.journal||pub.venue)&&<div style={{fontSize:11,color:T.v,fontWeight:600}}>{pub.journal||pub.venue}</div>}
                        {pub.doi&&<div style={{fontSize:10.5,color:T.mu}}>DOI: {pub.doi}</div>}
                        {pub.notes&&<div style={{fontSize:10.5,color:T.mu,fontStyle:'italic',marginTop:2}}>{pub.notes}</div>}
                      </div>
                      <div style={{display:'flex',gap:6,flexShrink:0,flexDirection:'column',alignItems:'flex-end'}}>
                        <button onClick={()=>confirmImportPub(pub,idx)} style={{padding:'5px 11px',borderRadius:20,border:'none',background:T.gr,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>✓ Add</button>
                        <button onClick={()=>rejectImportPub(idx)} style={{padding:'5px 11px',borderRadius:20,border:`1px solid ${T.bdr}`,background:T.w,color:T.mu,cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>✕ Skip</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {showRisImport&&(
        <div style={{background:T.s2,borderRadius:12,padding:16,marginBottom:20,border:`1px solid ${T.bdr}`}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,flex:1}}>📑 Import from {risFileName}</div>
            <button onClick={()=>{setShowRisImport(false);setRisProposals([]);}} style={{fontSize:12,color:T.mu,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit'}}>Close</button>
          </div>
          {risProposals.length === 0 ? (
            <div style={{fontSize:12.5,color:T.mu,textAlign:'center',padding:'12px 0'}}>
              No new papers found — all entries already exist in your publications.
            </div>
          ) : (
            <>
              <div style={{fontSize:12,color:T.mu,marginBottom:12}}>
                {risProposals.length} new paper{risProposals.length!==1?'s':''} found (duplicates excluded).
              </div>
              <div style={{maxHeight:220,overflowY:'auto',marginBottom:14,display:'flex',flexDirection:'column',gap:5}}>
                {risProposals.slice(0,8).map((p,i)=>(
                  <div key={i} style={{background:T.w,borderRadius:8,padding:'8px 11px',fontSize:12,border:`1px solid ${T.bdr}`}}>
                    <div style={{fontWeight:700,lineHeight:1.4}}>{p.title}</div>
                    <div style={{color:T.mu}}>{[p.journal,p.year].filter(Boolean).join(' · ')}</div>
                    {p.authors&&<div style={{color:T.mu,fontSize:11,marginTop:1}}>{p.authors.slice(0,80)}{p.authors.length>80?'…':''}</div>}
                  </div>
                ))}
                {risProposals.length>8&&(
                  <div style={{fontSize:11,color:T.mu,padding:'4px 4px'}}>+{risProposals.length-8} more papers</div>
                )}
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <Btn onClick={()=>{setShowRisImport(false);setRisProposals([]);}}>Cancel</Btn>
                <Btn variant="s" onClick={importAllRis} disabled={risSaving} style={{background:T.gr,borderColor:T.gr}}>
                  {risSaving?<Spinner size={13}/>:`Import all ${risProposals.length} →`}
                </Btn>
              </div>
            </>
          )}
        </div>
      )}

      {showAdd&&(
        <div style={{background:T.s2,borderRadius:12,padding:16,marginBottom:20,border:`1px solid ${T.bdr}`}}>
          <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,flex:1}}>Add a publication</div>
            <button onClick={closeAddPanel} style={{fontSize:12,color:T.mu,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit'}}>✕ Close</button>
          </div>

          {/* Mode tabs */}
          {!addSelected && (
            <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
              {[['search','🔍 Search PMC'],['doi','🔗 Enter DOI'],['manual','✏️ Fill manually']].map(([mode,label])=>(
                <button key={mode} onClick={()=>{ setAddMode(mode); setAddSearchResults([]); setAddSearchError(''); }}
                  style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,fontFamily:'inherit',cursor:'pointer',
                    border:`1.5px solid ${addMode===mode?T.v:T.bdr}`,background:addMode===mode?T.v2:T.w,color:addMode===mode?T.v:T.mu}}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Search PMC by keyword */}
          {addMode==='search' && !addSelected && (
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',gap:8,marginBottom:6}}>
                <input value={addSearchTerm} onChange={e=>setAddSearchTerm(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter') searchEPMCKeyword(); }}
                  placeholder="Title, keywords, topic…"
                  style={{flex:1,background:T.w,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text}}/>
                <Btn variant="s" onClick={searchEPMCKeyword} disabled={addSearching||!buildAddQuery()} style={{whiteSpace:'nowrap'}}>
                  {addSearching?'Searching…':'Search →'}
                </Btn>
              </div>
              <button onClick={()=>setShowAddAdv(s=>!s)} style={{fontSize:11.5,color:T.v,fontWeight:600,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',padding:0,marginBottom:showAddAdv?8:6}}>
                {showAddAdv?'▲ Hide filters':'▼ Author, year, journal…'}
              </button>
              {showAddAdv && (
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10,padding:'10px 12px',background:T.w,borderRadius:9,border:`1.5px solid ${T.bdr}`}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <label style={{fontSize:11.5,color:T.mu,width:52,flexShrink:0}}>Author</label>
                    <input value={addAuthor} onChange={e=>setAddAuthor(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMCKeyword()} placeholder="e.g. Smith J"
                      style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <label style={{fontSize:11.5,color:T.mu,width:52,flexShrink:0}}>Year</label>
                    <input value={addYearFrom} onChange={e=>setAddYearFrom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMCKeyword()} placeholder="From"
                      style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
                    <span style={{fontSize:12,color:T.mu,flexShrink:0}}>–</span>
                    <input value={addYearTo} onChange={e=>setAddYearTo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMCKeyword()} placeholder="To"
                      style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <label style={{fontSize:11.5,color:T.mu,width:52,flexShrink:0}}>Journal</label>
                    <input value={addJournal} onChange={e=>setAddJournal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchEPMCKeyword()} placeholder="e.g. Nature"
                      style={{flex:1,background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',minWidth:0}}/>
                  </div>
                </div>
              )}
              {addSearchError && <div style={{fontSize:12,color:T.ro,marginBottom:8}}>{addSearchError}</div>}
              {addTotal !== null && addSearchResults.length > 0 && (
                <div style={{fontSize:11.5,color:T.mu,marginBottom:8}}>{addTotal.toLocaleString()} results · showing {addSearchResults.length}</div>
              )}
              {addSearchResults.length>0&&(
                <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:320,overflowY:'auto'}}>
                  {addSearchResults.map((r,i)=>{
                    const title   = (r.title||'').replace(/<[^>]+>/g,'');
                    const authors = r.authorString||'';
                    const journal = r.journalTitle||'';
                    const year    = r.pubYear||'';
                    const oa      = r.isOpenAccess==='Y';
                    const cited   = r.citedByCount||0;
                    return (
                      <div key={r.pmid||r.doi||i} style={{background:T.w,border:`1px solid ${T.bdr}`,borderRadius:10,padding:'12px 14px'}}>
                        <div style={{fontSize:13,fontWeight:700,color:T.text,lineHeight:1.4,marginBottom:4}}>{title}</div>
                        <div style={{fontSize:11.5,color:T.mu,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {authors.length>80?authors.slice(0,80)+'…':authors}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,color:T.mu}}>{buildCitationFromEpmc(r) || [journal,year].filter(Boolean).join(' · ')}</span>
                          {oa&&<span style={{fontSize:10,fontWeight:700,color:T.gr,background:T.gr2,borderRadius:20,padding:'1px 7px'}}>Open Access</span>}
                          {cited>0&&<span style={{fontSize:10,fontWeight:700,color:T.bl,background:T.bl2,borderRadius:20,padding:'1px 7px'}}>{cited} citations</span>}
                          <button onClick={()=>selectAddResult(r)}
                            style={{marginLeft:'auto',padding:'4px 12px',borderRadius:20,border:`1.5px solid ${T.v}`,background:T.v,color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:'inherit',cursor:'pointer',flexShrink:0}}>
                            Select →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {addHasMore && (
                <div style={{textAlign:'center',paddingTop:6}}>
                  <Btn onClick={loadMoreAdd} disabled={addLoadingMore}>
                    {addLoadingMore?'Loading…':'Show next 10'}
                  </Btn>
                </div>
              )}
            </div>
          )}

          {/* Enter DOI */}
          {addMode==='doi' && !addSelected && (
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                <input value={addDoi} onChange={e=>{ setAddDoi(e.target.value); setAddSearchError(''); }}
                  onKeyDown={e=>{ if(e.key==='Enter') lookupAddDoi(addDoi); }}
                  onBlur={e=>{ if(e.target.value.trim()) lookupAddDoi(e.target.value); }}
                  placeholder="10.1038/... or https://doi.org/..."
                  style={{flex:1,background:T.w,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text}}/>
                <Btn variant="v" onClick={()=>lookupAddDoi(addDoi)} disabled={addDoiFetching||!addDoi.trim()} style={{whiteSpace:'nowrap',fontSize:11.5}}>
                  {addDoiFetching?'Fetching…':'Look up →'}
                </Btn>
              </div>
              {addSearchError && <div style={{fontSize:12,color:T.ro,marginBottom:4}}>{addSearchError}</div>}
              <div style={{fontSize:11,color:T.mu}}>Fetches title, authors, and journal automatically via CrossRef.</div>
            </div>
          )}

          {/* Pre-filled confirmation banner */}
          {addSelected&&(
            <div style={{display:'flex',alignItems:'center',gap:8,background:T.gr2,border:`1px solid rgba(16,185,129,.25)`,borderRadius:9,padding:'8px 12px',marginBottom:12}}>
              <span style={{fontSize:12,color:T.gr,fontWeight:700}}>✓ Paper found — review and save</span>
              <button onClick={()=>{ setAddSelected(false); setNewPub({title:'',authors:'',journal:'',year:'',doi:'',pub_type:'journal',venue:''}); setAddDoi(''); }}
                style={{marginLeft:'auto',fontSize:11,color:T.mu,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>← Search again</button>
            </div>
          )}

          {/* Form fields — shown in manual mode or after a result is selected */}
          {(addMode==='manual' || addSelected)&&(
            <>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',fontSize:11.5,fontWeight:600,marginBottom:6}}>Type</label>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {PUB_TYPES.map(t=>(
                    <button key={t.id} onClick={()=>setNewPub(p=>({...p,pub_type:t.id}))}
                      style={{padding:'4px 11px',borderRadius:20,border:`1.5px solid ${newPub.pub_type===t.id?T.v:T.bdr}`,background:newPub.pub_type===t.id?T.v2:T.w,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,color:newPub.pub_type===t.id?T.v:T.mu}}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {[
                ['title','Title *','Full title of publication or presentation'],
                ['authors','Authors','Smith J, Jones A et al.'],
                ['year','Year','2024'],
                ['journal',['journal','review','preprint'].includes(newPub.pub_type)?'Journal':'Venue / Conference',
                  ['conference','poster'].includes(newPub.pub_type)?'e.g. ASCO Annual Meeting':'e.g. Nature Medicine'],
                ['doi','DOI / URL','10.1038/... or https://...'],
              ].map(([f,l,ph])=>(
                <div key={f} style={{marginBottom:10}}>
                  <label style={{display:'block',fontSize:11.5,fontWeight:600,marginBottom:4}}>{l}</label>
                  <input value={newPub[f]} onChange={e=>setNewPub(p=>({...p,[f]:e.target.value}))} placeholder={ph}
                    style={{width:'100%',background:T.w,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
                </div>
              ))}
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <Btn onClick={closeAddPanel}>Cancel</Btn>
                <Btn variant="s" onClick={addManual} disabled={saving||!newPub.title.trim()}>{saving?'Saving…':'Add Publication'}</Btn>
              </div>
            </>
          )}
        </div>
      )}

      {pubs.length===0?(
        <div style={{textAlign:'center',padding:'32px 0',color:T.mu}}>
          <div style={{fontSize:32,marginBottom:10}}>📄</div>
          <div style={{fontSize:14,fontFamily:"'DM Serif Display',serif",marginBottom:8}}>No publications yet</div>
          <div style={{fontSize:13}}>Search PubMed, import a CV/document, or add manually.</div>
        </div>
      ):(
        <>
          <SectionGroup title="Journal Articles & Reviews" items={journals} setPubs={setPubs}/>
          <SectionGroup title="Presentations & Posters" items={presentations} setPubs={setPubs}/>
          <SectionGroup title="Book Chapters" items={books} setPubs={setPubs}/>
          <SectionGroup title="Other" items={others} setPubs={setPubs}/>
        </>
      )}
    </div>
  );
}
