-- Phase 1: brand-scoped token RPCs.
--
-- Both functions are SECURITY DEFINER. Their WHERE clauses are the only
-- access gate; audit any future change carefully.
--
-- Token decryption reuses the existing brand_profiles.decrypt_token(bytea) helper
-- (see 20260206_create_get_google_access_token_rpc.sql for prior art).

--------------------------------------------------------------------------------
-- list_brand_integrations: read-only summary for any brand member, including viewer.
--------------------------------------------------------------------------------
create or replace function brand_profiles.list_brand_integrations(p_brand_profile_id uuid)
returns table (
  grant_id uuid,
  integration_id uuid,
  provider text,
  granted_by uuid,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = brand_profiles, auth
as $$
  select
    g.id           as grant_id,
    g.integration_id,
    ui.provider,
    g.granted_by,
    g.granted_at
  from brand_profiles.brand_integration_grants g
  join brand_profiles.user_integrations ui on ui.id = g.integration_id
  where g.brand_profile_id = p_brand_profile_id
    and g.revoked_at is null
    and exists (
      select 1 from brand_profiles.permissions p
      where p.user_id = (select auth.uid())
        and p.brand_profile_id = p_brand_profile_id
    )
  order by g.granted_at desc;
$$;

revoke all on function brand_profiles.list_brand_integrations(uuid) from public;
grant execute on function brand_profiles.list_brand_integrations(uuid) to authenticated;

--------------------------------------------------------------------------------
-- get_brand_integration_token: returns DECRYPTED access token for a granted
-- integration. Restricted to owner|admin|operator (viewer cannot mint tokens).
-- Returns NULL when no eligible grant exists.
--------------------------------------------------------------------------------
create or replace function brand_profiles.get_brand_integration_token(
  p_brand_profile_id uuid,
  p_provider text
)
returns text
language plpgsql
security definer
set search_path = brand_profiles, auth, extensions
as $$
declare
  v_token bytea;
begin
  select ui.access_token_encrypted
    into v_token
    from brand_profiles.user_integrations ui
    join brand_profiles.brand_integration_grants g
      on g.integration_id = ui.id
     and g.brand_profile_id = p_brand_profile_id
     and g.revoked_at is null
   where ui.provider = p_provider
     and exists (
       select 1 from brand_profiles.permissions p
       where p.user_id = (select auth.uid())
         and p.brand_profile_id = p_brand_profile_id
         and p.role in ('owner', 'admin', 'operator')
     )
   order by g.granted_at desc
   limit 1;

  if v_token is null then
    return null;
  end if;

  return brand_profiles.decrypt_token(v_token);
end;
$$;

revoke all on function brand_profiles.get_brand_integration_token(uuid, text) from public;
grant execute on function brand_profiles.get_brand_integration_token(uuid, text) to authenticated;
