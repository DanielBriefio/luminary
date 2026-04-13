import { T } from '../lib/constants';

export default function Btn({ variant="", children, onClick, style={}, disabled=false, type="button" }) {
  const base={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,padding:"6px 14px",borderRadius:22,cursor:disabled?"not-allowed":"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600,border:"1.5px solid",transition:"all .13s",opacity:disabled?.6:1};
  const vs={"":{ borderColor:T.bdr,background:"transparent",color:T.mu},v:{borderColor:T.v,background:T.v2,color:T.v},s:{borderColor:T.v,background:T.v,color:"#fff"}};
  return <button type={type} style={{...base,...(vs[variant]||vs[""]), ...style}} onClick={onClick} disabled={disabled}>{children}</button>;
}
