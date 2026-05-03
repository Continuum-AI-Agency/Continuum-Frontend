-- Phase 2 follow-up: surface, on /settings/integrations, every brand each of the
-- caller's connections is granted to.
--
-- The RPC is the inverse of list_brand_integrations: instead of "for THIS brand,
-- which connections are granted", it answers "for the caller's connections,
-- which brands have an active grant". Cross-brand by design — RLS would require
-- a per-brand fetch loop (N+1).
--
-- SECURITY DEFINER. The WHERE clause is the only access gate.

create or replace function brand_profiles.list_my_connection_grants()
returns table (
  integration_id uuid,
  brand_profile_id uuid,
  brand_name text,
  granted_at timestamptz
)
language sql
stable
security definer
set search_path = brand_profiles, auth
as $$
  select
    g.integration_id,
    g.brand_profile_id,
    bp.brand_name,
    g.granted_at
  from brand_profiles.brand_integration_grants g
  join brand_profiles.user_integrations ui on ui.id = g.integration_id
  join brand_profiles.brand_profiles bp on bp.id = g.brand_profile_id
  where ui.user_id = (select auth.uid())
    and g.revoked_at is null
  order by g.granted_at desc;
$$;

revoke all on function brand_profiles.list_my_connection_grants() from public;
grant execute on function brand_profiles.list_my_connection_grants() to authenticated;
