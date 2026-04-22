import React, { useState, useEffect, useCallback } from 'react';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';

const TABS = [
  { id: 'posts',      label: '📝 Posts'      },
  { id: 'papers',     label: '📄 Papers'     },
  { id: 'groups',     label: '👥 Groups'     },
  { id: 'projects',   label: '🗂️ Projects'   },
  { id: 'moderation', label: '🚩 Moderation' },
];

const HEALTH_STYLES = {
  active: { bg: T.gr2, color: T.gr,  label: '🟢 Active' },
  quiet:  { bg: T.am2, color: T.am,  label: '🟡 Quiet'  },
  dead:   { bg: T.ro2, color: T.ro,  label: '🔴 Dead'   },
};

const POST_TYPES = ['text', 'paper', 'link', 'upload', 'tip'];

const FEATURE_DURATIONS = [
  { label: '24 hours',  hours: 24   },
  { label: '48 hours',  hours: 48   },
  { label: '7 days',    hours: 168  },
  { label: 'Permanent', hours: null },
];

export default function ContentSection({ supabase }) {
  const [tab, setTab] = useState('posts');

  return (
    <div>
      <h1 style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 32, color: T.text, margin: '0 0 20px',
      }}>
        Content
      </h1>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24,
        borderBottom: `1px solid ${T.bdr}`, paddingBottom: 0,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 18px', border: 'none',
              cursor: 'pointer', background: 'transparent',
              fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? T.v : T.mu,
              borderBottom: tab === t.id
                ? `2px solid ${T.v}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'posts'      && <PostsTab      supabase={supabase} />}
      {tab === 'papers'     && <PapersTab     supabase={supabase} />}
      {tab === 'groups'     && <GroupsTab     supabase={supabase} />}
      {tab === 'projects'   && <ProjectsTab   supabase={supabase} />}
      {tab === 'moderation' && <ModerationTab supabase={supabase} />}
    </div>
  );
}

// ─── PostsTab ─────────────────────────────────────────────────────────────────

function PostsTab({ supabase }) {
  const [posts, setPosts]                   = useState([]);
  const [total, setTotal]                   = useState(0);
  const [loading, setLoading]               = useState(true);
  const [page, setPage]                     = useState(0);
  const [search, setSearch]                 = useState('');
  const [typeFilter, setTypeFilter]         = useState('');
  const [featuredFilter, setFeaturedFilter] = useState('');
  const [hiddenFilter, setHiddenFilter]     = useState('');
  const [acting, setActing]                 = useState(null);
  const [featuringId, setFeaturingId]       = useState(null);

  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_admin_posts', {
      p_limit:    PAGE_SIZE,
      p_offset:   page * PAGE_SIZE,
      p_search:   search || null,
      p_type:     typeFilter || null,
      p_featured: featuredFilter === 'true'  ? true
                : featuredFilter === 'false' ? false : null,
      p_hidden:   hiddenFilter   === 'true'  ? true
                : hiddenFilter   === 'false' ? false : null,
    });
    setPosts(data?.posts || []);
    setTotal(data?.total || 0);
    setLoading(false);
  }, [supabase, page, search, typeFilter, featuredFilter, hiddenFilter]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [search, typeFilter, featuredFilter, hiddenFilter]);

  const deletePost = async (id) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    setActing(id);
    await supabase.from('posts').delete().eq('id', id);
    setActing(null);
    load();
  };

  const toggleHidden = async (post) => {
    setActing(post.id);
    await supabase.from('posts').update({ is_hidden: !post.is_hidden }).eq('id', post.id);
    setActing(null);
    load();
  };

  const featurePost = async (post, hours) => {
    setActing(post.id);
    await supabase.from('posts').update({
      is_featured:    true,
      featured_until: hours
        ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
        : null,
    }).eq('id', post.id);
    setActing(null);
    setFeaturingId(null);
    load();
  };

  const unfeaturePost = async (id) => {
    setActing(id);
    await supabase.from('posts').update({ is_featured: false, featured_until: null }).eq('id', id);
    setActing(null);
    load();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          placeholder="Search posts, authors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 200, padding: '8px 12px',
            borderRadius: 9, border: `1px solid ${T.bdr}`,
            background: T.s2, fontSize: 13, color: T.text,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="">All types</option>
          {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={featuredFilter} onChange={e => setFeaturedFilter(e.target.value)} style={selectStyle}>
          <option value="">All posts</option>
          <option value="true">Featured only</option>
          <option value="false">Not featured</option>
        </select>
        <select value={hiddenFilter} onChange={e => setHiddenFilter(e.target.value)} style={selectStyle}>
          <option value="">All visibility</option>
          <option value="true">Hidden only</option>
          <option value="false">Visible only</option>
        </select>
      </div>

      {/* Summary */}
      <div style={{ fontSize: 12, color: T.mu, marginBottom: 12 }}>
        {total.toLocaleString()} posts
        {page > 0 || total > PAGE_SIZE ? ` · Page ${page + 1} of ${totalPages}` : ''}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mu, fontSize: 14 }}>
          No posts match your filters.
        </div>
      ) : (
        <>
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 90px 70px 120px 160px',
              padding: '10px 16px',
              borderBottom: `1px solid ${T.bdr}`,
              fontSize: 11, fontWeight: 600, color: T.mu,
              textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              <div>Post</div>
              <div>Type</div>
              <div>Date</div>
              <div>Reports</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {posts.map((post, i) => (
              <PostRow
                key={post.id}
                post={post}
                isLast={i === posts.length - 1}
                acting={acting === post.id}
                featuringThis={featuringId === post.id}
                onFeatureClick={() => setFeaturingId(featuringId === post.id ? null : post.id)}
                onFeatureDuration={(h) => featurePost(post, h)}
                onUnfeature={() => unfeaturePost(post.id)}
                onToggleHidden={() => toggleHidden(post)}
                onDelete={() => deletePost(post.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={pageBtn(page === 0)}
              >
                ← Prev
              </button>
              <span style={{ padding: '8px 14px', fontSize: 13, color: T.mu }}>
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={pageBtn(page >= totalPages - 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PostRow ──────────────────────────────────────────────────────────────────

function postHealth(participants) {
  if (participants >= 3) return { label: '🟢 Active',  bg: T.gr2, color: T.gr  };
  if (participants === 2) return { label: '🟡 Growing', bg: T.am2, color: T.am  };
  return                         { label: '⚪ Quiet',   bg: T.s3,  color: T.mu  };
}

function PostRow({
  post, isLast, acting, featuringThis,
  onFeatureClick, onFeatureDuration, onUnfeature,
  onToggleHidden, onDelete,
}) {
  const participants = post.participant_count || 0;
  const health       = postHealth(participants);
  const hasReports   = post.report_count > 0;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 90px 70px 120px 160px',
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`,
      alignItems: 'center',
      background: hasReports ? 'rgba(245,158,11,.07)' : 'transparent',
    }}>
      {/* Post preview + stats */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0 }}>
        <Av
          size={28}
          name={post.author_name}
          color={post.author_avatar_color}
          url={post.author_avatar_url || ''}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: T.mu, marginBottom: 2 }}>{post.author_name}</div>
          <div style={{ fontSize: 13, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {post.paper_title ||
             post.link_title  ||
             post.content?.replace(/<[^>]+>/g, '').slice(0, 80) ||
             '(no content)'}
          </div>
          {/* Engagement stats */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: T.mu }}>
            <span>👍 {post.like_count || 0}</span>
            <span>💬 {post.comment_count || 0}</span>
            <span style={{
              fontWeight: participants >= 3 ? 700 : 400,
              color: participants >= 3 ? T.gr : participants === 2 ? T.am : T.mu,
            }}>
              👥 {participants} participant{participants !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Type */}
      <div style={{ fontSize: 12, color: T.mu }}>{post.post_type}</div>

      {/* Date */}
      <div style={{ fontSize: 12, color: T.mu }}>{timeAgo(post.created_at)}</div>

      {/* Reports */}
      <div>
        {post.report_count > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: T.am, background: T.w, padding: '2px 7px', borderRadius: 20, border: `1px solid ${T.am}` }}>
            🚩 {post.report_count}
          </span>
        )}
      </div>

      {/* Status: health + featured/hidden indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: health.bg, color: health.color, alignSelf: 'flex-start' }}>
          {health.label}
        </span>
        {post.is_featured && (
          <span style={{ fontSize: 10, color: T.v, fontWeight: 600 }}>✦ Featured</span>
        )}
        {post.is_hidden && (
          <span style={{ fontSize: 10, color: T.mu, fontWeight: 600 }}>👁 Hidden</span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', position: 'relative' }}>
        {/* Feature / Unfeature */}
        {post.is_featured ? (
          <button onClick={onUnfeature} disabled={acting} style={actionBtn(T.v, acting)}>
            Unfeature
          </button>
        ) : (
          <div style={{ position: 'relative' }}>
            <button onClick={onFeatureClick} disabled={acting} style={actionBtn(T.v, acting)}>
              ✦ Feature
            </button>
            {featuringThis && (
              <div style={{
                position: 'absolute', top: 30, left: 0, zIndex: 10,
                background: T.w, border: `1px solid ${T.bdr}`,
                borderRadius: 9, padding: '6px 0', minWidth: 140,
                boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              }}>
                {FEATURE_DURATIONS.map(d => (
                  <button key={d.label} onClick={() => onFeatureDuration(d.hours)} style={{
                    display: 'block', width: '100%',
                    padding: '8px 14px', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    fontSize: 13, color: T.text, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hide / Unhide */}
        <button onClick={onToggleHidden} disabled={acting} style={actionBtn(T.mu, acting)}>
          {post.is_hidden ? 'Unhide' : 'Hide'}
        </button>

        {/* View */}
        <a href={`/s/${post.id}`} target="_blank" rel="noopener noreferrer"
          style={{ ...actionBtn(T.bl, false), textDecoration: 'none', display: 'inline-block' }}>
          View →
        </a>

        {/* Delete */}
        <button onClick={onDelete} disabled={acting} style={actionBtn(T.ro, acting)}>
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── PapersTab ────────────────────────────────────────────────────────────────

function getPaperKPI(participants) {
  if (participants >= 3) return 'active';
  if (participants === 2) return 'growing';
  return 'quiet';
}

const PAPER_KPI = {
  active:  { bg: T.gr2, color: T.gr, label: '🟢 Active',  desc: '3+ participants' },
  growing: { bg: T.am2, color: T.am, label: '🟡 Growing', desc: '2 participants'  },
  quiet:   { bg: T.s3,  color: T.mu, label: '⚪ Quiet',   desc: '1 participant'   },
};

function PapersTab({ supabase }) {
  const [papers, setPapers]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [healthFilter, setHealthFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_paper_health');
      setPapers(data || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const filtered = healthFilter
    ? papers.filter(p => getPaperKPI(p.participants) === healthFilter)
    : papers;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} style={selectStyle}>
          <option value="">All papers</option>
          <option value="active">🟢 Active (3+ participants)</option>
          <option value="growing">🟡 Growing (2 participants)</option>
          <option value="quiet">⚪ Quiet (1 participant)</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : papers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mu, fontSize: 14 }}>
          No papers discussed yet.
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mu, fontSize: 14 }}>
          No papers match this filter.
        </div>
      ) : (
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 110px 90px 140px',
            padding: '10px 16px',
            borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            <div>Paper</div>
            <div>Discussions</div>
            <div>Participants</div>
            <div>Comments</div>
            <div>Health</div>
          </div>

          {filtered.map((row, i) => {
            const kpi = getPaperKPI(row.participants);
            const h   = PAPER_KPI[kpi];
            return (
              <div key={row.paper_doi} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 110px 90px 140px',
                padding: '12px 16px',
                borderBottom: i === filtered.length - 1 ? 'none' : `1px solid ${T.bdr}`,
                alignItems: 'center',
                background: kpi === 'active'
                  ? 'rgba(16,185,129,.06)'
                  : kpi === 'growing'
                  ? 'rgba(245,158,11,.06)'
                  : 'transparent',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.paper_title || row.paper_doi}
                  </div>
                  {row.paper_journal && (
                    <div style={{ fontSize: 11, color: T.mu, marginTop: 2 }}>{row.paper_journal}</div>
                  )}
                </div>
                <div style={{ fontSize: 13, color: T.mu }}>{row.discussions}</div>
                <div style={{
                  fontSize: 13, fontWeight: row.participants >= 3 ? 700 : 400,
                  color: row.participants >= 3 ? T.gr : row.participants === 2 ? T.am : T.mu,
                }}>
                  {row.participants}
                </div>
                <div style={{ fontSize: 13, color: T.mu }}>{row.total_comments}</div>
                <div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: h.bg, color: h.color }}>
                    {h.label}
                  </span>
                  <div style={{ fontSize: 10, color: T.mu, marginTop: 2 }}>{h.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GroupsTab ────────────────────────────────────────────────────────────────

function GroupsTab({ supabase }) {
  const [groups, setGroups]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [healthFilter, setHealthFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_content_health');
      setGroups(data?.groups || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const filtered = healthFilter ? groups.filter(g => g.health === healthFilter) : groups;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} style={selectStyle}>
          <option value="">All health</option>
          <option value="active">🟢 Active</option>
          <option value="quiet">🟡 Quiet</option>
          <option value="dead">🔴 Dead</option>
        </select>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <HealthTable rows={filtered} type="group" />
      )}
    </div>
  );
}

// ─── ProjectsTab ──────────────────────────────────────────────────────────────

function ProjectsTab({ supabase }) {
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [healthFilter, setHealthFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_content_health');
      setProjects(data?.projects || []);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const filtered = healthFilter ? projects.filter(p => p.health === healthFilter) : projects;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={healthFilter} onChange={e => setHealthFilter(e.target.value)} style={selectStyle}>
          <option value="">All health</option>
          <option value="active">🟢 Active</option>
          <option value="quiet">🟡 Quiet</option>
          <option value="dead">🔴 Dead</option>
        </select>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : (
        <HealthTable rows={filtered} type="project" />
      )}
    </div>
  );
}

// ─── HealthTable ──────────────────────────────────────────────────────────────

function HealthTable({ rows, type }) {
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: T.mu, fontSize: 14 }}>
        No {type}s found.
      </div>
    );
  }

  return (
    <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 100px 100px 120px',
        padding: '10px 16px',
        borderBottom: `1px solid ${T.bdr}`,
        fontSize: 11, fontWeight: 600, color: T.mu,
        textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        <div>Name</div>
        <div>Members</div>
        <div>Posts / week</div>
        <div>Last active</div>
        <div>Health</div>
      </div>

      {rows.map((row, i) => {
        const h = HEALTH_STYLES[row.health] || HEALTH_STYLES.dead;
        return (
          <div key={row.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 100px 100px 120px',
            padding: '12px 16px',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${T.bdr}`,
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
              {type === 'project' && row.icon && <span style={{ marginRight: 6 }}>{row.icon}</span>}
              {row.name}
            </div>
            <div style={{ fontSize: 13, color: T.mu }}>{row.member_count}</div>
            <div style={{ fontSize: 13, color: T.mu }}>{row.posts_this_week}</div>
            <div style={{ fontSize: 12, color: T.mu }}>
              {row.last_post_at ? timeAgo(row.last_post_at) : 'Never'}
            </div>
            <div>
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: h.bg, color: h.color }}>
                {h.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ModerationTab ────────────────────────────────────────────────────────────

function ModerationTab({ supabase }) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [acting, setActing]             = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_moderation_queue', { p_status: statusFilter });
    setItems(data || []);
    setLoading(false);
  }, [supabase, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const updateReports = async (item, newStatus) => {
    setActing(item.post_id || item.group_post_id);
    const field = item.source === 'post' ? 'post_id' : 'group_post_id';
    const id    = item.source === 'post' ? item.post_id : item.group_post_id;
    await supabase.from('post_reports').update({ status: newStatus }).eq(field, id);
    setActing(null);
    load();
  };

  const deletePost = async (item) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    const id = item.post_id || item.group_post_id;
    setActing(id);
    const table = item.source === 'post' ? 'posts' : 'group_posts';
    await supabase.from(table).delete().eq('id', id);
    await updateReports(item, 'actioned');
    setActing(null);
    load();
  };

  const hidePost = async (item) => {
    if (item.source !== 'post') return;
    setActing(item.post_id);
    await supabase.from('posts').update({ is_hidden: true }).eq('id', item.post_id);
    await updateReports(item, 'actioned');
    setActing(null);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="pending">Pending</option>
          <option value="dismissed">Dismissed</option>
          <option value="actioned">Actioned</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.mu }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {statusFilter === 'pending' ? 'No pending reports' : `No ${statusFilter} reports`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(item => {
            const id = item.post_id || item.group_post_id;
            return (
              <div key={id} style={{
                background: T.w, border: `1.5px solid ${T.am}`,
                borderRadius: 12, padding: '16px 18px',
              }}>
                {/* Post content preview */}
                <div style={{
                  fontSize: 13, color: T.text, lineHeight: 1.5,
                  marginBottom: 10,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                }}>
                  {item.content?.replace(/<[^>]+>/g, '') || '(no content)'}
                </div>

                {/* Author + meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Av size={20} name={item.author_name} color={item.author_avatar_color} url="" />
                  <span style={{ fontSize: 12, color: T.mu }}>
                    {item.author_name} · {item.source === 'group_post' ? 'Group post' : 'Public post'}
                    · {timeAgo(item.post_created_at)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.am, background: T.am2, padding: '2px 8px', borderRadius: 20, marginLeft: 'auto' }}>
                    🚩 {item.report_count} report{item.report_count > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Individual reports */}
                {(item.reports || []).slice(0, 3).map((r, ri) => (
                  <div key={ri} style={{ fontSize: 12, color: T.mu, padding: '6px 10px', background: T.s2, borderRadius: 7, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: T.text }}>{r.reporter}</span>
                    {' · '}{r.reason}
                    {r.note && ` · "${r.note}"`}
                  </div>
                ))}
                {item.reports?.length > 3 && (
                  <div style={{ fontSize: 12, color: T.mu, marginBottom: 8 }}>
                    +{item.reports.length - 3} more reports
                  </div>
                )}

                {/* Actions */}
                {statusFilter === 'pending' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => updateReports(item, 'dismissed')}
                      disabled={acting === id}
                      style={actionBtn(T.mu, acting === id)}
                    >
                      Dismiss
                    </button>
                    {item.source === 'post' && !item.is_hidden && (
                      <button
                        onClick={() => hidePost(item)}
                        disabled={acting === id}
                        style={actionBtn(T.am, acting === id)}
                      >
                        Hide post
                      </button>
                    )}
                    <button
                      onClick={() => deletePost(item)}
                      disabled={acting === id}
                      style={actionBtn(T.ro, acting === id)}
                    >
                      Delete post
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const selectStyle = {
  padding: '8px 10px', borderRadius: 9,
  border: `1px solid ${T.bdr}`, background: T.s2,
  fontSize: 13, color: T.text,
  fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
};

const actionBtn = (color, disabled) => ({
  padding: '5px 11px', borderRadius: 7, border: 'none',
  background: color + '22', color,
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
});

const pageBtn = (disabled) => ({
  padding: '8px 16px', borderRadius: 8,
  border: `1px solid ${T.bdr}`, background: T.w,
  color: disabled ? T.mu : T.text, fontSize: 13,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
});
