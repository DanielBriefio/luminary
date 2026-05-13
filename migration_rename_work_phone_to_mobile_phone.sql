-- Rename the mislabelled `work_phone` column to `mobile_phone`.
--
-- The column was always used to capture a mobile/cell number (UI labelled
-- it "Mobile phone 📱", placeholder "+81 90 1234 5678"). The legacy name
-- was a holdover from a "work contact" grouping that originally lived
-- next to work_address — we've since split mobile from office phone and
-- the DB name needs to follow the UI's mental model so future code reads
-- naturally and the vCard export can be retyped as TEL;TYPE=CELL (it was
-- previously emitting TYPE=WORK, which would confuse address books).
--
-- Idempotent via a DO block + column-existence guards so re-running on a
-- DB that's already been migrated is a no-op.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='work_phone') then
    alter table profiles rename column work_phone to mobile_phone;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='card_show_work_phone') then
    alter table profiles rename column card_show_work_phone to card_show_mobile_phone;
  end if;
end $$;
