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
}) {
  const [creating,      setCreating]      = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  return (
    <div style={{
      width:200, flexShrink:0,
      borderRight:`1px solid ${T.bdr}`,
      display:'flex', flexDirection:'column',
      background:T.w,
    }}>
      <div style={{padding:'12px 14px', fontSize:11, fontWeight:700,
        color:T.mu, textTransform:'uppercase', letterSpacing:'.07em'}}>
        Folders
      </div>

      <div style={{flex:1, overflowY:'auto'}}>
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
              background: activeFolderId===folder.id ? T.v2 : 'transparent',
              color: activeFolderId===folder.id ? T.v : T.text,
              fontWeight: activeFolderId===folder.id ? 700 : 400,
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
              + New folder
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
