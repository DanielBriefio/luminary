import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';
import FollowBtn from '../components/FollowBtn';
import PostCard from '../feed/PostCard';

async function fetchCrossRef(doi) {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!r.ok) return null;
    const { message: w } = await r.json();
    const authors = (w.author || []);
    return {
      title:       w.title?.[0] || '',
      journal:     w['container-title']?.[0] || w.publisher || '',
      year:        w.published?.['date-parts']?.[0]?.[0]?.toString() || '',
      authors:     authors.slice(0, 6).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ')
                   + (authors.length > 6 ? ' et al.' : ''),
      abstract:    w.abstract ? w.abstract.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '',
      citations:   w['is-referenced-by-count'] || 0,
      openAccess:  !!(w.license || []).find(l => l.URL?.includes('creativecommons')),
      publisher:   w.publisher || '',
      type:        w.type || '',
      doiUrl:      `https://doi.org/${doi}`,
    };
  } catch {
    return null;
  }
}

export default function PaperDetailPage({
  doi,
  currentUserId,
  currentProfile,
  onBack,
  onViewUser,
  onViewPaper,
  isPublicPage = false,
}) {
  const [paper,         setPaper]         = useState(null);
  const [posts,         setPosts]         = useState([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [notFound,      setNotFound]      = useState(false);
  const [abstractOpen,  setAbstractOpen]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);

    // Parallel: our DB posts + follower count + CrossRef metadata
    const [{ data: postRows }, { count }, crossref] = await Promise.all([
      supabase
        .from('posts_with_meta')
        .select('*')
        .eq('paper_doi', doi)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('target_type', 'paper')
        .eq('target_id', doi),
      fetchCrossRef(doi),
    ]);

    // Build metadata: CrossRef is authoritative; fall back to what's stored in posts
    const firstPost = (postRows || []).find(p => p.paper_title);
    const meta = crossref || (firstPost ? {
      title:      firstPost.paper_title  || '',
      journal:    firstPost.paper_journal || '',
      year:       firstPost.paper_year    || '',
      authors:    firstPost.paper_authors || '',
      abstract:   firstPost.paper_abstract
                    ? firstPost.paper_abstract.replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim()
                    : '',
      citations:  0,
      openAccess: false,
      doiUrl:     `https://doi.org/${doi}`,
    } : null);

    if (!meta && (!postRows || postRows.length === 0)) {
      setNotFound(true); setLoading(false); return;
    }

    // Enrich posts with user_liked / user_reposted flags when signed in
    let enriched = postRows || [];
    if (currentUserId && enriched.length) {
      const ids = enriched.map(p => p.id);
      const [{ data: ld }, { data: rd }] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', currentUserId).in('post_id', ids),
        supabase.from('reposts').select('post_id').eq('user_id', currentUserId).in('post_id', ids),
      ]);
      const likedSet    = new Set((ld || []).map(l => l.post_id));
      const repostedSet = new Set((rd || []).map(r => r.post_id));
      enriched = enriched.map(p => ({
        ...p,
        user_liked:    likedSet.has(p.id),
        user_reposted: repostedSet.has(p.id),
        isRepost:      false,
        _itemKey:      p.id,
        _sortTime:     p.created_at,
      }));
    } else {
      enriched = enriched.map(p => ({ ...p, isRepost: false, _itemKey: p.id, _sortTime: p.created_at }));
    }

    setPaper(meta);
    setPosts(enriched);
    setFollowerCount(count || 0);
    setLoading(false);
  }, [doi, currentUserId]);

  useEffect(() => { load(); }, [load]);

  // Update document title
  useEffect(() => {
    if (!paper?.title) return;
    const prev = document.title;
    document.title = `${paper.title} — Luminary`;
    return () => { document.title = prev; };
  }, [paper?.title]);

  const fonts = isPublicPage
    ? <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
    : null;

  const pageContent = (() => {
    if (loading) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
        <Spinner />
      </div>
    );

    if (notFound) return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, marginBottom: 10 }}>Paper not found</div>
        <div style={{ fontSize: 13, color: T.mu, marginBottom: 24 }}>
          DOI <code style={{ background: T.s2, padding: '2px 6px', borderRadius: 4 }}>{doi}</code> doesn't match any paper on Luminary yet.
        </div>
        {onBack && (
          <button onClick={onBack}
            style={{ padding: '9px 22px', borderRadius: 22, border: `1.5px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>
            ← Go back
          </button>
        )}
      </div>
    );

    const abstract    = paper?.abstract || '';
    const isLongAbstract = abstract.length > 460;
    const displayAbstract = !isLongAbstract || abstractOpen
      ? abstract
      : abstract.slice(0, 460).trimEnd() + '…';

    return (
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '20px 18px' }}>

        {/* Back button (in-app only) */}
        {onBack && (
          <button onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 16, padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
            ← Back
          </button>
        )}

        {/* ── Paper header card ── */}
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 16px rgba(108,99,255,.08)', marginBottom: 18 }}>

          {/* Violet top bar */}
          <div style={{ height: 5, background: `linear-gradient(90deg, ${T.v}, ${T.bl})` }} />

          <div style={{ padding: '20px 22px 18px' }}>

            {/* Type chip + OA badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: T.v, background: T.v2, border: `1px solid ${T.v}30`, borderRadius: 20, padding: '2px 9px' }}>
                📄 Research Paper
              </span>
              {paper?.openAccess && (
                <span style={{ fontSize: 10, fontWeight: 700, color: T.gr, background: T.gr2, border: `1px solid ${T.gr}40`, borderRadius: 20, padding: '2px 9px' }}>
                  Open Access
                </span>
              )}
              {paper?.citations > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: T.bl, background: T.bl2, border: `1px solid ${T.bl}40`, borderRadius: 20, padding: '2px 9px' }}>
                  {paper.citations.toLocaleString()} citations
                </span>
              )}
            </div>

            {/* Title */}
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, lineHeight: 1.35, color: T.text, marginBottom: 10 }}>
              {paper?.title || doi}
            </div>

            {/* Authors */}
            {paper?.authors && (
              <div style={{ fontSize: 12.5, color: T.mu, marginBottom: 8, lineHeight: 1.5 }}>
                {paper.authors}
              </div>
            )}

            {/* Journal · Year · Publisher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {paper?.journal && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.v }}>{paper.journal}</span>
              )}
              {paper?.year && (
                <span style={{ fontSize: 12, color: T.mu }}>· {paper.year}</span>
              )}
              {paper?.publisher && paper.publisher !== paper?.journal && (
                <span style={{ fontSize: 11.5, color: T.mu }}>· {paper.publisher}</span>
              )}
            </div>

            {/* Abstract */}
            {abstract && (
              <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: '13px 15px', marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: T.v, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>Abstract</div>
                <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8 }}>{displayAbstract}</div>
                {isLongAbstract && (
                  <button onClick={() => setAbstractOpen(o => !o)}
                    style={{ marginTop: 8, fontSize: 12, color: T.v, fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                    {abstractOpen ? '↑ Collapse' : '↓ Read full abstract'}
                  </button>
                )}
              </div>
            )}

            {/* DOI + actions row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 22, background: T.v, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                Read paper ↗
              </a>
              <FollowBtn
                targetType="paper"
                targetId={doi}
                currentUserId={currentUserId}
                label="Follow Paper"
                onToggle={(now) => setFollowerCount(c => now ? c + 1 : Math.max(0, c - 1))}
              />
              <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: T.mu, textDecoration: 'none', marginLeft: 'auto', fontFamily: 'monospace', opacity: .7 }}>
                {doi}
              </a>
            </div>
          </div>

          {/* Stats footer */}
          <div style={{ borderTop: `1px solid ${T.bdr}`, background: T.s2, padding: '10px 22px', display: 'flex', gap: 20 }}>
            <span style={{ fontSize: 12, color: T.mu }}>
              <strong style={{ color: T.text }}>{followerCount}</strong> follower{followerCount !== 1 ? 's' : ''} on Luminary
            </span>
            <span style={{ fontSize: 12, color: T.mu }}>
              <strong style={{ color: T.text }}>{posts.length}</strong> post{posts.length !== 1 ? 's' : ''} discussing this paper
            </span>
          </div>
        </div>

        {/* ── Posts feed ── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: T.mu, marginBottom: 14 }}>
            Discussions on Luminary
          </div>

          {posts.length === 0 ? (
            <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, padding: '36px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
              <div style={{ fontSize: 34, marginBottom: 12 }}>💬</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, marginBottom: 8 }}>No discussions yet</div>
              <div style={{ fontSize: 13, color: T.mu }}>Be the first to share this paper on Luminary.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {posts.map(p => (
                <PostCard
                  key={p._itemKey || p.id}
                  post={p}
                  currentUserId={currentUserId}
                  currentProfile={currentProfile}
                  onRefresh={load}
                  onViewUser={onViewUser}
                  onViewPaper={onViewPaper}
                  hidePaperDetails
                />
              ))}
            </div>
          )}
        </div>

      </div>
    );
  })();

  // ── Public page wrapper (no sidebar) ──────────────────────────────────────
  if (isPublicPage) {
    return (
      <>
        {fonts}
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.text, background: T.bg, minHeight: '100vh' }}>
          {/* Minimal header */}
          <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="/" style={{ textDecoration: 'none', fontFamily: "'DM Serif Display',serif", fontSize: 20, color: T.text }}>
              Lumi<span style={{ color: T.v }}>nary</span>
            </a>
            <span style={{ color: T.bdr }}>|</span>
            <span style={{ fontSize: 12, color: T.mu }}>Paper discussion</span>
          </div>
          {pageContent}
        </div>
      </>
    );
  }

  // ── In-app wrapper ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '11px 20px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.mu, padding: '0 4px', fontFamily: 'inherit', lineHeight: 1 }}>
          ←
        </button>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16 }}>
            {loading ? 'Paper' : (paper?.title?.slice(0, 60) + (paper?.title?.length > 60 ? '…' : '') || 'Paper')}
          </div>
          <div style={{ fontSize: 11, color: T.mu }}>Paper discussion</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {pageContent}
      </div>
    </div>
  );
}
