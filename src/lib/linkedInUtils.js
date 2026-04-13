export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((h,i) => { row[h.trim()] = (values[i]||'').trim(); });
    return row;
  }).filter(r => Object.values(r).some(v=>v));
}

export function parseCsvLine(line) {
  const res=[]; let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(ch===','&&!inQ){res.push(cur);cur='';}
    else cur+=ch;
  }
  res.push(cur); return res;
}

export function parseLinkedInDate(s){
  if(!s)return'';
  const months={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const parts=s.trim().split(' ');
  if(parts.length===2){const m=months[parts[0]];return m?`${parts[1]}-${String(m).padStart(2,'0')}`:parts[1];}
  return parts[0]||'';
}

export function formatDateRange(start,end){
  if(!start&&!end)return'';
  const fmt=d=>{if(!d)return'';const[y,m]=d.split('-');if(!m)return y;const mn=['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return`${mn[parseInt(m)]} ${y}`;};
  return[fmt(start),end?fmt(end):'Present'].filter(Boolean).join(' – ');
}

export function cleanBio(t){if(!t)return'';return t.replace(/\r?\n/g,' ').replace(/  +/g,' ').trim();}
export function buildName(f,l){const first=(f||'').trim(),last=(l||'').trim();if(!first&&!last)return'';if(!last)return first;if(!first)return last;return`${first} ${last}`;}
