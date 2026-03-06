-- Migration: 20260304131500_fix_paid_media_campaign_indexes_permissions.sql
-- Description: Grant table-level permissions and optimize RLS policy for paid_media_campaign_indexes.

-- Grant table-level permissions to standard Supabase roles
GRANT ALL ON TABLE brand_profiles.paid_media_campaign_indexes TO authenticated, service_role, anon;

-- Re-grant on schema usage to ensure roles can access objects within 'brand_profiles'
GRANT USAGE ON SCHEMA brand_profiles TO authenticated, service_role, anon;

-- Optimize RLS policy to use 'has_brand_access' security definer helper
-- This avoids recursion or complex query plan errors from direct queries on permission tables.
DROP POLICY IF EXISTS "Manage paid media campaign indexes (member)" ON brand_profiles.paid_media_campaign_indexes;

CREATE POLICY "Manage paid media campaign indexes (member)"
  ON brand_profiles.paid_media_campaign_indexes
  FOR ALL
  TO authenticated
  USING (brand_profiles.has_brand_access(brand_id))
  WITH CHECK (brand_profiles.has_brand_access(brand_id));
