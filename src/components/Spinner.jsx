import { T } from '../lib/constants';

export default function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40}}>
      <div style={{width:28,height:28,borderRadius:"50%",border:`3px solid ${T.v2}`,borderTop:`3px solid ${T.v}`,animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
