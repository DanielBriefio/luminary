import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T, TAXONOMY, TIER1_LIST } from '../lib/constants';
import Spinner from '../components/Spinner';
import PostCard from '../feed/PostCard';
import Av from '../components/Av';
import Btn from '../components/Btn';
import FollowBtn from '../components/FollowBtn';
import { timeAgo, buildCitationFromEpmc } from '../lib/utils';

// ─── Researcher result card ───────────────────────────────────────────────────

function ResearcherCard({ user, currentUserId, onViewUser }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 0', borderBottom: `1px solid ${T.bdr}`,
      }}
    >
      <div
        onClick={() => onViewUser && onViewUser(user.id)}
        style={{ cursor: onViewUser ? 'pointer' : 'default', flexShrink: 0 }}
      >
        <Av size={44} color={user.avatar_color} name={user.name} url={user.avatar_url} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={() => onViewUser && onViewUser(user.id)}
          style={{ fontSize: 13, fontWeight: 700, cursor: onViewUser ? 'pointer' : 'default' }}
        >
          {user.name}
        </div>
        {user.title && (
          <div style={{ fontSize: 12, color: T.v, fontWeight: 600 }}>{user.title}</div>
        )}
        {user.institution && (
          <div style={{ fontSize: 12, color: T.mu }}>{user.institution}</div>
        )}
        {user.topic_interests?.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
            {user.topic_interests.slice(0, 4).map(t => (
              <span key={t} style={{
                fontSize: 10.5, padding: '2px 8px', borderRadius: 20,
                background: T.v2, color: T.v, fontWeight: 600,
              }}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      {currentUserId && currentUserId !== user.id && (
        <FollowBtn targetType="user" targetId={user.id} currentUserId={currentUserId} />
      )}
    </div>
  );
}

// ─── Paper search result card (Posts tab — one card per unique DOI) ──────────

function PaperSearchCard({ post, currentUserId, onViewPaper }) {
  const doiUrl = post.paper_doi ? `https://doi.org/${post.paper_doi}` : null;
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12,
      padding: '14px 16px', boxShadow: '0 1px 4px rgba(108,99,255,.06)',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: T.v, background: T.v2,
          padding: '2px 8px', borderRadius: 20,
        }}>PAPER</span>
        {post._discussionCount > 0 && (
          <span style={{ fontSize: 11, color: T.mu }}>
            {post._discussionCount} discussion{post._discussionCount !== 1 ? 's' : ''} on Luminary
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>
        {post.paper_title}
      </div>
      {post.paper_authors && (
        <div style={{
          fontSize: 12, color: T.mu, marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {post.paper_authors}
        </div>
      )}
      {(post.paper_citation || post.paper_journal) && (
        <div style={{ fontSize: 12, color: T.mu, marginBottom: 10 }}>
          {post.paper_citation || post.paper_journal}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {doiUrl && (
          <Btn style={{ fontSize: 11.5 }} onClick={() => window.open(doiUrl, '_blank')}>
            Open paper
          </Btn>
        )}
        {post.paper_doi && (
          <Btn variant="v" style={{ fontSize: 11.5 }} onClick={() => onViewPaper && onViewPaper(post.paper_doi)}>
            Discussion
          </Btn>
        )}
        {post.paper_doi && currentUserId && (
          <FollowBtn targetType="paper" targetId={post.paper_doi} currentUserId={currentUserId} />
        )}
      </div>
    </div>
  );
}

// ─── Papers tab helper components ────────────────────────────────────────────

function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase',
      letterSpacing: '.06em', marginBottom: 10, marginTop: 4,
    }}>
      {label}
    </div>
  );
}

function DiscussedCard({ post, onViewPost }) {
  return (
    <div style={{
      background: T.s2, borderRadius: 12, padding: '12px 14px',
      marginBottom: 8, border: `1px solid ${T.bdr}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.v, marginBottom: 4 }}>
        💬 {post.author_name} · {timeAgo(post.created_at)}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>
        {post.paper_title || post.content?.slice(0, 120)}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: T.mu, alignItems: 'center' }}>
        <span>❤️ {post.like_count || 0}</span>
        <span>💬 {post.comment_count || 0}</span>
        {onViewPost && (
          <button
            onClick={() => onViewPost(post)}
            style={{
              color: T.v, fontWeight: 600, border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', marginLeft: 'auto',
            }}
          >
            View discussion →
          </button>
        )}
      </div>
    </div>
  );
}

function ProfilePubCard({ pub, onViewUser }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 14px',
      background: T.s2, borderRadius: 12, marginBottom: 8, border: `1px solid ${T.bdr}`,
      alignItems: 'flex-start',
    }}>
      <Av
        size={32}
        color={pub.profiles?.avatar_color}
        name={pub.profiles?.name}
        url={pub.profiles?.avatar_url}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 2 }}>
          {pub.title}
        </div>
        <div style={{ fontSize: 11.5, color: T.mu }}>
          {pub.journal}{pub.year ? ` · ${pub.year}` : ''}
          {pub.cited_by_count > 0 ? ` · ${pub.cited_by_count} citations` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: T.v, marginTop: 3 }}>
          In {pub.profiles?.name}'s publications
        </div>
      </div>
      {onViewUser && pub.profiles?.id && (
        <button
          onClick={() => onViewUser(pub.profiles.id)}
          style={{
            color: T.v, fontWeight: 600, border: 'none', background: 'transparent',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, flexShrink: 0,
          }}
        >
          View profile →
        </button>
      )}
    </div>
  );
}

function EpmcCard({ paper, currentUserId, onNavigateToPost }) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const cleanTitle = (t) => t?.replace(/<[^>]+>/g, '') || '';

  const handleShare = () => {
    sessionStorage.setItem('prefill_paper', JSON.stringify({
      doi:      paper.doi || '',
      title:    cleanTitle(paper.title),
      journal:  paper.journalTitle || '',
      year:     paper.pubYear || '',
      authors:  paper.authorString || '',
      abstract: paper.abstractText?.slice(0, 500) || '',
    }));
    onNavigateToPost && onNavigateToPost();
  };

  const handleAdd = async () => {
    if (!currentUserId || adding || added) return;
    setAdding(true);
    await supabase.from('library_items').insert({
      added_by:       currentUserId,
      folder_id:      null,
      title:          cleanTitle(paper.title),
      authors:        paper.authorString || '',
      journal:        paper.journalTitle || '',
      year:           paper.pubYear      || '',
      doi:            paper.doi          || '',
      citation:       buildCitationFromEpmc(paper),
      cited_by_count: paper.citedByCount || 0,
      is_open_access: paper.isOpenAccess === 'Y',
      full_text_url:  paper.fullTextUrlList?.fullTextUrl?.[0]?.url || '',
    });
    setAdding(false);
    setAdded(true);
  };

  return (
    <div style={{
      padding: '12px 14px', background: T.s2, borderRadius: 12,
      marginBottom: 8, border: `1px solid ${T.bdr}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 3 }}>
        {cleanTitle(paper.title)}
      </div>
      <div style={{ fontSize: 11.5, color: T.mu, marginBottom: 6 }}>
        {paper.authorString?.length > 80
          ? paper.authorString.slice(0, 80) + '…'
          : paper.authorString}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {(buildCitationFromEpmc(paper) || paper.journalTitle) && (
          <span style={{ fontSize: 11.5, color: T.mu }}>{buildCitationFromEpmc(paper) || paper.journalTitle}</span>
        )}
        {paper.citedByCount > 0 && (
          <span style={{
            fontSize: 10.5, background: T.bl2, color: T.bl,
            padding: '2px 8px', borderRadius: 20, fontWeight: 600,
          }}>
            {paper.citedByCount} citations
          </span>
        )}
        {paper.isOpenAccess === 'Y' && (
          <span style={{
            fontSize: 10.5, background: T.gr2, color: T.gr,
            padding: '2px 8px', borderRadius: 20, fontWeight: 700,
          }}>
            Open Access
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {onNavigateToPost && (
          <Btn variant="s" style={{ fontSize: 11.5 }} onClick={handleShare}>
            Share this paper
          </Btn>
        )}
        {currentUserId && (
          <Btn style={{ fontSize: 11.5 }} onClick={handleAdd} disabled={added || adding}>
            {added ? 'Added ✓' : adding ? 'Adding…' : 'Add to library'}
          </Btn>
        )}
      </div>
    </div>
  );
}

// ─── Main ExploreScreen ───────────────────────────────────────────────────────

export default function ExploreScreen({
  user,
  currentProfile,
  initialQuery = '',
  onViewUser,
  onViewPaper,
  onNavigateToPost,
  onViewGroup,
}) {
  const [q, setQ]                   = useState(initialQuery);
  const [exploreTab, setExploreTab] = useState('posts');

  // Posts tab state
  const [postResults, setPostResults]     = useState([]);
  const [postSearching, setPostSearching] = useState(false);

  // Researchers tab state
  const [resResults, setResResults]     = useState([]);
  const [resSearching, setResSearching] = useState(false);

  // Papers tab state
  const [paperResults, setPaperResults]     = useState({ posts: [], profiles: [], epmc: [] });
  const [paperSearching, setPaperSearching] = useState(false);
  const [showMoreDiscussed, setShowMoreDiscussed]   = useState(false);
  const [showMoreInProfiles, setShowMoreInProfiles] = useState(false);
  const [epmcTotal,       setEpmcTotal]       = useState(null);
  const [epmcCursor,      setEpmcCursor]      = useState(null);
  const [epmcLoadingMore, setEpmcLoadingMore] = useState(false);

  // Groups tab state
  const [groupResults,    setGroupResults]    = useState([]);
  const [groupSearching,  setGroupSearching]  = useState(false);
  const [suggestedGroups, setSuggestedGroups] = useState([]);
  const [groupTier1Filter,setGroupTier1Filter]= useState('');

  const [tier1Filter, setTier1Filter] = useState('');

  const currentUserId = user?.id;

  // ── Search functions ─────────────────────────────────────────────────────

  const searchPosts = useCallback(async (query, t1Filter = '') => {
    if (!query.trim() && !t1Filter) { setPostResults([]); return; }
    setPostSearching(true);
    // Strip leading # so "#GLP1" and "GLP1" behave identically
    const cleanQ = query.trim().replace(/^#+/, '');
    // Tags are stored WITH # prefix (e.g. "#family"), so tag search uses "#cleanQ"
    const tagQ = `#${cleanQ}`;

    let textQ = supabase.from('posts_with_meta').select('*').order('created_at', { ascending: false }).limit(40);
    let tagResQ = supabase.from('posts_with_meta').select('*').order('created_at', { ascending: false }).limit(40);

    if (cleanQ) {
      textQ  = textQ.or(`content.ilike.%${cleanQ}%,paper_title.ilike.%${cleanQ}%,paper_authors.ilike.%${cleanQ}%`);
      tagResQ = tagResQ.contains('tags', [tagQ]);
    }
    if (t1Filter) {
      textQ   = textQ.eq('tier1', t1Filter);
      tagResQ = tagResQ.eq('tier1', t1Filter);
    }

    // Two queries: (1) full-text across text fields, (2) exact tag array match
    const [textRes, tagRes] = await Promise.all([textQ, tagResQ]);

    // Merge and deduplicate by post id, preserve recency order
    const seen = new Set();
    const merged = [...(textRes.data || []), ...(tagRes.data || [])]
      .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Deduplicate paper posts by DOI → one card per paper, track discussion count
    const paperByDoi = new Map();
    const otherPosts = [];
    for (const p of merged) {
      if (p.post_type === 'paper' && p.paper_doi) {
        const doi = p.paper_doi.toLowerCase();
        if (!paperByDoi.has(doi)) {
          paperByDoi.set(doi, { ...p, _discussionCount: 1 });
        } else {
          paperByDoi.get(doi)._discussionCount++;
        }
      } else {
        otherPosts.push(p);
      }
    }
    const dedupedPapers = Array.from(paperByDoi.values())
      .sort((a, b) => b._discussionCount - a._discussionCount)
      .map(p => ({ ...p, _isPaperCard: true }));

    setPostResults([...dedupedPapers, ...otherPosts]);
    setPostSearching(false);
  }, []);

  const searchResearchers = useCallback(async (query) => {
    if (!query.trim()) { setResResults([]); return; }
    setResSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, name, title, institution, location, avatar_url, avatar_color, bio, topic_interests')
      .or(`name.ilike.%${query}%,institution.ilike.%${query}%,title.ilike.%${query}%`)
      .limit(20);
    setResResults(data || []);
    setResSearching(false);
  }, []);

  const searchPapers = useCallback(async (query) => {
    if (!query.trim()) { setPaperResults({ posts: [], profiles: [], epmc: [] }); return; }
    setPaperSearching(true);
    setPaperResults({ posts: [], profiles: [], epmc: [] });
    setShowMoreDiscussed(false);
    setShowMoreInProfiles(false);
    setEpmcTotal(null);
    setEpmcCursor(null);

    const cleanQ = query.trim().replace(/^#+/, '');

    const [postsRes, profilesRes, epmcData] = await Promise.all([
      supabase
        .from('posts_with_meta')
        .select('*')
        .or(`content.ilike.%${cleanQ}%,paper_title.ilike.%${cleanQ}%,paper_authors.ilike.%${cleanQ}%`)
        .eq('post_type', 'paper')
        .order('created_at', { ascending: false })
        .limit(20),

      supabase
        .from('publications')
        .select('*, profiles(id, name, avatar_url, avatar_color, title, institution)')
        .or(`title.ilike.%${cleanQ}%,authors.ilike.%${cleanQ}%,journal.ilike.%${cleanQ}%`)
        .order('year', { ascending: false })
        .limit(20),

      fetch(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search` +
        `?query=${encodeURIComponent(cleanQ)}&resultType=core&pageSize=10&format=json&cursorMark=*`
      ).then(r => r.json()).catch(() => ({})),
    ]);

    const epmcRows   = epmcData.resultList?.result || [];
    const epmcHits   = epmcData.hitCount || 0;
    const nextCursor = epmcData.nextCursorMark || null;

    const luminaryDois = new Set([
      ...(postsRes.data || []).map(p => p.paper_doi).filter(Boolean),
      ...(profilesRes.data || []).map(p => p.doi).filter(Boolean),
    ]);

    const filteredEpmc = epmcRows.filter(r =>
      !r.doi || !luminaryDois.has(r.doi.toLowerCase())
    );

    setEpmcTotal(epmcHits);
    setEpmcCursor(epmcRows.length === 10 ? nextCursor : null);

    // Deduplicate Luminary paper posts by DOI (same logic as Posts tab)
    const paperByDoi = new Map();
    for (const p of (postsRes.data || [])) {
      const doi = (p.paper_doi || '').toLowerCase();
      const key = doi || p.id; // fall back to post id if no DOI
      if (!paperByDoi.has(key)) {
        paperByDoi.set(key, { ...p, _discussionCount: 1, _isPaperCard: true });
      } else {
        paperByDoi.get(key)._discussionCount++;
      }
    }
    const dedupedPosts = Array.from(paperByDoi.values())
      .sort((a, b) => b._discussionCount - a._discussionCount);

    setPaperResults({
      posts:    dedupedPosts,
      profiles: profilesRes.data || [],
      epmc:     filteredEpmc,
    });
    setPaperSearching(false);
  }, []);

  const loadMoreEpmc = async () => {
    if (!epmcCursor || epmcLoadingMore || !q.trim()) return;
    setEpmcLoadingMore(true);
    try {
      const cleanQ = q.trim().replace(/^#+/, '');
      const data = await fetch(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search` +
        `?query=${encodeURIComponent(cleanQ)}&resultType=core&pageSize=10&format=json` +
        `&cursorMark=${encodeURIComponent(epmcCursor)}`
      ).then(r => r.json()).catch(() => ({}));
      const rows = data.resultList?.result || [];
      const next = data.nextCursorMark || null;
      setPaperResults(prev => ({ ...prev, epmc: [...prev.epmc, ...rows] }));
      setEpmcCursor(rows.length === 10 && next !== epmcCursor ? next : null);
    } catch {}
    setEpmcLoadingMore(false);
  };

  const searchGroups = useCallback(async (query, tier1) => {
    setGroupSearching(true);
    const cols = 'id, name, description, research_topic, tier1, tier2, avatar_url, is_public';
    if (!query.trim() && !tier1) {
      const { data } = await supabase
        .from('groups').select(cols)
        .eq('is_public', true)
        .order('created_at', { ascending: false }).limit(6);
      setSuggestedGroups(data || []);
      setGroupResults([]);
    } else {
      let q = supabase.from('groups').select(cols).eq('is_public', true);
      if (query.trim()) q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%,research_topic.ilike.%${query}%`);
      if (tier1) q = q.eq('tier1', tier1);
      const { data } = await q.limit(10);
      setGroupResults(data || []);
    }
    setGroupSearching(false);
  }, []);

  // ── Run search when query or tab or tier1Filter changes ──────────────────

  useEffect(() => {
    const t = setTimeout(() => {
      if (exploreTab === 'posts')       searchPosts(q, tier1Filter);
      if (exploreTab === 'researchers') searchResearchers(q);
      if (exploreTab === 'papers')      searchPapers(q);
      if (exploreTab === 'groups')      searchGroups(q, groupTier1Filter);
    }, 400);
    return () => clearTimeout(t);
  }, [q, tier1Filter, groupTier1Filter, exploreTab, searchPosts, searchResearchers, searchPapers, searchGroups]);

  // Run search immediately if initialQuery is provided
  useEffect(() => {
    if (initialQuery) {
      setQ(initialQuery);
    }
  }, [initialQuery]); // eslint-disable-line

  // ── Tab switch ──────────────────────────────────────────────────────────

  const handleTabChange = (tab) => {
    setExploreTab(tab);
  };

  // ── Handle chip click ────────────────────────────────────────────────────

  const handleChipClick = (tag) => {
    setQ(tag);
    setExploreTab('posts');
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'posts',       label: 'Posts' },
    { id: 'researchers', label: 'Researchers' },
    { id: 'papers',      label: 'Papers' },
    { id: 'groups',      label: 'Groups' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* ── Search bar + tab bar ── */}
      <div style={{
        background: 'rgba(255,255,255,.96)', borderBottom: `1px solid ${T.bdr}`,
        flexShrink: 0,
      }}>
        <div style={{ padding: '10px 18px 0' }}>
          <input
            style={{
              width: '100%', background: T.s2, border: `1.5px solid ${T.bdr}`,
              borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none',
              fontFamily: 'inherit', color: T.text, boxSizing: 'border-box',
            }}
            placeholder="Search posts, researchers, papers…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', padding: '0 8px' }}>
          {tabs.map(({ id, label }) => (
            <div
              key={id}
              onClick={() => handleTabChange(id)}
              style={{
                padding: '8px 16px', fontSize: 12.5, fontWeight: 600,
                color: exploreTab === id ? T.v : T.mu,
                borderBottom: `2.5px solid ${exploreTab === id ? T.v : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 18px' }}>

        {/* ═══ Posts tab ═════════════════════════════════════════════════ */}
        {exploreTab === 'posts' && (
          <>
            {!q.trim() && (
              <>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase',
                  letterSpacing: '.07em', marginBottom: 10,
                }}>
                  Browse by Discipline
                </div>
                {/* Tier 1 discipline filter */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {TIER1_LIST.map(t1 => (
                    <button key={t1}
                      onClick={() => setTier1Filter(tier1Filter === t1 ? '' : t1)}
                      style={{
                        padding: '5px 13px', borderRadius: 20, cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                        border: `1.5px solid ${tier1Filter === t1 ? T.v : T.bdr}`,
                        background: tier1Filter === t1 ? T.v2 : T.w,
                        color: tier1Filter === t1 ? T.v : T.mu,
                        transition: 'all .12s',
                      }}>
                      {t1}
                    </button>
                  ))}
                  {tier1Filter && (
                    <button onClick={() => setTier1Filter('')}
                      style={{
                        padding: '5px 10px', borderRadius: 20, fontSize: 11.5,
                        fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                        border: `1px solid ${T.bdr}`, background: T.s2, color: T.mu,
                      }}>
                      ✕ Clear
                    </button>
                  )}
                </div>
                {/* Tier 2 chips */}
                {!tier1Filter ? (
                  <div style={{ fontSize: 12, color: T.mu, padding: '8px 0', marginBottom: 16 }}>
                    Select a discipline above to browse specialities, or search below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {TAXONOMY[tier1Filter].map(t2 => (
                      <button key={t2}
                        onClick={() => { setQ(t2); }}
                        style={{
                          padding: '4px 11px', borderRadius: 20, cursor: 'pointer',
                          fontSize: 11.5, fontFamily: 'inherit', fontWeight: 500,
                          border: `1px solid rgba(108,99,255,.2)`,
                          background: T.v2, color: T.v,
                        }}>
                        {t2}
                      </button>
                    ))}
                  </div>
                )}
                {!tier1Filter && (
                  <div style={{
                    background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
                    padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 8 }}>
                      Discover scientific content
                    </div>
                    <div style={{ fontSize: 13, color: T.mu }}>
                      Select a discipline above to browse by speciality, or search directly.
                    </div>
                  </div>
                )}
              </>
            )}

            {(q.trim() || tier1Filter) && (
              <>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: T.mu, textTransform: 'uppercase',
                  letterSpacing: '.07em', marginBottom: 10,
                }}>
                  {postSearching
                    ? 'Searching…'
                    : tier1Filter && !q.trim()
                      ? `${postResults.length} post${postResults.length !== 1 ? 's' : ''} in ${tier1Filter}`
                      : `${postResults.length} result${postResults.length !== 1 ? 's' : ''} for "${q}"`}
                </div>
                {postSearching
                  ? <Spinner />
                  : postResults.length === 0
                    ? (
                      <div style={{ color: T.mu, fontSize: 13, textAlign: 'center', padding: 20 }}>
                        No results for "{q}" — try different keywords or check the spelling.
                      </div>
                    )
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {postResults.map(p => p._isPaperCard
                          ? (
                            <PaperSearchCard
                              key={p.paper_doi}
                              post={p}
                              currentUserId={currentUserId}
                              onViewPaper={onViewPaper}
                            />
                          ) : (
                            <PostCard
                              key={p.id}
                              post={p}
                              currentUserId={currentUserId}
                              currentProfile={currentProfile}
                              onViewUser={onViewUser}
                              onViewPaper={onViewPaper}
                            />
                          )
                        )}
                      </div>
                    )
                }
              </>
            )}
          </>
        )}

        {/* ═══ Researchers tab ════════════════════════════════════════════ */}
        {exploreTab === 'researchers' && (
          <>
            {!q.trim() && (
              <div style={{
                background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
                padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>👩‍🔬</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 8 }}>
                  Find researchers
                </div>
                <div style={{ fontSize: 13, color: T.mu }}>
                  Search by name, institution, or area of expertise.
                </div>
              </div>
            )}

            {q.trim() && (
              <>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: T.mu, textTransform: 'uppercase',
                  letterSpacing: '.07em', marginBottom: 10,
                }}>
                  {resSearching
                    ? 'Searching…'
                    : `${resResults.length} researcher${resResults.length !== 1 ? 's' : ''} found`}
                </div>
                {resSearching
                  ? <Spinner />
                  : resResults.length === 0
                    ? (
                      <div style={{ color: T.mu, fontSize: 13, textAlign: 'center', padding: 20 }}>
                        No results for "{q}" — try different keywords or check the spelling.
                      </div>
                    )
                    : resResults.map(u => (
                      <ResearcherCard
                        key={u.id}
                        user={u}
                        currentUserId={currentUserId}
                        onViewUser={onViewUser}
                      />
                    ))
                }
              </>
            )}
          </>
        )}

        {/* ═══ Papers tab ═════════════════════════════════════════════════ */}
        {exploreTab === 'papers' && (
          <>
            {!q.trim() && (
              <div style={{
                background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
                padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>📄</div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 8 }}>
                  Search scientific papers
                </div>
                <div style={{ fontSize: 13, color: T.mu }}>
                  Find papers discussed on Luminary, in researcher profiles, or anywhere on Europe PMC.
                </div>
              </div>
            )}

            {q.trim() && paperSearching && <Spinner />}

            {q.trim() && !paperSearching && (
              <>
                {paperResults.posts.length === 0 &&
                 paperResults.profiles.length === 0 &&
                 paperResults.epmc.length === 0 && (
                  <div style={{ color: T.mu, fontSize: 13, textAlign: 'center', padding: 20 }}>
                    No results for &ldquo;{q}&rdquo; — try different keywords or check the spelling.
                  </div>
                )}

                {/* Section 1 — Discussed on Luminary */}
                {paperResults.posts.length > 0 && (
                  <>
                    <SectionHeader label={`💬 Discussed on Luminary  (${paperResults.posts.length})`} />
                    {(showMoreDiscussed ? paperResults.posts : paperResults.posts.slice(0, 5)).map(post => (
                      <PaperSearchCard
                        key={post.paper_doi || post.id}
                        post={post}
                        currentUserId={currentUserId}
                        onViewPaper={onViewPaper}
                      />
                    ))}
                    {paperResults.posts.length > 5 && (
                      <button
                        onClick={() => setShowMoreDiscussed(v => !v)}
                        style={{
                          width: '100%', padding: '8px', borderRadius: 9, border: `1px solid ${T.bdr}`,
                          background: T.s2, color: T.v, fontWeight: 600, fontSize: 12,
                          fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8,
                        }}
                      >
                        {showMoreDiscussed ? 'Show less' : `Show ${paperResults.posts.length - 5} more`}
                      </button>
                    )}
                  </>
                )}

                {/* Section 2 — In researcher profiles */}
                {paperResults.profiles.length > 0 && (
                  <>
                    <SectionHeader label={`👤 In researcher profiles  (${paperResults.profiles.length})`} />
                    {(showMoreInProfiles ? paperResults.profiles : paperResults.profiles.slice(0, 5)).map(pub => (
                      <ProfilePubCard key={pub.id} pub={pub} onViewUser={onViewUser} />
                    ))}
                    {paperResults.profiles.length > 5 && (
                      <button
                        onClick={() => setShowMoreInProfiles(v => !v)}
                        style={{
                          width: '100%', padding: '8px', borderRadius: 9, border: `1px solid ${T.bdr}`,
                          background: T.s2, color: T.v, fontWeight: 600, fontSize: 12,
                          fontFamily: 'inherit', cursor: 'pointer', marginBottom: 8,
                        }}
                      >
                        {showMoreInProfiles
                          ? 'Show less'
                          : `Show ${paperResults.profiles.length - 5} more in profiles`}
                      </button>
                    )}
                  </>
                )}

                {/* Section 3 — From Europe PMC */}
                {paperResults.epmc.length > 0 && (
                  <>
                    <SectionHeader label={
                      epmcTotal !== null
                        ? `🌍 From Europe PMC — ${epmcTotal.toLocaleString()} results (showing ${paperResults.epmc.length})`
                        : `🌍 From Europe PMC (${paperResults.epmc.length})`
                    } />
                    {paperResults.epmc.map(paper => (
                      <EpmcCard
                        key={paper.id || paper.doi || paper.title}
                        paper={paper}
                        currentUserId={currentUserId}
                        onNavigateToPost={onNavigateToPost}
                      />
                    ))}
                    {epmcCursor && (
                      <div style={{textAlign:'center', paddingTop:4, paddingBottom:8}}>
                        <Btn onClick={loadMoreEpmc} disabled={epmcLoadingMore}>
                          {epmcLoadingMore ? <Spinner size={14}/> : 'Load more from Europe PMC'}
                        </Btn>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ═══ Groups tab ═════════════════════════════════════════════════ */}
        {exploreTab === 'groups' && (
          <>
            {/* Tier 1 filter chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {TIER1_LIST.map(t1 => (
                <button key={t1}
                  onClick={() => setGroupTier1Filter(f => f === t1 ? '' : t1)}
                  style={{
                    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                    fontSize: 11.5, fontFamily: 'inherit', fontWeight: 600,
                    border: `1.5px solid ${groupTier1Filter === t1 ? T.v : T.bdr}`,
                    background: groupTier1Filter === t1 ? T.v2 : T.w,
                    color: groupTier1Filter === t1 ? T.v : T.mu,
                    transition: 'all .15s',
                  }}>
                  {t1}
                </button>
              ))}
            </div>

            {groupSearching && <Spinner />}

            {!groupSearching && !q.trim() && (
              suggestedGroups.length === 0 ? (
                <div style={{
                  background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14,
                  padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>🔬</div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, marginBottom: 8 }}>
                    Discover research groups
                  </div>
                  <div style={{ fontSize: 13, color: T.mu }}>
                    Search for groups by name or research topic.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                    Recent groups
                  </div>
                  {suggestedGroups.map(g => (
                    <GroupResultCard key={g.id} group={g} onViewGroup={onViewGroup} />
                  ))}
                </>
              )
            )}

            {!groupSearching && q.trim() && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
                  {groupResults.length} group{groupResults.length !== 1 ? 's' : ''} found
                </div>
                {groupResults.length === 0
                  ? <div style={{ color: T.mu, fontSize: 13, textAlign: 'center', padding: 20 }}>No groups found for "{q}".</div>
                  : groupResults.map(g => <GroupResultCard key={g.id} group={g} onViewGroup={onViewGroup} />)
                }
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function GroupResultCard({ group, onViewGroup }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '14px 0',
      borderBottom: `1px solid ${T.bdr}`, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
        background: 'linear-gradient(135deg,#667eea,#764ba2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700, color: '#fff', overflow: 'hidden',
      }}>
        {group.avatar_url
          ? <img src={group.avatar_url} alt={group.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          : group.name?.charAt(0).toUpperCase()
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{group.name}</div>
        {group.research_topic && (
          <div style={{ fontSize: 12, color: T.v, fontWeight: 600, marginBottom: 3 }}>{group.research_topic}</div>
        )}
        {group.description && (
          <div style={{
            fontSize: 12, color: T.mu,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {group.description}
          </div>
        )}
        <div style={{ fontSize: 11, color: T.mu, marginTop: 4 }}>
          {group.is_public ? '🌐 Public group' : '🔒 Closed group'}
        </div>
      </div>
      <button onClick={() => onViewGroup?.(group.id)} style={{
        padding: '6px 14px', borderRadius: 20, flexShrink: 0,
        border: `1.5px solid ${T.v}`, background: T.v2,
        color: T.v, fontSize: 12, fontWeight: 700,
        fontFamily: 'inherit', cursor: 'pointer',
      }}>
        View →
      </button>
    </div>
  );
}
