import { useState } from 'react';
import { supabase } from '../supabase';
import { T, PUB_TYPES } from '../lib/constants';
import { typeIcon, typeLabel } from '../lib/pubUtils';
import Btn from '../components/Btn';

export default function PubRow({ pub, setPubs }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({title:pub.title||'',authors:pub.authors||'',journal:pub.journal||'',year:pub.year||'',doi:pub.doi||'',pub_type:pub.pub_type||'journal',venue:pub.venue||''});
  const [rowSaving, setRowSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const saveEdit = async () => {
    setRowSaving(true);
    setSaveError('');
    const { error } = await supabase.from('publications').update(form).eq('id', pub.id);
    if (!error) {
      setPubs(p => p.map(x => x.id === pub.id ? { ...pub, ...form } : x).sort((a,b)=>(b.year||'').localeCompare(a.year||'')));
      setEditing(false);
    } else {
      console.error('Publication save error:', error);
      setSaveError('Save failed. Please try again.');
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
      {[
        ['title','Title *','Full title of publication or presentation'],
        ['authors','Authors','Smith J, Jones A et al.'],
        ['year','Year','2024'],
        ['journal',['journal','review','preprint'].includes(form.pub_type)?'Journal':'Venue / Conference',
          ['conference','poster'].includes(form.pub_type)?'e.g. ASCO Annual Meeting':'e.g. Nature Medicine'],
        ['doi','DOI / URL','10.1038/... or https://...'],
      ].map(([f,l,ph])=>(
        <div key={f} style={{marginBottom:10}}>
          <label style={{display:'block',fontSize:11.5,fontWeight:600,marginBottom:4}}>{l}</label>
          <input value={form[f]} onChange={e=>setForm(p=>({...p,[f]:e.target.value}))} placeholder={ph}
            style={{width:'100%',background:T.w,border:`1.5px solid ${T.bdr}`,borderRadius:9,padding:'8px 12px',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
        </div>
      ))}
      {saveError && <div style={{fontSize:12,color:T.ro,marginBottom:8}}>{saveError}</div>}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <Btn onClick={()=>{setEditing(false);setSaveError('');setForm({title:pub.title||'',authors:pub.authors||'',journal:pub.journal||'',year:pub.year||'',doi:pub.doi||'',pub_type:pub.pub_type||'journal',venue:pub.venue||''});}}>Cancel</Btn>
        <Btn variant="s" onClick={saveEdit} disabled={rowSaving||!form.title.trim()}>{rowSaving?'Saving...':'Save'}</Btn>
      </div>
    </div>
  );

  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:14,padding:'14px 0',borderBottom:`1px solid ${T.bdr}`}}>
      <div style={{fontSize:18,width:24,flexShrink:0,paddingTop:1,textAlign:'center'}}>{typeIcon(pub.pub_type)}</div>
      <div style={{width:36,flexShrink:0}}>
        <div style={{fontSize:11,color:T.mu,fontWeight:600,textAlign:'right',paddingTop:2}}>{pub.year||'—'}</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,lineHeight:1.4,marginBottom:3}}>
          {pub.doi
            ?<a href={pub.doi.startsWith('http')?pub.doi:`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" style={{color:T.text,textDecoration:'none'}}>{pub.title}</a>
            :pub.title}
        </div>
        {pub.authors&&<div style={{fontSize:11.5,color:T.mu,marginBottom:2}}>{pub.authors}</div>}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          {(pub.journal||pub.venue)&&<span style={{fontSize:11.5,fontWeight:600,color:T.v}}>{pub.journal||pub.venue}</span>}
          {pub.pub_type&&<span style={{fontSize:10.5,color:T.mu,background:T.s2,borderRadius:10,padding:'1px 7px'}}>{typeLabel(pub.pub_type)}</span>}
          {pub.is_open_access&&<span style={{fontSize:10.5,color:'#059669',background:'#d1fae5',borderRadius:10,padding:'1px 7px',fontWeight:600}}>Open Access</span>}
          {pub.citations>0&&<span style={{fontSize:10.5,color:T.mu,background:T.s2,borderRadius:10,padding:'1px 7px'}}>{pub.citations} cited</span>}
          {pub.full_text_url&&<a href={pub.full_text_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'#059669',textDecoration:'none',background:'#d1fae5',padding:'2px 8px',borderRadius:10}}>Full Text ↗</a>}
          {pub.doi&&<a href={pub.doi.startsWith('http')?pub.doi:`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:T.v,textDecoration:'none',background:T.v2,padding:'2px 8px',borderRadius:10}}>DOI ↗</a>}
          {pub.pmid&&<a href={`https://pubmed.ncbi.nlm.nih.gov/${pub.pmid}`} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:T.bl,textDecoration:'none',background:T.bl2,padding:'2px 8px',borderRadius:10}}>PubMed ↗</a>}
        </div>
      </div>
      <div style={{display:'flex',gap:4,flexShrink:0}}>
        <button onClick={()=>setEditing(true)} title="Edit" style={{width:26,height:26,borderRadius:'50%',border:`1px solid ${T.bdr}`,background:T.w,cursor:'pointer',fontSize:12,color:T.mu}}>✏️</button>
        <button onClick={deletePub} title="Remove" style={{width:26,height:26,borderRadius:'50%',border:`1px solid ${T.bdr}`,background:T.w,cursor:'pointer',fontSize:12,color:T.ro}}>✕</button>
      </div>
    </div>
  );
}
