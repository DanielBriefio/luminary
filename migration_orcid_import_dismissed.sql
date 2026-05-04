-- Persist the "don't show me the ORCID import modal" preference
-- server-side so it survives across browsers / devices. Was localStorage
-- (`orcid_import_dismissed_<user_id>`), which lost the flag whenever the
-- user signed in from a different device or cleared site data.
--
-- App.jsx now gates the auto-popup on this column being null.

alter table profiles
  add column if not exists orcid_import_dismissed_at timestamptz;
