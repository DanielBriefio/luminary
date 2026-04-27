// Embed src whitelist — only YouTube and Vimeo /embed URLs are kept.
const EMBED_SRC_RE = /^https:\/\/(www\.youtube\.com\/embed\/[\w-]+|player\.vimeo\.com\/video\/\d+)(\?[^"'<>\s]*)?$/;

export function sanitiseHtml(html) {
  if (!html) return '';
  const allowed = [
    'b','strong','i','em','u','h1','h2','h3','h4','ul','ol','li',
    'p','br','a','div','span','blockquote','sup','hr',
    'img','iframe','figure','figcaption',
  ];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (!allowed.includes(tag)) {
      el.replaceWith(document.createTextNode(el.textContent));
      return;
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (/^(https?:|mailto:|\/)/i.test(href)) el.setAttribute('href', href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    } else if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (!/^https:\/\//i.test(src)) {
        el.replaceWith(document.createTextNode(''));
        return;
      }
      el.setAttribute('src', src);
      if (alt) el.setAttribute('alt', alt);
      el.setAttribute('loading', 'lazy');
    } else if (tag === 'iframe') {
      const src = el.getAttribute('src') || '';
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (!EMBED_SRC_RE.test(src)) {
        el.replaceWith(document.createTextNode(''));
        return;
      }
      el.setAttribute('src', src);
      el.setAttribute('frameborder', '0');
      el.setAttribute('allow', 'accelerometer; encrypted-media; picture-in-picture');
      el.setAttribute('allowfullscreen', '');
    } else {
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
    }
  });
  return tmp.innerHTML;
}

export function isHtml(str) {
  return /<(b|strong|i|em|u|h1|h2|h3|h4|ul|ol|li|br|p|div|img|iframe|blockquote)[\s\/>]/i.test(str||'');
}

// Convert a YouTube watch / shorts / youtu.be URL or Vimeo URL into the
// canonical embed URL accepted by the sanitiser. Returns null if unsupported.
export function toEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return null;
}
