-- Ensure authenticated users can manage their brand profile records
grant usage on schema brand_profiles to authenticated;

grant select, insert, update, delete on brand_profiles.brand_profiles to authenticated;

alter table if exists brand_profiles.brand_profiles enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'brand_profiles'
      and policyname = 'Manage brand profiles (owner or onboarding)'
  ) then
    drop policy "Manage brand profiles (owner or onboarding)" on brand_profiles.brand_profiles;
  end if;
end $$;

create policy "Manage brand profiles (owner or onboarding)"
  on brand_profiles.brand_profiles
  for all
  to authenticated
  using (
    brand_profiles.brand_profiles.created_by = auth.uid()
    or exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_profiles.id
        and uos.user_id = auth.uid()
    )
  )
  with check (
    brand_profiles.brand_profiles.created_by = auth.uid()
    or exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_profiles.id
        and uos.user_id = auth.uid()
    )
  );


