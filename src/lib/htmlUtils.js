export function sanitiseHtml(html) {
  if (!html) return '';
  const allowed = ['b','strong','i','em','u','h2','h3','ul','ol','li','p','br','a','div','span'];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (!allowed.includes(tag)) {
      el.replaceWith(document.createTextNode(el.textContent));
    } else {
      [...el.attributes].forEach(attr => {
        if (!(tag === 'a' && attr.name === 'href')) {
          el.removeAttribute(attr.name);
        }
      });
      if (tag === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
  return tmp.innerHTML;
}

export function isHtml(str) {
  return /<(b|strong|i|em|u|h2|h3|ul|ol|li|br|p|div)[\s\/>]/i.test(str||'');
}
