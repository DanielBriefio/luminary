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
      /* Use width (not max-width) so the chosen size renders even when
         the source image's natural width is smaller than the cap.
         max-width-only would silently render at natural size and the
         resize would have no visible effect on small uploads. */
      img[data-size="small"]  { width: 25% !important; max-width: 25% !important; height: auto !important; }
      img[data-size="medium"] { width: 50% !important; max-width: 50% !important; height: auto !important; }
      img[data-size="large"]  { width: 75% !important; max-width: 75% !important; height: auto !important; }
    `}</style>
  );
}
