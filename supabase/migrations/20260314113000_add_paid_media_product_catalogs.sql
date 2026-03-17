create table if not exists brand_profiles.paid_media_product_catalogs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  external_catalog_id text not null,
  name text not null,
  business_id text,
  vertical text not null default 'commerce',
  feed_url text,
  default_image_url text,
  fallback_image_url text,
  linked_ad_object_level text not null default 'adset',
  linked_ad_object_ids text[] not null default '{}',
  data_feed_enabled boolean not null default true,
  product_tagging_enabled boolean not null default true,
  sync_status text not null default 'draft',
  product_count integer not null default 0,
  feed_count integer not null default 0,
  product_set_count integer not null default 0,
  last_synced_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_media_product_catalogs_name_length check (char_length(trim(name)) between 2 and 120),
  constraint paid_media_product_catalogs_external_id_length check (char_length(trim(external_catalog_id)) between 2 and 64),
  constraint paid_media_product_catalogs_nonnegative_counts check (
    product_count >= 0 and feed_count >= 0 and product_set_count >= 0
  ),
  constraint paid_media_product_catalogs_sync_status_check check (
    sync_status in ('active', 'stale', 'error', 'draft')
  ),
  constraint paid_media_product_catalogs_ad_level_check check (
    linked_ad_object_level in ('campaign', 'adset', 'ad')
  ),
  constraint paid_media_product_catalogs_vertical_check check (
    vertical in (
      'adoptable_pets',
      'commerce',
      'destinations',
      'flights',
      'generic',
      'home_listings',
      'hotels',
      'local_service_businesses',
      'offer_items',
      'offline_commerce',
      'transactable_items',
      'vehicles'
    )
  )
);

create unique index if not exists uniq_paid_media_product_catalogs_brand_external_id
  on brand_profiles.paid_media_product_catalogs (brand_id, external_catalog_id);

create index if not exists idx_paid_media_product_catalogs_brand_external_id_ci
  on brand_profiles.paid_media_product_catalogs (brand_id, lower(external_catalog_id));

create index if not exists idx_paid_media_product_catalogs_brand_name
  on brand_profiles.paid_media_product_catalogs (brand_id, lower(name));

create index if not exists idx_paid_media_product_catalogs_sync_status
  on brand_profiles.paid_media_product_catalogs (brand_id, sync_status);

create index if not exists idx_paid_media_product_catalogs_linked_ad_object_ids
  on brand_profiles.paid_media_product_catalogs using gin (linked_ad_object_ids);

create or replace function brand_profiles.touch_paid_media_product_catalogs_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists paid_media_product_catalogs_touch_updated_at on brand_profiles.paid_media_product_catalogs;
create trigger paid_media_product_catalogs_touch_updated_at
before update on brand_profiles.paid_media_product_catalogs
for each row execute function brand_profiles.touch_paid_media_product_catalogs_updated_at();

alter table brand_profiles.paid_media_product_catalogs enable row level security;

drop policy if exists "Manage paid media product catalogs (member)" on brand_profiles.paid_media_product_catalogs;
create policy "Manage paid media product catalogs (member)"
  on brand_profiles.paid_media_product_catalogs
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

grant all on table brand_profiles.paid_media_product_catalogs to authenticated, service_role, anon;
grant usage on schema brand_profiles to authenticated, service_role, anon;
