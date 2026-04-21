import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import CreateProjectModal from './CreateProjectModal';
import ProjectScreen from './ProjectScreen';
import TemplateGallery from './TemplateGallery';
import SaveAsTemplateModal from './SaveAsTemplateModal';

const isActive = (d) => {
  if (!d) return false;
  return Date.now() - new Date(d).getTime() < 5 * 24 * 60 * 60 * 1000;
};

async function fetchUnreadCounts(projectList, userId) {
  if (!projectList.length) return {};
  const { data: memberships } = await supabase
    .from('project_members')
    .select('project_id, last_read_at')
    .eq('user_id', userId)
    .in('project_id', projectList.map(p => p.id));
  const readMap = {};
  (memberships || []).forEach(m => { readMap[m.project_id] = m.last_read_at; });
  const counts = {};
  await Promise.all(projectList.map(async (project) => {
    const lastRead = readMap[project.id] || '1970-01-01';
    const { count } = await supabase
      .from('project_posts')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .gt('created_at', lastRead);
    counts[project.id] = count || 0;
  }));
  return counts;
}

async function fetchLastActivity(projectList) {
  const activity = {};
  await Promise.all(projectList.map(async (project) => {
    const { data } = await supabase
      .from('project_posts')
      .select('created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1);
    activity[project.id] = data?.[0]?.created_at || null;
  }));
  return activity;
}

export default function ProjectsScreen({ user }) {
  const [projects,              setProjects]              = useState([]);
  const [archivedProjects,      setArchivedProjects]      = useState([]);
  const [showArchived,          setShowArchived]          = useState(false);
  const [loading,               setLoading]               = useState(true);
  const [showCreate,            setShowCreate]            = useState(false);
  const [showGallery,           setShowGallery]           = useState(false);
  const [preselectedTemplate,   setPreselectedTemplate]   = useState(null);
  const [communityTemplateData, setCommunityTemplateData] = useState(null);
  const [activeProject,         setActiveProject]         = useState(null);
  const [unreadCounts,          setUnreadCounts]          = useState({});
  const [lastActivityMap,       setLastActivityMap]       = useState({});
  const [saveAsTemplateProject, setSaveAsTemplateProject] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    const all      = data || [];
    const active   = all.filter(p => p.status !== 'archived');
    const archived = all.filter(p => p.status === 'archived');
    setProjects(active);
    setArchivedProjects(archived);
    setLoading(false);

    if (active.length) {
      const [counts, activity] = await Promise.all([
        fetchUnreadCounts(active, user.id),
        fetchLastActivity(active),
      ]);
      setUnreadCounts(counts);
      setLastActivityMap(activity);
    }
  };

  useEffect(() => { fetchProjects(); }, [user.id]); // eslint-disable-line

  const togglePin = async (project) => {
    await supabase.from('projects')
      .update({ is_pinned: !project.is_pinned })
      .eq('id', project.id);
    fetchProjects();
  };

  const archiveProject = async (project) => {
    if (!window.confirm('Archive this project? It will be read-only. You can unarchive it anytime.')) return;
    await supabase.from('projects').update({ status: 'archived' }).eq('id', project.id);
    fetchProjects();
  };

  const unarchiveProject = async (projectId) => {
    await supabase.from('projects').update({ status: 'active' }).eq('id', projectId);
    fetchProjects();
  };

  if (activeProject) {
    return (
      <ProjectScreen
        projectId={activeProject}
        user={user}
        onBack={() => { setActiveProject(null); fetchProjects(); }}
      />
    );
  }

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
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
      {showCreate && (
        <CreateProjectModal
          user={user}
          ownerId={user.id}
          isGroupProject={false}
          preselectedTemplate={preselectedTemplate}
          communityTemplateSource={communityTemplateData}
          onProjectCreated={id => { setShowCreate(false); setPreselectedTemplate(null); setCommunityTemplateData(null); setActiveProject(id); }}
          onClose={() => { setShowCreate(false); setPreselectedTemplate(null); setCommunityTemplateData(null); }}
          onOpenGallery={() => { setShowCreate(false); setShowGallery(true); }}
        />
      )}

      {saveAsTemplateProject && (
        <SaveAsTemplateModal
          project={saveAsTemplateProject}
          user={user}
          onClose={() => setSaveAsTemplateProject(null)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24 }}>Projects</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn onClick={() => setShowGallery(true)}>🗂️ Browse templates</Btn>
          <Btn variant="s" onClick={() => setShowCreate(true)}>+ New project</Btn>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
      ) : projects.length === 0 && archivedProjects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 18, fontFamily: "'DM Serif Display',serif", marginBottom: 8, color: T.text }}>
            No projects yet
          </div>
          <div style={{ fontSize: 13, color: T.mu, marginBottom: 20, lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
            Projects are activity spaces for your research, writing, and collaboration — from a single conference to a full manuscript.
          </div>
          <Btn variant="s" onClick={() => setShowCreate(true)}>Create your first project</Btn>
        </div>
      ) : (
        <>
          {projects.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 8 }}>
              {projects.map(p => (
                <ProjectBadgeCard
                  key={p.id}
                  project={p}
                  onClick={() => setActiveProject(p.id)}
                  onTogglePin={togglePin}
                  onArchive={archiveProject}
                  onSaveAsTemplate={proj => setSaveAsTemplateProject(proj)}
                  unreadCount={unreadCounts[p.id] || 0}
                  lastActivity={lastActivityMap[p.id] || null}
                  isOwner={true}
                />
              ))}
            </div>
          )}

          {archivedProjects.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setShowArchived(s => !s)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12.5, color: T.mu, fontWeight: 600,
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
                }}>
                <span style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s', display: 'inline-block' }}>▶</span>
                📦 Archived ({archivedProjects.length})
              </button>

              {showArchived && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12, opacity: 0.75 }}>
                  {archivedProjects.map(p => (
                    <ArchivedProjectCard
                      key={p.id}
                      project={p}
                      onUnarchive={() => unarchiveProject(p.id)}
                      onClick={() => setActiveProject(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProjectBadgeCard({ project, onClick, onTogglePin, onArchive, onSaveAsTemplate, unreadCount, lastActivity, isOwner }) {
  const [showMenu, setShowMenu] = useState(false);
  const nudgeKey = `luminary_project_nudge_${project.id}`;
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    const stored = localStorage.getItem(nudgeKey);
    if (!stored) return false;
    return Date.now() - parseInt(stored) < 5 * 24 * 60 * 60 * 1000;
  });

  const dismissNudge = (e) => {
    e.stopPropagation();
    localStorage.setItem(nudgeKey, Date.now().toString());
    setNudgeDismissed(true);
  };

  const menuBtnStyle = {
    width: '100%', padding: '10px 14px', border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 8,
  };

  return (
    <div>
      <div
        onClick={onClick}
        style={{
          background: T.w, borderRadius: 14, overflow: 'hidden',
          border: `1px solid ${T.bdr}`, cursor: 'pointer',
          transition: 'box-shadow .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.10)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
      >
        <div style={{ height: 5, background: project.cover_color || T.v }}/>
        <div style={{ padding: '14px 16px' }}>

          {/* Top row: icon + badges + menu */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 26 }}>{project.icon}</span>
              {project.is_pinned && <span style={{ fontSize: 13, opacity: 0.6 }}>📌</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, background: T.v, color: '#fff',
                  padding: '2px 7px', borderRadius: 20, minWidth: 20, textAlign: 'center',
                }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
              {isOwner && (
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setShowMenu(m => !m)} style={{
                    fontSize: 16, color: T.mu, border: 'none', background: 'transparent',
                    cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
                  }}>···</button>
                  {showMenu && (
                    <>
                      <div onClick={() => setShowMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }}/>
                      <div style={{
                        position: 'absolute', top: 28, right: 0, background: T.w,
                        borderRadius: 10, zIndex: 10, boxShadow: '0 4px 20px rgba(0,0,0,.12)',
                        border: `1px solid ${T.bdr}`, minWidth: 160, overflow: 'hidden',
                      }}>
                        <button onClick={() => { onTogglePin(project); setShowMenu(false); }} style={menuBtnStyle}>
                          {project.is_pinned ? '📌 Unpin' : '📌 Pin to top'}
                        </button>
                        <button onClick={() => { onArchive(project); setShowMenu(false); }} style={{ ...menuBtnStyle, color: T.mu }}>
                          📦 Archive
                        </button>
                        <button onClick={() => { onSaveAsTemplate(project); setShowMenu(false); }} style={menuBtnStyle}>
                          🗂️ Save as template
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, lineHeight: 1.3, paddingRight: 4 }}>{project.name}</div>
          <div style={{ fontSize: 11, color: T.v, fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>
            {project.template_type?.replace(/_/g, ' ')}
          </div>
          {project.description && (
            <div style={{
              fontSize: 12, color: T.mu, lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', marginBottom: 8,
            }}>
              {project.description}
            </div>
          )}

          {/* Activity footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.bdr}`,
          }}>
            <span style={{ fontSize: 11.5, color: T.mu }}>
              {lastActivity ? `Last post ${timeAgo(lastActivity)}` : 'No posts yet'}
            </span>
            {lastActivity && (
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                background: isActive(lastActivity) ? T.gr2 : T.s2,
                color: isActive(lastActivity) ? T.gr : T.mu,
              }}>
                {isActive(lastActivity) ? '🟢 Active' : '⚪ Quiet'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quiet nudge */}
      {!isActive(lastActivity) && lastActivity && !nudgeDismissed && (
        <div style={{
          marginTop: 6, padding: '8px 12px', background: T.am2,
          borderRadius: 9, border: `1px solid rgba(245,158,11,.2)`,
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ flexShrink: 0 }}>💬</span>
          <span style={{ flex: 1, color: T.text }}>No recent activity — time to check in with your team?</span>
          <button onClick={dismissNudge} style={{
            fontSize: 11, color: T.mu, border: 'none',
            background: 'transparent', cursor: 'pointer', flexShrink: 0,
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

function ArchivedProjectCard({ project, onUnarchive, onClick }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.bdr}`, background: T.s2, cursor: 'pointer' }} onClick={onClick}>
      <div style={{ height: 4, background: '#ccc' }}/>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 20, opacity: 0.5 }}>{project.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.mu }}>{project.name}</span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onUnarchive(); }}
          style={{
            fontSize: 11.5, color: T.v, fontWeight: 600,
            border: `1px solid ${T.v}`, background: T.v2,
            borderRadius: 20, padding: '3px 10px',
            cursor: 'pointer', fontFamily: 'inherit', marginTop: 6,
          }}>
          Unarchive
        </button>
      </div>
    </div>
  );
}
