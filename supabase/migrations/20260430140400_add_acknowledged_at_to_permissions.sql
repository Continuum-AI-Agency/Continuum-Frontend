-- Phase 5 of brand & user management overhaul.
-- Adds acknowledged_at so the UI can surface a "New" badge on freshly-accepted
-- members for 24h after acceptance.

alter table brand_profiles.permissions
  add column if not exists acknowledged_at timestamptz;

-- Index supports the "recently accepted" query used by BrandMembersSection:
--   created_at > now() - interval '24 hours' and acknowledged_at is null
create index if not exists permissions_unacknowledged_idx
  on brand_profiles.permissions (created_at desc)
  where acknowledged_at is null;
