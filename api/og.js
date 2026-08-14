'use strict';

// Credentials are the public anon key — safe to hardcode (same as browser bundle)
const SUPABASE_URL      = 'https://rtblqylhoswckvwwspcp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0YmxxeWxob3N3Y2t2d3dzcGNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUzOTQsImV4cCI6MjA5MTEyMTM5NH0.lHcaMtZ6a781g8RTVkddupNc7qV1Ll1lvBdtdsaIgOs';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function postMeta(post) {
  let title, description, image;

  if (post.is_deep_dive && post.deep_dive_title) {
    title = post.deep_dive_title;
    const plain = (post.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    description = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');

  } else if (post.post_type === 'paper' && post.paper_title) {
    title = post.paper_title;
    const byline = [post.paper_authors, post.paper_journal, post.paper_year]
      .filter(Boolean).join(' · ');
    const abstract = post.paper_abstract ? post.paper_abstract.slice(0, 250) : '';
    description = [byline, abstract].filter(Boolean).join(' — ');

  } else {
    const html  = post.content || '';
    // First line = text before the first block-level break
    const first = html.split(/<br\s*\/?>|<\/p>|<\/div>/i)[0]
                      .replace(/<[^>]+>/g, '').trim();
    const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    title       = first.slice(0, 100) + (first.length > 100 ? '…' : '');
    description = plain.slice(0, 280) + (plain.length > 280 ? '…' : '');
  }

  // Image priority: deep-dive cover → first of multi-image array → single image upload
  if (post.deep_dive_cover_url) {
    image = post.deep_dive_cover_url;
  } else if (post.image_urls && post.image_urls.length > 0) {
    image = post.image_urls[0];
  } else if (post.image_url && post.file_type === 'image') {
    image = post.image_url;
  }

  if (!title)       title       = 'Post on Luminary';
  if (!description) description = 'Research networking for scientists and medical affairs professionals.';
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

  const proto = ((req.headers['x-forwarded-proto'] || 'https') + '').split(',')[0].trim();
  const host  = req.headers.host;
  const canonicalUrl = `https://${host}/s/${id}`;

  // ── Fetch post data ───────────────────────────────────────────────────────
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

  const { title, description, image: postImage } = post
    ? postMeta(post)
    : { title: 'Post on Luminary', description: 'Research networking for scientists and medical affairs professionals.', image: null };

  const image      = postImage || `https://${host}/brand/og.png`;
  const authorLine = [authorName, authorInstitution].filter(Boolean).join(', ');

  // ── Fetch index.html and inject post-specific OG tags ─────────────────────
  let html = '';
  try {
    const r = await fetch(`${proto}://${host}/index.html`);
    html = await r.text();
  } catch {
    return res.redirect(307, canonicalUrl);
  }

  // Replace <title>
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${esc(title)} — Luminary</title>`
  );

  // Replace <meta name="description">
  html = html.replace(
    /<meta name="description"[^>]*\/>/,
    `<meta name="description" content="${esc(description)}"/>`
  );

  // Replace the entire Open Graph + Twitter block in one shot.
  // The block starts with <!-- Open Graph and ends at the last twitter:image tag.
  const ogBlock = [
    `<!-- Open Graph -->`,
    `    <meta property="og:type"        content="article"/>`,
    `    <meta property="og:site_name"   content="Luminary"/>`,
    `    <meta property="og:title"       content="${esc(title)}"/>`,
    `    <meta property="og:description" content="${esc(description)}"/>`,
    `    <meta property="og:url"         content="${esc(canonicalUrl)}"/>`,
    `    <meta property="og:image"       content="${esc(image)}"/>`,
    authorLine ? `    <meta property="article:author" content="${esc(authorLine)}"/>` : '',
    `    <meta name="twitter:card"        content="summary_large_image"/>`,
    `    <meta name="twitter:site"        content="@LuminaryScience"/>`,
    `    <meta name="twitter:title"       content="${esc(title)}"/>`,
    `    <meta name="twitter:description" content="${esc(description)}"/>`,
    `    <meta name="twitter:image"       content="${esc(image)}"/>`,
    `    <link rel="canonical"            href="${esc(canonicalUrl)}"/>`,
  ].filter(Boolean).join('\n');

  html = html.replace(
    /<!-- Open Graph[\s\S]*?<meta name="twitter:image"[^>]*\/>/,
    ogBlock
  );

  res.setHeader('Content-Type',  'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=3600');
  res.end(html);
};
