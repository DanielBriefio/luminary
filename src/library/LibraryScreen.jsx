import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import Av from '../components/Av';
import LibraryFolderSidebar from './LibraryFolderSidebar';
import LibraryPaperSearch   from './LibraryPaperSearch';
import LibraryItemCard      from './LibraryItemCard';

export default function LibraryScreen({ user, onSaveToggled }) {
  const [activeTab,      setActiveTab]      = useState('papers');
  const [folders,        setFolders]        = useState([]);
  const [activeFolderID, setActiveFolderID] = useState(null);
  const [items,          setItems]          = useState([]);
  const [savedPosts,     setSavedPosts]     = useState([]);
  const [showSearch,     setShowSearch]     = useState(false);
  const [showDOI,        setShowDOI]        = useState(false);
  const [doiInput,       setDoiInput]       = useState('');
  const [doiLoading,     setDoiLoading]     = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => { fetchFolders(); }, []); // eslint-disable-line
  useEffect(() => { if (activeFolderID) fetchItems(activeFolderID); }, [activeFolderID]);
  useEffect(() => { if (activeTab === 'saved') fetchSavedPosts(); }, [activeTab]);

  const fetchFolders = async () => {
    const { data } = await supabase
      .from('library_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');
    setFolders(data || []);
    if (data?.length) setActiveFolderID(data[0].id);
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

  const fetchSavedPosts = async () => {
    const { data } = await supabase
      .from('saved_posts')
      .select(`
        id, saved_at, post_id, group_post_id,
        post:posts(id, content, paper_title, created_at,
          profiles(name, avatar_url, avatar_color)),
        group_post:group_posts(id, content, paper_title, created_at,
          profiles(name, avatar_url, avatar_color))
      `)
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });
    setSavedPosts(data || []);
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

  const uploadPDF = async (file) => {
    if (!activeFolderID) return;
    const path = `library/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('library-files').upload(path, file);
    if (error) { alert('Upload failed.'); return; }
    const { data } = supabase.storage.from('library-files').getPublicUrl(path);
    await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      title:     file.name.replace(/\.[^/.]+$/, ''),
      pdf_url:   data.publicUrl,
      pdf_name:  file.name,
    });
    fetchItems(activeFolderID);
  };

  const unsavePost = async (sp) => {
    await supabase.from('saved_posts').delete().eq('id', sp.id);
    setSavedPosts(p => p.filter(x => x.id !== sp.id));
    onSaveToggled?.();
  };

  return (
    <div style={{display:'flex', flexDirection:'column', height:'100%', background:T.s2}}>

      {/* Header */}
      <div style={{padding:'16px 20px', background:T.w,
        borderBottom:`1px solid ${T.bdr}`,
        display:'flex', alignItems:'center', gap:12}}>
        <div style={{fontFamily:"'DM Serif Display',serif", fontSize:20}}>Library</div>
        <div style={{display:'flex', gap:4, marginLeft:'auto'}}>
          {[['papers','📚 Papers'],['saved','🔖 Saved']].map(([id,label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              padding:'5px 14px', borderRadius:20, cursor:'pointer',
              fontSize:12.5, fontWeight:600, fontFamily:'inherit',
              border:`1.5px solid ${activeTab===id ? T.v : T.bdr}`,
              background: activeTab===id ? T.v2 : T.w,
              color: activeTab===id ? T.v : T.mu,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Papers tab */}
      {activeTab === 'papers' && (
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>
          <LibraryFolderSidebar
            folders={folders}
            activeFolderId={activeFolderID}
            onSelectFolder={setActiveFolderID}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            canManageFolders={true}
          />

          <div style={{flex:1, overflowY:'auto', padding:16}}>
            {loading && <div style={{display:'flex',justifyContent:'center',padding:40}}><Spinner/></div>}

            {!loading && folders.length === 0 && (
              <div style={{textAlign:'center', color:T.mu, padding:'48px 20px'}}>
                <div style={{fontSize:36, marginBottom:12}}>📚</div>
                <div style={{fontSize:15, fontFamily:"'DM Serif Display',serif", marginBottom:8}}>
                  Your library is empty
                </div>
                <div style={{fontSize:13, marginBottom:16, lineHeight:1.6}}>
                  Create a folder to get started, then add papers from Europe PMC or by DOI.
                </div>
              </div>
            )}

            {activeFolderID && (
              <>
                <div style={{display:'flex', gap:8, marginBottom:16, flexWrap:'wrap'}}>
                  <Btn onClick={() => { setShowSearch(s => !s); setShowDOI(false); }}>
                    🔍 Search Europe PMC
                  </Btn>
                  <Btn onClick={() => { setShowDOI(s => !s); setShowSearch(false); }}>
                    🔗 Enter DOI
                  </Btn>
                  <label style={{cursor:'pointer'}}>
                    <input type="file" accept=".pdf,.doc,.docx,.txt" style={{display:'none'}}
                      onChange={e => e.target.files[0] && uploadPDF(e.target.files[0])}/>
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

                {items.length === 0 && !showSearch && !showDOI && (
                  <div style={{textAlign:'center', color:T.mu, padding:'32px 20px', fontSize:13}}>
                    <div style={{fontSize:28, marginBottom:8}}>📭</div>
                    This folder is empty. Add papers above.
                  </div>
                )}

                {items.map(item => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    onDelete={deleteItem}
                    showGroupPublicationToggle={false}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Saved posts tab */}
      {activeTab === 'saved' && (
        <div style={{flex:1, overflowY:'auto', padding:16}}>
          {savedPosts.length === 0 && (
            <div style={{textAlign:'center', color:T.mu, padding:'48px 20px'}}>
              <div style={{fontSize:36, marginBottom:12}}>🔖</div>
              <div style={{fontSize:15, fontFamily:"'DM Serif Display',serif", marginBottom:8}}>
                No saved posts yet
              </div>
              <div style={{fontSize:13, lineHeight:1.6}}>
                Tap the bookmark icon on any post to save it here.
              </div>
            </div>
          )}
          {savedPosts.map(sp => {
            const post = sp.post || sp.group_post;
            if (!post) return null;
            const text = (post.content || '').replace(/<[^>]+>/g,'').slice(0, 200);
            return (
              <div key={sp.id} style={{
                padding:'12px 14px', borderRadius:12,
                border:`1px solid ${T.bdr}`, background:T.w,
                marginBottom:8, display:'flex', gap:10, alignItems:'flex-start',
              }}>
                <Av size={36}
                  color={post.profiles?.avatar_color}
                  name={post.profiles?.name}
                  url={post.profiles?.avatar_url || ''}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:12.5, fontWeight:700, marginBottom:2}}>
                    {post.profiles?.name}
                  </div>
                  <div style={{fontSize:13, lineHeight:1.55, color:T.text, marginBottom:4}}>
                    {post.paper_title || text || '(no text)'}
                    {text.length === 200 ? '…' : ''}
                  </div>
                  <div style={{fontSize:11.5, color:T.mu}}>
                    Saved {timeAgo(sp.saved_at)}
                  </div>
                </div>
                <button onClick={() => unsavePost(sp)} style={{
                  fontSize:12, color:T.mu, border:'none',
                  background:'transparent', cursor:'pointer',
                  flexShrink:0, lineHeight:1,
                }} title="Unsave">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
