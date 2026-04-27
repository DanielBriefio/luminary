import { useState } from 'react';
import { T } from '../lib/constants';

const FOLDER_ICONS = {
  'Journal Club':             '📚',
  "Our Group's Publications": '🏆',
  'Reading List':             '📖',
  'To Reference':             '🔖',
};

export default function LibraryFolderSidebar({
  folders, activeFolderId, onSelectFolder,
  onCreateFolder, onDeleteFolder,
  canManageFolders,
  showInbox = false, inboxCount = 0,
  // Bookmarks (optional — only LibraryScreen passes these)
  bookmarkFolders,                 // [{id, name, parent_id, sort_order}]
  bookmarksActive = false,         // is the bookmarks view selected?
  activeBookmarkFolderId = 'all',  // 'all' | '__unsorted__' | uuid
  onSelectBookmarksView,           // (folderId | 'all' | '__unsorted__') => void
  onCreateBookmarkFolder,          // (name, parentId|null) => void
  onDeleteBookmarkFolder,          // (folder) => void
  bookmarkCount = 0,
  unsortedBookmarkCount = 0,
}) {
  const [creating,         setCreating]         = useState(false);          // library folder
  const [newFolderName,    setNewFolderName]    = useState('');
  const [creatingBookmark, setCreatingBookmark] = useState(null);            // null | 'root' | parentId
  const [newBmName,        setNewBmName]        = useState('');

  const showBookmarks = !!onSelectBookmarksView;

  const topBmFolders = (bookmarkFolders || []).filter(f => !f.parent_id);
  const childrenOf   = (id) => (bookmarkFolders || []).filter(f => f.parent_id === id);

  const bmRow = ({ id, label, icon, count, isActive, onClick, onDelete, indent = 0, addChildHandler }) => (
    <div
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:8,
        padding:`8px 14px 8px ${14 + indent * 16}px`,
        cursor:'pointer',
        background: isActive ? T.v2 : 'transparent',
        color:      isActive ? T.v  : T.text,
        fontWeight: isActive ? 700  : 400,
        fontSize:13,
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.s2; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{fontSize:14, flexShrink:0}}>{icon}</span>
      <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
        {label}
      </span>
      {count > 0 && (
        <span style={{
          fontSize:10, fontWeight:700, color:isActive ? '#fff' : T.mu,
          background: isActive ? T.v : T.s3,
          padding:'1px 6px', borderRadius:20, flexShrink:0,
        }}>
          {count}
        </span>
      )}
      {addChildHandler && (
        <button
          onClick={e => { e.stopPropagation(); addChildHandler(); }}
          style={{
            fontSize:14, color:T.mu, border:'none',
            background:'transparent', cursor:'pointer',
            opacity:.6, flexShrink:0, lineHeight:1, padding:'0 2px',
          }}
          title="New subfolder"
        >
          ＋
        </button>
      )}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            fontSize:11, color:T.mu, border:'none',
            background:'transparent', cursor:'pointer',
            opacity:.5, flexShrink:0, lineHeight:1,
          }}
          title="Delete folder"
        >
          ✕
        </button>
      )}
    </div>
  );

  return (
    <div style={{
      width:220, flexShrink:0,
      borderRight:`1px solid ${T.bdr}`,
      display:'flex', flexDirection:'column',
      background:T.w,
    }}>
      <div style={{flex:1, overflowY:'auto'}}>

        {/* ─── Bookmarks section ───────────────────────────────────── */}
        {showBookmarks && (
          <>
            <div style={{padding:'12px 14px 6px', fontSize:11, fontWeight:700,
              color:T.mu, textTransform:'uppercase', letterSpacing:'.07em'}}>
              Bookmarks
            </div>

            {bmRow({
              id:'all',
              label:'All bookmarks',
              icon:'🔖',
              count: bookmarkCount,
              isActive: bookmarksActive && activeBookmarkFolderId === 'all',
              onClick: () => onSelectBookmarksView('all'),
            })}

            {unsortedBookmarkCount > 0 && bmRow({
              id:'__unsorted__',
              label:'Unsorted',
              icon:'📥',
              count: unsortedBookmarkCount,
              isActive: bookmarksActive && activeBookmarkFolderId === '__unsorted__',
              onClick: () => onSelectBookmarksView('__unsorted__'),
            })}

            {topBmFolders.map(folder => (
              <div key={folder.id}>
                {bmRow({
                  id: folder.id,
                  label: folder.name,
                  icon: '📂',
                  isActive: bookmarksActive && activeBookmarkFolderId === folder.id,
                  onClick: () => onSelectBookmarksView(folder.id),
                  onDelete: () => onDeleteBookmarkFolder?.(folder),
                  addChildHandler: () => { setCreatingBookmark(folder.id); setNewBmName(''); },
                })}
                {childrenOf(folder.id).map(child => bmRow({
                  id: child.id,
                  label: child.name,
                  icon: '📄',
                  isActive: bookmarksActive && activeBookmarkFolderId === child.id,
                  onClick: () => onSelectBookmarksView(child.id),
                  onDelete: () => onDeleteBookmarkFolder?.(child),
                  indent: 1,
                }))}
                {creatingBookmark === folder.id && (
                  <div style={{padding:`6px 14px 8px ${14 + 16}px`}}>
                    <input
                      autoFocus
                      value={newBmName}
                      onChange={e => setNewBmName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newBmName.trim()) {
                          onCreateBookmarkFolder?.(newBmName.trim(), folder.id);
                          setCreatingBookmark(null); setNewBmName('');
                        }
                        if (e.key === 'Escape') { setCreatingBookmark(null); setNewBmName(''); }
                      }}
                      onBlur={() => { setCreatingBookmark(null); setNewBmName(''); }}
                      placeholder="Subfolder name…"
                      style={{width:'100%', fontSize:12, padding:'4px 7px',
                        border:`1.5px solid ${T.v}`, borderRadius:6,
                        fontFamily:'inherit', outline:'none'}}
                    />
                  </div>
                )}
              </div>
            ))}

            <div style={{padding:'4px 14px 12px'}}>
              {creatingBookmark === 'root' ? (
                <input
                  autoFocus
                  value={newBmName}
                  onChange={e => setNewBmName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newBmName.trim()) {
                      onCreateBookmarkFolder?.(newBmName.trim(), null);
                      setCreatingBookmark(null); setNewBmName('');
                    }
                    if (e.key === 'Escape') { setCreatingBookmark(null); setNewBmName(''); }
                  }}
                  onBlur={() => { setCreatingBookmark(null); setNewBmName(''); }}
                  placeholder="Folder name…"
                  style={{width:'100%', fontSize:12.5, padding:'5px 8px',
                    border:`1.5px solid ${T.v}`, borderRadius:7,
                    fontFamily:'inherit', outline:'none'}}
                />
              ) : (
                <button onClick={() => { setCreatingBookmark('root'); setNewBmName(''); }} style={{
                  fontSize:11.5, color:T.v, fontWeight:600,
                  border:'none', background:'transparent',
                  cursor:'pointer', fontFamily:'inherit', padding:0,
                }}>
                  + New folder
                </button>
              )}
            </div>

            <div style={{height:1, background:T.bdr, margin:'0 14px 8px'}} />
          </>
        )}

        {/* ─── Library Folders section ─────────────────────────────── */}
        <div style={{padding:'4px 14px 6px', fontSize:11, fontWeight:700,
          color:T.mu, textTransform:'uppercase', letterSpacing:'.07em'}}>
          {showBookmarks ? 'Library Folders' : 'Folders'}
        </div>

        {showInbox && (
          <div
            onClick={() => onSelectFolder('__inbox__')}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'9px 14px', cursor:'pointer',
              background: activeFolderId === '__inbox__' ? T.v2 : 'transparent',
              color: activeFolderId === '__inbox__' ? T.v : T.text,
              fontWeight: activeFolderId === '__inbox__' ? 700 : 400,
              fontSize:13,
            }}
          >
            <span style={{fontSize:14, flexShrink:0}}>📋</span>
            <span style={{flex:1}}>Unsorted</span>
            {inboxCount > 0 && (
              <span style={{
                fontSize:10, fontWeight:700, background:T.v, color:'#fff',
                padding:'1px 6px', borderRadius:20, flexShrink:0,
              }}>
                {inboxCount}
              </span>
            )}
          </div>
        )}

        {folders.length === 0 && (
          <div style={{padding:'12px 14px', fontSize:12.5, color:T.mu}}>
            No folders yet.{canManageFolders ? ' Create one below.' : ''}
          </div>
        )}

        {folders.map(folder => (
          <div key={folder.id}
            onClick={() => onSelectFolder(folder.id)}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'9px 14px', cursor:'pointer',
              background: activeFolderId===folder.id && !bookmarksActive ? T.v2 : 'transparent',
              color: activeFolderId===folder.id && !bookmarksActive ? T.v : T.text,
              fontWeight: activeFolderId===folder.id && !bookmarksActive ? 700 : 400,
              fontSize:13,
            }}>
            <span style={{fontSize:14, flexShrink:0}}>
              {FOLDER_ICONS[folder.name] || '📁'}
            </span>
            <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {folder.name}
            </span>
            {canManageFolders && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteFolder(folder); }}
                style={{
                  fontSize:11, color:T.mu, border:'none',
                  background:'transparent', cursor:'pointer',
                  opacity:.5, flexShrink:0, lineHeight:1,
                }}
                title="Delete folder"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {canManageFolders && (
        <div style={{padding:'10px 14px', borderTop:`1px solid ${T.bdr}`}}>
          {!creating ? (
            <button onClick={() => setCreating(true)} style={{
              fontSize:12, color:T.v, fontWeight:600,
              border:'none', background:'transparent',
              cursor:'pointer', fontFamily:'inherit',
              display:'flex', alignItems:'center', gap:4,
            }}>
              + New library folder
            </button>
          ) : (
            <div>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    onCreateFolder(newFolderName.trim());
                    setNewFolderName('');
                    setCreating(false);
                  }
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="Folder name..."
                style={{width:'100%', fontSize:12.5,
                  padding:'5px 8px', border:`1.5px solid ${T.v}`,
                  borderRadius:7, fontFamily:'inherit', outline:'none'}}
              />
              <div style={{fontSize:11, color:T.mu, marginTop:3}}>
                Enter to save · Esc to cancel
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
