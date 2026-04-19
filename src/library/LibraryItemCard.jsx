import { T } from '../lib/constants';

export default function LibraryItemCard({
  item,
  onDelete,
  showGroupPublicationToggle,
  onToggleGroupPublication,
  isAdmin,
}) {
  return (
    <div style={{
      padding:'14px 16px', borderRadius:12,
      border:`1px solid ${T.bdr}`, background:T.w, marginBottom:8,
    }}>
      {item.is_group_publication && (
        <div style={{
          fontSize:10.5, fontWeight:700, color:T.am,
          background:T.am2, display:'inline-block',
          padding:'1px 8px', borderRadius:20, marginBottom:6,
        }}>
          🏆 Group publication
        </div>
      )}

      <div style={{fontSize:13.5, fontWeight:700, lineHeight:1.4, marginBottom:4}}>
        {item.title}
      </div>

      {item.authors && (
        <div style={{fontSize:11.5, color:T.mu, marginBottom:4}}>
          {item.authors.slice(0,100)}{item.authors.length>100?'…':''}
        </div>
      )}

      <div style={{display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:8}}>
        {item.journal && (
          <span style={{fontSize:12, fontWeight:600, color:T.v}}>{item.journal}</span>
        )}
        {item.year && (
          <span style={{fontSize:12, color:T.mu}}>· {item.year}</span>
        )}
        {item.cited_by_count > 0 && (
          <span style={{fontSize:10.5, background:T.bl2, color:T.bl,
            padding:'1px 7px', borderRadius:20, fontWeight:600}}>
            {item.cited_by_count} citations
          </span>
        )}
        {item.is_open_access && (
          <span style={{fontSize:10.5, background:T.gr2, color:T.gr,
            padding:'1px 7px', borderRadius:20, fontWeight:700}}>
            Open Access
          </span>
        )}
      </div>

      {item.notes && (
        <div style={{fontSize:12, color:T.mu, fontStyle:'italic',
          marginBottom:8, padding:'6px 10px', background:T.s2, borderRadius:7}}>
          "{item.notes}"
        </div>
      )}

      <div style={{display:'flex', gap:10, flexWrap:'wrap', alignItems:'center'}}>
        {item.doi && (
          <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.v, fontWeight:600, textDecoration:'none'}}>
            DOI ↗
          </a>
        )}
        {item.full_text_url && (
          <a href={item.full_text_url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.gr, fontWeight:600, textDecoration:'none'}}>
            Full text ↗
          </a>
        )}
        {item.pdf_url && (
          <a href={item.pdf_url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.bl, fontWeight:600, textDecoration:'none'}}>
            📄 PDF
          </a>
        )}

        {showGroupPublicationToggle && (
          <button onClick={() => onToggleGroupPublication(item)} style={{
            fontSize:11, fontWeight:600, cursor:'pointer',
            border:`1px solid ${item.is_group_publication ? T.am : T.bdr}`,
            background: item.is_group_publication ? T.am2 : T.w,
            color: item.is_group_publication ? T.am : T.mu,
            padding:'2px 9px', borderRadius:20, fontFamily:'inherit',
          }}>
            {item.is_group_publication ? '★ Our publication' : '☆ Mark as ours'}
          </button>
        )}

        {onDelete && (
          <button onClick={() => onDelete(item)} style={{
            marginLeft:'auto', fontSize:11.5, color:T.ro,
            border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'inherit',
          }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
