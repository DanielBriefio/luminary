import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import CreateProjectModal from '../projects/CreateProjectModal';
import ProjectScreen from '../projects/ProjectScreen';

export default function GroupProjects({ groupId, user, myRole }) {
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [activeProject, setActiveProject] = useState(null);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('group_id', groupId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false });
    setProjects(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [groupId]); // eslint-disable-line

  if (activeProject) {
    return (
      <ProjectScreen
        projectId={activeProject}
        user={user}
        onBack={() => { setActiveProject(null); fetchProjects(); }}
      />
    );
  }

  const canCreate = myRole === 'admin' || myRole === 'member';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {showCreate && (
        <CreateProjectModal
          user={user}
          ownerId={groupId}
          isGroupProject={true}
          onProjectCreated={id => { setShowCreate(false); setActiveProject(id); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>Projects</div>
        {canCreate && (
          <Btn variant="s" onClick={() => setShowCreate(true)}>+ New project</Btn>
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
            <GroupProjectCard key={p.id} project={p} onClick={() => setActiveProject(p.id)}/>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupProjectCard({ project, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: '#fff', border: `1px solid ${T.bdr}`, borderRadius: 14,
      padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
      overflow: 'hidden', transition: 'box-shadow .15s',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ height: 5, background: project.cover_color || T.v }}/>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>{project.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, lineHeight: 1.3 }}>{project.name}</div>
        <div style={{ fontSize: 10.5, color: T.v, fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>
          {project.template_type?.replace('_', ' ')}
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
    </button>
  );
}
