import { useState } from 'react';
import { T } from '../lib/constants';
import { tokenOverlap, datesOverlap, mergeRicher } from '../lib/utils';
import { formatDateRange } from '../lib/linkedInUtils';
import Btn from './Btn';

export default function ConflictResolverModal({ conflicts: initialConflicts, onApply, onCancel, saving }) {
  const [conflicts, setConflicts] = useState(
    initialConflicts.map((c,i)=>({...c, id:i, resolution:'keep_existing'}))
  );

  const setRes = (id, res) =>
    setConflicts(cs => cs.map(c => c.id===id ? {...c, resolution:res} : c));

  const EntryCard = ({item, label, bg}) => (
    <div style={{flex:1,background:bg,borderRadius:10,padding:'11px 13px',minWidth:0}}>
      <div style={{fontSize:10,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{label}</div>
      <div style={{fontSize:13,fontWeight:700,lineHeight:1.3,marginBottom:2}}>{item.title||item.degree||item.school||item.company||'—'}</div>
      <div style={{fontSize:12,fontWeight:600,color:T.v,marginBottom:2}}>{item.company||item.school||item.name||''}</div>
      {item.location&&<div style={{fontSize:11,color:T.mu}}>{item.location}</div>}
      {(item.start||item.end)&&<div style={{fontSize:11,color:T.mu}}>{formatDateRange(item.start,item.end)}</div>}
      {item.description&&<div style={{fontSize:11,color:T.mu,marginTop:3,lineHeight:1.5}}>{item.description.slice(0,120)}{item.description.length>120?'…':''}</div>}
    </div>
  );

  const ResBtn = ({conflict, value, label}) => {
    const active = conflict.resolution===value;
    return (
      <button onClick={()=>setRes(conflict.id, value)} style={{
        flex:1, padding:'6px 4px', borderRadius:9, cursor:'pointer', fontSize:11,
        fontFamily:'inherit', fontWeight:600, textAlign:'center',
        border:`2px solid ${active?T.v:T.bdr}`,
        background:active?T.v2:T.w, color:active?T.v:T.mu, transition:'all .12s',
      }}>{label}</button>
    );
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:1020,overflowY:'auto',padding:'20px 0'}}>
      <div style={{background:T.w,borderRadius:18,padding:28,maxWidth:700,width:'92%',boxShadow:'0 20px 60px rgba(0,0,0,.25)',margin:'auto'}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:21,marginBottom:4}}>Review possible duplicates</div>
        <div style={{fontSize:13,color:T.mu,marginBottom:20,lineHeight:1.6}}>
          {conflicts.length} entr{conflicts.length===1?'y':'ies'} from your import look similar to existing profile data.
          Identical entries where only the description differed were merged automatically. For everything else — choose what to do.
        </div>

        {conflicts.map(conflict=>{
          const {incoming, existing, score, fieldLabel='Experience'} = conflict;
          const pct = Math.round(score*100);
          const confColor = pct>=65 ? T.am : T.ro;

          const compOk  = tokenOverlap(incoming.company||incoming.name||'', existing.company||existing.name||'') >= 0.80;
          const titleOk = tokenOverlap(incoming.title||incoming.degree||'', existing.title||existing.degree||'') >= 0.65;
          const ov      = datesOverlap(incoming.start, incoming.end, existing.start, existing.end);

          return (
            <div key={conflict.id} style={{marginBottom:18,padding:16,background:T.s2,borderRadius:14,border:`1px solid ${T.bdr}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.06em'}}>{fieldLabel}</div>
                <div style={{display:'flex',gap:5,flex:1,flexWrap:'wrap'}}>
                  {!compOk  && <span style={{fontSize:10.5,fontWeight:600,padding:'2px 8px',borderRadius:20,background:T.am2,color:'#92400e'}}>⚠ Name differs</span>}
                  {!titleOk && <span style={{fontSize:10.5,fontWeight:600,padding:'2px 8px',borderRadius:20,background:T.am2,color:'#92400e'}}>⚠ Title differs</span>}
                  {ov===false&&<span style={{fontSize:10.5,fontWeight:600,padding:'2px 8px',borderRadius:20,background:T.ro2,color:T.ro}}>⚠ Dates don't overlap</span>}
                  {ov===null && <span style={{fontSize:10.5,fontWeight:600,padding:'2px 8px',borderRadius:20,background:T.s2,color:T.mu}}>ℹ Dates unknown</span>}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:5,background:T.w,borderRadius:20,padding:'2px 9px',border:`1px solid ${confColor}33`,flexShrink:0}}>
                  <div style={{width:7,height:7,borderRadius:'50%',background:confColor}}/>
                  <span style={{fontSize:11,fontWeight:700,color:confColor}}>{pct}% similar</span>
                </div>
              </div>

              <div style={{display:'flex',gap:9,marginBottom:12}}>
                <EntryCard item={existing} label="Already in your profile" bg={T.bl2}/>
                <div style={{display:'flex',alignItems:'center',fontSize:16,color:T.mu,flexShrink:0}}>⟷</div>
                <EntryCard item={incoming} label="From import" bg={T.v2}/>
              </div>

              <div style={{fontSize:11,fontWeight:700,color:T.mu,marginBottom:6}}>What to do:</div>
              <div style={{display:'flex',gap:6}}>
                <ResBtn conflict={conflict} value="keep_existing" label="Keep existing"/>
                <ResBtn conflict={conflict} value="use_incoming"  label="Use imported"/>
                <ResBtn conflict={conflict} value="merge"         label="Merge (best of both)"/>
                <ResBtn conflict={conflict} value="keep_both"     label="Keep both"/>
              </div>

              {conflict.resolution==='merge'&&(()=>{
                const m=mergeRicher(incoming,existing);
                return (
                  <div style={{marginTop:10,padding:'9px 12px',background:T.gr2,borderRadius:9,border:`1px solid rgba(16,185,129,.2)`}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.gr,marginBottom:4}}>Merged result preview</div>
                    <div style={{fontSize:12,color:T.text,lineHeight:1.6}}>
                      <strong>{m.title||m.degree}</strong>{m.company||m.school?` at ${m.company||m.school}`:''}
                      {m.location&&<span style={{color:T.mu}}> · {m.location}</span>}
                      {(m.start||m.end)&&<div style={{color:T.mu}}>{formatDateRange(m.start,m.end)}</div>}
                      {m.description&&<div style={{color:T.mu,marginTop:2}}>{m.description.slice(0,150)}{m.description.length>150?'…':''}</div>}
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}

        <div style={{display:'flex',gap:9,justifyContent:'flex-end',paddingTop:16,borderTop:`1px solid ${T.bdr}`}}>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn variant="s" onClick={()=>onApply(conflicts)} disabled={saving}>
            {saving?'Saving...':'Apply & import →'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
