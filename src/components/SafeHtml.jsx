import { T } from '../lib/constants';
import { sanitiseHtml, isHtml } from '../lib/htmlUtils';
import Linkify from './Linkify';

export default function SafeHtml({ html, tags, onTagClick }) {
  if (!html) return null;
  if (isHtml(html)) {
    return (
      <div style={{fontSize:13,lineHeight:1.8,marginBottom:10}}>
        <style>{`
          .rc { overflow-wrap:break-word; word-break:break-word; }
          .rc h1 { font-size:20px; font-weight:700; margin:14px 0 6px; line-height:1.25; font-family:'DM Serif Display',serif; display:block; }
          .rc h2 { font-size:17px; font-weight:700; margin:10px 0 5px; line-height:1.3; font-family:'DM Serif Display',serif; display:block; }
          .rc h3 { font-size:14.5px; font-weight:700; margin:8px 0 4px; line-height:1.3; display:block; }
          .rc h4 { font-size:13.5px; font-weight:700; margin:8px 0 3px; line-height:1.3; display:block; }
          .rc img { max-width:100%; height:auto; border-radius:8px; margin:8px 0; display:block; }
          .rc iframe { max-width:100%; width:100%; aspect-ratio:16/9; height:auto; border-radius:8px; margin:8px 0; display:block; border:0; }
          .rc p  { margin:3px 0; display:block; }
          .rc div{ margin:2px 0; display:block; }
          .rc ul { list-style-type:disc; padding-left:22px; margin:6px 0; display:block; }
          .rc ol { list-style-type:decimal; padding-left:22px; margin:6px 0; display:block; }
          .rc li { margin:3px 0; display:list-item; }
          .rc a  { color:#6c63ff; text-decoration:underline; overflow-wrap:break-word; word-break:break-all; }
          .rc strong, .rc b { font-weight:700; }
          .rc em, .rc i { font-style:italic; }
          .rc u  { text-decoration:underline; }
          .rc br { display:block; content:""; }
          .rc pre, .rc code { overflow-x:auto; max-width:100%; white-space:pre-wrap; }
        `}</style>
        <div
          className="rc"
          dangerouslySetInnerHTML={{ __html: sanitiseHtml(html) }}/>
      </div>
    );
  }
  return (
    <div style={{fontSize:13,lineHeight:1.7,marginBottom:10}}>
      <Linkify text={html}/>
    </div>
  );
}
