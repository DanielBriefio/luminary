alter table profiles
  add column if not exists card_email          text default '',
  add column if not exists card_phone          text default '',
  add column if not exists card_address        text default '',
  add column if not exists card_linkedin       text default '',
  add column if not exists card_website        text default '',
  add column if not exists card_visible        boolean default true,
  add column if not exists card_show_email     boolean default false,
  add column if not exists card_show_phone     boolean default false,
  add column if not exists card_show_address   boolean default false,
  add column if not exists card_show_linkedin  boolean default true,
  add column if not exists card_show_website   boolean default true,
  add column if not exists card_show_orcid     boolean default true,
  add column if not exists card_show_twitter   boolean default true;
