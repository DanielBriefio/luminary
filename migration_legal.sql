-- Email and consent preferences on profiles
alter table profiles
  add column if not exists email_notifications  boolean     default true,
  add column if not exists email_marketing      boolean     default false,
  add column if not exists marketing_consent_at timestamptz default null,
  add column if not exists terms_accepted_at    timestamptz default null,
  add column if not exists privacy_accepted_at  timestamptz default null;
