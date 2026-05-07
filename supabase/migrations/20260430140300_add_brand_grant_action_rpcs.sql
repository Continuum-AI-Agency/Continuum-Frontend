-- Phase 2 of brand & user management overhaul.
-- Server-side grant/revoke RPCs. Both atomic by virtue of being single statements.
-- Validations duplicate the RLS write policies on brand_integration_grants so the
-- RPC fails with a clear error message instead of an opaque "permission denied".

--------------------------------------------------------------------------------
-- grant_integration_to_brand: idempotent. If an active grant already exists,
-- returns its id; otherwise creates a new active grant.
--
-- Caller must be owner|admin of the brand AND own the integration.
--------------------------------------------------------------------------------
create or replace function brand_profiles.grant_integration_to_brand(
  p_brand_profile_id uuid,
  p_integration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = brand_profiles, auth
as $$
declare
  v_caller uuid := (select auth.uid());
  v_grant_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from brand_profiles.permissions p
    where p.user_id = v_caller
      and p.brand_profile_id = p_brand_profile_id
      and p.role in ('owner', 'admin')
  ) then
    raise exception 'caller is not owner or admin of brand %', p_brand_profile_id
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from brand_profiles.user_integrations ui
    where ui.id = p_integration_id
      and ui.user_id = v_caller
  ) then
    raise exception 'caller does not own integration %', p_integration_id
      using errcode = '42501';
  end if;

  -- Idempotent insert: if an active grant exists, return its id.
  select id into v_grant_id
    from brand_profiles.brand_integration_grants
    where brand_profile_id = p_brand_profile_id
      and integration_id = p_integration_id
      and revoked_at is null;

  if v_grant_id is not null then
    return v_grant_id;
  end if;

  insert into brand_profiles.brand_integration_grants
    (brand_profile_id, integration_id, granted_by)
  values
    (p_brand_profile_id, p_integration_id, v_caller)
  returning id into v_grant_id;

  return v_grant_id;
end;
$$;

revoke all on function brand_profiles.grant_integration_to_brand(uuid, uuid) from public;
grant execute on function brand_profiles.grant_integration_to_brand(uuid, uuid) to authenticated;

--------------------------------------------------------------------------------
-- revoke_integration_from_brand: soft-revoke. Caller must be the granter or the
-- brand owner. Idempotent: revoking an already-revoked grant returns silently.
--------------------------------------------------------------------------------
create or replace function brand_profiles.revoke_integration_from_brand(
  p_grant_id uuid
)
returns void
language plpgsql
security definer
set search_path = brand_profiles, auth
as $$
declare
  v_caller uuid := (select auth.uid());
  v_brand_id uuid;
  v_granted_by uuid;
  v_already_revoked timestamptz;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select brand_profile_id, granted_by, revoked_at
    into v_brand_id, v_granted_by, v_already_revoked
    from brand_profiles.brand_integration_grants
    where id = p_grant_id;

  if v_brand_id is null then
    raise exception 'grant % not found', p_grant_id using errcode = '02000';
  end if;

  if v_already_revoked is not null then
    return;
  end if;

  if v_granted_by != v_caller and not exists (
    select 1 from brand_profiles.permissions p
    where p.user_id = v_caller
      and p.brand_profile_id = v_brand_id
      and p.role = 'owner'
  ) then
    raise exception 'caller is neither the granter nor the brand owner'
      using errcode = '42501';
  end if;

  update brand_profiles.brand_integration_grants
    set revoked_at = now(),
        revoked_by = v_caller
    where id = p_grant_id;
end;
$$;

revoke all on function brand_profiles.revoke_integration_from_brand(uuid) from public;
grant execute on function brand_profiles.revoke_integration_from_brand(uuid) to authenticated;
