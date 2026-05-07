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
  platform_key            text
)
language sql
stable
security definer
set search_path = brand_profiles, auth, public
as $$
  select
    coalesce(bpia.id, g.id)          as assignment_id,
    iaa.id                          as integration_account_id,
    bpia.alias                      as alias,
    coalesce(bpia.alias, iaa.name, iaa.external_account_id, 'Account')
                                    as account_name,
    iaa.external_account_id         as external_account_id,
    iaa.status                      as account_status,
    coalesce(bpia.created_at, g.granted_at)
                                    as linked_at,
    iaa.integration_id              as provider_integration_id,
    iaa.type                        as account_type,
    bpia.settings::jsonb            as settings,
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
    end                             as platform_key
  from brand_profiles.brand_integration_grants g
  join brand_profiles.integration_accounts_assets iaa
    on iaa.integration_id = g.integration_id
  left join brand_profiles.brand_profile_integration_accounts bpia
    on bpia.brand_profile_id = g.brand_profile_id
   and bpia.integration_account_id = iaa.id
  where g.brand_profile_id = p_brand_profile_id
    and g.revoked_at is null
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
