import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import CreateProjectModal from '../projects/CreateProjectModal';
import TemplateGallery from '../projects/TemplateGallery';

export default function GroupProjects({ groupId, user, myRole, onSelectProject }) {
  const [projects,              setProjects]              = useState([]);
  const [loading,               setLoading]               = useState(true);
  const [showCreate,            setShowCreate]            = useState(false);
  const [showGallery,           setShowGallery]           = useState(false);
  const [preselectedTemplate,   setPreselectedTemplate]   = useState(null);
  const [communityTemplateData, setCommunityTemplateData] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [groupId]); // eslint-disable-line

  const canCreate = myRole === 'admin' || myRole === 'member';
  const isAdmin   = myRole === 'admin';

  const togglePin = async (project) => {
    await supabase.from('projects')
      .update({ is_pinned: !project.is_pinned })
      .eq('id', project.id);
    fetchProjects();
  };

  if (showGallery) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TemplateGallery
          user={user}
          onSelectTemplate={(type, communityObj) => {
            setShowGallery(false);
            setPreselectedTemplate(type);
            setCommunityTemplateData(communityObj || null);
            setShowCreate(true);
          }}
          onBack={() => setShowGallery(false)}
        />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {showCreate && (
        <CreateProjectModal
          user={user}
          ownerId={groupId}
          isGroupProject={true}
          preselectedTemplate={preselectedTemplate}
          communityTemplateSource={communityTemplateData}
          onProjectCreated={id => { setShowCreate(false); setPreselectedTemplate(null); setCommunityTemplateData(null); onSelectProject?.(id); fetchProjects(); }}
          onClose={() => { setShowCreate(false); setPreselectedTemplate(null); setCommunityTemplateData(null); }}
          onOpenGallery={() => { setShowCreate(false); setShowGallery(true); }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>Projects</div>
        {canCreate && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn onClick={() => setShowGallery(true)}>🗂️ Browse templates</Btn>
            <Btn variant="s" onClick={() => setShowCreate(true)}>+ New project</Btn>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚀</div>
          <div style={{ fontSize: 16, fontFamily: "'DM Serif Display',serif", marginBottom: 8 }}>No projects yet</div>
          <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6 }}>
            Create a project to coordinate group work — conferences, publications, journal clubs.
          </div>
          {canCreate && <Btn variant="s" onClick={() => setShowCreate(true)}>Create first project</Btn>}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {projects.map(p => (
            <GroupProjectCard
              key={p.id}
              project={p}
              onClick={() => onSelectProject?.(p.id)}
              onTogglePin={isAdmin ? togglePin : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupProjectCard({ project, onClick, onTogglePin }) {
  const [showMenu, setShowMenu] = useState(false);

  const menuBtnStyle = {
    width: '100%', padding: '9px 14px', border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 8,
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: `1px solid ${T.bdr}`, borderRadius: 14,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        overflow: 'hidden', transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ height: 5, background: project.cover_color || T.v }}/>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 24 }}>{project.icon}</span>
            {project.is_pinned && <span style={{ fontSize: 12, opacity: 0.6 }}>📌</span>}
          </div>
          {onTogglePin && (
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowMenu(m => !m)} style={{
                fontSize: 15, color: T.mu, border: 'none', background: 'transparent',
                cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
              }}>···</button>
              {showMenu && (
                <>
                  <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }}/>
                  <div style={{
                    position: 'absolute', top: 26, right: 0, background: T.w,
                    borderRadius: 10, zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,.12)',
                    border: `1px solid ${T.bdr}`, minWidth: 150, overflow: 'hidden',
                  }}>
                    <button onClick={() => { onTogglePin(project); setShowMenu(false); }} style={menuBtnStyle}>
                      {project.is_pinned ? '📌 Unpin' : '📌 Pin to top'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, lineHeight: 1.3 }}>{project.name}</div>
        <div style={{ fontSize: 10.5, color: T.v, fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>
          {project.template_type?.replace(/_/g, ' ')}
        </div>
        {project.description && (
          <div style={{
            fontSize: 11.5, color: T.mu, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', marginBottom: 6,
          }}>
            {project.description}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: T.mu }}>Updated {timeAgo(project.updated_at)}</div>
      </div>
    </div>
  );
}
