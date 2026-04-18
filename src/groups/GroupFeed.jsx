import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import GroupPostCard from './GroupPostCard';
import GroupNewPost from './GroupNewPost';

export default function GroupFeed({ groupId, groupName, user, profile, myRole, onViewPaper, onMarkRead }) {
  const [posts,      setPosts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showCompose,setShowCompose]= useState(false);
  const [likedSet,   setLikedSet]   = useState(new Set());

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('group_posts_with_meta')
      .select('*')
      .eq('group_id', groupId)
      .order('is_sticky', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    const rows = data || [];

    // Fetch user's likes for these posts
    if (user && rows.length) {
      const ids = rows.map(p => p.id);
      const { data: likes } = await supabase
        .from('group_post_likes')
        .select('post_id')
        .eq('user_id', user.id)
        .in('post_id', ids);
      setLikedSet(new Set((likes || []).map(l => l.post_id)));
    }

    setPosts(rows);
    setLoading(false);
  }, [groupId, user]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Mark group as read when feed is opened
  useEffect(() => {
    if (!groupId || !user) return;
    supabase.from('group_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('group_id', groupId).eq('user_id', user.id)
      .then(() => { onMarkRead?.(); });
  }, [groupId]); // eslint-disable-line

  const handlePostCreated = () => {
    setShowCompose(false);
    fetchPosts();
  };

  const canPost = myRole === 'admin' || myRole === 'member';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>

      {/* Compose button / composer */}
      {canPost && !showCompose && (
        <button
          onClick={() => setShowCompose(true)}
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

      {showCompose && (
        <div style={{ marginBottom: 16 }}>
          <GroupNewPost
            groupId={groupId}
            groupName={groupName}
            user={user}
            onPostCreated={handlePostCreated}
            onCancel={() => setShowCompose(false)}
          />
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner/></div>
      ) : posts.length === 0 ? (
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, marginBottom: 8 }}>Group feed is empty</div>
          <div style={{ fontSize: 13, color: T.mu }}>
            {canPost
              ? 'Be the first to post — share a paper, update, or question.'
              : 'No posts in this group yet.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map(p => (
            <GroupPostCard
              key={p.id}
              post={{ ...p, user_liked: likedSet.has(p.id) }}
              currentUserId={user?.id}
              currentProfile={profile}
              groupName={groupName}
              myRole={myRole}
              onRefresh={fetchPosts}
              onViewPaper={onViewPaper}
            />
          ))}
        </div>
      )}
    </div>
  );
}
