import { T } from '../lib/constants';
import { sanitiseHtml, isHtml } from '../lib/htmlUtils';
import Linkify from './Linkify';

export default function SafeHtml({ html, tags, onTagClick }) {
  if (!html) return null;
  if (isHtml(html)) {
    return (
      <div style={{fontSize:13,lineHeight:1.8,marginBottom:10}}>
        <style>{`
          .rc h2 { font-size:17px; font-weight:700; margin:10px 0 5px; line-height:1.3; font-family:'DM Serif Display',serif; display:block; }
          .rc h3 { font-size:14.5px; font-weight:700; margin:8px 0 4px; line-height:1.3; display:block; }
          .rc p  { margin:3px 0; display:block; }
          .rc div{ margin:2px 0; display:block; }
          .rc ul { list-style-type:disc; padding-left:22px; margin:6px 0; display:block; }
          .rc ol { list-style-type:decimal; padding-left:22px; margin:6px 0; display:block; }
          .rc li { margin:3px 0; display:list-item; }
          .rc a  { color:#6c63ff; text-decoration:underline; }
          .rc strong, .rc b { font-weight:700; }
          .rc em, .rc i { font-style:italic; }
          .rc u  { text-decoration:underline; }
          .rc br { display:block; content:""; }
        `}</style>
        <div
          className="rc"
          dangerouslySetInnerHTML={{ __html: sanitiseHtml(html) }}/>
        {tags?.length>0&&<div style={{marginTop:8}}>
          {tags.map(t=><span key={t} onClick={()=>onTagClick&&onTagClick(t)} style={{color:'#6c63ff',fontWeight:600,cursor:"pointer",marginRight:4}}>{t}</span>)}
        </div>}
      </div>
    );
  }
  return (
    <div style={{fontSize:13,lineHeight:1.7,marginBottom:10}}>
      <Linkify text={html}/>
      {" "}{tags?.map(t=><span key={t} onClick={()=>onTagClick&&onTagClick(t)} style={{color:T.v,fontWeight:600,cursor:"pointer"}}>{t} </span>)}
    </div>
  );
}
