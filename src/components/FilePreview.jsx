import { T } from '../lib/constants';

export default function FilePreview({ url, fileType, fileName }) {
  if (!url) return null;

  if (fileType === 'image') {
    return (
      <div style={{borderRadius:12,overflow:"hidden",margin:"8px 0",border:`1px solid ${T.bdr}`}}>
        <img src={url} alt={fileName||"Image"}
          style={{width:"100%",maxHeight:520,objectFit:"cover",display:"block",cursor:"pointer"}}
          onClick={()=>window.open(url,'_blank')}/>
      </div>
    );
  }

  if (fileType === 'video') {
    return (
      <div style={{borderRadius:12,overflow:"hidden",margin:"8px 0",border:`1px solid ${T.bdr}`,background:"#000"}}>
        <video src={url} controls autoPlay muted playsInline loop
          style={{width:"100%",maxHeight:480,display:"block",outline:"none"}}/>
        <div style={{padding:"7px 12px",background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:"rgba(255,255,255,.7)",fontWeight:600}}>{fileName}</span>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,color:"rgba(255,255,255,.8)",fontWeight:700,textDecoration:"none"}}>↗ Open</a>
        </div>
      </div>
    );
  }

  if (fileType === 'audio') {
    return (
      <div style={{background:`linear-gradient(135deg,${T.v2},${T.bl2})`,border:`1px solid rgba(108,99,255,.2)`,borderRadius:12,padding:"14px 16px",margin:"8px 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,${T.v},${T.bl})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:16}}>🎙️</span>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName||"Audio file"}</div>
            <div style={{fontSize:10.5,color:T.mu}}>Audio recording</div>
          </div>
        </div>
        <audio controls src={url} style={{width:"100%",height:36,outline:"none"}}/>
      </div>
    );
  }

  if (fileType === 'pdf') {
    return (
      <div style={{border:`1px solid ${T.bdr}`,borderRadius:12,overflow:"hidden",margin:"8px 0"}}>
        <div style={{position:"relative",height:320,background:T.s2}}>
          <iframe
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`}
            title={fileName||"PDF preview"}
            style={{width:"100%",height:"100%",border:"none",display:"block"}}/>
        </div>
        <div style={{padding:"9px 14px",background:T.w,borderTop:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>📄</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName||"Document"}</div>
            <div style={{fontSize:10.5,color:T.mu}}>PDF</div>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer"
            style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:20,background:T.v,color:"#fff",fontSize:11.5,fontWeight:700,textDecoration:"none",flexShrink:0}}>
            Open PDF ↗
          </a>
        </div>
      </div>
    );
  }

  if (fileType === 'data') {
    return (
      <div style={{background:T.gr2,border:`1px solid rgba(16,185,129,.2)`,borderRadius:12,padding:"13px 16px",margin:"8px 0",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:28}}>📊</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName||"Dataset"}</div>
          <div style={{fontSize:11,color:T.mu}}>CSV · Click to open or download</div>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:20,background:T.gr,color:"#fff",fontSize:11.5,fontWeight:700,textDecoration:"none",flexShrink:0}}>
          Open ↗
        </a>
      </div>
    );
  }

  return (
    <div style={{background:T.s2,border:`1px solid ${T.bdr}`,borderRadius:12,padding:"13px 16px",margin:"8px 0",display:"flex",alignItems:"center",gap:12}}>
      <span style={{fontSize:28}}>📎</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fileName||"Attachment"}</div>
        <div style={{fontSize:11,color:T.mu}}>Click to open or download</div>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:20,background:T.v,color:"#fff",fontSize:11.5,fontWeight:700,textDecoration:"none",flexShrink:0}}>
        Open ↗
      </a>
    </div>
  );
}
