'use strict';

// Credentials are the public anon key — safe to hardcode (same as browser bundle)
const SUPABASE_URL      = 'https://rtblqylhoswckvwwspcp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmxxeWxob3N3Y2t2d3dzcGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUzOTQsImV4cCI6MjA5MTEyMTM5NH0.lHcaMtZ6a781g8RTVkddupNc7qV1Ll1lvBdtdsaIgOs';

// Known social-media / link-preview crawlers
const BOT_RE = /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|vkshare|applebot|pinterest|iframely|embedly|outbrain|W3C_Validator/i;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function postMeta(post) {
  let title, description, image;

  if (post.post_type === 'paper' && post.paper_title) {
    title = post.paper_title;
    const byline = [post.paper_authors, post.paper_journal, post.paper_year]
      .filter(Boolean).join(' · ');
    const abstract = post.paper_abstract ? post.paper_abstract.slice(0, 250) : '';
    description = [byline, abstract].filter(Boolean).join(' — ');

  } else if (post.post_type === 'link' && post.link_title) {
    title       = post.link_title;
    description = post.link_url || '';
    // YouTube thumbnail
    const yt = post.link_url && YT_RE.exec(post.link_url);
    if (yt) image = `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;

  } else {
    const plain = (post.content || '').replace(/<[^>]+>/g, '').trim();
    title       = plain.slice(0, 100) + (plain.length > 100 ? '…' : '');
    description = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');
  }

  // Uploaded image takes priority over anything derived above
  if (post.image_url && post.file_type === 'image') image = post.image_url;

  if (!title)       title       = 'Post on Luminary';
  if (!description) description = 'Research networking for scientists and medical affairs professionals.';
  // image is resolved by the caller; null here means use the branded fallback
  return { title, description, image: image || null };
}

async function supabaseFetch(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey:        SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  return r.json();
}

module.exports = async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).send('Missing id');

  const ua    = req.headers['user-agent'] || '';
  const isBot = BOT_RE.test(ua);

  // ── Regular browsers: proxy the React SPA shell ───────────────────────────
  if (!isBot) {
    try {
      const proto = ((req.headers['x-forwarded-proto'] || 'https') + '').split(',')[0].trim();
      const r     = await fetch(`${proto}://${req.headers.host}/index.html`);
      const html  = await r.text();
      res.setHeader('Content-Type',  'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.end(html);
    } catch {
      return res.redirect(307, '/');
    }
  }

  // ── Social crawlers / bots: build rich OG response ────────────────────────
  let post = null, authorName = '', authorInstitution = '';

  try {
    const rows = await supabaseFetch(
      `posts_with_meta?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );
    post = rows?.[0] ?? null;
  } catch {}

  if (post?.user_id) {
    try {
      const rows = await supabaseFetch(
        `profiles?id=eq.${encodeURIComponent(post.user_id)}&select=name,institution&limit=1`
      );
      authorName        = rows?.[0]?.name        ?? '';
      authorInstitution = rows?.[0]?.institution ?? '';
    } catch {}
  }

  const canonicalUrl = `https://${req.headers.host}/s/${id}`;
  const { title, description, image: postImage } = post
    ? postMeta(post)
    : { title: 'Post on Luminary', description: 'Research networking for scientists.', image: null };

  // Always have an og:image — use the real image/thumbnail or the branded fallback
  const image = postImage || `https://${req.headers.host}/api/og-image`;

  const authorLine = [authorName, authorInstitution].filter(Boolean).join(', ');
  const twitterCard = 'summary_large_image';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(title)} — Luminary</title>
  <meta name="description" content="${esc(description)}">

  <!-- Open Graph -->
  <meta property="og:type"        content="article">
  <meta property="og:site_name"   content="Luminary">
  <meta property="og:title"       content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url"         content="${esc(canonicalUrl)}">
  ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
  ${authorLine ? `<meta property="article:author" content="${esc(authorLine)}">` : ''}

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="${twitterCard}">
  <meta name="twitter:site"        content="@LuminaryScience">
  <meta name="twitter:title"       content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  ${image ? `<meta name="twitter:image" content="${esc(image)}">` : ''}

  <link rel="canonical" href="${esc(canonicalUrl)}">
</head>
<body>
  <script>window.location.replace(${JSON.stringify(canonicalUrl)});</script>
  <p>Redirecting to Luminary…</p>
</body>
</html>`;

  res.setHeader('Content-Type',  'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=3600');
  res.end(html);
};
