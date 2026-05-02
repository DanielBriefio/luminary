import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import PostCard from '../posts/PostCard';

export default function GroupFeed({ groupId, groupName, groupIsPublic, user, profile, myRole, isGroupOwner, onViewPaper, onViewGroup, onViewProject, onEditPost, onOpenCompose, onMarkRead, savedPostIds = new Set(), onSaveToggled }) {
  const [posts,         setPosts]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [groupProjects, setGroupProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState(null);

  useEffect(() => {
    supabase.from('projects').select('id, name, icon, cover_color')
      .eq('group_id', groupId).eq('status', 'active').order('updated_at', { ascending: false })
      .then(({ data }) => setGroupProjects(data || []));
  }, [groupId]);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    let rows = [];

    if (projectFilter) {
      const { data } = await supabase
        .from('posts_with_meta')
        .select('*')
        .eq('context_kind', 'project')
        .eq('context_id', projectFilter)
        .eq('hidden', false)
        .order('pinned_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      rows = data || [];
    } else {
      const { data } = await supabase
        .from('posts_with_meta')
        .select('*')
        .eq('context_kind', 'group')
        .eq('context_id', groupId)
        .eq('hidden', false)
        .order('pinned_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      rows = data || [];
    }

    setPosts(rows);
    setLoading(false);
  }, [groupId, projectFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Mark group as read when feed is opened
  useEffect(() => {
    if (!groupId || !user) return;
    supabase.from('group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', groupId).eq('user_id', user.id)
      .then(() => { onMarkRead?.(); });
  }, [groupId]); // eslint-disable-line

  const canPost = myRole === 'admin' || myRole === 'member';

  const openCompose = () => {
    onOpenCompose?.({ kind: 'group', groupId, groupName, groupIsPublic });
  };

  const chipStyle = (active, color) => ({
    padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? (color || T.v) : T.bdr}`,
    background: active ? `${(color || T.v)}22` : T.w, color: active ? (color || T.v) : T.mu,
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 700 : 500,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Project filter chips */}
      {groupProjects.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 16px',
          borderBottom: `1px solid ${T.bdr}`, background: T.w,
          flexWrap: 'wrap', flexShrink: 0,
        }}>
          <button onClick={() => setProjectFilter(null)} style={chipStyle(!projectFilter, T.v)}>
            📋 All posts
          </button>
          {groupProjects.map(p => (
            <button key={p.id} onClick={() => setProjectFilter(p.id)}
              style={chipStyle(projectFilter === p.id, p.cover_color)}>
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

      {/* Compose trigger — opens the App-level composer screen with group context */}
      {canPost && !projectFilter && (
        <button
          onClick={openCompose}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '12px 16px', marginBottom: 16,
            background: T.w, border: `1.5px dashed ${T.bdr}`,
            borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
            color: T.mu, fontSize: 13, textAlign: 'left',
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = T.v}
          onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
        >
          ✏️ Share something with the group…
        </button>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
      ) : posts.length === 0 ? (
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, marginBottom: 8 }}>
            {projectFilter ? 'No posts in this project yet' : 'Group feed is empty'}
          </div>
          <div style={{ fontSize: 13, color: T.mu }}>
            {!projectFilter && (canPost ? 'Be the first to post — share a paper, update, or question.' : 'No posts in this group yet.')}
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
              canPin={isGroupOwner && !projectFilter}
              hideContextBanner={!projectFilter}
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
