-- Optimized RPC functions for integration summary fetching.
-- Replaces Edge Function HTTP round-trip (brand) and 2-query waterfall (user)
-- with single-query JOINs that include type-to-platform mapping in SQL.

--------------------------------------------------------------------------------
-- 1. Brand integration summary
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION brand_profiles.get_brand_integration_summary(
  p_brand_profile_id uuid
)
RETURNS TABLE (
  assignment_id           uuid,
  integration_account_id  uuid,
  alias                   text,
  account_name            text,
  external_account_id     text,
  account_status          text,
  linked_at               timestamptz,
  provider_integration_id uuid,
  account_type            text,
  settings                jsonb,
  platform_key            text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = brand_profiles, auth, public
AS $$
  SELECT
    bpia.id                         AS assignment_id,
    iaa.id                          AS integration_account_id,
    bpia.alias                      AS alias,
    COALESCE(bpia.alias, iaa.name, iaa.external_account_id, 'Account')
                                    AS account_name,
    iaa.external_account_id         AS external_account_id,
    iaa.status                      AS account_status,
    bpia.created_at                 AS linked_at,
    iaa.integration_id              AS provider_integration_id,
    iaa.type                        AS account_type,
    bpia.settings::jsonb            AS settings,
    -- Mirror of TYPE_TO_PLATFORM_MAP in src/lib/integrations/platform.ts
    CASE lower(trim(iaa.type))
      WHEN 'youtube_channel'              THEN 'youtube'
      WHEN 'youtube'                      THEN 'youtube'
      WHEN 'google_ad_account'            THEN 'googleAds'
      WHEN 'google_ads_account'           THEN 'googleAds'
      WHEN 'googleads_account'            THEN 'googleAds'
      WHEN 'google_ads_customer'          THEN 'googleAds'
      WHEN 'dv360_advertiser'             THEN 'dv360'
      WHEN 'display_video_360_advertiser' THEN 'dv360'
      WHEN 'displayvideo360_advertiser'   THEN 'dv360'
      WHEN 'instagram_business_account'   THEN 'instagram'
      WHEN 'instagram_account'            THEN 'instagram'
      WHEN 'meta_instagram_account'       THEN 'instagram'
      WHEN 'facebook_page'                THEN 'facebook'
      WHEN 'facebook_account'             THEN 'facebook'
      WHEN 'meta_ad_account'              THEN 'facebook'
      WHEN 'meta_page'                    THEN 'facebook'
      WHEN 'threads_profile'              THEN 'threads'
      WHEN 'threads_account'              THEN 'threads'
      WHEN 'meta_threads_account'         THEN 'threads'
      ELSE CASE
        WHEN lower(trim(iaa.type)) LIKE '%youtube%'  THEN 'youtube'
        WHEN lower(trim(iaa.type)) LIKE '%tiktok%'   THEN 'tiktok'
        WHEN lower(trim(iaa.type)) LIKE '%amazon%'   THEN 'amazonAds'
        WHEN lower(trim(iaa.type)) LIKE '%linkedin%' THEN 'linkedin'
        ELSE NULL
      END
    END                             AS platform_key
  FROM brand_profiles.brand_profile_integration_accounts bpia
  JOIN brand_profiles.integration_accounts_assets iaa
    ON iaa.id = bpia.integration_account_id
  WHERE bpia.brand_profile_id = p_brand_profile_id
    AND EXISTS (
      SELECT 1 FROM brand_profiles.permissions p
      WHERE p.user_id = auth.uid()
        AND p.brand_profile_id = p_brand_profile_id
    )
  ORDER BY
    COALESCE(bpia.alias, iaa.name, iaa.external_account_id, 'Account');
$$;

REVOKE ALL ON FUNCTION brand_profiles.get_brand_integration_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION brand_profiles.get_brand_integration_summary(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 2. User integration summary
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION brand_profiles.get_user_integration_summary(
  p_user_id uuid
)
RETURNS TABLE (
  asset_id              uuid,
  asset_name            text,
  asset_status          text,
  external_account_id   text,
  provider              text,
  asset_type            text,
  created_at            timestamptz,
  platform_key          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = brand_profiles, auth, public
AS $$
  SELECT
    iaa.id                    AS asset_id,
    COALESCE(iaa.name, ui.provider, 'Account')
                              AS asset_name,
    COALESCE(iaa.status, ui.status)
                              AS asset_status,
    iaa.external_account_id   AS external_account_id,
    ui.provider               AS provider,
    iaa.type                  AS asset_type,
    COALESCE(iaa.created_at, ui.created_at)
                              AS created_at,
    CASE lower(trim(iaa.type))
      WHEN 'youtube_channel'              THEN 'youtube'
      WHEN 'youtube'                      THEN 'youtube'
      WHEN 'google_ad_account'            THEN 'googleAds'
      WHEN 'google_ads_account'           THEN 'googleAds'
      WHEN 'googleads_account'            THEN 'googleAds'
      WHEN 'google_ads_customer'          THEN 'googleAds'
      WHEN 'dv360_advertiser'             THEN 'dv360'
      WHEN 'display_video_360_advertiser' THEN 'dv360'
      WHEN 'displayvideo360_advertiser'   THEN 'dv360'
      WHEN 'instagram_business_account'   THEN 'instagram'
      WHEN 'instagram_account'            THEN 'instagram'
      WHEN 'meta_instagram_account'       THEN 'instagram'
      WHEN 'facebook_page'                THEN 'facebook'
      WHEN 'facebook_account'             THEN 'facebook'
      WHEN 'meta_ad_account'              THEN 'facebook'
      WHEN 'meta_page'                    THEN 'facebook'
      WHEN 'threads_profile'              THEN 'threads'
      WHEN 'threads_account'              THEN 'threads'
      WHEN 'meta_threads_account'         THEN 'threads'
      ELSE CASE
        WHEN lower(trim(iaa.type)) LIKE '%youtube%'  THEN 'youtube'
        WHEN lower(trim(iaa.type)) LIKE '%tiktok%'   THEN 'tiktok'
        WHEN lower(trim(iaa.type)) LIKE '%amazon%'   THEN 'amazonAds'
        WHEN lower(trim(iaa.type)) LIKE '%linkedin%' THEN 'linkedin'
        ELSE NULL
      END
    END                       AS platform_key
  FROM brand_profiles.user_integrations ui
  JOIN brand_profiles.integration_accounts_assets iaa
    ON iaa.integration_id = ui.id
  WHERE ui.user_id = p_user_id
    AND p_user_id = auth.uid()
  ORDER BY
    COALESCE(iaa.name, ui.provider, 'Account');
$$;

REVOKE ALL ON FUNCTION brand_profiles.get_user_integration_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION brand_profiles.get_user_integration_summary(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 3. Indexes for JOIN performance
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_bpia_brand_profile_id
  ON brand_profiles.brand_profile_integration_accounts (brand_profile_id);

CREATE INDEX IF NOT EXISTS idx_bpia_integration_account_id
  ON brand_profiles.brand_profile_integration_accounts (integration_account_id);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id
  ON brand_profiles.user_integrations (user_id);

CREATE INDEX IF NOT EXISTS idx_iaa_integration_id
  ON brand_profiles.integration_accounts_assets (integration_id);
