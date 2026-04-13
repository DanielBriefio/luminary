import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Bdg from '../components/Bdg';
import Spinner from '../components/Spinner';
import SafeHtml from '../components/SafeHtml';
import PaperPreview from '../components/PaperPreview';
import FilePreview from '../components/FilePreview';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import ShareModal from '../components/ShareModal';
import { timeAgo } from '../lib/utils';

export default function PublicPostPage({ postId }) {
  const [post,     setPost]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sharing,  setSharing]  = useState(false);

  // Inject / clean up OG + Twitter meta tags dynamically
  // (covers JS-executing crawlers like LinkedIn's bot)
  useEffect(() => {
    if (!post) return;

    let ogTitle, ogDescription;
    if (post.post_type === 'paper' && post.paper_title) {
      ogTitle = post.paper_title;
      const byline = [post.paper_authors, post.paper_journal, post.paper_year].filter(Boolean).join(' · ');
      const abstract = post.paper_abstract ? post.paper_abstract.slice(0, 250) : '';
      ogDescription = [byline, abstract].filter(Boolean).join(' — ');
    } else if (post.post_type === 'link' && post.link_title) {
      ogTitle = post.link_title;
      ogDescription = post.link_url || '';
    } else {
      const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
      ogTitle = plain.slice(0, 100) + (plain.length > 100 ? '…' : '');
      ogDescription = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');
    }
    if (!ogTitle) ogTitle = 'Post on Luminary';
    if (!ogDescription) ogDescription = 'Research networking for scientists and medical affairs professionals.';

    const postUrl = `${window.location.origin}/s/${postId}`;
    const metas = [
      ['property', 'og:type',        'article'],
      ['property', 'og:site_name',   'Luminary'],
      ['property', 'og:title',       ogTitle],
      ['property', 'og:description', ogDescription],
      ['property', 'og:url',         postUrl],
      ['name',     'twitter:card',        'summary'],
      ['name',     'twitter:site',        '@LuminaryScience'],
      ['name',     'twitter:title',       ogTitle],
      ['name',     'twitter:description', ogDescription],
    ];

    const injected = metas.map(([attr, key, content]) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute('content', content);
      return el;
    });

    return () => { injected.forEach(el => el.remove()); };
  }, [post, postId]);

  useEffect(() => {
    document.title = 'Luminary';
    return () => { document.title = 'Luminary'; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: p } = await supabase
        .from('posts_with_meta')
        .select('*')
        .eq('id', postId)
        .single();

      if (cancelled) return;
      if (!p) { setNotFound(true); setLoading(false); return; }

      // Fetch author profile for slug + avatar
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_color, avatar_url, institution, profile_slug')
        .eq('id', p.user_id)
        .single();

      if (!cancelled) {
        const post = {
          ...p,
          author_name:       profile?.name        || p.author_name,
          author_avatar:     profile?.avatar_color || p.author_avatar,
          author_avatar_url: profile?.avatar_url   || '',
          author_institution:profile?.institution  || p.author_institution,
          author_slug:       profile?.profile_slug || null,
        };
        setPost(post);
        const title = p.post_type === 'paper' && p.paper_title
          ? p.paper_title
          : (p.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 80);
        if (title) document.title = `${title} — Luminary`;
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const typeColor = { text:'v', paper:'v', photo:'t', audio:'r', link:'a', tip:'g' };
  const typeLabel = { text:'Post', paper:'Paper', photo:'Photo', audio:'Audio', link:'Link', tip:'Tip' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif" }}>
      <Spinner />
    </div>
  );

  if (notFound) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'DM Sans',sans-serif", color: T.text, textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 24, marginBottom: 8 }}>Post not found</div>
      <div style={{ fontSize: 14, color: T.mu, marginBottom: 24 }}>This post may have been deleted or is no longer public.</div>
      <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '8px 18px' }}>
        ← Go to Luminary
      </a>
    </div>
  );

  const ytMatch = post.post_type === 'link' && post.link_url?.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: T.text }}>
      {/* Top bar */}
      <div style={{ background: T.w, borderBottom: `1px solid ${T.bdr}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, position: 'sticky', top: 0, zIndex: 10 }}>
        <a href="/" style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, textDecoration: 'none', color: T.text }}>
          Lumi<span style={{ color: T.v }}>nary</span>
        </a>
        <a href="/" style={{ fontSize: 12.5, color: T.v, fontWeight: 600, textDecoration: 'none', background: T.v2, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 8, padding: '7px 16px' }}>
          Join Luminary →
        </a>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 18px 64px' }}>
        {/* Post card */}
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(108,99,255,.07)' }}>
          <div style={{ padding: 20 }}>

            {/* Author row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
              {post.author_slug ? (
                <a href={`/p/${post.author_slug}`} style={{ flexShrink: 0 }}>
                  <Av color={post.author_avatar || 'me'} size={42} name={post.author_name} url={post.author_avatar_url || ''} />
                </a>
              ) : (
                <div style={{ flexShrink: 0 }}>
                  <Av color={post.author_avatar || 'me'} size={42} name={post.author_name} url={post.author_avatar_url || ''} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  {post.author_slug ? (
                    <a href={`/p/${post.author_slug}`} style={{ fontWeight: 700, fontSize: 14, color: T.v, textDecoration: 'none' }}>
                      {post.author_name || 'Researcher'}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 14, color: T.v }}>{post.author_name || 'Researcher'}</span>
                  )}
                  <Bdg color={typeColor[post.post_type] || 'v'}>{typeLabel[post.post_type] || 'Post'}</Bdg>
                </div>
                <div style={{ fontSize: 11, color: T.mu, marginTop: 2 }}>
                  {post.author_institution && `${post.author_institution} · `}{timeAgo(post.created_at)}
                </div>
              </div>
            </div>

            {/* Content */}
            {post.content && <SafeHtml html={post.content} tags={post.tags} />}

            {/* Link preview for text posts */}
            {post.post_type === 'text' && (() => {
              const url = extractFirstUrl(post.content || '');
              return url ? <LinkPreview url={url} /> : null;
            })()}

            {/* File attachment */}
            {post.image_url && (
              <FilePreview url={post.image_url} fileType={post.file_type || 'image'} fileName={post.file_name} />
            )}

            {/* Paper */}
            {post.post_type === 'paper' && post.paper_title && (
              <PaperPreview post={post} currentUserId={null} />
            )}

            {/* Link / YouTube */}
            {post.post_type === 'link' && post.link_title && (
              ytMatch ? (
                <div style={{ margin: '8px 0', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.bdr}` }}>
                  <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, background: '#000' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                      title={post.link_title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                    />
                  </div>
                  <a href={post.link_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{ padding: '9px 13px', background: T.s2, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>▶️</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.link_title}</div>
                        <div style={{ fontSize: 10.5, color: T.v }}>youtube.com</div>
                      </div>
                    </div>
                  </a>
                </div>
              ) : (
                <a href={post.link_url || '#'} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ background: T.s2, border: `1px solid ${T.bdr}`, borderRadius: 9, padding: '10px 13px', margin: '8px 0', display: 'flex', gap: 11, cursor: 'pointer' }}>
                    <div style={{ width: 50, height: 50, borderRadius: 8, background: T.am2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔗</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4, marginBottom: 2, color: T.text }}>{post.link_title}</div>
                      {post.link_url && <div style={{ fontSize: 10.5, color: T.v, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.link_url}</div>}
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 13, color: T.v, paddingTop: 2, fontWeight: 700 }}>↗</div>
                  </div>
                </a>
              )
            )}

            {/* Stats row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.bdr}` }}>
              <span style={{ fontSize: 12, color: T.mu, fontWeight: 600 }}>🤍 {parseInt(post.like_count) || 0}</span>
              <span style={{ fontSize: 12, color: T.mu, fontWeight: 600 }}>💬 {parseInt(post.comment_count) || 0}</span>
              <button
                onClick={() => setSharing(true)}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, border: `1.5px solid ${T.bdr}`, background: T.w, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 600, color: T.mu }}>
                ↗ Share
              </button>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: `linear-gradient(135deg, ${T.v2}, ${T.bl2})`, border: `1px solid rgba(108,99,255,.2)`, borderRadius: 14, padding: '22px 24px', marginTop: 16, textAlign: 'center' }}>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, marginBottom: 8 }}>
            Join the conversation on Luminary
          </div>
          <div style={{ fontSize: 13, color: T.mu, marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Like, comment, and connect with scientists and medical affairs professionals.
          </div>
          <a href="/" style={{ display: 'inline-block', background: T.v, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', borderRadius: 22, padding: '10px 26px', boxShadow: '0 3px 14px rgba(108,99,255,.3)' }}>
            Create your free account →
          </a>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '24px 0 0', color: T.mu, fontSize: 12 }}>
          Posted on{' '}
          <a href="/" style={{ color: T.v, fontWeight: 600, textDecoration: 'none' }}>Luminary</a>
          {' '}— Research networking for scientists
        </div>
      </div>

      {sharing && <ShareModal post={post} onClose={() => setSharing(false)} />}
    </div>
  );
}
