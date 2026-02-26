create table if not exists brand_profiles.paid_media_campaign_indexes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  meta_account_id text not null,
  name text not null,
  campaign_ids text[] not null default '{}',
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_media_campaign_indexes_name_length check (char_length(trim(name)) between 1 and 120)
);

create index if not exists idx_paid_media_campaign_indexes_brand_account
  on brand_profiles.paid_media_campaign_indexes (brand_id, meta_account_id);

create index if not exists idx_paid_media_campaign_indexes_campaign_ids
  on brand_profiles.paid_media_campaign_indexes using gin (campaign_ids);

create unique index if not exists uniq_paid_media_campaign_indexes_brand_account_name
  on brand_profiles.paid_media_campaign_indexes (brand_id, meta_account_id, lower(name));

create or replace function brand_profiles.touch_paid_media_campaign_indexes_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists paid_media_campaign_indexes_touch_updated_at on brand_profiles.paid_media_campaign_indexes;
create trigger paid_media_campaign_indexes_touch_updated_at
before update on brand_profiles.paid_media_campaign_indexes
for each row execute function brand_profiles.touch_paid_media_campaign_indexes_updated_at();

alter table brand_profiles.paid_media_campaign_indexes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'paid_media_campaign_indexes'
      and policyname = 'Manage paid media campaign indexes (member)'
  ) then
    create policy "Manage paid media campaign indexes (member)"
      on brand_profiles.paid_media_campaign_indexes
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = paid_media_campaign_indexes.brand_id
            and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = paid_media_campaign_indexes.brand_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end $$;
