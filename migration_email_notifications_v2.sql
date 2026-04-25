-- Phase 7B: Two more granular email-preference toggles.

alter table profiles
  add column if not exists email_notif_new_comment      boolean default true,
  add column if not exists email_notif_invite_redeemed  boolean default true;

-- Honour the master toggle for users who already disabled email_notifications.
update profiles
set
  email_notif_new_comment     = false,
  email_notif_invite_redeemed = false
where email_notifications = false;
