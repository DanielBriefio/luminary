// Single source of truth for post-content CSS rules that should apply
// regardless of which renderer (SafeHtml, PublicPostPage's article-body,
// RichTextEditor) is showing the HTML. Typography stays per-component
// because feed-card, article-page, and editor have legitimately different
// sizes / fonts. Element-level rules that should always be the same
// (img resize via data-size) live here.
//
// Mounted once at the App root so it covers both the authenticated app
// and the public routes (PublicPostPage, PublicProfilePage, etc.).
//
// `data-size` is only ever set on <img> by the sanitiser (htmlUtils.js)
// or the RichTextEditor's resize toolbar — both paths gate on
// 'small'|'medium'|'large' — so a global `img[data-size]` selector is
// safe and won't leak into unrelated images.
export default function PostContentStyles() {
  return (
    <style>{`
      img[data-size="small"]  { max-width: 33% !important; }
      img[data-size="medium"] { max-width: 60% !important; }
      img[data-size="large"]  { max-width: 85% !important; }
    `}</style>
  );
}
