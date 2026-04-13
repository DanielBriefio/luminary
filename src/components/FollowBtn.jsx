import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';

/**
 * Reusable follow/unfollow button.
 *
 * Props:
 *   targetType  'user' | 'paper' | 'group'
 *   targetId    UUID string (user/group) or DOI string (paper)
 *   currentUserId  UUID of the logged-in user — if null, renders nothing
 *   label       optional override for the follow label (default: 'Follow')
 */
export default function FollowBtn({ targetType, targetId, currentUserId, label = 'Follow' }) {
  const [following, setFollowing] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!currentUserId || !targetId) { setLoading(false); return; }
    supabase
      .from('follows')
      .select('id')
      .eq('follower_id', currentUserId)
      .eq('target_type', targetType)
      .eq('target_id',   targetId)
      .maybeSingle()
      .then(({ data }) => { setFollowing(!!data); setLoading(false); });
  }, [currentUserId, targetType, targetId]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (!currentUserId || saving) return;
    setSaving(true);
    if (following) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('target_type', targetType)
        .eq('target_id',   targetId);
      setFollowing(false);
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, target_type: targetType, target_id: targetId });
      setFollowing(true);
    }
    setSaving(false);
  };

  if (!currentUserId || loading) return null;

  return (
    <button
      onClick={toggle}
      disabled={saving}
      style={{
        fontSize: 11,
        padding: '4px 11px',
        borderRadius: 20,
        border: `1.5px solid ${following ? T.bdr : T.v}`,
        background: following ? T.w : T.v,
        color: following ? T.mu : '#fff',
        cursor: saving ? 'default' : 'pointer',
        fontWeight: 600,
        fontFamily: 'inherit',
        flexShrink: 0,
        transition: 'all .15s',
        opacity: saving ? .6 : 1,
      }}
    >
      {saving ? '...' : following ? '✓ Following' : `+ ${label}`}
    </button>
  );
}
