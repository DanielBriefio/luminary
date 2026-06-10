-- Presentation/poster/lecture metadata: when the talk was given and
-- where. Permissive text — researchers don't remember exact dates
-- for older talks, so the UI accepts "2024-08-30", "Aug 2024", or
-- just "2024" with no validation. Both columns nullable; rendered
-- conditionally on pub_type in PubRow + the Vancouver export.

alter table publications
  add column if not exists event_date     text,
  add column if not exists event_location text;
