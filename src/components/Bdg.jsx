import { T } from '../lib/constants';

export default function Bdg({ color, children }) {
  const c={v:[T.v2,T.v],b:[T.bl2,T.bl],g:[T.gr2,T.gr],a:[T.am2,T.am],r:[T.ro2,T.ro],t:[T.te2,T.te]};
  const [bg,fg]=c[color]||c.v;
  return <span style={{display:"inline-flex",padding:"2px 9px",borderRadius:20,fontSize:10.5,fontWeight:700,background:bg,color:fg}}>{children}</span>;
}
