-- Ensure auth roles can access onboarding state storage
grant usage on schema brand_profiles to authenticated;

grant select, insert, update, delete on brand_profiles.user_onboarding_states to authenticated;

alter table brand_profiles.user_onboarding_states enable row level security;

create policy "Select own onboarding state"
  on brand_profiles.user_onboarding_states
  for select
  using (auth.uid() = user_id);

create policy "Insert own onboarding state"
  on brand_profiles.user_onboarding_states
  for insert
  with check (auth.uid() = user_id);

create policy "Update own onboarding state"
  on brand_profiles.user_onboarding_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Delete own onboarding state"
  on brand_profiles.user_onboarding_states
  for delete
  using (auth.uid() = user_id);

