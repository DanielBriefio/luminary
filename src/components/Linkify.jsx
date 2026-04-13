import { T } from '../lib/constants';

export default function Linkify({ text }) {
  if (!text) return null;
  const urlRe = /(https?:\/\/[^\s<>"']+)/g;
  const parts = text.split(urlRe);
  return (
    <>
      {parts.map((part, i) =>
        urlRe.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              style={{color:T.v,textDecoration:"underline",wordBreak:"break-all"}}>{part}</a>
          : part
      )}
    </>
  );
}
