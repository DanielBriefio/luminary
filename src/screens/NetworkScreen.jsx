import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';

export default function NetworkScreen({ user, profile, onViewUser, onViewPaper }) {
  const [loading,        setLoading]        = useState(true);
  const [friends,        setFriends]        = useState([]);
  const [followingOnly,  setFollowingOnly]  = useState([]);
  const [followerOnly,   setFollowerOnly]   = useState([]);
  const [suggested,      setSuggested]      = useState([]);
  const [saving,         setSaving]         = useState({});
  const [listModal,      setListModal]      = useState(null); // 'following' | 'followers' | null
  const [followedPapers, setFollowedPapers] = useState([]);
  const [unfollowingDoi, setUnfollowingDoi] = useState({});

  useEffect(() => { load(); }, [user.id]); // eslint-disable-line

  async function load() {
    setLoading(true);

    const [{ data: myFollowsData }, { data: myFollowersData }, { data: paperFollows }] = await Promise.all([
      supabase.from('follows').select('target_id').eq('follower_id', user.id).eq('target_type', 'user'),
      supabase.from('follows').select('follower_id').eq('target_id', user.id).eq('target_type', 'user'),
      supabase.from('follows').select('target_id, created_at').eq('follower_id', user.id).eq('target_type', 'paper').order('created_at', { ascending: false }),
    ]);

    const myFollowingIds = [...new Set((myFollowsData  || []).map(f => f.target_id))];
    const myFollowerIds  = [...new Set((myFollowersData || []).map(f => f.follower_id))];

    const followingSet = new Set(myFollowingIds);
    const followerSet  = new Set(myFollowerIds);

    const friendIds      = myFollowingIds.filter(id =>  followerSet.has(id));
    const followOnlyIds  = myFollowingIds.filter(id => !followerSet.has(id));
    const followerOnlyIds= myFollowerIds .filter(id => !followingSet.has(id));

    // Fetch profiles for all known connections
    const connectionIds = [...new Set([...friendIds, ...followOnlyIds, ...followerOnlyIds])];
    let profileMap = {};
    if (connectionIds.length > 0) {
      const { data: rows } = await supabase
        .from('profiles')
        .select('id, name, title, institution, avatar_color, avatar_url')
        .in('id', connectionIds);
      (rows || []).forEach(p => { profileMap[p.id] = p; });
    }

    setFriends      (friendIds      .map(id => profileMap[id]).filter(Boolean));
    setFollowingOnly(followOnlyIds  .map(id => profileMap[id]).filter(Boolean));
    setFollowerOnly (followerOnlyIds.map(id => profileMap[id]).filter(Boolean));

    // Suggestions — 2nd-degree connections (people my followees follow)
    const alreadyKnown = new Set([...myFollowingIds, ...myFollowerIds, user.id]);
    let suggestProfiles = [];

    if (myFollowingIds.length > 0) {
      const { data: secondDegree } = await supabase
        .from('follows')
        .select('target_id')
        .in('follower_id', myFollowingIds)
        .eq('target_type', 'user');

      const suggestIds = [...new Set((secondDegree || []).map(f => f.target_id))]
        .filter(id => !alreadyKnown.has(id))
        .slice(0, 8);

      if (suggestIds.length > 0) {
        const { data: suggestRows } = await supabase
          .from('profiles')
          .select('id, name, title, institution, avatar_color, avatar_url')
          .in('id', suggestIds);
        suggestProfiles = suggestRows || [];
      }
    }

    // Fallback: same institution
    if (suggestProfiles.length < 4 && profile?.institution) {
      const alreadyInSuggest = new Set(suggestProfiles.map(p => p.id));
      const { data: instRows } = await supabase
        .from('profiles')
        .select('id, name, title, institution, avatar_color, avatar_url')
        .ilike('institution', profile.institution)
        .neq('id', user.id)
        .limit(12);
      const extra = (instRows || []).filter(p => !alreadyKnown.has(p.id) && !alreadyInSuggest.has(p.id));
      suggestProfiles = [...suggestProfiles, ...extra].slice(0, 8);
    }

    const seenSuggest = new Set();
    setSuggested(suggestProfiles.filter(p => !seenSuggest.has(p.id) && seenSuggest.add(p.id)));

    // Fetch paper metadata for followed papers
    const followedDois = (paperFollows || []).map(f => f.target_id);
    if (followedDois.length > 0) {
      const { data: paperPosts } = await supabase
        .from('posts')
        .select('paper_doi, paper_title, paper_journal, paper_year, paper_authors')
        .in('paper_doi', followedDois)
        .eq('post_type', 'paper');

      // Deduplicate by DOI, keeping first occurrence (best metadata)
      const metaByDoi = {};
      (paperPosts || []).forEach(p => {
        if (!metaByDoi[p.paper_doi]) metaByDoi[p.paper_doi] = p;
      });

      // Preserve the follow order and include DOIs even if no post found
      setFollowedPapers(followedDois.map(doi => ({
        doi,
        paper_title:   metaByDoi[doi]?.paper_title   || null,
        paper_journal: metaByDoi[doi]?.paper_journal || null,
        paper_year:    metaByDoi[doi]?.paper_year    || null,
        paper_authors: metaByDoi[doi]?.paper_authors || null,
      })));
    } else {
      setFollowedPapers([]);
    }

    setLoading(false);
  }

  const followUser = async (targetId, from) => {
    setSaving(prev => ({ ...prev, [targetId]: true }));
    await supabase.from('follows').insert({ follower_id: user.id, target_type: 'user', target_id: targetId });

    if (from === 'follower') {
      // They follow me → now mutual → move to friends
      setFollowerOnly(prev => prev.filter(p => p.id !== targetId));
      setFriends(prev => {
        if (prev.some(p => p.id === targetId)) return prev;
        const person = followerOnly.find(p => p.id === targetId);
        return person ? [...prev, person] : prev;
      });
    } else if (from === 'suggested') {
      // They don't follow me → move to followingOnly
      setSuggested(prev => prev.filter(p => p.id !== targetId));
      setFollowingOnly(prev => {
        if (prev.some(p => p.id === targetId)) return prev;
        const person = suggested.find(p => p.id === targetId);
        return person ? [...prev, person] : prev;
      });
    }

    setSaving(prev => ({ ...prev, [targetId]: false }));
  };

  const unfollowUser = async (targetId, from) => {
    setSaving(prev => ({ ...prev, [targetId]: true }));
    await supabase.from('follows').delete()
      .eq('follower_id', user.id).eq('target_type', 'user').eq('target_id', targetId);

    if (from === 'friend') {
      // They still follow me → become followerOnly
      setFriends(prev => prev.filter(p => p.id !== targetId));
      setFollowerOnly(prev => {
        if (prev.some(p => p.id === targetId)) return prev;
        const person = friends.find(p => p.id === targetId);
        return person ? [...prev, person] : prev;
      });
    } else if (from === 'following') {
      setFollowingOnly(prev => prev.filter(p => p.id !== targetId));
    }

    setSaving(prev => ({ ...prev, [targetId]: false }));
  };

  const unfollowPaper = async (doi) => {
    setUnfollowingDoi(prev => ({ ...prev, [doi]: true }));
    await supabase.from('follows').delete()
      .eq('follower_id', user.id).eq('target_type', 'paper').eq('target_id', doi);
    setFollowedPapers(prev => prev.filter(p => p.doi !== doi));
    setUnfollowingDoi(prev => ({ ...prev, [doi]: false }));
  };

  const totalFollowing  = friends.length + followingOnly.length;
  const totalFollowers  = friends.length + followerOnly.length;
  const noConnections   = friends.length === 0 && followingOnly.length === 0 && followerOnly.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '13px 20px', flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20 }}>My Network</div>
        <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>Manage your connections and discover researchers</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}><Spinner /></div>
          : (
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 264px', gap: 16, alignItems: 'start' }}>

                {/* ── Left column ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Stats strip */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { count: friends.length,          label: 'Friends',        color: T.v,  bg: T.v2,  onClick: null },
                      { count: totalFollowing,           label: 'Following',      color: T.gr, bg: T.gr2, onClick: () => setListModal('following') },
                      { count: totalFollowers,           label: 'Followers',      color: T.bl, bg: T.bl2, onClick: () => setListModal('followers') },
                      { count: followedPapers.length,    label: 'Papers',         color: T.am, bg: T.am2, onClick: null },
                    ].map(({ count, label, color, bg, onClick }) => (
                      <div
                        key={label}
                        onClick={onClick || undefined}
                        style={{ flex: 1, background: bg, borderRadius: 12, padding: '14px 0', textAlign: 'center', border: `1px solid ${color}30`, cursor: onClick ? 'pointer' : 'default' }}
                      >
                        <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "'DM Serif Display',serif", color }}>{count}</div>
                        <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Friends */}
                  <SectionCard
                    icon="🤝"
                    title="Friends"
                    count={friends.length}
                    subtitle="People you follow who follow you back"
                  >
                    {friends.length === 0
                      ? <Empty icon="🤝" message="No friends yet — follow someone back and you'll appear here." />
                      : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {friends.map(p => (
                            <FriendCard
                              key={p.id}
                              person={p}
                              saving={saving[p.id]}
                              onView={() => onViewUser(p.id)}
                              onUnfollow={() => unfollowUser(p.id, 'friend')}
                            />
                          ))}
                        </div>
                      )
                    }
                  </SectionCard>

                  {/* Friend suggestions — followers I haven't followed back */}
                  {followerOnly.length > 0 && (
                    <SectionCard
                      icon="✨"
                      title="Friend Suggestions"
                      count={followerOnly.length}
                      subtitle="They follow you — follow back to become friends"
                    >
                      {followerOnly.map((p, i) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          isLast={i === followerOnly.length - 1}
                          onView={() => onViewUser(p.id)}
                          action={
                            <ActionBtn
                              label="Follow back"
                              variant="solid"
                              saving={saving[p.id]}
                              onClick={() => followUser(p.id, 'follower')}
                            />
                          }
                        />
                      ))}
                    </SectionCard>
                  )}

                  {/* Following (not yet mutual) */}
                  {followingOnly.length > 0 && (
                    <SectionCard
                      icon="→"
                      title="Following"
                      count={followingOnly.length}
                      subtitle="You follow them — not following back yet"
                    >
                      {followingOnly.map((p, i) => (
                        <PersonRow
                          key={p.id}
                          person={p}
                          isLast={i === followingOnly.length - 1}
                          onView={() => onViewUser(p.id)}
                          action={
                            <ActionBtn
                              label="Following"
                              variant="muted"
                              saving={saving[p.id]}
                              onClick={() => unfollowUser(p.id, 'following')}
                            />
                          }
                        />
                      ))}
                    </SectionCard>
                  )}

                  {/* Papers I'm Following */}
                  <SectionCard
                    icon="📄"
                    title="Papers I'm Following"
                    count={followedPapers.length}
                    subtitle="Papers you'll get notified about when someone comments"
                  >
                    {followedPapers.length === 0
                      ? <Empty icon="📄" message="You're not following any papers yet. Follow a paper from the feed to track discussions." />
                      : followedPapers.map((paper, i) => (
                          <PaperRow
                            key={paper.doi}
                            paper={paper}
                            isLast={i === followedPapers.length - 1}
                            saving={unfollowingDoi[paper.doi]}
                            onUnfollow={() => unfollowPaper(paper.doi)}
                            onClick={onViewPaper ? () => onViewPaper(paper.doi) : null}
                          />
                        ))
                    }
                  </SectionCard>

                  {/* Zero-state */}
                  {noConnections && (
                    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '40px 28px', textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                      <div style={{ fontSize: 40, marginBottom: 14 }}>🌱</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, marginBottom: 8 }}>Start building your network</div>
                      <div style={{ fontSize: 13, color: T.mu, maxWidth: 320, margin: '0 auto', lineHeight: 1.7 }}>
                        Follow researchers from your feed or Explore section. People who follow you back will appear here as friends.
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Right column — suggestions ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {suggested.length > 0 && (
                    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: T.mu, fontWeight: 700, marginBottom: 14 }}>
                        People You May Know
                      </div>
                      {suggested.map((p, i) => (
                        <div key={p.id}>
                          <SuggestRow
                            person={p}
                            saving={saving[p.id]}
                            onView={() => onViewUser(p.id)}
                            onFollow={() => followUser(p.id, 'suggested')}
                          />
                          {i < suggested.length - 1 && <div style={{ height: 1, background: T.bdr, margin: '10px 0' }} />}
                        </div>
                      ))}
                    </div>
                  )}

                  {suggested.length === 0 && !noConnections && (
                    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '16px', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
                      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: T.mu, fontWeight: 700, marginBottom: 10 }}>
                        People You May Know
                      </div>
                      <div style={{ fontSize: 12, color: T.mu, lineHeight: 1.6 }}>
                        No suggestions right now. As your network grows, we'll surface researchers you might know.
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )
        }
      </div>
      {/* ── List modal (Following / Followers) ── */}
      {listModal && (() => {
        const isFollowingType = listModal === 'following';
        const rawList = isFollowingType ? [...friends, ...followingOnly] : [...friends, ...followerOnly];
        const seen = new Set();
        const modalList = rawList.filter(p => !seen.has(p.id) && seen.add(p.id));
        return (
          <div
            onClick={() => setListModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(27,29,54,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: T.w, borderRadius: 16, width: 420, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(108,99,255,.18)', overflow: 'hidden' }}
            >
              {/* Modal header */}
              <div style={{ padding: '16px 20px 14px', borderBottom: `1px solid ${T.bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div>
                  <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17 }}>
                    {isFollowingType ? 'Following' : 'Followers'}
                  </span>
                  <span style={{ marginLeft: 8, background: T.v2, color: T.v, fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20 }}>
                    {modalList.length}
                  </span>
                </div>
                <button
                  onClick={() => setListModal(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.mu, lineHeight: 1, padding: '2px 4px', fontFamily: 'inherit' }}
                >
                  ×
                </button>
              </div>

              {/* Modal list */}
              <div style={{ overflowY: 'auto', padding: '6px 20px 16px' }}>
                {modalList.length === 0
                  ? <div style={{ textAlign: 'center', padding: '32px 0', color: T.mu, fontSize: 13 }}>Nobody here yet.</div>
                  : modalList.map((p, i) => {
                      const isFriend = friends.some(f => f.id === p.id);
                      return (
                        <PersonRow
                          key={p.id}
                          person={p}
                          isLast={i === modalList.length - 1}
                          onView={() => { setListModal(null); onViewUser(p.id); }}
                          action={
                            isFollowingType
                              ? <ActionBtn
                                  label={isFriend ? 'Friends' : 'Following'}
                                  variant="muted"
                                  saving={saving[p.id]}
                                  onClick={() => unfollowUser(p.id, isFriend ? 'friend' : 'following')}
                                />
                              : isFriend
                                ? <ActionBtn label="Friends" variant="muted" saving={saving[p.id]} onClick={() => unfollowUser(p.id, 'friend')} />
                                : <ActionBtn label="Follow back" variant="solid" saving={saving[p.id]} onClick={() => followUser(p.id, 'follower')} />
                          }
                        />
                      );
                    })
                }
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function SectionCard({ icon, title, count, subtitle, children }) {
  return (
    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
      <div style={{ padding: '13px 18px 11px', borderBottom: `1px solid ${T.bdr}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15 }}>{title}</span>
          <span style={{ background: T.v2, color: T.v, fontSize: 10.5, fontWeight: 700, padding: '1px 8px', borderRadius: 20, marginLeft: 2 }}>{count}</span>
        </div>
        {subtitle && <div style={{ fontSize: 11.5, color: T.mu, marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

function Empty({ icon, message }) {
  return (
    <div style={{ textAlign: 'center', padding: '22px 0', color: T.mu }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{message}</div>
    </div>
  );
}

function FriendCard({ person, onView, onUnfollow, saving }) {
  return (
    <div
      onClick={onView}
      style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: '14px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}
    >
      <div style={{ border: `2.5px solid ${T.v}`, borderRadius: '50%', padding: 2, flexShrink: 0 }}>
        <Av color={person.avatar_color || 'me'} size={42} name={person.name} url={person.avatar_url || ''} />
      </div>
      <div style={{ minWidth: 0, width: '100%' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name || 'Researcher'}</div>
        {person.title && <div style={{ fontSize: 11, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{person.title}</div>}
        {person.institution && <div style={{ fontSize: 11, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.institution}</div>}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onUnfollow(); }}
        disabled={saving}
        style={{ fontSize: 10.5, padding: '3px 11px', borderRadius: 20, border: `1.5px solid ${T.bdr}`, background: T.w, color: T.mu, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: saving ? .6 : 1 }}
      >
        {saving ? '...' : '✓ Friends'}
      </button>
    </div>
  );
}

function PersonRow({ person, onView, action, isLast }) {
  return (
    <div
      onClick={onView}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`, cursor: 'pointer' }}
    >
      <Av color={person.avatar_color || 'me'} size={38} name={person.name} url={person.avatar_url || ''} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {person.name || 'Researcher'}
        </div>
        {(person.title || person.institution) && (
          <div style={{ fontSize: 11.5, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[person.title, person.institution].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div onClick={e => e.stopPropagation()}>{action}</div>
    </div>
  );
}

function ActionBtn({ label, variant, saving, onClick }) {
  const solid = variant === 'solid';
  return (
    <button
      onClick={onClick}
      disabled={saving}
      style={{
        fontSize: 11, padding: '4px 12px', borderRadius: 20,
        border: `1.5px solid ${solid ? T.v : T.bdr}`,
        background: solid ? T.v : T.w,
        color: solid ? '#fff' : T.mu,
        cursor: saving ? 'default' : 'pointer',
        fontWeight: 600, fontFamily: 'inherit',
        opacity: saving ? .6 : 1, whiteSpace: 'nowrap',
      }}
    >
      {saving ? '...' : solid ? `+ ${label}` : `✓ ${label}`}
    </button>
  );
}

function PaperRow({ paper, isLast, onUnfollow, saving, onClick }) {
  const title = paper.paper_title || paper.doi;
  const meta  = [paper.paper_journal, paper.paper_year].filter(Boolean).join(' · ');
  return (
    <div
      onClick={onClick || undefined}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 8, background: T.am2, border: `1px solid ${T.am}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        📄
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {title}
        </div>
        {meta && <div style={{ fontSize: 11, color: T.mu, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
        <div style={{ fontSize: 10.5, color: T.mu, marginTop: 3, fontFamily: 'monospace', opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{paper.doi}</div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onUnfollow(); }}
        disabled={saving}
        style={{ fontSize: 10.5, padding: '3px 11px', borderRadius: 20, border: `1.5px solid ${T.bdr}`, background: T.w, color: T.mu, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: saving ? .6 : 1, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}
      >
        {saving ? '...' : '✓ Following'}
      </button>
    </div>
  );
}

function SuggestRow({ person, onView, onFollow, saving }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={onView}>
      <Av color={person.avatar_color || 'me'} size={34} name={person.name} url={person.avatar_url || ''} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {person.name || 'Researcher'}
        </div>
        {(person.title || person.institution) && (
          <div style={{ fontSize: 11, color: T.mu, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[person.title, person.institution].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div onClick={e => e.stopPropagation()}>
        <button
          onClick={onFollow}
          disabled={saving}
          style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, border: `1.5px solid ${T.v}`, background: 'transparent', color: T.v, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: saving ? .6 : 1, whiteSpace: 'nowrap' }}
        >
          {saving ? '...' : '+ Follow'}
        </button>
      </div>
    </div>
  );
}
