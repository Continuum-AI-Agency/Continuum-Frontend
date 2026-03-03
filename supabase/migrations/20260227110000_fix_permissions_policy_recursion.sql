-- Prevent recursive RLS evaluation on brand_profiles.permissions.
-- SQLSTATE 54001 ("statement too complex") can occur when permissions policies
-- query the same permissions table under RLS.

create or replace function brand_profiles.has_brand_access(brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = brand_profiles, auth, public
as $$
  select exists (
    select 1
    from brand_profiles.permissions p
    where p.user_id = auth.uid()
      and p.brand_profile_id = brand_id
  );
$$;

revoke all on function brand_profiles.has_brand_access(uuid) from public;
grant execute on function brand_profiles.has_brand_access(uuid) to authenticated;

drop policy if exists "View team permissions" on brand_profiles.permissions;
create policy "View team permissions"
  on brand_profiles.permissions
  for select
  to authenticated
  using (brand_profiles.has_brand_access(brand_profile_id));

drop policy if exists "View pending invites" on brand_profiles.invites;
create policy "View pending invites"
  on brand_profiles.invites
  for select
  to authenticated
  using (brand_profiles.has_brand_access(brand_profile_id));
