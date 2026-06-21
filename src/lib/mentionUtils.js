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

// Two plain-text storage formats supported, both producing the same
// notification target:
//   1. @[Display Name](slug)   — modern (matches Slack/LinkedIn). The
//      autocomplete writes this format on select so render-time shows
//      the full name.
//   2. @<slug>                 — legacy, still parsed for older comments.
// Slugs accept lowercase alphanumerics + hyphen (matches profile_slug
// generation). Negative lookbehind on bare slugs avoids matching email
// addresses.
const MENTION_RE_MARKER = /@\[([^\]]+)\]\(([a-z0-9][a-z0-9-]{1,50})\)/g;
const MENTION_RE_PLAIN  = /(^|[^a-zA-Z0-9_\])])@([a-z0-9][a-z0-9-]{1,50})/g;

export function parseMentionSlugsFromText(text) {
  if (!text) return [];
  const out = new Set();
  let m;
  MENTION_RE_MARKER.lastIndex = 0;
  while ((m = MENTION_RE_MARKER.exec(text)) !== null) out.add(m[2]);
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

// Strip mention markers down to readable text — "@[Daniel](daniel-r)"
// becomes "@Daniel". Used in non-clickable previews (the inline top-
// comment snippet under a feed card, notification bodies, etc.)
// where rendering links would conflict with the parent's click
// handler or layout constraints.
export function mentionsToPlainText(text) {
  if (!text) return '';
  return String(text).replace(/@\[([^\]]+)\]\(([a-z0-9][a-z0-9-]{1,50})\)/g, '@$1');
}

// Render-time helper for plain text: tokenises into React children
// supporting three patterns in one pass:
//   1. http(s) URLs                  → external link
//   2. @[Name](slug) markdown marker → "@Name" linked to /p/slug
//   3. @<slug> bare                  → "@<slug>" linked to /p/slug (legacy)
// Marker pattern is listed before the bare slug so a "@[Name](slug)"
// substring matches as a single marker rather than re-matching the
// trailing "(slug)" as a bare mention.
const COMBINED_RE = new RegExp(
  '(https?:\\/\\/[^\\s<>"\']+)' +
  '|@\\[([^\\]]+)\\]\\(([a-z0-9][a-z0-9-]{1,50})\\)' +
  '|(?:^|[^a-zA-Z0-9_\\])])@([a-z0-9][a-z0-9-]{1,50})',
  'g'
);

const mentionStyle = { color: T.v, textDecoration: 'none', fontWeight: 600 };

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
    } else if (m[3]) {
      // Marker mention "@[Name](slug)" — render the name as the link text
      const name = m[2];
      const slug = m[3];
      out.push(
        <a key={`mk${m.index}`} href={`/p/${slug}`} style={mentionStyle}>
          @{name}
        </a>
      );
      last = m.index + m[0].length;
    } else if (m[4]) {
      // Legacy bare slug mention — preserve the leading boundary char
      // (could be whitespace, punctuation, or start-of-string)
      const slug = m[4];
      const matchStart = m.index;
      const atIdx = text.indexOf('@', matchStart);
      if (atIdx > matchStart) out.push(text.slice(matchStart, atIdx));
      out.push(
        <a key={`m${m.index}`} href={`/p/${slug}`} style={mentionStyle}>
          @{slug}
        </a>
      );
      last = atIdx + 1 + slug.length;
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// Inserts one 'mention' notification per slug mentioned in `content`.
// Skips self-mentions. Deduped against existing unread mention notifs
// for the same post so simple edits don't re-fire. Caller passes
// their `supabase` client (no module-level dep here — keeps
// mentionUtils import-cycle-free).
export async function notifyMentioned(supabase, content, isHtml, actorId, postId) {
  if (!content || !postId) return;
  const slugs = parseAllMentionSlugs(content, isHtml);
  if (!slugs.length) return;
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, profile_slug')
    .in('profile_slug', slugs);
  if (!profs?.length) return;
  const recipients = profs
    .map(p => p.id)
    .filter(id => id && id !== actorId);
  if (!recipients.length) return;
  const { data: existing } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('notif_type', 'mention')
    .eq('target_id', postId)
    .eq('read', false)
    .in('user_id', recipients);
  const skip = new Set((existing || []).map(r => r.user_id));
  const fresh = recipients.filter(id => !skip.has(id));
  if (!fresh.length) return;
  await supabase.from('notifications').insert(
    fresh.map(uid => ({
      user_id:    uid,
      actor_id:   actorId,
      notif_type: 'mention',
      target_id:  postId,
      read:       false,
    }))
  );
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
