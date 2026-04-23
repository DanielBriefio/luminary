-- Add featured_at to track when a post was featured.
-- Used as the sort key in the feed so a featured post appears at the top
-- as of its featuring time, but new posts after that time naturally go above it.

alter table posts
  add column if not exists featured_at timestamptz;
