import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import PostCard from '../posts/PostCard';
import PostComposer from '../posts/PostComposer';

export default function ProjectFeed({ project, user, profile, setProfile, myRole, activeFolderId, folders, onViewPaper, onViewGroup, onViewProject, onEditPost, savedPostIds = new Set(), onSaveToggled }) {
  const [posts,       setPosts]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  // Track when user last read this project (for unread badge)
  useEffect(() => {
    if (!project?.id || !user) return;
    supabase
      .from('project_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('user_id', user.id);
  }, [project?.id]); // eslint-disable-line

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('posts_with_meta')
      .select('*')
      .eq('context_kind', 'project')
      .eq('context_id', project.id)
      .eq('hidden', false);

    // Folder filter: when a specific folder is selected, only show posts
    // tagged with that folder_id. "All posts" (activeFolderId === null)
    // shows every post across the project.
    if (activeFolderId) query = query.eq('folder_id', activeFolderId);

    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(50);
    setPosts(data || []);
    setLoading(false);
  }, [project.id, activeFolderId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handlePostCreated = () => {
    setShowCompose(false);
    fetchPosts();
  };

  const canPost = (myRole === 'owner' || myRole === 'member') && project.status !== 'archived';
  const activeFolder = folders.find(f => f.id === activeFolderId);

  // Look up the parent group's name if this project belongs to a group, so we
  // can pass it to the composer for the heads-up banner.
  const [parentGroupName, setParentGroupName] = useState('');
  useEffect(() => {
    if (!project?.group_id) { setParentGroupName(''); return; }
    supabase.from('groups').select('name').eq('id', project.group_id).maybeSingle()
      .then(({ data }) => setParentGroupName(data?.name || ''));
  }, [project?.group_id]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${T.bdr}`,
        background: T.w, fontSize: 12, fontWeight: 700, color: T.mu,
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        {activeFolderId ? `📁 ${activeFolder?.name || 'Folder'}` : '📋 All Posts'}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

        {/* Compose trigger */}
        {canPost && !showCompose && (
          <button onClick={() => setShowCompose(true)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '12px 16px', marginBottom: 16,
            background: T.w, border: `1.5px dashed ${T.bdr}`,
            borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            color: T.mu, fontSize: 13, textAlign: 'left',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.v}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
          >
            ✏️ Post something in {activeFolderId ? activeFolder?.name : 'this project'}…
          </button>
        )}

        {showCompose && (
          <div style={{ marginBottom: 16 }}>
            <PostComposer
              context={{
                kind: 'project',
                projectId:        project.id,
                projectName:      project.name,
                projectGroupId:   project.group_id || null,
                projectGroupName: parentGroupName || null,
                folderId:         activeFolderId || null,
                folderName:       activeFolder?.name || null,
              }}
              user={user}
              profile={profile}
              setProfile={setProfile}
              onPublished={handlePostCreated}
              onCancel={() => setShowCompose(false)}
            />
          </div>
        )}

        {/* Posts */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
        ) : posts.length === 0 ? (
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✨</div>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 6 }}>
              {activeFolderId ? `${activeFolder?.name} is empty` : 'No posts yet'}
            </div>
            <div style={{ fontSize: 13, color: T.mu }}>
              {canPost ? 'Be the first to post here.' : 'Nothing here yet.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {posts.map(p => (
              <PostCard
                key={p.id}
                post={p}
                currentUserId={user?.id}
                currentProfile={profile}
                onRefresh={fetchPosts}
                onViewPaper={onViewPaper}
                onViewGroup={onViewGroup}
                onViewProject={onViewProject}
                onEditPost={onEditPost}
                isSaved={savedPostIds.has(p.id)}
                onSaveToggled={onSaveToggled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
