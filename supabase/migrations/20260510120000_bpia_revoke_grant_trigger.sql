-- Symmetric to 20260430140600_bpia_auto_grant_trigger.sql.
--
-- The auto-grant trigger keeps BPIA inserts in sync with brand_integration_grants
-- so newly-linked assets surface in get_brand_integration_summary. This migration
-- adds the inverse: when the LAST BPIA row for a (brand_profile_id, integration_id)
-- pair is deleted, soft-revoke the matching active grant.
--
-- Without this, deselecting every asset for a provider in onboarding/settings would
-- leave an orphan grant alive, and get_brand_integration_summary's grant->iaa join
-- (left-join with bpia) would still surface every asset under that integration as
-- "available", contradicting the user's intent.

create or replace function brand_profiles.bpia_revoke_grant_on_last_asset_delete_trigger()
returns trigger
language plpgsql
security definer
set search_path = brand_profiles, auth
as $$
declare
  resolved_integration_id uuid;
  remaining_count int;
begin
  select coalesce(old.integration_id, iaa.integration_id)
    into resolved_integration_id
    from brand_profiles.integration_accounts_assets iaa
    where iaa.id = old.integration_account_id;

  if resolved_integration_id is null then
    return old;
  end if;

  select count(*) into remaining_count
    from brand_profiles.brand_profile_integration_accounts bpia
    join brand_profiles.integration_accounts_assets iaa
      on iaa.id = bpia.integration_account_id
    where bpia.brand_profile_id = old.brand_profile_id
      and coalesce(bpia.integration_id, iaa.integration_id) = resolved_integration_id;

  if remaining_count > 0 then
    return old;
  end if;

  update brand_profiles.brand_integration_grants
    set revoked_at = now(),
        revoked_by = coalesce((select auth.uid()), revoked_by)
    where brand_profile_id = old.brand_profile_id
      and integration_id = resolved_integration_id
      and revoked_at is null;

  return old;
end;
$$;

drop trigger if exists bpia_revoke_grant_on_last_asset_delete
  on brand_profiles.brand_profile_integration_accounts;
create trigger bpia_revoke_grant_on_last_asset_delete
  after delete on brand_profiles.brand_profile_integration_accounts
  for each row execute function brand_profiles.bpia_revoke_grant_on_last_asset_delete_trigger();
