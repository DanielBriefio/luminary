-- Profile v2 migration: split address/location fields + rename work_mode 'both' → 'clinician_scientist'

-- 1. Add split address columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS work_street      TEXT,
  ADD COLUMN IF NOT EXISTS work_city        TEXT,
  ADD COLUMN IF NOT EXISTS work_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS work_country     TEXT;

-- 2. Add split location columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_city    TEXT,
  ADD COLUMN IF NOT EXISTS location_country TEXT;

-- 3. Migrate existing work_address data to work_street (keep work_address for backward compat)
UPDATE profiles
SET work_street = work_address
WHERE work_address IS NOT NULL AND work_address <> '' AND work_street IS NULL;

-- 4. Rename work_mode 'both' → 'clinician_scientist'
UPDATE profiles
SET work_mode = 'clinician_scientist'
WHERE work_mode = 'both';
