alter table profiles
  add column if not exists onboarding_completed boolean default false,
  add column if not exists topic_interests      text[]  default '{}';
