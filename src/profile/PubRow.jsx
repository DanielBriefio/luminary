import { useState, useRef, useEffect } from 'react';
import { supabase } from '../supabase';
import { T, PUB_TYPES } from '../lib/constants';
import { typeIcon, typeLabel, formatAuthorsVancouver, formatVancouver } from '../lib/pubUtils';
import Btn from '../components/Btn';

export default function PubRow({ pub, setPubs, onPubStatsChanged }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({title:pub.title||'',authors:pub.authors||'',journal:pub.journal||'',year:pub.year||'',doi:pub.doi||'',pub_type:pub.pub_type||'journal',venue:pub.venue||'',event_date:pub.event_date||'',event_location:pub.event_location||''});
  const [rowSaving, setRowSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied]   = useState(false);
  const menuRef = useRef(null);

  const copyCitation = async () => {
    const text = formatVancouver(pub);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard rejects on insecure contexts / older browsers
      setCopied(false);
    }
  };
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (!menuRef.current?.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const saveEdit = async () => {
    setRowSaving(true);
    setSaveError('');
    // Chain .select() so a silent RLS rejection (error: null, data: null)
    // becomes visible — without this the UI showed "saved" but the row
    // reverted on reload because no DB rows were actually updated.
    const { data, error } = await supabase
      .from('publications').update(form).eq('id', pub.id).select();
    if (error) {
      console.error('Publication save error:', error);
      setSaveError('Save failed. Please try again.');
    } else if (!data || data.length === 0) {
      console.warn('Publication save: 0 rows updated (likely RLS block)');
      setSaveError('Save blocked — the row exists but the database rejected the update. (RLS policy may be missing.)');
    } else {
      setPubs(p => p.map(x => x.id === pub.id ? { ...pub, ...form } : x).sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
      setEditing(false);
      onPubStatsChanged?.();
    }
    setRowSaving(false);
  };

  const deletePub = async () => {
    await supabase.from('publications').delete().eq('id', pub.id);
    setPubs(p => p.filter(x => x.id !== pub.id));
  };

  if (editing) return (
    <div style={{background:T.s2,borderRadius:12,padding:16,margin:'6px 0',border:`1px solid ${T.bdr}`}}>
      <div style={{marginBottom:12}}>
        <label style={{display:'block',fontSize:11.5,fontWeight:600,marginBottom:6}}>Type</label>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {PUB_TYPES.map(t=>(
            <button key={t.id} onClick={()=>setForm(f=>({...f,pub_type:t.id}))}
              style={{padding:'4px 11px',borderRadius:20,border:`1.5px solid ${form.pub_type===t.id?T.v:T.bdr}`,background:form.pub_type===t.id?T.v2:T.w,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600,color:form.pub_type===t.id?T.v:T.mu}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>
      {(() => {
        const isEvent = ['conference','poster','lecture'].includes(form.pub_type);
        const fields = [
          ['title','Title *','Full title of publication or presentation'],
          ['authors','Authors','Smith J, Jones A et al.'],
          ['year','Year','2024'],
          ['journal',
            isEvent
              ? 'Venue / Conference'
              : (['journal','review','preprint','book'].includes(form.pub_type) ? 'Journal' : 'Venue / Conference'),
            isEvent
              ? 'e.g. ASCO Annual Meeting'
              : (form.pub_type === 'book' ? 'e.g. Harrison\'s Principles of Internal Medicine' : 'e.g. Nature Medicine'),
          ],
          // Event-only fields — show right after the venue so they're
          // in the natural reading order for a presentation entry.
          ...(isEvent ? [
            ['event_date',     'Event date (optional)',     'e.g. 2024-08-30, Aug 2024, or 2024'],
            ['event_location', 'Event location (optional)', 'e.g. Barcelona, Spain'],
          ] : []),
          ['doi', isEvent ? 'DOI / URL (optional)' : 'DOI / URL', '10.1038/... or https://...'],
        ];
        return fields.map(([f,l,ph])=>(
          <div key={f} style={{marginBottom:10}}>
            <label style={{display:'block',fontSize:11.5,fontWeight:600,marginBottom:4}}>{l}</label>
            <input value={form[f]} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} placeholder={ph}
              style={{width:'100%',background:T.w,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          </div>
        ));
      })()}
      {saveError && <div style={{fontSize:12,color:T.ro,marginBottom:8}}>{saveError}</div>}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <Btn onClick={()=>{setEditing(false);setSaveError('');setForm({title:pub.title||'',authors:pub.authors||'',journal:pub.journal||'',year:pub.year||'',doi:pub.doi||'',pub_type:pub.pub_type||'journal',venue:pub.venue||'',event_date:pub.event_date||'',event_location:pub.event_location||''});}}>Cancel</Btn>
        <Btn variant="s" onClick={saveEdit} disabled={rowSaving||!form.title.trim()}>{rowSaving?'Saving...':'Save'}</Btn>
      </div>
    </div>
  );

  return (
    <div style={{padding:'14px 0',borderBottom:`1px solid ${T.bdr}`}}>
      {/* Icon + year + type + three-dots menu */}
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
        <span style={{fontSize:16}}>{typeIcon(pub.pub_type)}</span>
        {pub.year&&<span style={{fontSize:11,color:T.mu,fontWeight:600}}>{pub.year}</span>}
        {pub.pub_type&&<span style={{fontSize:10.5,color:T.mu,background:T.s2,borderRadius:10,padding:'1px 7px'}}>{typeLabel(pub.pub_type)}</span>}
        {pub.is_open_access&&<span style={{fontSize:10.5,color:'#059669',background:'#d1fae5',borderRadius:10,padding:'1px 7px',fontWeight:600}}>Open Access</span>}
        <div ref={menuRef} style={{marginLeft:'auto',position:'relative'}}>
          <button onClick={()=>setShowMenu(v=>!v)}
            style={{width:28,height:28,borderRadius:'50%',border:`1px solid ${T.bdr}`,background:T.w,cursor:'pointer',color:T.mu,fontSize:15,fontWeight:700,fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',letterSpacing:1}}>
            ···
          </button>
          {showMenu&&(
            <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:T.w,border:`1px solid ${T.bdr}`,borderRadius:10,boxShadow:'0 4px 16px rgba(0,0,0,.1)',zIndex:50,minWidth:120,overflow:'hidden'}}>
              <button onClick={()=>{setShowMenu(false);setEditing(true);}}
                style={{display:'block',width:'100%',textAlign:'left',padding:'9px 14px',fontSize:13,fontFamily:'inherit',border:'none',borderBottom:`1px solid ${T.bdr}`,background:'transparent',cursor:'pointer',color:T.text}}>
                Edit
              </button>
              <button onClick={()=>{setShowMenu(false);deletePub();}}
                style={{display:'block',width:'100%',textAlign:'left',padding:'9px 14px',fontSize:13,fontFamily:'inherit',border:'none',background:'transparent',cursor:'pointer',color:T.ro}}>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Title + authors — full width */}
      <div style={{minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,lineHeight:1.4,marginBottom:3}}>
          {pub.doi
            ?<a href={pub.doi.startsWith('http')?pub.doi:`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" style={{color:T.text,textDecoration:'none'}}>{pub.title}</a>
            :pub.title}
        </div>
        {pub.authors&&<div style={{fontSize:11.5,color:T.mu,marginBottom:4}}>{formatAuthorsVancouver(pub.authors)}</div>}
        {(pub.event_date || pub.event_location) && (
          <div style={{fontSize:11.5,color:T.mu,marginBottom:4,display:'flex',gap:10,flexWrap:'wrap'}}>
            {pub.event_date     && <span>📅 {pub.event_date}</span>}
            {pub.event_location && <span>📍 {pub.event_location}</span>}
          </div>
        )}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          {(pub.citation||pub.journal||pub.venue)&&<span style={{fontSize:11.5,color:T.mu}}>{pub.citation||pub.journal||pub.venue}</span>}
          {pub.citations>0&&<span style={{fontSize:10.5,color:T.mu,background:T.s2,borderRadius:10,padding:'1px 7px'}}>{pub.citations} cited</span>}
          {pub.full_text_url&&<a href={pub.full_text_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#059669',textDecoration:'none',background:'#d1fae5',padding:'2px 8px',borderRadius:10}}>Full Text ↗</a>}
          {pub.doi&&<a href={pub.doi.startsWith('http')?pub.doi:`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:T.v,textDecoration:'none',background:T.v2,padding:'2px 8px',borderRadius:10}}>DOI ↗</a>}
          {pub.pmid&&<a href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:T.bl,textDecoration:'none',background:T.bl2,padding:'2px 8px',borderRadius:10}}>PubMed ↗</a>}
          <button onClick={copyCitation} title="Copy citation in Vancouver format"
            style={{fontSize:11,color:copied?T.gr:T.mu,background:copied?T.gr2:T.s2,border:'none',padding:'2px 8px',borderRadius:10,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
