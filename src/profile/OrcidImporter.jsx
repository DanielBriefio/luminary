import { useState } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { deduplicateSectionFuzzy, scoreWorkMatch, scoreEduMatch, mergeRicher } from '../lib/utils';
import { formatDateRange } from '../lib/linkedInUtils';
import Btn from '../components/Btn';
import ConflictResolverModal from '../components/ConflictResolverModal';

export default function OrcidImporter({ user, profile, setProfile, onClose }) {
  const [orcidId,    setOrcidId]    = useState(profile?.orcid || '');
  const [fetching,   setFetching]   = useState(false);
  const [error,      setError]      = useState('');
  const [preview,    setPreview]    = useState(null);
  const [importing,  setImporting]  = useState(false);
  const [step,       setStep]       = useState('input');

  const cleanOrcid = (s) => s.replace(/https?:\/\/orcid\.org\//,'').trim();

  const fetchOrcid = async () => {
    const id = cleanOrcid(orcidId);
    if (!id.match(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)) {
      setError('Please enter a valid ORCID iD (format: 0000-0000-0000-0000)');
      return;
    }
    setFetching(true); setError('');
    try {
      const res = await fetch(`https://pub.orcid.org/v3.0/${id}/record`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`ORCID returned ${res.status}. Check the iD and try again.`);
      const data = await res.json();

      const person  = data.person || {};
      const name    = person.name || {};
      const given   = name['given-names']?.value || '';
      const family  = name['family-name']?.value  || '';
      const bio     = person.biography?.content   || '';
      const keywords= (person.keywords?.keyword||[]).map(k=>k.content).filter(Boolean);

      const employments = (data['activities-summary']?.employments?.['affiliation-group']||[])
        .flatMap(g => g['summaries']||[])
        .map(s => s['employment-summary'] || s)
        .map(e => ({
          title:       e['role-title']   || '',
          company:     e.organization?.name || '',
          location:    [e.organization?.address?.city, e.organization?.address?.country].filter(Boolean).join(', '),
          start:       e['start-date'] ? `${e['start-date'].year?.value||''}-${String(e['start-date'].month?.value||1).padStart(2,'0')}` : '',
          end:         e['end-date']   ? `${e['end-date'].year?.value||''}-${String(e['end-date'].month?.value||1).padStart(2,'0')}` : '',
          description: '',
          _source:     'orcid',
        }))
        .filter(e => e.company || e.title);

      const educations = (data['activities-summary']?.educations?.['affiliation-group']||[])
        .flatMap(g => g['summaries']||[])
        .map(s => s['education-summary'] || s)
        .map(e => ({
          school:  e.organization?.name  || '',
          degree:  e['role-title']       || '',
          field:   '',
          start:   e['start-date'] ? `${e['start-date'].year?.value||''}-${String(e['start-date'].month?.value||1).padStart(2,'0')}` : '',
          end:     e['end-date']   ? `${e['end-date'].year?.value||''}-${String(e['end-date'].month?.value||1).padStart(2,'0')}` : '',
          _source: 'orcid',
        }))
        .filter(e => e.school);

      const workGroups = data['activities-summary']?.works?.group || [];
      const publications = workGroups.map(g => {
        const ws = g['work-summary']?.[0];
        if (!ws) return null;
        const doi = (ws['external-ids']?.['external-id']||[]).find(x=>x['external-id-type']==='doi');
        const pmid= (ws['external-ids']?.['external-id']||[]).find(x=>x['external-id-type']==='pmid');
        const year= ws['publication-date']?.year?.value || '';
        return {
          title:   ws.title?.title?.value || '',
          journal: ws['journal-title']?.value || '',
          year,
          doi:     doi?.['external-id-value'] || '',
          pmid:    pmid?.['external-id-value'] || '',
          authors: '',
          source:  'orcid',
        };
      }).filter(p => p && p.title);

      const existingWH  = profile?.work_history || [];
      const existingEdu = profile?.education    || [];

      const whResult  = deduplicateSectionFuzzy(employments, existingWH,  scoreWorkMatch, 'work');
      const eduResult = deduplicateSectionFuzzy(educations,  existingEdu, scoreEduMatch,  'edu');

      setPreview({
        orcidId: id,
        given, family, bio, keywords,
        employments, educations, publications,
        stats: {
          newWH:     whResult.newItems.length,
          updatedWH: whResult.conflicts.length + (employments.length - whResult.newItems.length - whResult.conflicts.length),
          newEdu:    eduResult.newItems.length,
          newPubs:   publications.length,
        }
      });
      setStep('preview');
    } catch(e) {
      setError(e.message);
    }
    setFetching(false);
  };

  const [orcidConflicts,   setOrcidConflicts]   = useState([]);
  const [showOrcidConflicts,setShowOrcidConflicts] = useState(false);
  const [orcidPending,   setOrcidPending]   = useState(null);

  const doImport = async () => {
    if (!preview) return;
    setImporting(true);

    const baseUpdates = { orcid_imported_at: new Date().toISOString(), orcid: preview.orcidId };
    if (!profile?.name && (preview.given || preview.family))
      baseUpdates.name = [preview.given, preview.family].filter(Boolean).join(' ');
    if (!profile?.bio && preview.bio) baseUpdates.bio = preview.bio;

    const existingWH  = profile?.work_history || [];
    const existingEdu = profile?.education    || [];
    const whResult  = preview.employments.length ? deduplicateSectionFuzzy(preview.employments, existingWH,  scoreWorkMatch, 'work') : {autoMerged:existingWH,  conflicts:[], newItems:[]};
    const eduResult = preview.educations.length  ? deduplicateSectionFuzzy(preview.educations,  existingEdu, scoreEduMatch,  'edu')  : {autoMerged:existingEdu, conflicts:[], newItems:[]};

    const allConflicts = [
      ...whResult.conflicts.map(c=>({...c, field:'work_history', fieldLabel:'Work Experience'})),
      ...eduResult.conflicts.map(c=>({...c, field:'education',   fieldLabel:'Education'})),
    ];

    if (allConflicts.length > 0) {
      setOrcidPending({ baseUpdates, whAutoMerged:whResult.autoMerged, whNew:whResult.newItems, eduAutoMerged:eduResult.autoMerged, eduNew:eduResult.newItems, publications:preview.publications });
      setOrcidConflicts(allConflicts);
      setShowOrcidConflicts(true);
      setImporting(false);
      return;
    }

    await saveOrcidImport(baseUpdates, [...whResult.autoMerged,...whResult.newItems], [...eduResult.autoMerged,...eduResult.newItems], preview.publications);
    setImporting(false);
    setStep('done');
  };

  const applyOrcidConflicts = async (resolvedConflicts) => {
    setImporting(true);
    const { baseUpdates, whAutoMerged, whNew, eduAutoMerged, eduNew, publications } = orcidPending;
    let whFinal=[...whAutoMerged], eduFinal=[...eduAutoMerged];
    for(const c of resolvedConflicts) {
      const arr = c.field==='work_history' ? whFinal : eduFinal;
      if(c.resolution==='use_incoming')  arr[c.existingIdx]=c.incoming;
      else if(c.resolution==='merge')    arr[c.existingIdx]=mergeRicher(c.incoming,c.existing);
      else if(c.resolution==='keep_both') arr.push(c.incoming);
    }
    await saveOrcidImport(baseUpdates, [...whFinal,...whNew], [...eduFinal,...eduNew], publications);
    setImporting(false); setShowOrcidConflicts(false); setStep('done');
  };

  const saveOrcidImport = async (baseUpdates, whFinal, eduFinal, publications) => {
    if (whFinal.length)  baseUpdates.work_history = whFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    if (eduFinal.length) baseUpdates.education    = eduFinal.sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    if (publications.length) {
      const { data: existingPubs } = await supabase.from('publications').select('*').eq('user_id', user.id);
      const existingDois = new Set((existingPubs||[]).map(p=>(p.doi||'').toLowerCase()).filter(Boolean));
      const toInsert = publications.filter(p => p.title && !(p.doi && existingDois.has(p.doi.toLowerCase())));
      if (toInsert.length) {
        await supabase.from('publications').insert(
          toInsert.map(p=>({ user_id:user.id, title:p.title, journal:p.journal, year:p.year, doi:p.doi, pmid:p.pmid, authors:'', source:'orcid' }))
        );
      }
    }
    const { data } = await supabase.from('profiles').update(baseUpdates).eq('id', user.id).select().single();
    if (data) setProfile(data);
  };

  if (showOrcidConflicts) return (
    <ConflictResolverModal
      conflicts={orcidConflicts}
      saving={importing}
      onApply={applyOrcidConflicts}
      onCancel={()=>{setShowOrcidConflicts(false);setOrcidConflicts([]);setOrcidPending(null);}}
    />
  );

  if (step === 'input') return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:500,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:8}}>Import from ORCID</div>
        <div style={{fontSize:13,color:T.mu,marginBottom:20,lineHeight:1.7}}>
          ORCID is the universal researcher ID. It holds your verified employment history, education, and peer-reviewed publications — all linked to DOIs.
        </div>

        <div style={{background:T.gr2,border:`1px solid rgba(16,185,129,.2)`,borderRadius:10,padding:'12px 14px',marginBottom:20,fontSize:12.5,lineHeight:1.65}}>
          <strong>✓ Smart merge with LinkedIn data.</strong> ORCID import won't overwrite your existing profile — it enriches it. Matching entries are merged (ORCID dates + LinkedIn descriptions). New entries are added. Nothing is deleted.
        </div>

        <div style={{marginBottom:16}}>
          <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:6}}>Your ORCID iD</label>
          <input
            value={orcidId}
            onChange={e=>setOrcidId(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&fetchOrcid()}
            placeholder="0000-0002-1825-0097 or https://orcid.org/..."
            style={{width:'100%',background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:'10px 14px',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
          <div style={{fontSize:11.5,color:T.mu,marginTop:5}}>
            Find yours at <a href="https://orcid.org" target="_blank" rel="noopener noreferrer" style={{color:T.gr}}>orcid.org</a> — it looks like 0000-0000-0000-0000.
            {profile?.orcid && <span style={{color:T.gr,fontWeight:600}}> Your saved ORCID iD is pre-filled.</span>}
          </div>
        </div>

        {error && <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:T.ro}}>{error}</div>}

        <div style={{display:'flex',gap:9,justifyContent:'flex-end'}}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="s" onClick={fetchOrcid} disabled={fetching||!orcidId.trim()}
            style={{background:T.gr,borderColor:T.gr}}>
            {fetching ? 'Fetching from ORCID...' : 'Fetch profile →'}
          </Btn>
        </div>
      </div>
    </div>
  );

  if (step === 'preview' && preview) {
    const { stats } = preview;
    const totalNew = stats.newWH + stats.newEdu + stats.newPubs;
    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px 0'}}>
        <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:600,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:4}}>ORCID preview</div>
          <div style={{fontSize:13,color:T.mu,marginBottom:20}}>
            Fetched from <strong>orcid.org/{preview.orcidId}</strong>
          </div>

          <div style={{background:T.gr2,border:`1px solid rgba(16,185,129,.2)`,borderRadius:12,padding:'14px 16px',marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:T.gr,marginBottom:10}}>What will happen:</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {stats.newWH>0&&<span style={{background:'rgba(255,255,255,.8)',border:`1px solid rgba(16,185,129,.3)`,borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600}}>+{stats.newWH} new work entries</span>}
              {stats.updatedWH>0&&<span style={{background:'rgba(255,255,255,.8)',border:`1px solid rgba(16,185,129,.3)`,borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600}}>~{stats.updatedWH} entries enriched</span>}
              {stats.newEdu>0&&<span style={{background:'rgba(255,255,255,.8)',border:`1px solid rgba(16,185,129,.3)`,borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600}}>+{stats.newEdu} new education entries</span>}
              {stats.newPubs>0&&<span style={{background:'rgba(255,255,255,.8)',border:`1px solid rgba(16,185,129,.3)`,borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:600}}>+{stats.newPubs} publications (deduped)</span>}
              {totalNew===0&&stats.updatedWH===0&&<span style={{fontSize:12.5,color:T.mu}}>Everything is already up to date — no new data found.</span>}
            </div>
          </div>

          {preview.employments.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Work History ({preview.employments.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
                {preview.employments.map((e,i)=>(
                  <div key={i} style={{background:T.s2,borderRadius:9,padding:'8px 12px',fontSize:12}}>
                    <div style={{fontWeight:700}}>{e.title||'—'}</div>
                    <div style={{color:T.mu}}>{e.company}{e.location?` · ${e.location}`:''}</div>
                    <div style={{color:T.mu,fontSize:11}}>{formatDateRange(e.start,e.end)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.educations.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Education ({preview.educations.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {preview.educations.map((e,i)=>(
                  <div key={i} style={{background:T.s2,borderRadius:9,padding:'8px 12px',fontSize:12}}>
                    <div style={{fontWeight:700}}>{e.school}</div>
                    {e.degree&&<div style={{color:T.mu}}>{e.degree}</div>}
                    <div style={{color:T.mu,fontSize:11}}>{formatDateRange(e.start,e.end)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.publications.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Publications ({preview.publications.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:180,overflowY:'auto'}}>
                {preview.publications.map((p,i)=>(
                  <div key={i} style={{background:T.s2,borderRadius:9,padding:'8px 12px',fontSize:12}}>
                    <div style={{fontWeight:700,lineHeight:1.4}}>{p.title}</div>
                    <div style={{color:T.mu}}>{p.journal}{p.year?` · ${p.year}`:''}</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:11.5,color:T.mu,marginTop:6}}>Already-existing papers (matched by DOI or title) will be skipped automatically.</div>
            </div>
          )}

          <div style={{display:'flex',gap:9,justifyContent:'flex-end',paddingTop:16,borderTop:`1px solid ${T.bdr}`}}>
            <Btn onClick={()=>setStep('input')}>← Back</Btn>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="s" onClick={doImport} disabled={importing}
              style={{background:T.gr,borderColor:T.gr}}>
              {importing ? 'Importing...' : 'Import & merge →'}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'done') return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:T.w,borderRadius:18,padding:36,maxWidth:440,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:14}}>✅</div>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:8}}>ORCID import complete</div>
        <div style={{fontSize:13,color:T.mu,lineHeight:1.7,marginBottom:24}}>
          Your ORCID data has been merged into your Luminary profile. Existing LinkedIn entries were preserved and enriched where possible.
        </div>
        <Btn variant="s" onClick={onClose} style={{width:'100%',justifyContent:'center',padding:'11px',background:T.gr,borderColor:T.gr}}>View my profile →</Btn>
      </div>
    </div>
  );

  return null;
}
