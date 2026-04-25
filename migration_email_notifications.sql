-- Phase 7A: Email notification system via Resend.
-- Adds granular email-preference toggles plus a one-shot welcome flag.

alter table profiles
  add column if not exists email_notif_new_follower   boolean default true,
  add column if not exists email_notif_new_message    boolean default true,
  add column if not exists email_notif_group_request  boolean default true,
  add column if not exists welcome_email_sent         boolean default false;

-- Backfill: users who previously turned the master toggle off keep all
-- granular prefs off. Everyone else inherits the column default (true).
update profiles
set
  email_notif_new_follower  = false,
  email_notif_new_message   = false,
  email_notif_group_request = false
where email_notifications = false;

-- Backfill: existing users predate this email system, so mark the welcome
-- email as already sent to prevent retroactive sends on first profile update.
update profiles
set welcome_email_sent = true
where created_at < now() - interval '1 hour';
