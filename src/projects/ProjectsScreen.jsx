import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import CreateProjectModal from './CreateProjectModal';
import ProjectScreen from './ProjectScreen';

export default function ProjectsScreen({ user }) {
  const [projects,       setProjects]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showCreate,     setShowCreate]     = useState(false);
  const [activeProject,  setActiveProject]  = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [user.id]); // eslint-disable-line

  if (activeProject) {
    return (
      <ProjectScreen
        projectId={activeProject}
        user={user}
        onBack={() => { setActiveProject(null); fetchProjects(); }}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
      {showCreate && (
        <CreateProjectModal
          user={user}
          ownerId={user.id}
          isGroupProject={false}
          onProjectCreated={id => { setShowCreate(false); setActiveProject(id); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24 }}>Projects</div>
        <Btn variant="s" onClick={() => setShowCreate(true)}>+ New project</Btn>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
      ) : projects.length === 0 ? (
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} onClick={() => setActiveProject(p.id)}/>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: '#fff', border: `1px solid ${T.bdr}`, borderRadius: 14,
      padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      overflow: 'hidden', transition: 'box-shadow .15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Colour bar */}
      <div style={{ height: 5, background: project.cover_color || T.v }}/>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 26, marginBottom: 6 }}>{project.icon}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, lineHeight: 1.3 }}>{project.name}</div>
        <div style={{ fontSize: 11, color: T.v, fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>
          {project.template_type?.replace('_', ' ')}
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
        <div style={{ fontSize: 11, color: T.mu }}>
          Updated {timeAgo(project.updated_at)}
        </div>
      </div>
    </button>
  );
}
