-- Add tier1/tier2/tags columns to publications for DOI cache
alter table publications
  add column if not exists tier1 text    default '',
  add column if not exists tier2 text[]  default '{}',
  add column if not exists tags  text[]  default '{}';
