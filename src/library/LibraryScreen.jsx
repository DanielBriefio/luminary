import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { capture } from '../lib/analytics';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import { useWindowSize } from '../lib/useWindowSize';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import Av from '../components/Av';
import LibraryFolderSidebar          from './LibraryFolderSidebar';
import LibraryPaperSearch             from './LibraryPaperSearch';
import LibraryItemCard                from './LibraryItemCard';
import LibraryRisImporter             from './LibraryRisImporter';
import LibraryClinicalTrialSearch     from './LibraryClinicalTrialSearch';
import LibraryFilesView               from './LibraryFilesView';
import { checkRemainingQuota }        from '../lib/storageQuota';

export default function LibraryScreen({ user, profile, onSaveToggled, onViewGroup, onNavigateToPost, defaultView = 'library' }) {
  const { isMobile } = useWindowSize();
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [folders,        setFolders]        = useState([]);
  const [activeFolderID, setActiveFolderID] = useState(null);
  const [items,          setItems]          = useState([]);
  const [inboxItems,     setInboxItems]     = useState([]);
  const [savedPosts,     setSavedPosts]     = useState([]);
  const [bookmarkFolders, setBookmarkFolders] = useState([]);
  const [bookmarksActive, setBookmarksActive] = useState(defaultView === 'bookmarks');
  const [filesActive,    setFilesActive]    = useState(defaultView === 'files');
  const [filesCount,     setFilesCount]     = useState(0);
  const [activeBmFolderId, setActiveBmFolderId] = useState('all'); // 'all' | '__unsorted__' | uuid
  const [searchSource,   setSearchSource]   = useState('epmc');
  const [showSearch,     setShowSearch]     = useState(false);
  const [showDOI,        setShowDOI]        = useState(false);
  const [showRisImport,  setShowRisImport]  = useState(false);
  const [doiInput,       setDoiInput]       = useState('');
  const [doiLoading,     setDoiLoading]     = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    fetchFolders(); fetchBookmarks(); fetchInboxItems(); fetchBookmarkFolders(); fetchFilesCount();
  }, []); // eslint-disable-line
  useEffect(() => {
    if (activeFolderID && activeFolderID !== '__inbox__') fetchItems(activeFolderID);
  }, [activeFolderID]);

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

  const fetchFilesCount = async () => {
    const { count } = await supabase
      .from('user_storage_files')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setFilesCount(count || 0);
  };

  const fetchBookmarkFolders = async () => {
    const { data } = await supabase
      .from('bookmark_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');
    setBookmarkFolders(data || []);
  };

  const fetchBookmarks = async () => {
    // posts has two FKs to profiles (user_id + target_user_id) so PostgREST
    // can't auto-resolve `profiles(...)` without a hint — disambiguate via
    // the FK column name (returns PGRST201 / 300 Multiple Choices otherwise).
    // group_posts only has user_id → profiles, so no hint needed there.
    const { data } = await supabase
      .from('saved_posts')
      .select(`
        id, saved_at, post_id, group_post_id, folder_id,
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

  const renameItem = async (item, newTitle) => {
    await supabase.from('library_items').update({ title: newTitle }).eq('id', item.id);
    setItems(prev => prev.map(x => x.id === item.id ? { ...x, title: newTitle } : x));
    setInboxItems(prev => prev.map(x => x.id === item.id ? { ...x, title: newTitle } : x));
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
      setBookmarksActive(false);
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
    if (file.size > 10 * 1024 * 1024) { alert('File is too large (max 10 MB).'); return; }
    const quotaErr = await checkRemainingQuota(file.size);
    if (quotaErr) { alert(quotaErr); return; }
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

  const moveBookmark = async (sp, folderId) => {
    // folderId may be '' (treated as null = unsorted) or a uuid
    const target = folderId || null;
    await supabase.from('saved_posts').update({ folder_id: target }).eq('id', sp.id);
    setSavedPosts(prev => prev.map(x => x.id === sp.id ? { ...x, folder_id: target } : x));
  };

  const createBookmarkFolder = async (name, parentId) => {
    const { data, error } = await supabase.from('bookmark_folders').insert({
      user_id:    user.id,
      name,
      parent_id:  parentId,
      sort_order: bookmarkFolders.length,
    }).select().single();
    if (error || !data) return;
    setBookmarkFolders(f => [...f, data]);
    setBookmarksActive(true);
    setActiveBmFolderId(data.id);
  };

  const deleteBookmarkFolder = async (folder) => {
    if (!window.confirm(`Delete "${folder.name}"? Bookmarks inside will become Unsorted; subfolders will also be removed.`)) return;
    await supabase.from('bookmark_folders').delete().eq('id', folder.id);
    // Refresh both folders and bookmarks (folder_id may have been set to null)
    fetchBookmarkFolders();
    fetchBookmarks();
    if (activeBmFolderId === folder.id) setActiveBmFolderId('all');
  };

  const onSelectBookmarksView = (id) => {
    setBookmarksActive(true);
    setFilesActive(false);
    setActiveBmFolderId(id);
    if (isMobile) setSidebarOpen(false);
  };

  const onSelectLibraryFolder = (id) => {
    setBookmarksActive(false);
    setFilesActive(false);
    setActiveFolderID(id);
    if (isMobile) setSidebarOpen(false);
  };

  const onSelectFilesView = () => {
    setFilesActive(true);
    setBookmarksActive(false);
    if (isMobile) setSidebarOpen(false);
  };

  // Bookmark counts for the sidebar
  const bookmarkCount         = savedPosts.length;
  const unsortedBookmarkCount = savedPosts.filter(sp => !sp.folder_id).length;

  // Build a flat picker list with hierarchy hints for the bookmark move dropdown
  const bookmarkFolderPickerList = (() => {
    const tops = bookmarkFolders.filter(f => !f.parent_id);
    const out = [];
    for (const t of tops) {
      out.push({ id: t.id, label: t.name });
      const subs = bookmarkFolders.filter(f => f.parent_id === t.id);
      for (const s of subs) out.push({ id: s.id, label: `${t.name} / ${s.name}` });
    }
    return out;
  })();

  const folderById = (id) => bookmarkFolders.find(f => f.id === id);
  const folderLabel = (id) => {
    const f = folderById(id);
    if (!f) return '';
    const parent = f.parent_id ? folderById(f.parent_id) : null;
    return parent ? `${parent.name} / ${f.name}` : f.name;
  };

  // Visible bookmarks for the active selection
  const visibleBookmarks = !bookmarksActive ? [] :
    activeBmFolderId === 'all'          ? savedPosts :
    activeBmFolderId === '__unsorted__' ? savedPosts.filter(sp => !sp.folder_id) :
                                          savedPosts.filter(sp => sp.folder_id === activeBmFolderId);

  const bookmarksHeader = !bookmarksActive ? '' :
    activeBmFolderId === 'all'          ? 'All bookmarks' :
    activeBmFolderId === '__unsorted__' ? 'Unsorted' :
                                          folderLabel(activeBmFolderId) || 'Bookmarks';

  // Mobile drawer button label — what's currently selected.
  const libraryFolderName = (id) => folders.find(f => f.id === id)?.name || '';
  const activeLabel = filesActive
    ? '📎 All files'
    : bookmarksActive
      ? `🔖 ${bookmarksHeader || 'Bookmarks'}`
      : activeFolderID === '__inbox__'
        ? '📥 Unsorted'
        : libraryFolderName(activeFolderID)
          ? `📁 ${libraryFolderName(activeFolderID)}`
          : 'Folders';

  const sidebarProps = {
    folders, activeFolderId: activeFolderID,
    onSelectFolder: onSelectLibraryFolder,
    onCreateFolder: createFolder, onDeleteFolder: deleteFolder,
    canManageFolders: true,
    showInbox: inboxItems.length > 0, inboxCount: inboxItems.length,
    bookmarkFolders, bookmarksActive,
    activeBookmarkFolderId: activeBmFolderId,
    onSelectBookmarksView, onCreateBookmarkFolder: createBookmarkFolder,
    onDeleteBookmarkFolder: deleteBookmarkFolder,
    bookmarkCount, unsortedBookmarkCount,
    filesActive, onSelectFilesView, filesCount,
  };

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:T.s2}}>

      {/* Header */}
      <div style={{
        padding: isMobile ? '10px 14px' : '14px 20px',
        background: T.w, borderBottom: `1px solid ${T.bdr}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{fontFamily:"'DM Serif Display',serif", fontSize: isMobile ? 18 : 20}}>Library</div>
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              border: `1.5px solid ${T.bdr}`, background: T.w,
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 600, color: T.text,
              maxWidth: 220, overflow: 'hidden',
            }}
            title="Switch folder"
          >
            <span style={{ flexShrink: 0 }}>≡</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeLabel}
            </span>
          </button>
        )}
      </div>

      {/* Body: sidebar + main panel */}
      <div style={{display:'flex', flex:1, overflow:'hidden', position: 'relative'}}>

        {/* Static sidebar — desktop only */}
        {!isMobile && <LibraryFolderSidebar {...sidebarProps}/>}

        {/* Drawer overlay — mobile only, when open */}
        {isMobile && sidebarOpen && (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(27,29,54,.45)',
                zIndex: 90,
              }}
            />
            <div style={{
              position: 'fixed', top: 0, bottom: 0, left: 0,
              width: '85%', maxWidth: 320,
              zIndex: 91, display: 'flex', flexDirection: 'column',
              boxShadow: '4px 0 24px rgba(0,0,0,.18)',
              background: T.w,
            }}>
              <div style={{
                padding: '12px 14px', borderBottom: `1px solid ${T.bdr}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16 }}>Folders</div>
                <button onClick={() => setSidebarOpen(false)} style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 16, color: T.mu, fontFamily: 'inherit', padding: '4px 8px',
                }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <LibraryFolderSidebar {...sidebarProps}/>
              </div>
            </div>
          </>
        )}

        <div style={{flex:1, overflowY:'auto', padding: isMobile ? 12 : 16}}>

          {/* ─── Files main view ─────────────────────────────────── */}
          {filesActive && <LibraryFilesView isMobile={isMobile} />}

          {/* ─── Bookmarks main view ─────────────────────────────── */}
          {!filesActive && bookmarksActive && (
            <>
              <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
                <svg width="16" height="16" viewBox="0 0 24 24"
                  fill={T.v} stroke={T.v} strokeWidth="1.8">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <div style={{fontSize:11, fontWeight:700, color:T.mu, textTransform:'uppercase',
                  letterSpacing:'.07em'}}>
                  Bookmarks · {bookmarksHeader}
                </div>
                <span style={{fontSize:11, color:T.mu}}>{visibleBookmarks.length}</span>
              </div>

              {visibleBookmarks.length === 0 ? (
                <div style={{textAlign:'center', color:T.mu, padding:'40px 16px'}}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                    stroke={T.bdr} strokeWidth="1.5" style={{marginBottom:10}}>
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <div style={{fontSize:13.5, fontWeight:600, marginBottom:6}}>
                    {activeBmFolderId === 'all' ? 'No bookmarks yet' : 'This folder is empty'}
                  </div>
                  <div style={{fontSize:12.5, lineHeight:1.6}}>
                    {activeBmFolderId === 'all'
                      ? 'Click the bookmark icon on any post to save it here.'
                      : 'Move bookmarks into this folder via the dropdown on each card.'}
                  </div>
                </div>
              ) : visibleBookmarks.map(sp => {
                const p = sp.post || sp.group_post;
                if (!p) return null;
                const isGroup = !!sp.group_post_id;
                const text = (p.content || '').replace(/<[^>]+>/g,'').slice(0, 220);
                const canOpen = sp.post_id || (sp.group_post?.group_id && onViewGroup);
                return (
                  <div key={sp.id}
                    style={{
                      padding:'12px 14px', borderRadius:12,
                      border:`1px solid ${T.bdr}`, marginBottom:10,
                      background: T.w,
                    }}
                  >
                    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
                      <Av size={28}
                        color={p.profiles?.avatar_color}
                        name={p.profiles?.name}
                        url={p.profiles?.avatar_url || ''}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:13, fontWeight:700,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                          {p.profiles?.name}
                        </div>
                        <div style={{fontSize:11, color:T.mu}}>{timeAgo(sp.saved_at)}</div>
                      </div>
                      {isGroup && (
                        <span style={{fontSize:9.5, fontWeight:700, color:T.v,
                          background:T.v2, padding:'1px 6px', borderRadius:20, flexShrink:0}}>
                          Group
                        </span>
                      )}
                      <button
                        onClick={() => unsavePost(sp)}
                        style={{fontSize:12, color:T.mu, border:'none', background:'transparent',
                          cursor:'pointer', flexShrink:0, opacity:.6, lineHeight:1}}
                        title="Remove bookmark"
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{fontSize:13, lineHeight:1.5, color:T.text, marginBottom:10}}>
                      {p.paper_title || text || '(no text)'}
                      {!p.paper_title && text.length === 220 ? '…' : ''}
                    </div>

                    <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
                      <select
                        value={sp.folder_id || ''}
                        onChange={e => moveBookmark(sp, e.target.value)}
                        style={{
                          fontSize:11.5, color:sp.folder_id ? T.v : T.mu,
                          fontWeight:600, fontFamily:'inherit',
                          border:`1px solid ${sp.folder_id ? T.v : T.bdr}`,
                          background: sp.folder_id ? T.v2 : T.w,
                          borderRadius:20, padding:'2px 8px', cursor:'pointer',
                        }}
                      >
                        <option value="">Unsorted</option>
                        {bookmarkFolderPickerList.map(o => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>

                      {activeBmFolderId === 'all' && sp.folder_id && (
                        <span style={{fontSize:11, color:T.mu}}>
                          in {folderLabel(sp.folder_id)}
                        </span>
                      )}

                      {canOpen && (
                        <span
                          onClick={() => openBookmark(sp)}
                          style={{marginLeft:'auto', fontSize:11.5, color:T.v,
                            fontWeight:600, cursor:'pointer'}}
                        >
                          {isGroup ? 'Open group →' : 'Read post →'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ─── Library main view ─────────────────────────────── */}
          {!filesActive && !bookmarksActive && (
            <>
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
                      onRename={renameItem}
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
                      onRename={renameItem}
                      showGroupPublicationToggle={false}
                      onSharePaper={onNavigateToPost ? sharePaper : null}
                      folders={folders.filter(f => f.id !== activeFolderID)}
                      onMoveToFolder={moveItemToFolder}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
