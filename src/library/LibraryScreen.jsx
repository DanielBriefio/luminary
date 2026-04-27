import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import Av from '../components/Av';
import LibraryFolderSidebar          from './LibraryFolderSidebar';
import LibraryPaperSearch             from './LibraryPaperSearch';
import LibraryItemCard                from './LibraryItemCard';
import LibraryRisImporter             from './LibraryRisImporter';
import LibraryClinicalTrialSearch     from './LibraryClinicalTrialSearch';

export default function LibraryScreen({ user, profile, onSaveToggled, onViewGroup, onNavigateToPost }) {
  const [folders,        setFolders]        = useState([]);
  const [activeFolderID, setActiveFolderID] = useState(null);
  const [items,          setItems]          = useState([]);
  const [inboxItems,     setInboxItems]     = useState([]);
  const [savedPosts,     setSavedPosts]     = useState([]);
  const [searchSource,   setSearchSource]   = useState('epmc');
  const [showSearch,     setShowSearch]     = useState(false);
  const [showDOI,        setShowDOI]        = useState(false);
  const [showRisImport,  setShowRisImport]  = useState(false);
  const [doiInput,       setDoiInput]       = useState('');
  const [doiLoading,     setDoiLoading]     = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => { fetchFolders(); fetchBookmarks(); fetchInboxItems(); }, []); // eslint-disable-line
  useEffect(() => { if (activeFolderID && activeFolderID !== '__inbox__') fetchItems(activeFolderID); }, [activeFolderID]);

  const fetchFolders = async (overrideActiveId) => {
    const { data } = await supabase
      .from('library_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');

    if (!data?.length && (profile?.work_mode === 'clinician' || profile?.work_mode === 'clinician_scientist')) {
      const { data: folder } = await supabase
        .from('library_folders')
        .insert({ user_id: user.id, name: 'Guidelines & Protocols', sort_order: 0 })
        .select().single();
      if (folder) { setFolders([folder]); setActiveFolderID(folder.id); }
      setLoading(false);
      return;
    }

    setFolders(data || []);
    if (overrideActiveId) setActiveFolderID(overrideActiveId);
    else if (data?.length) setActiveFolderID(data[0].id);
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

  const fetchInboxItems = async () => {
    const { data } = await supabase
      .from('library_items')
      .select('*')
      .is('folder_id', null)
      .eq('added_by', user.id)
      .order('added_at', { ascending: false });
    setInboxItems(data || []);
  };

  const fetchBookmarks = async () => {
    // posts has two FKs to profiles (user_id + target_user_id) so PostgREST
    // can't auto-resolve `profiles(...)` without a hint — disambiguate via
    // the FK column name (returns PGRST201 / 300 Multiple Choices otherwise).
    // group_posts only has user_id → profiles, so no hint needed there.
    const { data } = await supabase
      .from('saved_posts')
      .select(`
        id, saved_at, post_id, group_post_id,
        post:posts(id, content, paper_title, created_at,
          profiles!posts_user_id_fkey(name, avatar_url, avatar_color)),
        group_post:group_posts(id, content, paper_title, group_id, created_at,
          profiles(name, avatar_url, avatar_color))
      `)
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });
    setSavedPosts(data || []);
  };

  const sharePaper = (item) => {
    if (!onNavigateToPost) return;
    sessionStorage.setItem('prefill_paper', JSON.stringify({
      doi:      item.doi      || '',
      title:    item.title    || '',
      journal:  item.journal  || '',
      year:     item.year     || '',
      authors:  item.authors  || '',
      abstract: item.abstract || '',
      citation: item.citation || '',
    }));
    onNavigateToPost();
  };

  const moveInboxItemToFolder = async (item, folderId) => {
    await supabase.from('library_items').update({ folder_id: folderId }).eq('id', item.id);
    setInboxItems(prev => prev.filter(x => x.id !== item.id));
    if (activeFolderID === folderId) fetchItems(folderId);
  };

  const moveItemToFolder = async (item, folderId) => {
    if (folderId === activeFolderID) return;
    await supabase.from('library_items').update({ folder_id: folderId }).eq('id', item.id);
    setItems(prev => prev.filter(x => x.id !== item.id));
  };

  const deleteInboxItem = async (item) => {
    await supabase.from('library_items').delete().eq('id', item.id);
    setInboxItems(prev => prev.filter(x => x.id !== item.id));
  };

  const addPaperToFolder = async (paperData, source = 'epmc') => {
    if (!activeFolderID) return;
    const { error } = await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      ...paperData,
    });
    if (!error) capture('library_item_added', { source });
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
      }, 'doi');
      setDoiInput('');
      setShowDOI(false);
    } catch {
      alert('DOI not found. Check the format and try again.');
    }
    setDoiLoading(false);
  };

  const createFolder = async (name) => {
    const { data } = await supabase.from('library_folders').insert({
      user_id:    user.id,
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
  };

  const deleteItem = async (item) => {
    await supabase.from('library_items').delete().eq('id', item.id);
    setItems(i => i.filter(x => x.id !== item.id));
  };

  const uploadFile = async (file) => {
    if (!activeFolderID) return;
    const path = `library/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('library-files').upload(path, file);
    if (error) { alert('Upload failed.'); return; }
    const { data } = supabase.storage.from('library-files').getPublicUrl(path);
    const { data: item, error: insertError } = await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      title:     file.name.replace(/\.[^/.]+$/, ''),
      pdf_url:   data.publicUrl,
      pdf_name:  file.name,
    }).select('id').single();
    if (!insertError) {
      capture('library_item_added', { source: 'upload' });
      if (item?.id) {
        supabase.rpc('record_storage_file', {
          p_bucket:      'library-files',
          p_path:        path,
          p_size_bytes:  file.size,
          p_mime_type:   file.type || '',
          p_file_name:   file.name,
          p_source_kind: 'library',
          p_source_id:   item.id,
        }).then(() => {}, () => {});
      }
    }
    fetchItems(activeFolderID);
  };

  const unsavePost = async (sp) => {
    await supabase.from('saved_posts').delete().eq('id', sp.id);
    setSavedPosts(p => p.filter(x => x.id !== sp.id));
    onSaveToggled?.();
  };

  const openBookmark = (sp) => {
    if (sp.post_id) {
      window.open(`/s/${sp.post_id}`, '_blank', 'noopener,noreferrer');
    } else if (sp.group_post?.group_id && onViewGroup) {
      onViewGroup(sp.group_post.group_id);
    }
  };

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:T.s2}}>

      {/* Header */}
      <div style={{padding:'14px 20px', background:T.w, borderBottom:`1px solid ${T.bdr}`, flexShrink:0}}>
        <div style={{fontFamily:"'DM Serif Display',serif", fontSize:20}}>Library</div>
      </div>

      {/* Two-column body */}
      <div style={{display:'flex', flex:1, overflow:'hidden'}}>

        {/* ── LEFT: Paper Library ── */}
        <div style={{display:'flex', flex:'1 1 0', overflow:'hidden', borderRight:`2px solid ${T.bdr}`}}>

          <LibraryFolderSidebar
            folders={folders}
            activeFolderId={activeFolderID}
            onSelectFolder={setActiveFolderID}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            canManageFolders={true}
            showInbox={inboxItems.length > 0}
            inboxCount={inboxItems.length}
          />

          <div style={{flex:1, overflowY:'auto', padding:16}}>

            {/* Section label */}
            <div style={{fontSize:11, fontWeight:700, color:T.mu, textTransform:'uppercase',
              letterSpacing:'.07em', marginBottom:14}}>
              Paper Library
            </div>

            {activeFolderID === '__inbox__' && (
              <>
                <div style={{fontSize:12, color:T.mu, marginBottom:12, lineHeight:1.5}}>
                  Papers added from Explore without a folder. Move them to a folder to organise.
                </div>
                {inboxItems.length === 0 ? (
                  <div style={{textAlign:'center', color:T.mu, padding:'28px 16px', fontSize:13}}>
                    <div style={{fontSize:24, marginBottom:8}}>📭</div>
                    No unsorted papers.
                  </div>
                ) : inboxItems.map(item => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    onDelete={deleteInboxItem}
                    showGroupPublicationToggle={false}
                    folders={folders}
                    onMoveToFolder={moveInboxItemToFolder}
                    onSharePaper={onNavigateToPost ? sharePaper : null}
                    showInlineMove={true}
                  />
                ))}
              </>
            )}

            {loading && activeFolderID !== '__inbox__' && <div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>}

            {!loading && folders.length === 0 && (
              <div style={{textAlign:'center', color:T.mu, padding:'40px 16px'}}>
                <div style={{fontSize:32, marginBottom:10}}>
                  {(profile?.work_mode === 'clinician' || profile?.work_mode === 'clinician_scientist') ? '📋' : '📚'}
                </div>
                <div style={{fontSize:14, fontFamily:"'DM Serif Display',serif", marginBottom:6}}>
                  Your library is empty
                </div>
                <div style={{fontSize:12.5, lineHeight:1.6}}>
                  {(profile?.work_mode === 'clinician' || profile?.work_mode === 'clinician_scientist')
                    ? 'Search ClinicalTrials.gov for trials in your area, or find guidelines and key papers via Europe PMC.'
                    : 'Create a folder to get started, then add papers from Europe PMC or by DOI.'}
                </div>
              </div>
            )}

            {activeFolderID && activeFolderID !== '__inbox__' && (
              <>
                {/* Source selector */}
                <div style={{display:'flex', gap:6, marginBottom:12, flexWrap:'wrap'}}>
                  {[
                    { id: 'epmc',   label: '🔬 Europe PMC'         },
                    { id: 'trials', label: '🧪 ClinicalTrials.gov'  },
                    { id: 'doi',    label: '🔗 Enter DOI'           },
                  ].map(s => (
                    <button key={s.id}
                      onClick={() => { setSearchSource(s.id); setShowSearch(s.id==='epmc'); setShowDOI(s.id==='doi'); setShowRisImport(false); }}
                      style={{
                        padding:'6px 12px', borderRadius:20, cursor:'pointer',
                        fontSize:12.5, fontWeight:600, fontFamily:'inherit',
                        border:`1.5px solid ${searchSource===s.id&&(showSearch||showDOI||s.id==='trials')?T.v:T.bdr}`,
                        background:searchSource===s.id&&(showSearch||showDOI||s.id==='trials')?T.v2:T.w,
                        color:searchSource===s.id&&(showSearch||showDOI||s.id==='trials')?T.v:T.mu,
                      }}>
                      {s.label}
                    </button>
                  ))}
                  <Btn onClick={() => { setShowRisImport(s => !s); setShowSearch(false); setShowDOI(false); }}>
                    📑 Import .ris / .bib
                  </Btn>
                  <label style={{cursor:'pointer'}}>
                    <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:'none'}}
                      onChange={e => e.target.files[0] && uploadFile(e.target.files[0])}/>
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      padding:'7px 14px', borderRadius:9,
                      border:`1px solid ${T.bdr}`, background:T.w,
                      fontSize:13, cursor:'pointer', fontWeight:500,
                    }}>
                      📄 Upload file
                    </span>
                  </label>
                </div>

                {showSearch && (
                  <div style={{marginBottom:14, padding:14, background:T.w,
                    borderRadius:12, border:`1px solid ${T.bdr}`}}>
                    <LibraryPaperSearch onSelect={data => addPaperToFolder(data, 'epmc')}/>
                  </div>
                )}

                {searchSource === 'trials' && !showSearch && !showDOI && !showRisImport && (
                  <div style={{marginBottom:14, padding:14, background:T.w,
                    borderRadius:12, border:`1px solid ${T.bdr}`}}>
                    <LibraryClinicalTrialSearch onSelect={data => addPaperToFolder(data, 'trials')}/>
                  </div>
                )}

                {showDOI && (
                  <div style={{marginBottom:14, padding:14, background:T.w,
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

                {showRisImport && (
                  <LibraryRisImporter
                    userId={user.id}
                    folders={folders}
                    onDone={async (folderId, isNew) => {
                      setShowRisImport(false);
                      if (isNew) await fetchFolders(folderId);
                      else { setActiveFolderID(folderId); fetchItems(folderId); }
                    }}
                    onClose={() => setShowRisImport(false)}
                  />
                )}

                {items.length === 0 && !showSearch && !showDOI && !showRisImport && searchSource !== 'trials' && (
                  <div style={{textAlign:'center', color:T.mu, padding:'28px 16px', fontSize:13}}>
                    <div style={{fontSize:24, marginBottom:8}}>📭</div>
                    This folder is empty. Add papers above.
                  </div>
                )}

                {items.map(item => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    onDelete={deleteItem}
                    showGroupPublicationToggle={false}
                    onSharePaper={onNavigateToPost ? sharePaper : null}
                    folders={folders.filter(f => f.id !== activeFolderID)}
                    onMoveToFolder={moveItemToFolder}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Bookmarks ── */}
        <div style={{width:320, flexShrink:0, display:'flex', flexDirection:'column',
          background:T.w, overflow:'hidden'}}>

          <div style={{padding:'16px 16px 10px', borderBottom:`1px solid ${T.bdr}`, flexShrink:0,
            display:'flex', alignItems:'center', gap:8}}>
            <svg width="15" height="15" viewBox="0 0 24 24"
              fill={T.v} stroke={T.v} strokeWidth="1.8">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={{fontSize:11, fontWeight:700, color:T.mu, textTransform:'uppercase',
              letterSpacing:'.07em'}}>
              Bookmarks
            </span>
            {savedPosts.length > 0 && (
              <span style={{marginLeft:'auto', fontSize:10.5, color:T.mu}}>{savedPosts.length}</span>
            )}
          </div>

          <div style={{flex:1, overflowY:'auto', padding:10}}>
            {savedPosts.length === 0 && (
              <div style={{textAlign:'center', color:T.mu, padding:'40px 16px'}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke={T.bdr} strokeWidth="1.5" style={{marginBottom:10}}>
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <div style={{fontSize:13, fontWeight:600, marginBottom:6}}>No bookmarks yet</div>
                <div style={{fontSize:12, lineHeight:1.6}}>
                  Click the bookmark icon on any post to save it here.
                </div>
              </div>
            )}

            {savedPosts.map(sp => {
              const p = sp.post || sp.group_post;
              if (!p) return null;
              const isGroup = !!sp.group_post_id;
              const text = (p.content || '').replace(/<[^>]+>/g,'').slice(0, 160);
              const canOpen = sp.post_id || (sp.group_post?.group_id && onViewGroup);
              return (
                <div key={sp.id}
                  onClick={() => canOpen && openBookmark(sp)}
                  style={{
                    padding:'10px 12px', borderRadius:10,
                    border:`1px solid ${T.bdr}`, marginBottom:8,
                    cursor: canOpen ? 'pointer' : 'default',
                    background: T.w,
                    transition:'background .12s',
                  }}
                  onMouseEnter={e => { if (canOpen) e.currentTarget.style.background = T.s2; }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.w; }}
                >
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                    <Av size={26}
                      color={p.profiles?.avatar_color}
                      name={p.profiles?.name}
                      url={p.profiles?.avatar_url || ''}/>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:12, fontWeight:700,
                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                        {p.profiles?.name}
                      </div>
                    </div>
                    {isGroup && (
                      <span style={{fontSize:9.5, fontWeight:700, color:T.v,
                        background:T.v2, padding:'1px 6px', borderRadius:20, flexShrink:0}}>
                        Group
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); unsavePost(sp); }}
                      style={{fontSize:11, color:T.mu, border:'none', background:'transparent',
                        cursor:'pointer', flexShrink:0, opacity:.5, lineHeight:1}}
                      title="Remove bookmark"
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{fontSize:12.5, lineHeight:1.5, color:T.text, marginBottom:4}}>
                    {p.paper_title || text || '(no text)'}
                    {!p.paper_title && text.length === 160 ? '…' : ''}
                  </div>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <span style={{fontSize:11, color:T.mu}}>{timeAgo(sp.saved_at)}</span>
                    {canOpen && (
                      <span style={{fontSize:11, color:T.v, fontWeight:600}}>
                        {isGroup ? 'Open group →' : 'Read post →'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
