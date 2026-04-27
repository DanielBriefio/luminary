import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T, getTierFromLumens } from '../lib/constants';
import Av from '../components/Av';
import Bdg from '../components/Bdg';
import Spinner from '../components/Spinner';
import SafeHtml from '../components/SafeHtml';
import PaperPreview from '../components/PaperPreview';
import FilePreview from '../components/FilePreview';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import ShareModal from '../components/ShareModal';
import FollowBtn from '../components/FollowBtn';
import { timeAgo } from '../lib/utils';

const READING = {
  maxWidth:    680,
  fontSize:    20,
  lineHeight:  1.7,
  paraSpacing: 22,
  titleSize:   42,
  metaSize:    13,
  authorSize:  15,
  sidepadding: 24,
  // Softer reading colour than T.text (#1b1d36 → ~12.6:1 contrast on T.bg
  // is high enough to feel aggressive). #2d2f48 lands at ~9.7:1 — still
  // WCAG AAA but easier on the eye for long-form reading. Used for body
  // copy and headings on the article view; hierarchy is carried by font
  // size + serif, not by colour.
  textColor:   '#2d2f48',
};

function calcReadMins(content) {
  const plain = (content || '').replace(/<[^>]+>/g, '').trim();
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
  return Math.max(1, Math.round(words / 200));
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el    = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      if (total <= 0) { setProgress(100); return; }
      setProgress(Math.min(100, (el.scrollTop / total) * 100));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0,
      height:3, background:T.bdr, zIndex:100,
    }}>
      <div style={{
        height:'100%', width:`${progress}%`,
        background:T.v, transition:'width .1s linear',
      }}/>
    </div>
  );
}

function ArticleHeader({ post, author, readMins }) {
  const isDeepDive = post.is_deep_dive === true;
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  const lines = plain.split('\n').filter(l => l.trim());
  const title = isDeepDive && lines[0] && lines[0].length < 120 ? lines[0] : null;

  return (
    <header style={{ marginBottom: 32 }}>
      {title && (
        <h1 style={{
          fontFamily:"'DM Serif Display', serif",
          fontSize: READING.titleSize,
          color: READING.textColor,
          lineHeight: 1.2,
          margin:'0 0 20px',
          fontWeight: 400,
        }}>
          {title}
        </h1>
      )}
      <div style={{
        display:'flex', alignItems:'center', gap:12,
        paddingBottom: 20, borderBottom:`1px solid ${T.bdr}`,
        marginBottom: 28,
      }}>
        {author?.profile_slug ? (
          <a href={`/p/${author.profile_slug}`} style={{ flexShrink:0, textDecoration:'none' }}>
            <Av size={40} name={author?.name || ''} color={author?.avatar_color || T.v}
              url={author?.avatar_url || ''} tier={author?.tier || null}/>
          </a>
        ) : (
          <Av size={40} name={author?.name || ''} color={author?.avatar_color || T.v}
            url={author?.avatar_url || ''} tier={author?.tier || null}/>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize: READING.authorSize, fontWeight:700, color:T.text, marginBottom:2 }}>
            {author?.profile_slug ? (
              <a href={`/p/${author.profile_slug}`} style={{ color:T.text, textDecoration:'none' }}>
                {author?.name || 'Unknown'}
              </a>
            ) : (author?.name || 'Unknown')}
          </div>
          <div style={{
            fontSize: READING.metaSize, color: T.mu,
            display:'flex', flexWrap:'wrap', gap:'0 8px',
          }}>
            {author?.title && <span>{author.title}</span>}
            {author?.title && author?.institution && <span>·</span>}
            {author?.institution && <span>{author.institution}</span>}
            {(author?.title || author?.institution) && <span>·</span>}
            <span>{formatDate(post.created_at)}</span>
            {readMins > 0 && <><span>·</span><span>{readMins} min read</span></>}
          </div>
        </div>
      </div>
    </header>
  );
}

function ArticleBody({ post, isDeepDive }) {
  const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
  const lines = plain.split('\n').filter(l => l.trim());
  const hasExtractedTitle = isDeepDive && lines[0] && lines[0].length < 120;

  let bodyHtml = post.content || '';
  if (hasExtractedTitle) {
    bodyHtml = bodyHtml
      .replace(/^<p[^>]*>.*?<\/p>/i, '')
      .replace(/^[^\n<]+(\n|<br\s*\/?>)?/, '')
      .trim();
  }

  return (
    <div
      className="article-body"
      style={{
        fontSize: READING.fontSize,
        lineHeight: READING.lineHeight,
        color: READING.textColor,
        fontFamily: isDeepDive
          ? "'DM Serif Display', Georgia, serif"
          : "'DM Sans', Arial, sans-serif",
      }}
    >
      {bodyHtml && <SafeHtml html={bodyHtml} tags={post.tags}/>}
      <style>{`
        .article-body p { margin: 0 0 ${READING.paraSpacing}px; }
        .article-body h1 {
          font-family: 'DM Serif Display', serif;
          font-size: 32px; color: ${READING.textColor};
          margin: 40px 0 16px; font-weight: 400; line-height: 1.25;
        }
        .article-body h2 {
          font-family: 'DM Serif Display', serif;
          font-size: 26px; color: ${READING.textColor};
          margin: 36px 0 14px; font-weight: 400; line-height: 1.3;
        }
        .article-body h3 {
          font-family: 'DM Sans', sans-serif;
          font-size: 20px; font-weight: 700; color: ${READING.textColor};
          margin: 28px 0 10px;
        }
        .article-body h4 {
          font-family: 'DM Sans', sans-serif;
          font-size: 17px; font-weight: 700; color: ${READING.textColor};
          margin: 22px 0 8px;
        }
        .article-body ul, .article-body ol {
          margin: 0 0 ${READING.paraSpacing}px; padding-left: 26px;
        }
        .article-body li { margin-bottom: 8px; }
        .article-body blockquote {
          border-left: 3px solid ${T.v};
          margin: 24px 0; padding: 4px 0 4px 20px;
          color: ${T.mu}; font-style: italic;
        }
        .article-body a { color: ${T.v}; text-decoration: underline; }
        .article-body img {
          max-width: 100%; height: auto; border-radius: 8px;
          margin: 20px 0; display: block;
        }
        .article-body iframe {
          width: 100%; max-width: 100%;
          aspect-ratio: 16/9; height: auto;
          border-radius: 8px; margin: 20px 0; display: block; border: 0;
        }
        .article-body strong { font-weight: 700; color: ${READING.textColor}; }
      `}</style>
    </div>
  );
}

function ArticleFooter({ post, author, currentUserId, onShare, onJoinDiscussion }) {
  const isOwn = currentUserId && currentUserId === post.user_id;
  return (
    <footer style={{ marginTop: 48 }}>
      <div style={{ height:1, background:T.bdr, marginBottom:32 }}/>
      <div style={{
        display:'flex', gap:16, alignItems:'flex-start',
        padding:'20px 24px', background:T.w,
        borderRadius:12, border:`1px solid ${T.bdr}`, marginBottom:24,
      }}>
        {author?.profile_slug ? (
          <a href={`/p/${author.profile_slug}`} style={{ flexShrink:0, textDecoration:'none' }}>
            <Av size={52} name={author?.name || ''} color={author?.avatar_color || T.v}
              url={author?.avatar_url || ''} tier={author?.tier || null}/>
          </a>
        ) : (
          <Av size={52} name={author?.name || ''} color={author?.avatar_color || T.v}
            url={author?.avatar_url || ''} tier={author?.tier || null}/>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:2 }}>
            {author?.name}
          </div>
          {(author?.title || author?.institution) && (
            <div style={{ fontSize:13, color:T.mu, marginBottom:8 }}>
              {[author?.title, author?.institution].filter(Boolean).join(' · ')}
            </div>
          )}
          {author?.bio && (
            <div style={{
              fontSize:14, color:T.text, lineHeight:1.6, marginBottom:12,
              display:'-webkit-box', WebkitLineClamp:3,
              WebkitBoxOrient:'vertical', overflow:'hidden',
            }}>
              {author.bio}
            </div>
          )}
          {!isOwn && currentUserId && (
            <FollowBtn targetType="user" targetId={post.user_id} currentUserId={currentUserId}/>
          )}
        </div>
      </div>
      <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
        <button onClick={onShare} style={{
          padding:'10px 24px', borderRadius:9,
          border:`1px solid ${T.bdr}`, background:T.w,
          fontSize:14, fontWeight:600, color:T.text,
          cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:6,
        }}>
          ↗ Share
        </button>
        <button onClick={onJoinDiscussion} style={{
          padding:'10px 24px', borderRadius:9, border:'none',
          background:T.v, fontSize:14, fontWeight:600, color:'#fff',
          cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:6,
        }}>
          💬 Join the discussion
        </button>
      </div>
    </footer>
  );
}

function CommentsSection({ post, currentUserId, sectionRef }) {
  const [comments,    setComments]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [text,        setText]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('comments')
        .select('*, profiles(name, avatar_color, avatar_url, profile_slug, institution)')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      setComments(data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [post.id]);

  const submit = async () => {
    if (!text.trim() || !currentUserId || submitting) return;
    setSubmitting(true);
    const { data } = await supabase
      .from('comments')
      .insert({ post_id: post.id, user_id: currentUserId, content: text.trim() })
      .select('*, profiles(name, avatar_color, avatar_url, profile_slug, institution)')
      .single();
    if (data) {
      setComments(c => [...c, data]);
      setText('');
    }
    setSubmitting(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    await supabase.from('comments').delete().eq('id', id);
    setComments(c => c.filter(x => x.id !== id));
  };

  return (
    <section ref={sectionRef} style={{ marginTop: 48 }}>
      <div style={{ height:1, background:T.bdr, marginBottom:24 }}/>
      <h2 style={{
        fontFamily:"'DM Serif Display', serif",
        fontSize:22, color:T.text, margin:'0 0 18px',
        fontWeight:400,
      }}>
        Discussion {comments.length > 0 && (
          <span style={{ color:T.mu, fontSize:16, fontFamily:"'DM Sans',sans-serif" }}>
            · {comments.length}
          </span>
        )}
      </h2>

      {loading ? (
        <div style={{ padding:'14px 0', color:T.mu, fontSize:13 }}>Loading comments…</div>
      ) : comments.length === 0 ? (
        <div style={{
          padding:'18px 16px', background:T.w, borderRadius:10,
          border:`1px solid ${T.bdr}`, color:T.mu, fontSize:13.5,
          textAlign:'center',
        }}>
          No comments yet — be the first to reply.
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
          {comments.map(c => (
            <div key={c.id} style={{
              display:'flex', gap:12, padding:'14px 16px',
              background:T.w, borderRadius:10, border:`1px solid ${T.bdr}`,
            }}>
              {c.profiles?.profile_slug ? (
                <a href={`/p/${c.profiles.profile_slug}`} style={{ flexShrink:0, textDecoration:'none' }}>
                  <Av size={32} name={c.profiles?.name || ''}
                    color={c.profiles?.avatar_color || T.v}
                    url={c.profiles?.avatar_url || ''}/>
                </a>
              ) : (
                <Av size={32} name={c.profiles?.name || ''}
                  color={c.profiles?.avatar_color || T.v}
                  url={c.profiles?.avatar_url || ''}/>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:700, fontSize:13.5, color:T.text }}>
                    {c.profiles?.profile_slug ? (
                      <a href={`/p/${c.profiles.profile_slug}`} style={{ color:T.text, textDecoration:'none' }}>
                        {c.profiles?.name || 'Unknown'}
                      </a>
                    ) : (c.profiles?.name || 'Unknown')}
                  </span>
                  <span style={{ fontSize:11.5, color:T.mu }}>{timeAgo(c.created_at)}</span>
                  {currentUserId === c.user_id && (
                    <button onClick={() => remove(c.id)} style={{
                      marginLeft:'auto', fontSize:11, color:T.mu,
                      border:'none', background:'transparent',
                      cursor:'pointer', opacity:.6, fontFamily:'inherit',
                    }}>
                      Delete
                    </button>
                  )}
                </div>
                <div style={{ fontSize:14, lineHeight:1.6, color:T.text, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                  {c.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {currentUserId ? (
        <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Add to the discussion…"
            rows={2}
            style={{
              flex:1, padding:'10px 14px', borderRadius:10,
              border:`1.5px solid ${T.bdr}`, fontSize:14,
              fontFamily:'inherit', outline:'none', resize:'vertical',
              minHeight:44, color:T.text, background:T.w,
            }}
          />
          <button onClick={submit} disabled={submitting || !text.trim()} style={{
            padding:'10px 20px', borderRadius:9, border:'none',
            background: text.trim() && !submitting ? T.v : T.bdr,
            color: text.trim() && !submitting ? '#fff' : T.mu,
            fontSize:14, fontWeight:700, fontFamily:'inherit',
            cursor: text.trim() && !submitting ? 'pointer' : 'default',
          }}>
            {submitting ? '…' : 'Reply'}
          </button>
        </div>
      ) : (
        <div style={{
          padding:'18px 20px', borderRadius:10,
          background:T.v2, border:`1px solid rgba(108,99,255,.2)`,
          textAlign:'center',
        }}>
          <div style={{ fontSize:14, color:T.text, marginBottom:8 }}>
            Sign in to join the discussion.
          </div>
          <a href="/" style={{
            display:'inline-block', background:T.v, color:'#fff',
            fontWeight:700, fontSize:13, textDecoration:'none',
            borderRadius:22, padding:'8px 22px',
          }}>
            Sign in to Luminary →
          </a>
        </div>
      )}
    </section>
  );
}

export default function PublicPostPage({ postId }) {
  const [post,          setPost]          = useState(null);
  const [author,        setAuthor]        = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [notFound,      setNotFound]      = useState(false);
  const [sharing,       setSharing]       = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const commentsRef = useRef(null);

  // Auth — public page, but if signed in we enable comment + follow.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data?.session?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setCurrentUserId(s?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Inject / clean up OG + Twitter meta tags
  useEffect(() => {
    if (!post) return;

    const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
    let ogTitle, ogDescription, ogImage;

    if (post.post_type === 'paper' && post.paper_title) {
      ogTitle = post.paper_title;
      const byline   = [post.paper_authors, post.paper_journal, post.paper_year].filter(Boolean).join(' · ');
      const abstract = post.paper_abstract ? post.paper_abstract.slice(0, 250) : '';
      ogDescription  = [byline, abstract].filter(Boolean).join(' — ');
    } else if (post.post_type === 'link' && post.link_title) {
      ogTitle = post.link_title;
      ogDescription = post.link_url || '';
      const yt = post.link_url && YT_RE.exec(post.link_url);
      if (yt) ogImage = `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
    } else {
      const html  = post.content || '';
      const first = html.split(/<br\s*\/?>|<\/p>|<\/div>/i)[0]
                        .replace(/<[^>]+>/g, '').trim();
      const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      ogTitle = first.slice(0, 100) + (first.length > 100 ? '…' : '');
      ogDescription = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');
    }
    if (post.image_url && post.file_type === 'image') ogImage = post.image_url;
    if (!ogTitle) ogTitle = 'Post on Luminary';
    if (!ogDescription) ogDescription = 'Research networking for scientists and medical affairs professionals.';

    const postUrl = `${window.location.origin}/s/${postId}`;
    const metas = [
      ['property', 'og:type',        'article'],
      ['property', 'og:site_name',   'Luminary'],
      ['property', 'og:title',       ogTitle],
      ['property', 'og:description', ogDescription],
      ['property', 'og:url',         postUrl],
      ...(ogImage ? [['property', 'og:image', ogImage]] : []),
      ['name', 'twitter:card',        ogImage ? 'summary_large_image' : 'summary'],
      ['name', 'twitter:site',        '@LuminaryScience'],
      ['name', 'twitter:title',       ogTitle],
      ['name', 'twitter:description', ogDescription],
      ...(ogImage ? [['name', 'twitter:image', ogImage]] : []),
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

  // Fetch post + author
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const { data: p } = await supabase
        .from('posts_with_meta').select('*').eq('id', postId).single();
      if (cancelled) return;
      if (!p) { setNotFound(true); setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, avatar_color, avatar_url, title, institution, bio, profile_slug, lumens_current_period')
        .eq('id', p.user_id).single();

      if (cancelled) return;
      const tier = profile ? getTierFromLumens(profile.lumens_current_period || 0) : null;

      setPost(p);
      setAuthor(profile ? { ...profile, tier } : null);

      const title = p.post_type === 'paper' && p.paper_title
        ? p.paper_title
        : (p.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 80);
      if (title) document.title = `${title} — Luminary`;
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:'100vh', fontFamily:"'DM Sans',sans-serif" }}>
      <Spinner/>
    </div>
  );

  if (notFound) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      height:'100vh', fontFamily:"'DM Sans',sans-serif", color:T.text, textAlign:'center', padding:'0 24px' }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🔍</div>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, marginBottom:8 }}>Post not found</div>
      <div style={{ fontSize:14, color:T.mu, marginBottom:24 }}>This post may have been deleted or is no longer public.</div>
      <a href="/" style={{ color:T.v, fontWeight:600, textDecoration:'none',
        background:T.v2, border:`1px solid rgba(108,99,255,.2)`, borderRadius:8, padding:'8px 18px' }}>
        ← Go to Luminary
      </a>
    </div>
  );

  const isDeepDive = post.is_deep_dive === true;
  const readMins   = calcReadMins(post.content);
  const canGoBack  = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div style={{ minHeight:'100vh', background:T.bg, fontFamily:"'DM Sans',sans-serif", color:T.text }}>
      <ReadingProgressBar/>

      {/* Top bar — kept for unauth visitor wayfinding */}
      <div style={{
        background:T.w, borderBottom:`1px solid ${T.bdr}`,
        padding:'0 24px', display:'flex', alignItems:'center',
        justifyContent:'space-between', height:52,
        position:'sticky', top:0, zIndex:50,
      }}>
        <a href="/" style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, textDecoration:'none', color:T.text }}>
          Lumi<span style={{ color:T.v }}>nary</span>
        </a>
        {!currentUserId && (
          <a href="/" style={{
            fontSize:12.5, color:T.v, fontWeight:600, textDecoration:'none',
            background:T.v2, border:`1px solid rgba(108,99,255,.2)`,
            borderRadius:8, padding:'7px 16px',
          }}>
            Join Luminary →
          </a>
        )}
      </div>

      {canGoBack && (
        <div style={{
          maxWidth: READING.maxWidth + 48, margin:'0 auto',
          padding:'16px 24px 0',
        }}>
          <button onClick={() => window.history.back()} style={{
            background:'none', border:'none', color:T.mu, fontSize:13,
            cursor:'pointer', fontFamily:'inherit', padding:0,
            display:'flex', alignItems:'center', gap:6,
          }}>
            ← Back
          </button>
        </div>
      )}

      <article style={{
        maxWidth: READING.maxWidth, margin:'0 auto',
        padding:`32px ${READING.sidepadding}px 0`,
      }}>
        <ArticleHeader post={post} author={author} readMins={readMins}/>

        <ArticleBody post={post} isDeepDive={isDeepDive}/>

        {/* Link preview */}
        {post.post_type === 'text' && (() => {
          const url = extractFirstUrl(post.content || '');
          return url ? <div style={{ marginTop:20 }}><LinkPreview url={url}/></div> : null;
        })()}

        {/* File attachment */}
        {post.image_url && (
          <div style={{ marginTop:20 }}>
            <FilePreview url={post.image_url} fileType={post.file_type || 'image'} fileName={post.file_name}/>
          </div>
        )}

        {/* Paper card */}
        {post.post_type === 'paper' && post.paper_title && (
          <div style={{ marginTop:28 }}>
            <PaperPreview post={post} currentUserId={currentUserId}/>
          </div>
        )}

        {/* Tags */}
        {(post.tier2?.length > 0 || post.tags?.length > 0) && (
          <div style={{ marginTop:28, paddingTop:18, borderTop:`1px solid ${T.bdr}`,
            display:'flex', gap:6, flexWrap:'wrap' }}>
            {(post.tier2 || []).map(t => (
              <Bdg key={`t2-${t}`} color="v">{t}</Bdg>
            ))}
            {(post.tags || []).map(t => (
              <span key={`tag-${t}`} style={{
                fontSize:11.5, color:T.mu, padding:'2px 9px',
                borderRadius:20, background:T.s2, border:`1px solid ${T.bdr}`,
              }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        <ArticleFooter
          post={post}
          author={author}
          currentUserId={currentUserId}
          onShare={() => setSharing(true)}
          onJoinDiscussion={() => commentsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' })}
        />

        <CommentsSection post={post} currentUserId={currentUserId} sectionRef={commentsRef}/>
      </article>

      <div style={{ height: 80 }}/>

      {sharing && <ShareModal post={post} onClose={() => setSharing(false)}/>}
    </div>
  );
}
