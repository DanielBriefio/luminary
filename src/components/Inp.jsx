import { T } from '../lib/constants';

export default function Inp({ label, type="text", value, onChange, placeholder="", required=false }) {
  return (
    <div style={{marginBottom:14}}>
      {label&&<label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}
        style={{width:"100%",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
    </div>
  );
}
