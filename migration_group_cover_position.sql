-- Phase 12.5: drag-to-reposition for group covers
--
-- Stores the chosen `object-position` value (e.g. "50% 30%") so the
-- group cover crops the same way at every display site (GroupProfile,
-- PublicGroupProfileScreen, etc.) without modifying the underlying file.
-- Mirrors the deep-dive cover position pattern from Phase 12.1.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

alter table groups
  add column if not exists cover_position text default '50% 50%';
