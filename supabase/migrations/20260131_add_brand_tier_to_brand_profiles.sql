ALTER TABLE brand_profiles.brand_profiles
  ADD COLUMN IF NOT EXISTS tier integer;

UPDATE brand_profiles.brand_profiles AS bp
SET tier = src.tier
FROM (
  SELECT brand_profile_id, MAX(tier) AS tier
  FROM brand_profiles.permissions
  WHERE tier IS NOT NULL
  GROUP BY brand_profile_id
) AS src
WHERE bp.id = src.brand_profile_id
  AND bp.tier IS NULL;
