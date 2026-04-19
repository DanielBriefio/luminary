import { useState } from 'react';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 10;

// Build Europe PMC query string from individual fields
function buildQuery({ keywords, author, yearFrom, yearTo, journal }) {
  const parts = [];
  if (keywords.trim()) parts.push(keywords.trim());
  if (author.trim())   parts.push(`AUTH:"${author.trim()}"`);
  if (journal.trim())  parts.push(`JOURNAL:"${journal.trim()}"`);
  if (yearFrom.trim() || yearTo.trim()) {
    const from = yearFrom.trim() || yearTo.trim();
    const to   = yearTo.trim()   || yearFrom.trim();
    parts.push(from === to ? `(PUB_YEAR:${from})` : `(PUB_YEAR:[${from} TO ${to}])`);
  }
  return parts.join(' ');
}

export default function LibraryPaperSearch({ onSelect, buttonLabel }) {
  const [keywords,     setKeywords]     = useState('');
  const [author,       setAuthor]       = useState('');
  const [yearFrom,     setYearFrom]     = useState('');
  const [yearTo,       setYearTo]       = useState('');
  const [journal,      setJournal]      = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [results,      setResults]      = useState([]);
  const [nextCursor,   setNextCursor]   = useState(null);
  const [hasMore,      setHasMore]      = useState(false);
  const [searching,    setSearching]    = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState('');
  const [totalFound,   setTotalFound]   = useState(null);

  const canSearch = keywords.trim() || author.trim() || yearFrom.trim() || journal.trim();

  const doFetch = async (cursor, append) => {
    const q = buildQuery({ keywords, author, yearFrom, yearTo, journal });
    if (!q) return;

    let url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
      + `?query=${encodeURIComponent(q)}`
      + `&resultType=core&pageSize=${PAGE_SIZE}&format=json`
      + `&cursorMark=${encodeURIComponent(cursor || '*')}`;

    const data = await fetch(url).then(r => r.json());
    const rows = data.resultList?.result || [];
    const next = data.nextCursorMark;
    const total = data.hitCount || 0;

    if (append) {
      setResults(prev => [...prev, ...rows]);
    } else {
      setResults(rows);
      setTotalFound(total);
    }

    // Has more pages if cursor changed and we got a full page
    setNextCursor(next || null);
    setHasMore(!!next && next !== cursor && rows.length === PAGE_SIZE);

    if (!rows.length && !append) setError('No results found. Try different terms.');
  };

  const search = async () => {
    if (!canSearch || searching) return;
    setSearching(true);
    setError('');
    setResults([]);
    setNextCursor(null);
    setHasMore(false);
    setTotalFound(null);
    try {
      await doFetch('*', false);
    } catch {
      setError('Search failed. Check your connection.');
    }
    setSearching(false);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await doFetch(nextCursor, true);
    } catch {
      setError('Failed to load more results.');
    }
    setLoadingMore(false);
  };

  const mapResult = (r) => ({
    title:          r.title?.replace(/<[^>]+>/g,'') || '',
    authors:        r.authorString || '',
    journal:        r.journalTitle || '',
    year:           r.pubYear || '',
    doi:            r.doi || '',
    pmid:           r.pmid || '',
    epmc_id:        r.id || '',
    abstract:       r.abstractText?.slice(0,500) || '',
    cited_by_count: r.citedByCount || 0,
    is_open_access: r.isOpenAccess === 'Y',
    full_text_url:  r.fullTextUrlList?.fullTextUrl?.[0]?.url || '',
  });

  const inputStyle = {
    flex:1, padding:'7px 11px', borderRadius:8,
    border:`1.5px solid ${T.bdr}`, fontSize:13,
    fontFamily:'inherit', outline:'none', background:T.s2,
    color:T.text, minWidth:0,
  };

  return (
    <div>
      {/* Main keyword row */}
      <div style={{display:'flex', gap:8, marginBottom:8}}>
        <input
          value={keywords}
          onChange={e => setKeywords(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Title, keywords, topic…"
          style={{...inputStyle, flex:1}}
        />
        <Btn onClick={search} disabled={searching || !canSearch}>
          {searching ? <Spinner size={14}/> : '🔍 Search'}
        </Btn>
      </div>

      {/* Advanced toggle */}
      <button onClick={() => setShowAdvanced(s => !s)} style={{
        fontSize:11.5, color:T.v, fontWeight:600, border:'none',
        background:'transparent', cursor:'pointer', fontFamily:'inherit',
        marginBottom: showAdvanced ? 10 : 4, padding:0,
      }}>
        {showAdvanced ? '▲ Hide filters' : '▼ Author, year, journal…'}
      </button>

      {/* Advanced fields */}
      {showAdvanced && (
        <div style={{display:'flex', flexDirection:'column', gap:7, marginBottom:12,
          padding:'10px 12px', background:T.s2, borderRadius:9, border:`1px solid ${T.bdr}`}}>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{fontSize:11.5, color:T.mu, width:52, flexShrink:0}}>Author</label>
            <input value={author} onChange={e => setAuthor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="e.g. Smith J"
              style={{...inputStyle}}/>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{fontSize:11.5, color:T.mu, width:52, flexShrink:0}}>Year</label>
            <input value={yearFrom} onChange={e => setYearFrom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="From (e.g. 2020)"
              style={{...inputStyle}}/>
            <span style={{fontSize:12, color:T.mu, flexShrink:0}}>–</span>
            <input value={yearTo} onChange={e => setYearTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="To (e.g. 2024)"
              style={{...inputStyle}}/>
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{fontSize:11.5, color:T.mu, width:52, flexShrink:0}}>Journal</label>
            <input value={journal} onChange={e => setJournal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="e.g. Nature"
              style={{...inputStyle}}/>
          </div>
        </div>
      )}

      {error && <div style={{fontSize:12.5, color:T.mu, marginBottom:8}}>{error}</div>}

      {totalFound !== null && results.length > 0 && (
        <div style={{fontSize:11.5, color:T.mu, marginBottom:10}}>
          {totalFound.toLocaleString()} results · showing {results.length}
        </div>
      )}

      {results.map(r => (
        <div key={r.id || r.pmid || r.title} style={{
          padding:'12px 14px', borderRadius:10,
          border:`1px solid ${T.bdr}`, background:T.w, marginBottom:8,
        }}>
          <div style={{fontSize:13, fontWeight:700, lineHeight:1.4, marginBottom:3}}>
            {r.title?.replace(/<[^>]+>/g,'')}
          </div>
          <div style={{fontSize:11.5, color:T.mu, marginBottom:6}}>
            {r.authorString?.slice(0,100)}{r.authorString?.length>100?'…':''}
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:8, alignItems:'center'}}>
            {r.journalTitle && (
              <span style={{fontSize:11.5, fontWeight:600, color:T.v}}>{r.journalTitle}</span>
            )}
            {r.pubYear && (
              <span style={{fontSize:11.5, color:T.mu}}>· {r.pubYear}</span>
            )}
            {r.citedByCount > 0 && (
              <span style={{fontSize:10.5, background:T.bl2, color:T.bl,
                padding:'1px 7px', borderRadius:20, fontWeight:600}}>
                {r.citedByCount} citations
              </span>
            )}
            {r.isOpenAccess === 'Y' && (
              <span style={{fontSize:10.5, background:T.gr2, color:T.gr,
                padding:'1px 7px', borderRadius:20, fontWeight:700}}>
                Open Access
              </span>
            )}
          </div>
          <Btn variant="s" onClick={() => onSelect(mapResult(r))}>
            {buttonLabel || 'Add to library'}
          </Btn>
        </div>
      ))}

      {hasMore && (
        <div style={{textAlign:'center', paddingTop:4, paddingBottom:8}}>
          <Btn onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner size={14}/> : `Show next ${PAGE_SIZE}`}
          </Btn>
        </div>
      )}
    </div>
  );
}
