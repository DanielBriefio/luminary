import { T } from '../lib/constants';

// Single source of truth for post-content CSS rules that should apply
// regardless of which renderer (SafeHtml, PublicPostPage's article-body,
// RichTextEditor) is showing the HTML. Typography stays per-component
// because feed-card, article-page, and editor have legitimately different
// sizes / fonts. Element-level rules that should always be the same
// (img resize via data-width / data-size, figure + figcaption) live here.
//
// Mounted once at the App root so it covers both the authenticated app
// and the public routes (PublicPostPage, PublicProfilePage, etc.).
//
// `data-width` (10-100) is the modern free-form resize attribute; `data-size`
// (small | medium | large) is the legacy three-step attribute kept around
// so posts created before the drag-handle UI still render correctly. Only
// the sanitiser (htmlUtils.js) and the editor's resize toolbar can set
// either, so the global selectors won't leak into unrelated images.

// Build width rules at module load — 91 selectors, ~50 chars each ≈ 4.5KB.
// Cheaper than a runtime style-attribute pass and avoids needing to allow
// inline `style` on <img> through the sanitiser.
const WIDTH_RULES = (() => {
  let css = '';
  for (let w = 10; w <= 100; w += 1) {
    css += `img[data-width="${w}"]{width:${w}% !important;max-width:${w}% !important;height:auto !important;}`;
  }
  return css;
})();

export default function PostContentStyles() {
  return (
    <style>{`
      /* Free-form resize (drag handles in the editor write data-width).
         Use width (not max-width-only) so the chosen size renders even
         when the source image's natural width is smaller than the cap. */
      ${WIDTH_RULES}

      /* Legacy three-step resize. Equivalent to data-width 25 / 50 / 75. */
      img[data-size="small"]  { width: 25% !important; max-width: 25% !important; height: auto !important; }
      img[data-size="medium"] { width: 50% !important; max-width: 50% !important; height: auto !important; }
      img[data-size="large"]  { width: 75% !important; max-width: 75% !important; height: auto !important; }

      /* Figure + figcaption: scoped to our own figures so user-pasted
         figures from external sites don't accidentally pick up our
         centred / serif-italic look. */
      figure[data-luminary-fig] {
        margin: 20px auto;
        text-align: center;
      }
      figure[data-luminary-fig] img {
        margin: 0 auto;
        display: block;
      }
      figure[data-luminary-fig] > figcaption {
        margin: 8px auto 0;
        max-width: 600px;
        font-size: 13px;
        line-height: 1.5;
        color: ${T.mu};
        font-style: italic;
        text-align: center;
        padding: 0 12px;
      }
      /* Empty figcaption shows a placeholder while editing; stripped on
         render because contenteditable is only true inside the editor. */
      figure[data-luminary-fig] > figcaption[contenteditable="true"]:empty:before {
        content: attr(data-placeholder);
        color: ${T.bdr};
        font-style: italic;
        pointer-events: none;
      }
    `}</style>
  );
}
