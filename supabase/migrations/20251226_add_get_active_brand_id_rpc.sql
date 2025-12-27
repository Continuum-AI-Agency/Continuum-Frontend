-- Expose a fast, RLS-safe lookup for the caller's active brand.
create or replace function brand_profiles.get_active_brand_id()
returns uuid
language sql
stable
security invoker
as $$
  select u.brand_id
  from brand_profiles.user_onboarding_states u
  join brand_profiles.permissions p
    on p.brand_profile_id = u.brand_id
   and p.user_id = auth.uid()
  where u.user_id = auth.uid()
    and u.is_active = true
  limit 1;
$$;
