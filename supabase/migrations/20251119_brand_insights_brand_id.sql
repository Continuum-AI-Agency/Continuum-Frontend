-- Migrate brand insights tables to use brand_profiles.brand_profiles.id (brand_id) instead of platform_account_id.

set check_function_bodies = off;

begin;

-- 1) Add brand_id columns with FK to brand_profiles.brand_profiles
alter table if exists public.brand_insights_generations
  add column if not exists brand_id uuid references brand_profiles.brand_profiles(id);

alter table if exists public.brand_insights_trends
  add column if not exists brand_id uuid references brand_profiles.brand_profiles(id);

alter table if exists public.brand_insights_events
  add column if not exists brand_id uuid references brand_profiles.brand_profiles(id);

alter table if exists public.brand_insights_questions
  add column if not exists brand_id uuid references brand_profiles.brand_profiles(id);

-- 2) Backfill brand_id on generations by matching historical platform_account_id
--    to integration_accounts_assets.external_account_id
update public.brand_insights_generations g
set brand_id = bpia.brand_profile_id
from brand_profiles.brand_profile_integration_accounts bpia
join brand_profiles.integration_accounts_assets iaa on iaa.id = bpia.integration_account_id
where g.brand_id is null
  and g.platform_account_id is not null
  and iaa.external_account_id = g.platform_account_id;

update public.brand_insights_trends t
set brand_id = g.brand_id
from public.brand_insights_generations g
where t.brand_id is null
  and t.generation_id = g.id
  and g.brand_id is not null;

update public.brand_insights_events e
set brand_id = g.brand_id
from public.brand_insights_generations g
where e.brand_id is null
  and e.generation_id = g.id
  and g.brand_id is not null;

update public.brand_insights_questions q
set brand_id = g.brand_id
from public.brand_insights_generations g
where q.brand_id is null
  and q.generation_id = g.id
  and g.brand_id is not null;

-- 3) Enforce presence of brand_id; fail migration if backfill missed rows
do $$
begin
  if exists (select 1 from public.brand_insights_generations where brand_id is null) then
    raise exception 'brand_insights_generations.brand_id has NULL values after backfill';
  end if;
end $$;

alter table if exists public.brand_insights_generations
  alter column brand_id set not null;

alter table if exists public.brand_insights_trends
  alter column brand_id set not null;

alter table if exists public.brand_insights_events
  alter column brand_id set not null;

alter table if exists public.brand_insights_questions
  alter column brand_id set not null;

-- 4) Index brand_id for query performance
create index if not exists brand_insights_generations_brand_id_idx on public.brand_insights_generations (brand_id, week_start_date);
create index if not exists brand_insights_trends_brand_id_idx on public.brand_insights_trends (brand_id);
create index if not exists brand_insights_events_brand_id_idx on public.brand_insights_events (brand_id);
create index if not exists brand_insights_questions_brand_id_idx on public.brand_insights_questions (brand_id);

commit;
