import { useState } from 'react';
import { T } from '../lib/constants';
import FollowBtn from './FollowBtn';

export default function PaperPreview({ post, currentUserId, onViewPaper }) {
  const [expanded, setExpanded] = useState(false);

  const doiUrl = post.paper_doi
    ? (post.paper_doi.startsWith('http') ? post.paper_doi : `https://doi.org/${post.paper_doi}`)
    : null;

  const cleanAbstract = post.paper_abstract
    ? post.paper_abstract.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()
    : '';

  return (
    <div style={{background:T.v2,border:`1px solid rgba(108,99,255,.2)`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
      <div style={{padding:"13px 15px"}}>
        {doiUrl
          ? <a href={doiUrl} target="_blank" rel="noopener noreferrer" style={{fontFamily:"'DM Serif Display',serif",fontSize:15,lineHeight:1.4,color:T.text,textDecoration:"none",display:"block",marginBottom:5,overflowWrap:"break-word"}}>
              {post.paper_title}
            </a>
          : <div style={{fontFamily:"'DM Serif Display',serif",fontSize:15,lineHeight:1.4,marginBottom:5,overflowWrap:"break-word"}}>{post.paper_title}</div>
        }
        {post.paper_authors&&<div style={{fontSize:11,color:T.mu,marginBottom:4}}>{post.paper_authors}</div>}
        {(post.paper_citation || post.paper_journal) && (
          <div style={{fontSize:11.5,color:T.mu,marginBottom:10,lineHeight:1.5}}>
            {post.paper_citation || post.paper_journal}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          {doiUrl&&(
            <a href={doiUrl} target="_blank" rel="noopener noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:20,background:T.v,color:"#fff",fontSize:11,fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}>
              📄 Open paper ↗
            </a>
          )}
          {post.paper_doi&&onViewPaper&&(
            <button
              onClick={()=>onViewPaper(post.paper_doi)}
              style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:20,background:T.w,color:T.v,border:`1.5px solid ${T.v}`,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              💬 Discussions
            </button>
          )}
          {post.paper_doi&&(
            <FollowBtn targetType="paper" targetId={post.paper_doi} currentUserId={currentUserId} label="Follow Paper"/>
          )}
        </div>
      </div>

      {cleanAbstract&&(
        <div style={{borderTop:`1px solid rgba(108,99,255,.15)`,padding:"12px 15px",background:"rgba(255,255,255,.5)"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.v,textTransform:"uppercase",letterSpacing:".05em",marginBottom:7}}>Abstract</div>
          <div style={{fontSize:12.5,color:T.text,lineHeight:1.8}}>
            {expanded
              ? cleanAbstract
              : cleanAbstract.length > 420
                ? <>{cleanAbstract.slice(0,420).trimEnd()}… </>
                : cleanAbstract
            }
          </div>
          {cleanAbstract.length > 420 && (
            <button onClick={()=>setExpanded(!expanded)}
              style={{marginTop:7,fontSize:11.5,color:T.v,fontWeight:700,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",padding:0,display:"block"}}>
              {expanded?"↑ Collapse abstract":"↓ Read full abstract"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
