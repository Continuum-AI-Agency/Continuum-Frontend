UPDATE brand_profiles.brand_profiles
SET tier = 0
WHERE tier IS NULL;

ALTER TABLE brand_profiles.brand_profiles
  ALTER COLUMN tier SET DEFAULT 0;

ALTER TABLE brand_profiles.brand_profiles
  ALTER COLUMN tier SET NOT NULL;
