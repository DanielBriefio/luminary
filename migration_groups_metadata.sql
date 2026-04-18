-- Add institution, company, country fields to groups
alter table groups
  add column if not exists institution text default '',
  add column if not exists company     text default '',
  add column if not exists country     text default '';
