-- Group slug for public profile URL
alter table groups
  add column if not exists slug                    text unique,
  add column if not exists tier1                   text    default '',
  add column if not exists tier2                   text[]  default '{}',
  add column if not exists research_details        text    default '',
  add column if not exists public_show_members     boolean default true,
  add column if not exists public_show_leader      boolean default true,
  add column if not exists public_show_location    boolean default true,
  add column if not exists public_show_contact     boolean default false,
  add column if not exists public_show_posts       boolean default true,
  add column if not exists public_profile_enabled  boolean default false;

-- Auto-generate slug from group name on insert
create or replace function generate_group_slug()
returns trigger language plpgsql as $$
declare
  base_slug text;
  final_slug text;
  counter   integer := 0;
begin
  base_slug := lower(regexp_replace(new.name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  final_slug := base_slug;
  loop
    exit when not exists (
      select 1 from groups where slug = final_slug and id != new.id
    );
    counter    := counter + 1;
    final_slug := base_slug || '-' || counter;
  end loop;
  new.slug := final_slug;
  return new;
end;
$$;

drop trigger if exists group_slug_trigger on groups;
create trigger group_slug_trigger
  before insert on groups
  for each row
  when (new.slug is null or new.slug = '')
  execute function generate_group_slug();

-- Backfill slugs for existing groups without one
do $$
declare
  r record;
  base_slug text;
  final_slug text;
  counter integer;
begin
  for r in select id, name from groups where slug is null or slug = '' loop
    base_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    final_slug := base_slug;
    counter := 0;
    loop
      exit when not exists (select 1 from groups where slug = final_slug and id != r.id);
      counter    := counter + 1;
      final_slug := base_slug || '-' || counter;
    end loop;
    update groups set slug = final_slug where id = r.id;
  end loop;
end;
$$;

-- Group follows (users following groups to see their public posts in feed)
create table if not exists group_follows (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references groups(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table group_follows enable row level security;
create policy "gf_select" on group_follows for select using (true);
create policy "gf_insert" on group_follows for insert
  with check (auth.uid() = user_id);
create policy "gf_delete" on group_follows for delete
  using (auth.uid() = user_id);

create index if not exists idx_group_follows_user  on group_follows(user_id);
create index if not exists idx_group_follows_group on group_follows(group_id);

-- Track unread group posts per member
alter table group_members
  add column if not exists last_read_at timestamptz default now();
