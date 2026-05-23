-- Extends brand_profiles.get_brand_integration_summary to include the
-- owner_user_id of the underlying user_integrations row. This powers the
-- "Tagged by" attribution in the AssignmentsDialog and BrandIntegrationsSwitcher
-- so callers can tell which teammate connected the OAuth that owns each asset.
--
-- All other columns, ORDER BY, security_definer settings, and grant ACLs are
-- preserved verbatim from 20260430140200_get_brand_integration_summary_requires_grant.sql.

create or replace function brand_profiles.get_brand_integration_summary(
  p_brand_profile_id uuid
)
returns table (
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
  platform_key            text,
  owner_user_id           uuid
)
language sql
stable
security definer
set search_path = brand_profiles, auth, public
as $$
  select
    bpia.id                         as assignment_id,
    iaa.id                          as integration_account_id,
    bpia.alias                      as alias,
    coalesce(bpia.alias, iaa.name, iaa.external_account_id, 'Account')
                                    as account_name,
    iaa.external_account_id         as external_account_id,
    iaa.status                      as account_status,
    bpia.created_at                 as linked_at,
    iaa.integration_id              as provider_integration_id,
    iaa.type                        as account_type,
    bpia.settings::jsonb            as settings,
    -- Mirror of TYPE_TO_PLATFORM_MAP in src/lib/integrations/platform.ts
    case lower(trim(iaa.type))
      when 'youtube_channel'              then 'youtube'
      when 'youtube'                      then 'youtube'
      when 'google_ad_account'            then 'googleAds'
      when 'google_ads_account'           then 'googleAds'
      when 'googleads_account'            then 'googleAds'
      when 'google_ads_customer'          then 'googleAds'
      when 'dv360_advertiser'             then 'dv360'
      when 'display_video_360_advertiser' then 'dv360'
      when 'displayvideo360_advertiser'   then 'dv360'
      when 'instagram_business_account'   then 'instagram'
      when 'instagram_account'            then 'instagram'
      when 'meta_instagram_account'       then 'instagram'
      when 'facebook_page'                then 'facebook'
      when 'facebook_account'             then 'facebook'
      when 'meta_ad_account'              then 'facebook'
      when 'meta_page'                    then 'facebook'
      when 'threads_profile'              then 'threads'
      when 'threads_account'              then 'threads'
      when 'meta_threads_account'         then 'threads'
      else case
        when lower(trim(iaa.type)) like '%youtube%'  then 'youtube'
        when lower(trim(iaa.type)) like '%tiktok%'   then 'tiktok'
        when lower(trim(iaa.type)) like '%amazon%'   then 'amazonAds'
        when lower(trim(iaa.type)) like '%linkedin%' then 'linkedin'
        else null
      end
    end                             as platform_key,
    ui.user_id                      as owner_user_id
  from brand_profiles.brand_profile_integration_accounts bpia
  join brand_profiles.integration_accounts_assets iaa
    on iaa.id = bpia.integration_account_id
  join brand_profiles.user_integrations ui
    on ui.id = iaa.integration_id
  -- Only surface integrations that have an active brand grant.
  join brand_profiles.brand_integration_grants g
    on g.integration_id = iaa.integration_id
   and g.brand_profile_id = bpia.brand_profile_id
   and g.revoked_at is null
  where bpia.brand_profile_id = p_brand_profile_id
    and exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = p_brand_profile_id
    )
  order by
    coalesce(bpia.alias, iaa.name, iaa.external_account_id, 'Account');
$$;

revoke all on function brand_profiles.get_brand_integration_summary(uuid) from public;
grant execute on function brand_profiles.get_brand_integration_summary(uuid) to authenticated;
