import { T } from '../lib/constants';
import PubRow from './PubRow';

export default function SectionGroup({ title, items, setPubs }) {
  if (items.length === 0) return null;
  return (
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:700,color:T.mu,textTransform:'uppercase',letterSpacing:'.07em',margin:'18px 0 2px'}}>{title} <span style={{fontWeight:400}}>({items.length})</span></div>
      {items.map(pub=><PubRow key={pub.id} pub={pub} setPubs={setPubs}/>)}
    </div>
  );
}
