import { useState } from 'react';
import { T } from '../lib/constants';

export default function ExpandableBio({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const paragraphs = [];
  let cur = '';
  sentences.forEach((s,i) => {
    cur += (cur?' ':'')+s;
    if((i+1)%3===0||i===sentences.length-1){paragraphs.push(cur);cur='';}
  });
  return (
    <div>
      <div style={{
        fontSize:12.5, color:T.mu, lineHeight:1.75,
        display:expanded?'block':'-webkit-box',
        WebkitLineClamp:expanded?undefined:4,
        WebkitBoxOrient:'vertical',
        overflow:expanded?'visible':'hidden',
      }}>
        {paragraphs.map((p,i)=><p key={i} style={{margin:'0 0 8px'}}>{p}</p>)}
      </div>
      {text.length>400&&(
        <button onClick={()=>setExpanded(!expanded)}
          style={{fontSize:12,color:T.v,fontWeight:700,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',padding:'4px 0',display:'block'}}>
          {expanded?'↑ Show less':'↓ More'}
        </button>
      )}
    </div>
  );
}
