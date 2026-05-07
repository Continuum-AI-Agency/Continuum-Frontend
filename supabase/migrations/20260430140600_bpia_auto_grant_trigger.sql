-- Phase 1 backward-compat hardening.
--
-- After 20260430140200_get_brand_integration_summary_requires_grant.sql, any
-- BPIA row without a matching active brand_integration_grants row becomes
-- invisible to the UI. The Phase 1 backfill handles existing rows, but every
-- legacy code path that INSERTs into brand_profile_integration_accounts (OAuth
-- callbacks, onboarding link flow, edge functions) would silently drop assets.
--
-- Rather than retrofit every call site, this trigger auto-creates a grant when
-- a BPIA row is inserted, keyed on the integration's owner. ON CONFLICT keeps
-- it idempotent — explicit grants from grant_integration_to_brand still win.
--
-- This means: existing teams (e.g. Privalia) keep working with no manual
-- intervention, AND any new code path that touches BPIA cannot accidentally
-- regress brand visibility.

-- COALESCE on new.integration_id falls back to the asset's integration_id when
-- the BPIA row was inserted without a direct integration_id reference. Mirrors
-- the same fallback applied in the 20260430140000 backfill.
create or replace function brand_profiles.bpia_ensure_grant_trigger()
returns trigger
language plpgsql
security definer
set search_path = brand_profiles, auth
as $$
declare
  resolved_integration_id uuid;
begin
  select coalesce(new.integration_id, iaa.integration_id)
    into resolved_integration_id
    from brand_profiles.integration_accounts_assets iaa
    where iaa.id = new.integration_account_id;

  if resolved_integration_id is null then
    return new;
  end if;

  insert into brand_profiles.brand_integration_grants
    (brand_profile_id, integration_id, granted_by, granted_at)
  select
    new.brand_profile_id,
    resolved_integration_id,
    ui.user_id,
    now()
  from brand_profiles.user_integrations ui
  where ui.id = resolved_integration_id
  on conflict (brand_profile_id, integration_id) where revoked_at is null do nothing;

  return new;
end;
$$;

drop trigger if exists bpia_ensure_grant
  on brand_profiles.brand_profile_integration_accounts;
create trigger bpia_ensure_grant
  after insert on brand_profiles.brand_profile_integration_accounts
  for each row execute function brand_profiles.bpia_ensure_grant_trigger();

-- Sanity backfill repeat: in case any BPIA rows were inserted between
-- 20260430140000 and this migration's apply (e.g. during a multi-step deploy),
-- catch them up. Idempotent. Uses the same COALESCE fallback as the original
-- backfill in 20260430140000.
insert into brand_profiles.brand_integration_grants
  (brand_profile_id, integration_id, granted_by, granted_at)
select distinct
  bpia.brand_profile_id,
  coalesce(bpia.integration_id, iaa.integration_id) as integration_id,
  ui.user_id as granted_by,
  coalesce(bpia.created_at, now()) as granted_at
from brand_profiles.brand_profile_integration_accounts bpia
join brand_profiles.integration_accounts_assets iaa on iaa.id = bpia.integration_account_id
join brand_profiles.user_integrations ui
  on ui.id = coalesce(bpia.integration_id, iaa.integration_id)
where coalesce(bpia.integration_id, iaa.integration_id) is not null
on conflict (brand_profile_id, integration_id) where revoked_at is null do nothing;
