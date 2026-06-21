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
      const href      = el.getAttribute('href') || '';
      const mention   = el.getAttribute('data-mention') || '';
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (/^(https?:|mailto:|\/)/i.test(href)) el.setAttribute('href', href);
      // Preserve mention slug so notifyMentioned can find it on save
      // and rendered posts know to skip target=_blank for internal links.
      if (mention && /^[a-z0-9][a-z0-9-]{1,50}$/.test(mention)) {
        el.setAttribute('data-mention', mention);
      } else {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (tag === 'img') {
      const src      = el.getAttribute('src') || '';
      const alt      = el.getAttribute('alt') || '';
      const dataSize = el.getAttribute('data-size')  || '';   // legacy S/M/L
      const dataWidth = el.getAttribute('data-width') || '';   // free-form 10-100
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (!/^https:\/\//i.test(src)) {
        el.replaceWith(document.createTextNode(''));
        return;
      }
      el.setAttribute('src', src);
      if (alt) el.setAttribute('alt', alt);
      el.setAttribute('loading', 'lazy');
      // data-width takes precedence (free-form). Falls back to legacy
      // data-size for posts created before the resize handle UI shipped.
      const wNum = parseInt(dataWidth, 10);
      if (Number.isFinite(wNum) && wNum >= 10 && wNum <= 100) {
        el.setAttribute('data-width', String(wNum));
      } else if (['small', 'medium', 'large'].includes(dataSize)) {
        el.setAttribute('data-size', dataSize);
      }
    } else if (tag === 'figure') {
      // Mark figures we own so we can scope CSS without leaking onto
      // user-pasted figures from elsewhere. Strip every other attribute.
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      el.setAttribute('data-luminary-fig', '1');
    } else if (tag === 'figcaption') {
      // Caption is a text container — strip attributes; child sanitisation
      // continues via the recursive walk so inline formatting (em, strong)
      // inside the caption survives.
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
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

// Strip HTML tags AND decode HTML entities (&nbsp;, &amp;, etc.) so that
// a preview generated from HTML reads cleanly. Plain regex strip leaves
// entity codes as literal text — use this instead of `.replace(/<[^>]+>/g, '')`
// anywhere a preview/excerpt is rendered.
export function htmlToPlain(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
}

export function isHtml(str) {
  // Anchor + span added so a text post containing only a mention link
  // (which produces "<a data-mention=...>@Name</a>") is rendered as
  // HTML — without this, isHtml returned false and the content showed
  // as literal text.
  return /<(b|strong|i|em|u|h1|h2|h3|h4|ul|ol|li|br|p|div|img|iframe|blockquote|a|span)[\s\/>]/i.test(str||'');
}

// Normalise pasted HTML (Word, Google Docs, websites) into clean semantic
// tags so the sanitiser preserves the formatting instead of stripping it.
// Pasted text is usually `<span style="font-weight:bold">…` rather than
// `<strong>…</strong>`, plus a lot of Word-specific cruft.
export function normalisePastedHtml(html) {
  if (!html) return '';

  // 0) Pre-DOM regex cleanup. Word puts metadata in conditional comments
  //    and `<xml>` blocks containing `<w:*>` / `<o:*>` elements. If they
  //    survive into the DOM their text content can leak into the editor
  //    ("Normal 0 21 false false false de-JP JA X-NONE …"). Strip them
  //    before parsing.
  html = html
    .replace(/<!--\[if [^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, '')  // mso conditional comments
    .replace(/<!--[\s\S]*?-->/g, '')                             // any other HTML comments
    .replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, '')                  // raw <xml>…</xml> blocks
    .replace(/<\/?(?:o|w|m|v):[a-z][\w-]*[^>]*>/gi, '');         // dangling o:/w:/m:/v: tags

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // 1) Strip Word/Docs metadata containers
  tmp.querySelectorAll('style, script, meta, link, title, head').forEach(el => el.remove());
  // Belt + braces: also strip any namespaced elements that survived.
  tmp.querySelectorAll('*').forEach(el => {
    const ln = el.localName || '';
    if (ln.startsWith('o:') || ln.startsWith('w:') || ln.startsWith('m:') || ln.startsWith('v:') || ln === 'xml') el.remove();
  });

  // 2) Convert style-encoded formatting → semantic tags. Walk every element
  //    and inspect its inline style; wrap text content if a style implies
  //    bold / italic / underline.
  const wrapWith = (el, tagName) => {
    const wrap = document.createElement(tagName);
    while (el.firstChild) wrap.appendChild(el.firstChild);
    el.appendChild(wrap);
  };

  tmp.querySelectorAll('[style]').forEach(el => {
    const style = (el.getAttribute('style') || '').toLowerCase();
    const isBold      = /font-weight\s*:\s*(bold|[6-9]00)/.test(style);
    const isItalic    = /font-style\s*:\s*italic/.test(style);
    const isUnderline = /text-decoration[^;]*underline/.test(style);
    if (isBold)      wrapWith(el, 'strong');
    if (isItalic)    wrapWith(el, 'em');
    if (isUnderline) wrapWith(el, 'u');
  });

  // 3) Convert <b> / <i> to canonical <strong> / <em> (sanitiser keeps both
  //    but renderers are friendlier to the semantic versions)
  tmp.querySelectorAll('b').forEach(el => {
    const s = document.createElement('strong');
    while (el.firstChild) s.appendChild(el.firstChild);
    el.replaceWith(s);
  });
  tmp.querySelectorAll('i').forEach(el => {
    const s = document.createElement('em');
    while (el.firstChild) s.appendChild(el.firstChild);
    el.replaceWith(s);
  });

  // 4) Unwrap <span> after we've extracted its formatting (the wrap above
  //    leaves the <span> shell behind). Replaces span with its inner content.
  tmp.querySelectorAll('span').forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  // 5) Convert <font color="..."> et al — drop the wrapper, keep contents.
  tmp.querySelectorAll('font, center').forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });

  // 6) Drop empty paragraphs left behind by Word
  tmp.querySelectorAll('p, div').forEach(el => {
    if (!el.textContent.trim() && !el.querySelector('img, br, hr, iframe')) {
      el.remove();
    }
  });

  return tmp.innerHTML;
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
