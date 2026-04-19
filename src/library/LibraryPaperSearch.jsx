import { useState } from 'react';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

export default function LibraryPaperSearch({ onSelect, buttonLabel }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState('');

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
        + `?query=${encodeURIComponent(query)}`
        + `&resultType=core&pageSize=8&format=json`;
      const data = await fetch(url).then(r => r.json());
      setResults(data.resultList?.result || []);
      if (!data.resultList?.result?.length)
        setError('No results found. Try different keywords.');
    } catch {
      setError('Search failed. Check your connection.');
    }
    setSearching(false);
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

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by title, author, keyword..."
          style={{flex:1, padding:'8px 13px', borderRadius:9,
            border:`1.5px solid ${T.bdr}`, fontSize:13,
            fontFamily:'inherit', outline:'none', background:T.s2}}
        />
        <Btn onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Spinner size={14}/> : '🔍 Search'}
        </Btn>
      </div>

      {error && <div style={{fontSize:12.5, color:T.mu, marginBottom:8}}>{error}</div>}

      {results.map(r => (
        <div key={r.id} style={{
          padding:'12px 14px', borderRadius:10,
          border:`1px solid ${T.bdr}`, background:T.w, marginBottom:8,
        }}>
          <div style={{fontSize:13, fontWeight:700, lineHeight:1.4, marginBottom:3}}>
            {r.title?.replace(/<[^>]+>/g,'')}
          </div>
          <div style={{fontSize:11.5, color:T.mu, marginBottom:6}}>
            {r.authorString?.slice(0,80)}{r.authorString?.length>80?'…':''}
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
    </div>
  );
}
