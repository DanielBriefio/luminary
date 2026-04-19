import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import LibraryFolderSidebar from '../library/LibraryFolderSidebar';
import LibraryPaperSearch   from '../library/LibraryPaperSearch';
import LibraryItemCard      from '../library/LibraryItemCard';

export default function GroupLibrary({ groupId, user, myRole, onStatsChanged }) {
  const [folders,        setFolders]        = useState([]);
  const [activeFolderID, setActiveFolderID] = useState(null);
  const [items,          setItems]          = useState([]);
  const [showSearch,     setShowSearch]     = useState(false);
  const [showDOI,        setShowDOI]        = useState(false);
  const [doiInput,       setDoiInput]       = useState('');
  const [doiLoading,     setDoiLoading]     = useState(false);
  const [loading,        setLoading]        = useState(true);

  const isAdmin  = myRole === 'admin';
  const canAdd   = myRole === 'admin' || myRole === 'member';

  useEffect(() => { fetchFolders(); }, [groupId]); // eslint-disable-line
  useEffect(() => { if (activeFolderID) fetchItems(activeFolderID); }, [activeFolderID]);

  const fetchFolders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('library_folders')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order');

    if (!data?.length) {
      await supabase.rpc('create_group_library_defaults', { p_group_id: groupId });
      const { data: defaultData } = await supabase
        .from('library_folders')
        .select('*')
        .eq('group_id', groupId)
        .order('sort_order');
      setFolders(defaultData || []);
      if (defaultData?.length) setActiveFolderID(defaultData[0].id);
    } else {
      setFolders(data);
      setActiveFolderID(data[0]?.id);
    }
    setLoading(false);
  };

  const fetchItems = async (folderId) => {
    const { data } = await supabase
      .from('library_items')
      .select('*')
      .eq('folder_id', folderId)
      .order('added_at', { ascending: false });
    setItems(data || []);
  };

  const addPaperToFolder = async (paperData) => {
    if (!activeFolderID) return;
    await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      ...paperData,
    });
    fetchItems(activeFolderID);
    setShowSearch(false);
  };

  const addByDOI = async () => {
    if (!doiInput.trim() || !activeFolderID) return;
    setDoiLoading(true);
    try {
      const resp = await fetch(
        `https://api.crossref.org/works/${encodeURIComponent(doiInput.trim())}`
      );
      const data = await resp.json();
      const w    = data.message;
      await addPaperToFolder({
        title:   w.title?.[0] || '',
        authors: (w.author || [])
          .map(a => `${a.family||''} ${(a.given||'')[0]||''}`.trim())
          .join(', '),
        journal: w['container-title']?.[0] || '',
        year:    String(w.published?.['date-parts']?.[0]?.[0] || ''),
        doi:     doiInput.trim(),
      });
      setDoiInput('');
      setShowDOI(false);
    } catch {
      alert('DOI not found. Check the format and try again.');
    }
    setDoiLoading(false);
  };

  const createFolder = async (name) => {
    const { data } = await supabase.from('library_folders').insert({
      group_id:   groupId,
      name,
      sort_order: folders.length,
    }).select().single();
    if (data) {
      setFolders(f => [...f, data]);
      setActiveFolderID(data.id);
    }
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(`Delete "${folder.name}"? All papers inside will be removed.`)) return;
    await supabase.from('library_folders').delete().eq('id', folder.id);
    const remaining = folders.filter(f => f.id !== folder.id);
    setFolders(remaining);
    setActiveFolderID(remaining[0]?.id || null);
    if (remaining.length === 0) setItems([]);
    onStatsChanged?.();
  };

  const deleteItem = async (item) => {
    await supabase.from('library_items').delete().eq('id', item.id);
    setItems(i => i.filter(x => x.id !== item.id));
    if (item.is_group_publication) onStatsChanged?.();
  };

  const toggleGroupPublication = async (item) => {
    await supabase.from('library_items')
      .update({ is_group_publication: !item.is_group_publication })
      .eq('id', item.id);
    fetchItems(activeFolderID);
    onStatsChanged?.();
  };

  const isOurPublicationsFolder = () => {
    const f = folders.find(f => f.id === activeFolderID);
    return f?.name === "Our Group's Publications";
  };

  const canDelete = (item) => isAdmin || item.added_by === user.id;

  if (loading) return (
    <div style={{flex:1, display:'flex', justifyContent:'center', padding:40}}>
      <Spinner/>
    </div>
  );

  return (
    <div style={{display:'flex', flex:1, overflow:'hidden'}}>
      <LibraryFolderSidebar
        folders={folders}
        activeFolderId={activeFolderID}
        onSelectFolder={setActiveFolderID}
        onCreateFolder={createFolder}
        onDeleteFolder={deleteFolder}
        canManageFolders={isAdmin}
      />

      <div style={{flex:1, overflowY:'auto', padding:16}}>
        {activeFolderID && canAdd && (
          <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap'}}>
            <Btn onClick={() => { setShowSearch(s => !s); setShowDOI(false); }}>
              🔍 Search Europe PMC
            </Btn>
            <Btn onClick={() => { setShowDOI(s => !s); setShowSearch(false); }}>
              🔗 Enter DOI
            </Btn>
          </div>
        )}

        {showSearch && (
          <div style={{marginBottom:16, padding:14, background:T.w,
            borderRadius:12, border:`1px solid ${T.bdr}`}}>
            <LibraryPaperSearch onSelect={addPaperToFolder}/>
          </div>
        )}

        {showDOI && (
          <div style={{marginBottom:16, padding:14, background:T.w,
            borderRadius:12, border:`1px solid ${T.bdr}`,
            display:'flex', gap:8, alignItems:'center'}}>
            <input value={doiInput}
              onChange={e => setDoiInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && addByDOI()}
              placeholder="10.1056/NEJMoa..."
              style={{flex:1, padding:'8px 13px', borderRadius:9,
                border:`1.5px solid ${T.bdr}`, fontSize:13,
                fontFamily:'inherit', outline:'none'}}
            />
            <Btn variant="s" onClick={addByDOI} disabled={doiLoading}>
              {doiLoading ? '...' : 'Add'}
            </Btn>
          </div>
        )}

        {activeFolderID && items.length === 0 && !showSearch && !showDOI && (
          <div style={{textAlign:'center', color:T.mu, padding:'32px 20px', fontSize:13}}>
            <div style={{fontSize:28, marginBottom:8}}>📭</div>
            {canAdd ? 'This folder is empty. Add papers above.' : 'No papers in this folder yet.'}
          </div>
        )}

        {!activeFolderID && (
          <div style={{textAlign:'center', color:T.mu, padding:'32px 20px', fontSize:13}}>
            Select a folder to view its contents.
          </div>
        )}

        {items.map(item => (
          <LibraryItemCard
            key={item.id}
            item={item}
            onDelete={canDelete(item) ? deleteItem : null}
            showGroupPublicationToggle={isOurPublicationsFolder()}
            onToggleGroupPublication={toggleGroupPublication}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </div>
  );
}
