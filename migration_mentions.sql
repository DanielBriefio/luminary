-- @-mentions in posts + comments.
--
-- Notification mechanics:
--   - notif_type 'mention' is plain text, no enum change needed.
--   - Mentioned users get one in-app notification per post/comment.
--   - Email gated by a new opt-in email_notif_mention column (default
--     off — mentions create a tiny spam vector and we'd rather have
--     users opt in than opt out).
--
-- Mention storage: NOT stored in a separate table. We parse the
-- content at notification time and at render time. Identifier is the
-- mentioned user's profile_slug:
--   - Plain text (comments, paper-post commentary): "@<slug>"
--   - HTML (deep dives): <a href="/p/<slug>" data-mention="<slug>">@Name</a>
-- Slugs are unique on profiles so this avoids the multi-Daniel
-- disambiguation problem. See src/lib/mentionUtils.js.

alter table profiles
  add column if not exists email_notif_mention boolean default false;
