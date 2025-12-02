-- Enable authenticated users to read their own integrations and related assets

-- User integrations: allow select/insert/update for owner; delete restricted to owner
grant usage on schema brand_profiles to authenticated;
grant select, insert, update, delete on brand_profiles.user_integrations to authenticated;
grant select on brand_profiles.integration_accounts_assets to authenticated;

alter table if exists brand_profiles.user_integrations enable row level security;
alter table if exists brand_profiles.integration_accounts_assets enable row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'user_integrations'
      and policyname = 'User owns integration'
  ) then
    drop policy "User owns integration" on brand_profiles.user_integrations;
  end if;
end$$;

create policy "User owns integration"
  on brand_profiles.user_integrations
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'integration_accounts_assets'
      and policyname = 'Read assets for owned integrations'
  ) then
    drop policy "Read assets for owned integrations" on brand_profiles.integration_accounts_assets;
  end if;
end$$;

create policy "Read assets for owned integrations"
  on brand_profiles.integration_accounts_assets
  for select
  to authenticated
  using (
    exists (
      select 1 from brand_profiles.user_integrations ui
      where ui.id = integration_accounts_assets.integration_id
        and ui.user_id = auth.uid()
    )
  );
