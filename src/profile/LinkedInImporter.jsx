import { useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { deduplicateSectionFuzzy, scoreWorkMatch, scoreEduMatch, mergeRicher } from '../lib/utils';
import { parseCsv, parseLinkedInDate, formatDateRange, cleanBio, buildName } from '../lib/linkedInUtils';
import Btn from '../components/Btn';
import ConflictResolverModal from '../components/ConflictResolverModal';

export default function LinkedInImporter({ user, profile, setProfile, onClose }) {
  const [step,setStep]     = useState('instructions');
  const [parsing,setParsing] = useState(false);
  const [error,setError]   = useState('');
  const [parsed,setParsed] = useState(null);
  const [saving,setSaving] = useState(false);

  const handleZip = async (file) => {
    setParsing(true); setError('');
    try {
      const zip = await JSZip.loadAsync(file);
      const r = { profile:null, positions:[], education:[], volunteering:[], organizations:[], honors:[], languages:[], skills:[], patents:[], publications:[] };
      for (const [name,zf] of Object.entries(zip.files)) {
        if (zf.dir) continue;
        const lower = name.toLowerCase().split('/').pop();
        const text  = await zf.async('text');
        if (lower==='profile.csv')           r.profile       = parseCsv(text)[0] || null;
        if (lower==='positions.csv')         r.positions     = parseCsv(text);
        if (lower==='education.csv')         r.education     = parseCsv(text);
        if (lower.includes('volunteer'))     r.volunteering  = parseCsv(text);
        if (lower==='organizations.csv')     r.organizations = parseCsv(text);
        if (lower==='honors.csv')            r.honors        = parseCsv(text);
        if (lower==='languages.csv')         r.languages     = parseCsv(text);
        if (lower==='skills.csv')            r.skills        = parseCsv(text);
        if (lower==='patents.csv')           r.patents       = parseCsv(text);
        if (lower==='publications.csv')      r.publications  = parseCsv(text);
      }
      if (!r.profile && !r.positions.length && !r.education.length) {
        setError("No profile data found. Make sure you downloaded the complete LinkedIn export with all data types selected.");
        setParsing(false); return;
      }
      r.positions    = r.positions.map(p=>({title:p['Title']||'',company:p['Company Name']||'',location:p['Location']||'',start:parseLinkedInDate(p['Started On']||''),end:parseLinkedInDate(p['Finished On']||''),description:cleanBio(p['Description']||'')})).filter(p=>p.title||p.company);
      r.education    = r.education.map(e=>({school:e['School Name']||'',degree:e['Degree Name']||'',field:e['Notes']||e['Field of Study']||'',start:parseLinkedInDate(e['Start Date']||''),end:parseLinkedInDate(e['End Date']||'')})).filter(e=>e.school);
      r.volunteering = r.volunteering.map(v=>({role:v['Role']||v['Title']||'',org:v['Company Name']||v['Organization']||'',start:parseLinkedInDate(v['Started On']||''),end:parseLinkedInDate(v['Finished On']||''),description:cleanBio(v['Description']||'')})).filter(v=>v.role||v.org);
      r.organizations= r.organizations.map(o=>({name:o['Name']||o['Organization Name']||'',role:o['Position']||o['Role']||'',start:parseLinkedInDate(o['Started On']||''),end:parseLinkedInDate(o['Finished On']||'')})).filter(o=>o.name);
      r.honors       = r.honors.map(h=>({title:h['Title']||h['Honor Title']||h['Name']||'',issuer:h['Issuer']||h['Issued By']||'',date:parseLinkedInDate(h['Issued On']||h['Date']||''),description:h['Description']||''})).filter(h=>h.title);
      r.languages    = r.languages.map(l=>({name:l['Name']||l['Language']||'',proficiency:l['Proficiency']||''})).filter(l=>l.name);
      r.skills       = r.skills.map(s=>({name:s['Name']||s['Skill']||''})).filter(s=>s.name);
      r.patents      = r.patents.map(p=>({title:p['Title']||'',number:p['Application Number']||p['Patent Number']||'',date:parseLinkedInDate(p['Filed At']||p['Issued Date']||''),description:p['Description']||'',url:p['Url']||''})).filter(p=>p.title);
      r.publications = r.publications.map(p=>({title:p['Name']||p['Title']||'',publisher:p['Publisher']||'',date:parseLinkedInDate(p['Published On']||p['Date']||''),description:p['Description']||'',url:p['Url']||''})).filter(p=>p.title);
      setParsed(r); setStep('preview');
    } catch(e) { setError(`Failed to read ZIP: ${e.message}`); }
    setParsing(false);
  };

  const [conflicts,    setConflicts]    = useState([]);
  const [showConflictUI,setShowConflictUI] = useState(false);
  const [pendingUpdates,setPendingUpdates] = useState(null);

  const doImport = async () => {
    setSaving(true);
    const baseUpdates = { linkedin_imported_at: new Date().toISOString() };
    if (parsed.profile) {
      const p = parsed.profile;
      const name     = buildName(p['First Name']||p['first_name'], p['Last Name']||p['last_name']);
      const headline = p['Headline'] || '';
      const summary  = cleanBio(p['Summary'] || p['summary'] || '');
      const location = p['Geo Location'] || p['location'] || '';
      if (name)     baseUpdates.name     = name;
      if (headline) baseUpdates.title    = headline;
      if (summary)  baseUpdates.bio      = summary;
      if (location) baseUpdates.location = location;
    }
    if (parsed.volunteering.length) baseUpdates.volunteering    = parsed.volunteering;
    if (parsed.organizations.length)baseUpdates.organizations   = parsed.organizations;
    if (parsed.honors.length)       baseUpdates.honors          = parsed.honors;
    if (parsed.languages.length)    baseUpdates.languages       = parsed.languages;
    if (parsed.skills.length)       baseUpdates.skills          = parsed.skills;
    if (parsed.patents.length)      baseUpdates.patents         = parsed.patents;
    if (parsed.publications.length) baseUpdates.li_publications = parsed.publications;

    const existingWH  = profile?.work_history || [];
    const existingEdu = profile?.education    || [];
    const whResult  = parsed.positions.length ? deduplicateSectionFuzzy(parsed.positions, existingWH,  scoreWorkMatch, 'work') : {autoMerged:existingWH, conflicts:[], newItems:[]};
    const eduResult = parsed.education.length ? deduplicateSectionFuzzy(parsed.education, existingEdu, scoreEduMatch,  'edu')  : {autoMerged:existingEdu, conflicts:[], newItems:[]};

    const allConflicts = [
      ...whResult.conflicts.map(c=>({...c, field:'work_history', fieldLabel:'Work Experience'})),
      ...eduResult.conflicts.map(c=>({...c, field:'education',   fieldLabel:'Education'})),
    ];

    if (allConflicts.length > 0) {
      setPendingUpdates({
        baseUpdates,
        whAutoMerged: whResult.autoMerged, whNew: whResult.newItems,
        eduAutoMerged: eduResult.autoMerged, eduNew: eduResult.newItems,
      });
      setConflicts(allConflicts);
      setShowConflictUI(true);
      setSaving(false);
      return;
    }

    if (parsed.positions.length || parsed.education.length) {
      baseUpdates.work_history = [...whResult.autoMerged, ...whResult.newItems].sort((a,b)=>(b.start||'').localeCompare(a.start||''));
      baseUpdates.education    = [...eduResult.autoMerged, ...eduResult.newItems].sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    }
    const { data } = await supabase.from('profiles').update(baseUpdates).eq('id',user.id).select().single();
    if (data) setProfile(data);
    setSaving(false); setStep('done');
  };

  const applyLinkedInConflicts = async (resolvedConflicts) => {
    setSaving(true);
    const { baseUpdates, whAutoMerged, whNew, eduAutoMerged, eduNew } = pendingUpdates;
    let whFinal  = [...whAutoMerged];
    let eduFinal = [...eduAutoMerged];
    for(const c of resolvedConflicts) {
      const arr = c.field==='work_history' ? whFinal : eduFinal;
      if(c.resolution==='use_incoming')  arr[c.existingIdx] = c.incoming;
      else if(c.resolution==='merge')    arr[c.existingIdx] = mergeRicher(c.incoming, c.existing);
      else if(c.resolution==='keep_both') arr.push(c.incoming);
    }
    baseUpdates.work_history = [...whFinal,  ...whNew ].sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    baseUpdates.education    = [...eduFinal, ...eduNew].sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    const { data } = await supabase.from('profiles').update(baseUpdates).eq('id',user.id).select().single();
    if (data) setProfile(data);
    setSaving(false); setShowConflictUI(false); setStep('done');
  };

  if (showConflictUI) return (
    <ConflictResolverModal
      conflicts={conflicts}
      saving={saving}
      onApply={applyLinkedInConflicts}
      onCancel={()=>{setShowConflictUI(false);setConflicts([]);setPendingUpdates(null);}}
    />
  );

  if (step==='instructions') return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'20px 0',overflowY:'auto'}}>
      <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:560,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:8}}>Import from LinkedIn</div>
        <div style={{fontSize:13,color:T.mu,marginBottom:16,lineHeight:1.7}}>
          LinkedIn's API doesn't give third parties access to your full profile. Instead, use LinkedIn's built-in data export — it gives you everything: work history, education, publications, patents, skills, and more.
        </div>

        <div style={{background:T.gr2,border:`1px solid rgba(16,185,129,.25)`,borderRadius:10,padding:'13px 16px',marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,color:T.gr,marginBottom:6}}>💡 Get the full dataset for best results</div>
          <div style={{fontSize:12.5,color:T.text,lineHeight:1.7,marginBottom:10}}>
            We recommend downloading <strong>all</strong> your LinkedIn data in one go. This gives Luminary your complete professional history including patents, publications, and certifications that make a researcher's profile stand out.
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['Profile','Positions','Education','Volunteering','Organizations','Honors & Awards','Languages','Skills','Patents','Publications'].map(s=>(
              <span key={s} style={{background:T.w,border:`1px solid rgba(16,185,129,.3)`,borderRadius:6,padding:'2px 9px',fontSize:11.5,fontWeight:600,color:T.gr}}>✓ {s}</span>
            ))}
          </div>
        </div>

        {[
          {n:1, t:'Go to LinkedIn Settings', d:<>Click your photo → <strong>Settings & Privacy → Data Privacy → Get a copy of your data</strong></>},
          {n:2, t:'Select the full data archive', d:<>Select <strong>"Download larger data archive, including connections, verifications, contacts, account history, and information we infer about you based on your profile and activity."</strong> This is the first option and includes everything — positions, education, skills, patents, publications and more. Click <strong>Request archive</strong>.</>},
          {n:3, t:'Download the ZIP', d:'LinkedIn emails you a download link — usually within 10–30 minutes for the full archive. Download and save the ZIP file.'},
          {n:4, t:'Upload it here', d:"Everything is parsed locally in your browser. The file never leaves your device or reaches Luminary's servers."},
        ].map(s=>(
          <div key={s.n} style={{display:'flex',gap:14,marginBottom:14,alignItems:'flex-start'}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:T.v,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,flexShrink:0}}>{s.n}</div>
            <div><div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{s.t}</div><div style={{fontSize:12.5,color:T.mu,lineHeight:1.65}}>{s.d}</div></div>
          </div>
        ))}

        <div style={{background:T.v2,border:`1px solid rgba(108,99,255,.15)`,borderRadius:10,padding:'10px 14px',fontSize:12,color:T.v,marginBottom:20}}>
          🔒 Parsed locally — the ZIP never leaves your device or goes to Luminary's servers.
        </div>
        <div style={{display:'flex',gap:9,justifyContent:'flex-end'}}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="s" onClick={()=>setStep('upload')}>I have the ZIP → Next</Btn>
        </div>
      </div>
    </div>
  );

  if (step==='upload') return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:480,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:8}}>Upload your LinkedIn ZIP</div>
        <div style={{fontSize:13,color:T.mu,marginBottom:16}}>Select the ZIP file you downloaded from LinkedIn.</div>
        {error&&<div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:9,padding:'12px 14px',marginBottom:16,fontSize:12.5,color:T.ro,lineHeight:1.65}}>⚠️ {error}</div>}
        <label style={{display:'block',cursor:'pointer'}}>
          <input type="file" accept=".zip" onChange={e=>e.target.files?.[0]&&handleZip(e.target.files[0])} style={{display:'none'}}/>
          <div style={{border:`2.5px dashed rgba(108,99,255,.3)`,borderRadius:14,padding:'44px 24px',textAlign:'center',background:`linear-gradient(135deg,${T.v2},${T.bl2})`}}>
            {parsing
              ? <><div style={{fontSize:32,marginBottom:10}}>⚙️</div><div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:4}}>Parsing your LinkedIn data...</div><div style={{fontSize:12,color:T.mu}}>Reading CSVs from your ZIP</div></>
              : <><div style={{fontSize:40,marginBottom:10}}>📦</div><div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:5}}>Click to select your LinkedIn ZIP</div><div style={{fontSize:12,color:T.mu}}>Stays on your device — nothing is uploaded</div></>}
          </div>
        </label>
        <div style={{display:'flex',gap:9,justifyContent:'flex-end',marginTop:20}}>
          <Btn onClick={()=>setStep('instructions')}>← Back</Btn>
          <Btn onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </div>
  );

  if (step==='preview' && parsed) {
    const p        = parsed.profile;
    const name     = p ? buildName(p['First Name']||p['first_name'], p['Last Name']||p['last_name']) : '';
    const headline = p?.['Headline'] || '';
    const summary  = cleanBio(p?.['Summary'] || p?.['summary'] || '');

    const found = [
      parsed.positions.length    && `${parsed.positions.length} work positions`,
      parsed.education.length    && `${parsed.education.length} education entries`,
      parsed.volunteering.length && `${parsed.volunteering.length} volunteering roles`,
      parsed.organizations.length&& `${parsed.organizations.length} organizations`,
      parsed.honors.length       && `${parsed.honors.length} honors & awards`,
      parsed.languages.length    && `${parsed.languages.length} languages`,
      parsed.skills.length       && `${parsed.skills.length} skills`,
      parsed.patents.length      && `${parsed.patents.length} patents`,
      parsed.publications.length && `${parsed.publications.length} publications`,
    ].filter(Boolean);

    return (
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px 0'}}>
        <div style={{background:T.w,borderRadius:18,padding:32,maxWidth:560,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:4}}>Ready to import</div>
          <div style={{fontSize:13,color:T.mu,marginBottom:20}}>Everything below will be imported into your Luminary profile. Existing data will be replaced.</div>

          {(name||headline) && (
            <div style={{background:T.s2,borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Profile</div>
              {name     && <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{name}</div>}
              {headline && <div style={{fontSize:13,color:T.mu}}>{headline}</div>}
              {summary  && <div style={{fontSize:12,color:T.mu,marginTop:6,lineHeight:1.65}}>{summary.slice(0,160)}{summary.length>160?'…':''}</div>}
            </div>
          )}

          {found.length > 0 ? (
            <div style={{background:T.gr2,border:`1px solid rgba(16,185,129,.2)`,borderRadius:12,padding:'14px 16px',marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:700,color:T.gr,marginBottom:10}}>✅ Found in your ZIP:</div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                {found.map(f=>(
                  <span key={f} style={{background:'rgba(255,255,255,.8)',border:`1px solid rgba(16,185,129,.25)`,borderRadius:20,padding:'4px 12px',fontSize:12,fontWeight:600,color:T.text}}>{f}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{background:T.am2,border:`1px solid rgba(245,158,11,.3)`,borderRadius:12,padding:'16px 18px',marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>⚠️ Only basic profile found — no work history or education detected</div>
              <div style={{fontSize:12.5,color:T.text,lineHeight:1.7,marginBottom:12}}>
                Your ZIP only contains <strong>Profile.csv</strong>. LinkedIn's "Pick and choose" option sometimes limits what's included. The easiest fix is to request the <strong>full data archive</strong> instead.
              </div>
              <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:8}}>Try this instead:</div>
              {[
                {n:1, t:'Go to LinkedIn → Settings & Privacy → Data Privacy → Get a copy of your data'},
                {n:2, t:'Select the full archive option', d:<>On the export page, select <strong>"Download larger data archive"</strong> — the first and most complete option. This includes all positions, education, skills, and more.</>},
                {n:3, t:'Request archive and wait for the email — usually 10–30 minutes for the full archive'},
                {n:4, t:'Download and upload the new ZIP here'},
              ].map(s=>(
                <div key={s.n} style={{display:'flex',gap:10,marginBottom:7,alignItems:'flex-start'}}>
                  <div style={{width:20,height:20,borderRadius:'50%',background:T.am,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:11,flexShrink:0}}>{s.n}</div>
                  <div style={{fontSize:12.5,color:T.text,lineHeight:1.55}}>{s.t}</div>
                </div>
              ))}
              <div style={{marginTop:12,fontSize:12,color:T.mu,lineHeight:1.6}}>
                The full archive includes Positions, Education, Skills, Languages, Publications, Patents, and more — everything Luminary can import.
              </div>
            </div>
          )}

          <div style={{fontSize:12,color:T.mu,marginBottom:20,lineHeight:1.65}}>
            All data is imported at once. You can edit or remove individual entries from your profile page after importing.
          </div>

          <div style={{display:'flex',gap:9,justifyContent:'flex-end',paddingTop:16,borderTop:`1px solid ${T.bdr}`}}>
            <Btn onClick={()=>setStep('upload')}>← Back</Btn>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="s" onClick={doImport} disabled={saving||(!found.length&&!name)}>
              {saving ? 'Importing...' : `Import everything →`}
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  if (step==='done') return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
      <div style={{background:T.w,borderRadius:18,padding:36,maxWidth:440,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.2)',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:14}}>🎉</div>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,marginBottom:8}}>Profile imported!</div>
        <div style={{fontSize:13,color:T.mu,lineHeight:1.7,marginBottom:24}}>
          Your LinkedIn data is now on Luminary. Head to your profile to see the result — you can edit any section from there.
        </div>
        <Btn variant="s" onClick={onClose} style={{width:'100%',justifyContent:'center',padding:'11px'}}>View my profile →</Btn>
      </div>
    </div>
  );

  return null;
}
