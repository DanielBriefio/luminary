import { useState } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import { parseRis, parseBib, buildCitationFromRef } from '../lib/referenceUtils';

const TODAY = new Date().toISOString().slice(0, 10);

export default function LibraryRisImporter({ userId, groupId, folders, onDone, onClose }) {
  const [papers,       setPapers]       = useState([]);
  const [fileName,     setFileName]     = useState('');
  const [targetFolder, setTargetFolder] = useState('');
  const [importing,    setImporting]    = useState(false);
  const [done,         setDone]         = useState(false);
  const [error,        setError]        = useState('');

  const handleFile = (file) => {
    if (!file) return;
    setError(''); setPapers([]); setDone(false); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text  = e.target.result;
        const parsed = file.name.toLowerCase().endsWith('.bib')
          ? parseBib(text) : parseRis(text);
        if (!parsed.length) { setError('No papers found in this file. Check the format.'); return; }
        setPapers(parsed);
        setTargetFolder(folders[0]?.id || '__new__');
      } catch {
        setError('Failed to parse file. Check that it is a valid .ris or .bib file.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!papers.length || importing) return;
    setImporting(true);
    setError('');

    let folderId = targetFolder;
    if (targetFolder === '__new__') {
      const name = `Import ${TODAY}`;
      const insertData = groupId
        ? { group_id: groupId, name, sort_order: folders.length }
        : { user_id: userId, name, sort_order: folders.length };
      const { data, error: ferr } = await supabase
        .from('library_folders').insert(insertData).select().single();
      if (ferr || !data?.id) { setError('Failed to create folder: ' + (ferr?.message || 'unknown error')); setImporting(false); return; }
      folderId = data.id;
    }

    const rows = papers.map(p => ({
      folder_id: folderId,
      added_by:  userId,
      title:     p.title    || '',
      authors:   p.authors  || '',
      journal:   p.journal  || '',
      year:      p.year     || '',
      doi:       p.doi      || '',
      abstract:  p.abstract || '',
      citation:  buildCitationFromRef(p),
    }));

    const { error: err } = await supabase.from('library_items').insert(rows);
    if (err) { setError('Import failed: ' + err.message); setImporting(false); return; }

    capture('library_item_added', { source: 'ris' });
    setImporting(false);
    setDone(true);
    onDone(folderId, targetFolder === '__new__');
  };

  return (
    <div style={{
      padding:'14px 16px', background:T.w, borderRadius:12,
      border:`1px solid ${T.bdr}`, marginBottom:14,
    }}>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
        <span style={{fontSize:13, fontWeight:700, flex:1}}>📑 Import .ris / .bib</span>
        <button onClick={onClose} style={{
          fontSize:12, color:T.mu, border:'none',
          background:'transparent', cursor:'pointer', fontFamily:'inherit',
        }}>✕ Close</button>
      </div>

      {/* File drop zone — shown until a file is loaded */}
      {!papers.length && !done && (
        <label style={{display:'block', cursor:'pointer'}}>
          <input type="file" accept=".ris,.bib" style={{display:'none'}}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}/>
          <div
            style={{
              border:`2px dashed ${T.bdr}`, borderRadius:10, padding:'24px 16px',
              textAlign:'center', color:T.mu, fontSize:13,
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.v}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
          >
            <div style={{fontSize:28, marginBottom:8}}>📑</div>
            <div style={{fontWeight:600, marginBottom:4, color:T.text}}>Drop .ris or .bib file here</div>
            <div style={{fontSize:12}}>or click to browse</div>
          </div>
        </label>
      )}

      {error && <div style={{fontSize:12.5, color:T.ro, marginTop:8}}>{error}</div>}

      {papers.length > 0 && !done && (
        <>
          <div style={{fontSize:12.5, color:T.gr, fontWeight:700, marginBottom:10}}>
            ✓ {papers.length} paper{papers.length !== 1 ? 's' : ''} found in {fileName}
          </div>

          {/* Preview */}
          <div style={{
            maxHeight:160, overflowY:'auto', marginBottom:12,
            display:'flex', flexDirection:'column', gap:4,
            borderRadius:8, border:`1px solid ${T.bdr}`,
          }}>
            {papers.slice(0, 5).map((p, i) => (
              <div key={i} style={{
                background: i % 2 === 0 ? T.s2 : T.w,
                padding:'7px 11px', fontSize:12,
              }}>
                <div style={{fontWeight:700, lineHeight:1.4}}>{p.title}</div>
                <div style={{color:T.mu}}>{[p.journal, p.year].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
            {papers.length > 5 && (
              <div style={{
                padding:'6px 11px', fontSize:11, color:T.mu,
                background:T.w, borderTop:`1px solid ${T.bdr}`,
              }}>
                +{papers.length - 5} more papers
              </div>
            )}
          </div>

          {/* Folder selector */}
          <div style={{marginBottom:14}}>
            <label style={{display:'block', fontSize:11.5, fontWeight:600, color:T.mu, marginBottom:5}}>
              Import to folder
            </label>
            <select
              value={targetFolder}
              onChange={e => setTargetFolder(e.target.value)}
              style={{
                width:'100%', padding:'8px 11px', borderRadius:9,
                border:`1.5px solid ${T.bdr}`, fontSize:13,
                fontFamily:'inherit', outline:'none', background:T.w, color:T.text,
              }}
            >
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              <option value="__new__">📁 New folder: Import {TODAY}</option>
            </select>
          </div>

          <div style={{display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center'}}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn variant="s" onClick={handleImport} disabled={importing}>
              {importing
                ? <span style={{display:'flex', alignItems:'center', gap:6}}><Spinner size={13}/> Importing…</span>
                : `Import ${papers.length} paper${papers.length !== 1 ? 's' : ''} →`}
            </Btn>
          </div>
        </>
      )}

      {done && (
        <div style={{
          textAlign:'center', padding:'12px 0',
          color:T.gr, fontWeight:700, fontSize:13,
        }}>
          ✓ {papers.length} paper{papers.length !== 1 ? 's' : ''} imported successfully
        </div>
      )}
    </div>
  );
}
