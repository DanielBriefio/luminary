'use strict';

function decodeEntities(str) {
  return String(str)
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'");
}

function ogTag(html, prop) {
  const a = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"'<>]+)["']`, 'i'));
  if (a) return decodeEntities(a[1].trim());
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+property=["']og:${prop}["']`, 'i'));
  return b ? decodeEntities(b[1].trim()) : '';
}

function metaTag(html, name) {
  const a = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"'<>]+)["']`, 'i'));
  if (a) return decodeEntities(a[1].trim());
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"'<>]+)["'][^>]+name=["']${name}["']`, 'i'));
  return b ? decodeEntities(b[1].trim()) : '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad scheme');
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; LuminaryBot/1.0)',
        'Accept':          'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!r.ok || !(r.headers.get('content-type') || '').includes('html')) {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.json(null);
    }

    const html = await r.text();

    const title       = ogTag(html, 'title')       || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    const description = ogTag(html, 'description') || metaTag(html, 'description');
    const image       = ogTag(html, 'image');
    const publisher   = ogTag(html, 'site_name');

    if (!title && !image) {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.json(null);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.json({ title, description, image, publisher, url: r.url || url });

  } catch {
    clearTimeout(timer);
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.json(null);
  }
};
