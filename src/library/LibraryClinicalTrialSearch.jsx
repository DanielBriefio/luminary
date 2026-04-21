import { useState } from 'react';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

export default function LibraryClinicalTrialSearch({ onSelect, buttonLabel }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState('');
  const [total,     setTotal]     = useState(0);

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    setResults([]);

    try {
      const url = new URL('https://clinicaltrials.gov/api/v2/studies');
      url.searchParams.set('query.term', query.trim());
      url.searchParams.set('pageSize', '8');
      url.searchParams.set('format', 'json');
      url.searchParams.set('fields', [
        'NCTId', 'BriefTitle', 'BriefSummary', 'OverallStatus',
        'Phase', 'Condition', 'InterventionName', 'LeadSponsorName',
        'StartDate', 'CompletionDate', 'EnrollmentCount',
      ].join(','));

      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error('Search failed');
      const data = await resp.json();
      setResults(data.studies || []);
      setTotal(data.totalCount || 0);
      if (!data.studies?.length) setError('No trials found. Try different keywords.');
    } catch {
      setError('ClinicalTrials.gov search failed. Try again.');
    }
    setSearching(false);
  };

  const mapTrial = (study) => {
    const p       = study.protocolSection;
    const id      = p?.identificationModule;
    const status  = p?.statusModule;
    const desc    = p?.descriptionModule;
    const cond    = p?.conditionsModule;
    const sponsor = p?.sponsorCollaboratorsModule;
    const design  = p?.designModule;

    const nctId  = id?.nctId || '';
    const phases = (design?.phases || [])
      .map(ph => ph.replace('PHASE', 'Phase ').replace('_', ' '))
      .join(', ');

    return {
      title:          id?.briefTitle || '',
      authors:        sponsor?.leadSponsor?.name || '',
      journal:        `ClinicalTrials.gov · ${phases || 'N/A'}`,
      year:           status?.startDateStruct?.date?.slice(0, 4) || '',
      doi:            '',
      abstract:       desc?.briefSummary?.slice(0, 500) || '',
      cited_by_count: 0,
      is_open_access: true,
      full_text_url:  `https://clinicaltrials.gov/study/${nctId}`,
      notes: [
        nctId && `NCT ID: ${nctId}`,
        status?.overallStatus && `Status: ${status.overallStatus}`,
        (cond?.conditions || []).slice(0, 3).join(', '),
        design?.enrollmentInfo?.count && `Enrollment: ${design.enrollmentInfo.count}`,
        status?.completionDateStruct?.date && `Expected completion: ${status.completionDateStruct.date}`,
      ].filter(Boolean).join(' · '),
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'RECRUITING':            return { bg: T.gr2, color: T.gr  };
      case 'COMPLETED':             return { bg: T.bl2, color: T.bl  };
      case 'ACTIVE_NOT_RECRUITING': return { bg: T.am2, color: T.am  };
      default:                      return { bg: T.s2,  color: T.mu  };
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by condition, drug, sponsor…"
          style={{
            flex: 1, padding: '8px 13px', borderRadius: 9,
            border: `1.5px solid ${T.bdr}`, fontSize: 13,
            fontFamily: 'inherit', outline: 'none', background: T.s2,
          }}
        />
        <Btn onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Spinner size={14}/> : '🔍 Search'}
        </Btn>
      </div>

      {total > 0 && (
        <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 10 }}>
          {total.toLocaleString()} trials found — showing top 8
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 8 }}>{error}</div>
      )}

      {results.map((study, i) => {
        const p             = study.protocolSection;
        const id            = p?.identificationModule;
        const status        = p?.statusModule;
        const cond          = p?.conditionsModule;
        const design        = p?.designModule;
        const nctId         = id?.nctId || '';
        const overallStatus = status?.overallStatus || '';
        const sc            = getStatusColor(overallStatus);
        const phases        = (design?.phases || [])
          .map(ph => ph.replace('PHASE', 'Ph').replace('_', ' '))
          .join('/');

        return (
          <div key={nctId || i} style={{
            padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${T.bdr}`, background: T.w, marginBottom: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 5 }}>
              {id?.briefTitle}
            </div>

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
              {overallStatus && (
                <span style={{
                  fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20,
                  background: sc.bg, color: sc.color,
                }}>
                  {overallStatus.replace(/_/g, ' ')}
                </span>
              )}
              {phases && (
                <span style={{
                  fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
                  background: T.v2, color: T.v,
                }}>
                  {phases}
                </span>
              )}
              {nctId && (
                <span style={{ fontSize: 10.5, color: T.mu, fontFamily: 'monospace' }}>
                  {nctId}
                </span>
              )}
            </div>

            {(cond?.conditions || []).length > 0 && (
              <div style={{ fontSize: 12, color: T.mu, marginBottom: 6 }}>
                {cond.conditions.slice(0, 3).join(' · ')}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Btn variant="s" onClick={() => onSelect(mapTrial(study))}>
                {buttonLabel || 'Add to library'}
              </Btn>
              <a
                href={`https://clinicaltrials.gov/study/${nctId}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: T.v, fontWeight: 600, textDecoration: 'none' }}
              >
                View on ClinicalTrials.gov ↗
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
