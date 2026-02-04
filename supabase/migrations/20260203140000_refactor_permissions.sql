alter table brand_profiles.permissions add column if not exists email text;

update brand_profiles.permissions p
set email = u.email
from auth.users u
where p.user_id = u.id
  and p.email is null;

grant usage on schema brand_profiles to authenticated;
grant select on brand_profiles.permissions to authenticated;
grant select on brand_profiles.invites to authenticated;

drop policy if exists "Permissions owner access" on brand_profiles.permissions;
drop policy if exists "View team permissions" on brand_profiles.permissions;

create policy "Permissions owner access"
  on brand_profiles.permissions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "View team permissions"
  on brand_profiles.permissions
  for select
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.permissions p
      where p.brand_profile_id = brand_profiles.permissions.brand_profile_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "View pending invites" on brand_profiles.invites;
drop policy if exists "View own invites" on brand_profiles.invites;

create policy "View pending invites"
  on brand_profiles.invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.permissions p
      where p.brand_profile_id = brand_profiles.invites.brand_profile_id
        and p.user_id = auth.uid()
    )
  );

create policy "View own invites"
  on brand_profiles.invites
  for select
  to authenticated
  using (email = auth.jwt() ->> 'email');
