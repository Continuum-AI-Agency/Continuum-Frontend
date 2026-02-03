-- Fix infinite recursion in RLS policies by establishing a strict hierarchy:
-- 1. permissions depends ONLY on auth.uid()
-- 2. brand_profiles depends on permissions (and auth.uid())
-- 3. No circular references allowed.

-- Clean up Permissions policies
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'brand_profiles' and tablename = 'permissions' loop
    execute format('drop policy %I on brand_profiles.permissions', pol.policyname);
  end loop;
end $$;

-- Clean up Brand Profiles policies
do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'brand_profiles' and tablename = 'brand_profiles' loop
    execute format('drop policy %I on brand_profiles.brand_profiles', pol.policyname);
  end loop;
end $$;

-- 1. Define Permissions Policy (Base Layer)
-- This must NOT query brand_profiles to avoid recursion.
create policy "Permissions owner access"
  on brand_profiles.permissions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Define Brand Profiles Policy (Dependent Layer)
-- Access if you created it OR if you have a permission entry.
-- This queries permissions, which is safe because permissions only queries auth.uid().
create policy "Manage brand profiles (owner or member)"
  on brand_profiles.brand_profiles
  for all
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1
      from brand_profiles.permissions p
      where p.brand_profile_id = id
        and p.user_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1
      from brand_profiles.permissions p
      where p.brand_profile_id = id
        and p.user_id = auth.uid()
    )
  );
