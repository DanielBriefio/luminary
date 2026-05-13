-- Add WhatsApp to the digital business card.
--
-- At conferences and field meet-ups the share-flow is dominated by mobile,
-- where WhatsApp is the default "stay-in-touch" channel — far more so than
-- LinkedIn. This gives card owners a one-tap "Message on WhatsApp" button
-- alongside the existing Connect / Save Contact / LinkedIn affordances.
--
-- `card_whatsapp` stores the raw phone number (any format — the client
-- strips non-digits before building the wa.me URL). `card_show_whatsapp`
-- defaults to false so existing users don't accidentally expose a number.

alter table profiles
  add column if not exists card_whatsapp      text,
  add column if not exists card_show_whatsapp boolean not null default false;
