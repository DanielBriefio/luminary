import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import ProjectFeed from './ProjectFeed';
import ProjectMembers from './ProjectMembers';

function SidebarItem({ label, active, onClick, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '7px 14px', cursor: 'pointer',
      background: active ? T.v2 : 'transparent',
      color: active ? T.v : T.text,
      fontWeight: active ? 700 : 400, fontSize: 12.5,
    }} onClick={onClick}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{
          fontSize: 11, color: T.mu, border: 'none', background: 'transparent',
          cursor: 'pointer', opacity: 0.5, flexShrink: 0, lineHeight: 1, padding: '0 0 0 4px',
        }}>✕</button>
      )}
    </div>
  );
}

export default function ProjectScreen({ projectId, user, onBack, group, onBackToGroup }) {
  const [project,        setProject]        = useState(null);
  const [folders,        setFolders]        = useState([]);
  const [myRole,         setMyRole]         = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [activeSection,  setActiveSection]  = useState('feed');
  const [addingFolder,   setAddingFolder]   = useState(false);
  const [newFolderName,  setNewFolderName]  = useState('');
  const [loading,        setLoading]        = useState(true);
  const [confirmDel,     setConfirmDel]     = useState(false);
  const [deleting,       setDeleting]       = useState(false);

  useEffect(() => {
    const load = async () => {
      const [{ data: proj }, { data: fols }, { data: mem }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('project_folders').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single(),
      ]);
      setProject(proj);
      setFolders(fols || []);
      setMyRole(mem?.role || null);
      setLoading(false);
    };
    load();
  }, [projectId, user.id]);

  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data } = await supabase.from('project_folders').insert({
      project_id: projectId, name: newFolderName.trim(), sort_order: folders.length,
    }).select().single();
    if (data) {
      setFolders(f => [...f, data]);
      setActiveFolderId(data.id);
      setActiveSection('feed');
    }
    setNewFolderName('');
    setAddingFolder(false);
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(`Delete "${folder.name}"? Posts in it will move to All Posts.`)) return;
    await supabase.from('project_posts').update({ folder_id: null }).eq('folder_id', folder.id);
    await supabase.from('project_folders').delete().eq('id', folder.id);
    setFolders(f => f.filter(x => x.id !== folder.id));
    if (activeFolderId === folder.id) setActiveFolderId(null);
  };

  const archiveProject = async () => {
    await supabase.from('projects').update({ status: 'archived' }).eq('id', projectId);
    onBack();
  };

  const deleteProject = async () => {
    setDeleting(true);
    await supabase.from('projects').delete().eq('id', projectId);
    setDeleting(false);
    onBack();
  };

  const leaveProject = async () => {
    await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', user.id);
    onBack();
  };

  const isOwner = myRole === 'owner';

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner/></div>;
  if (!project) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mu }}>Project not found.</div>;

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{
        width: 200, flexShrink: 0, background: T.w,
        borderRight: `1px solid ${T.bdr}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {group && onBackToGroup && (
          <button onClick={onBackToGroup} style={{
            fontSize: 11, color: T.mu, padding: '10px 14px 4px',
            border: 'none', background: 'transparent',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4,
            borderBottom: `1px solid ${T.bdr}`, width: '100%',
          }}>
            ← {group.name}
          </button>
        )}

        <button onClick={onBack} style={{
          fontSize: 11, color: T.mu, padding: group ? '6px 14px 0' : '10px 14px 0',
          border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← All projects
        </button>

        {/* Project identity */}
        <div style={{ padding: '10px 14px 14px', borderBottom: `1px solid ${T.bdr}` }}>
          <div style={{ height: 4, borderRadius: 2, background: project.cover_color || T.v, marginBottom: 10 }}/>
          <div style={{ fontSize: 22, marginBottom: 4 }}>{project.icon}</div>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{project.name}</div>
          {project.description && (
            <div style={{ fontSize: 11.5, color: T.mu, lineHeight: 1.4 }}>{project.description}</div>
          )}
        </div>

        {/* Feed section */}
        <div style={{ padding: '10px 0 4px' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: '.07em',
            padding: '0 14px 6px',
          }}>Feed</div>

          <SidebarItem
            label="📋 All Posts"
            active={activeSection === 'feed' && activeFolderId === null}
            onClick={() => { setActiveSection('feed'); setActiveFolderId(null); }}
          />

          {folders.map(folder => (
            <SidebarItem
              key={folder.id}
              label={`📁 ${folder.name}`}
              active={activeSection === 'feed' && activeFolderId === folder.id}
              onClick={() => { setActiveSection('feed'); setActiveFolderId(folder.id); }}
              onDelete={isOwner ? () => deleteFolder(folder) : null}
            />
          ))}

          {!addingFolder ? (
            <button onClick={() => setAddingFolder(true)} style={{
              width: '100%', padding: '6px 14px', border: 'none',
              background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, color: T.mu, textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 14 }}>+</span> Add folder
            </button>
          ) : (
            <div style={{ padding: '4px 10px' }}>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addFolder();
                  if (e.key === 'Escape') { setAddingFolder(false); setNewFolderName(''); }
                }}
                placeholder="Folder name…"
                style={{
                  width: '100%', fontSize: 12.5, padding: '5px 8px',
                  border: `1.5px solid ${T.v}`, borderRadius: 7,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10.5, color: T.mu, marginTop: 2 }}>Enter · Esc to cancel</div>
            </div>
          )}
        </div>

        {/* Members section */}
        <div style={{ padding: '4px 0' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: '.07em',
            padding: '6px 14px',
          }}>Members</div>
          <SidebarItem
            label="👥 Members"
            active={activeSection === 'members'}
            onClick={() => setActiveSection('members')}
          />
        </div>

        {/* Owner/member actions */}
        <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: `1px solid ${T.bdr}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isOwner && !confirmDel && (
            <>
              <button onClick={archiveProject} style={{
                fontSize: 12, color: T.mu, border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '3px 0',
              }}>📦 Archive project</button>
              <button onClick={() => setConfirmDel(true)} style={{
                fontSize: 12, color: T.ro, border: 'none', background: 'transparent',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '3px 0',
              }}>Delete project</button>
            </>
          )}
          {isOwner && confirmDel && (
            <div>
              <div style={{ fontSize: 11.5, color: T.text, marginBottom: 6, lineHeight: 1.5 }}>Delete project?</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setConfirmDel(false)} style={{ flex: 1, padding: '5px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', color: T.mu }}>Cancel</button>
                <button onClick={deleteProject} disabled={deleting} style={{ flex: 1, padding: '5px', borderRadius: 7, border: 'none', background: T.ro, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', fontWeight: 700, color: '#fff' }}>
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          )}
          {!isOwner && (
            <button onClick={leaveProject} style={{
              fontSize: 12, color: T.mu, border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: '3px 0',
            }}>Leave project</button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: T.bg }}>
        {activeSection === 'feed' && (
          <ProjectFeed
            project={project}
            user={user}
            myRole={myRole}
            activeFolderId={activeFolderId}
            folders={folders}
          />
        )}
        {activeSection === 'members' && (
          <ProjectMembers
            project={project}
            user={user}
            myRole={myRole}
          />
        )}
      </div>
    </div>
  );
}
