create table if not exists brand_profiles.budget_pacing_cache (
  id               uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  ad_account_id    text not null,
  payload          jsonb not null,
  fetched_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budget_pacing_cache_brand_account_unique
    unique (brand_profile_id, ad_account_id)
);

create index if not exists idx_budget_pacing_cache_brand_account
  on brand_profiles.budget_pacing_cache (brand_profile_id, ad_account_id);

create or replace function brand_profiles.touch_budget_pacing_cache_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists budget_pacing_cache_touch_updated_at on brand_profiles.budget_pacing_cache;
create trigger budget_pacing_cache_touch_updated_at
before update on brand_profiles.budget_pacing_cache
for each row execute function brand_profiles.touch_budget_pacing_cache_updated_at();

alter table brand_profiles.budget_pacing_cache enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'budget_pacing_cache'
      and policyname = 'Manage budget pacing cache (member)'
  ) then
    create policy "Manage budget pacing cache (member)"
      on brand_profiles.budget_pacing_cache
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = budget_pacing_cache.brand_profile_id
            and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = budget_pacing_cache.brand_profile_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end $$;
