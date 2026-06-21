// @-mention parsing + linkifying.
//
// Storage convention:
//   - Plain text (comments, paper-post commentary):   "@<slug>"
//   - HTML (deep dives, RichTextEditor output):       <a href="/p/<slug>" data-mention="<slug>">@Name</a>
//
// Slugs are unique on profiles (see profile_slug column), so we never
// have to disambiguate multiple "Daniel"s. The autocomplete shows
// display names to the user but writes slugs into the content.
//
// Render-side: mentionLinkifyPlain replaces "@<slug>" with a clickable
// link to /p/<slug>; HTML content already has the anchor so it just
// passes through the sanitiser.

import React from 'react';
import { T } from './constants';

// Slugs accept lowercase alphanumerics + hyphen (matches profile_slug
// generation). Negative lookbehind to avoid matching email addresses.
const MENTION_RE_PLAIN = /(^|[^a-zA-Z0-9_])@([a-z0-9][a-z0-9-]{1,50})/g;

export function parseMentionSlugsFromText(text) {
  if (!text) return [];
  const out = new Set();
  let m;
  MENTION_RE_PLAIN.lastIndex = 0;
  while ((m = MENTION_RE_PLAIN.exec(text)) !== null) out.add(m[2]);
  return Array.from(out);
}

export function parseMentionSlugsFromHtml(html) {
  if (!html) return [];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const out = new Set();
  tmp.querySelectorAll('a[data-mention]').forEach(a => {
    const slug = a.getAttribute('data-mention');
    if (slug) out.add(slug);
  });
  return Array.from(out);
}

// Unified entry point. `isHtml` follows the same convention as the
// rest of the codebase: deep dives are HTML, everything else plain.
export function parseAllMentionSlugs(content, isHtml) {
  if (isHtml) return parseMentionSlugsFromHtml(content);
  return parseMentionSlugsFromText(content);
}

// Render-time helper for plain text: split into React children with
// @<slug> turned into clickable links, http(s) URLs handled by the
// existing Linkify regex inline so callers don't need both wrappers.
const URL_RE = /(https?:\/\/[^\s<>"']+)/;
const COMBINED_RE = new RegExp(
  `${URL_RE.source}|(?:^|[^a-zA-Z0-9_])@([a-z0-9][a-z0-9-]{1,50})`,
  'g'
);

export function MentionAndLinkify({ text }) {
  if (!text) return null;
  const out = [];
  let last = 0;
  let m;
  COMBINED_RE.lastIndex = 0;
  while ((m = COMBINED_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      // URL match
      out.push(
        <a key={`u${m.index}`} href={m[1]} target="_blank" rel="noopener noreferrer"
           style={{color:T.v,textDecoration:'underline',wordBreak:'break-all'}}>
          {m[1]}
        </a>
      );
      last = m.index + m[1].length;
    } else if (m[2]) {
      // Mention match — preserve the leading boundary char (could be
      // whitespace, punctuation, or start-of-string)
      const slug = m[2];
      const matchStart = m.index;
      const atIdx = text.indexOf('@', matchStart);
      if (atIdx > matchStart) out.push(text.slice(matchStart, atIdx));
      out.push(
        <a key={`m${m.index}`} href={`/p/${slug}`}
           style={{color:T.v,textDecoration:'none',fontWeight:600}}>
          @{slug}
        </a>
      );
      last = atIdx + 1 + slug.length;
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// Find the @<query> prefix immediately before the caret (if any).
// Used by MentionAutocomplete to drive the dropdown. Returns
// `{ start, query }` so the host can replace text[start..caret] on
// selection, or null when no active query.
export function detectActiveMention(text, caret) {
  if (caret == null || caret > text.length) return null;
  let i = caret - 1;
  // Walk backward until non-mention character or @.
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      // Verify the @ is at start-of-string or after a non-word char.
      if (i === 0 || /[^a-zA-Z0-9_]/.test(text[i - 1])) {
        return { start: i, query: text.slice(i + 1, caret) };
      }
      return null;
    }
    // Allow letters, digits, hyphen (slug chars).
    if (!/[a-zA-Z0-9-]/.test(ch)) return null;
    i--;
  }
  return null;
}
