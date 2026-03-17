create table if not exists brand_profiles.paid_media_catalog_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  catalog_id uuid not null references brand_profiles.paid_media_product_catalogs(id) on delete cascade,
  external_product_id text not null,
  title text,
  availability text not null default 'unknown',
  image_url text,
  product_url text,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_media_catalog_products_external_id_length check (char_length(trim(external_product_id)) between 1 and 150),
  constraint paid_media_catalog_products_availability_check check (availability in ('in_stock', 'out_of_stock', 'preorder', 'unknown')),
  constraint paid_media_catalog_products_currency_check check (currency is null or char_length(trim(currency)) = 3)
);

create table if not exists brand_profiles.paid_media_ad_objects (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  platform text not null default 'meta',
  object_type text not null,
  external_object_id text not null,
  name text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_media_ad_objects_platform_check check (platform in ('meta')),
  constraint paid_media_ad_objects_type_check check (object_type in ('campaign', 'adset', 'ad')),
  constraint paid_media_ad_objects_external_id_length check (char_length(trim(external_object_id)) between 1 and 120)
);

create table if not exists brand_profiles.paid_media_product_ad_activity (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  catalog_id uuid not null references brand_profiles.paid_media_product_catalogs(id) on delete cascade,
  product_id uuid not null references brand_profiles.paid_media_catalog_products(id) on delete cascade,
  ad_object_id uuid not null references brand_profiles.paid_media_ad_objects(id) on delete cascade,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_from timestamptz,
  active_to timestamptz,
  source text not null default 'sync',
  sync_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_media_product_ad_activity_source_length check (char_length(trim(source)) between 1 and 64),
  constraint paid_media_product_ad_activity_seen_window check (last_seen_at >= first_seen_at)
);

create unique index if not exists uniq_paid_media_catalog_products_external
  on brand_profiles.paid_media_catalog_products (brand_id, catalog_id, external_product_id);

create index if not exists idx_paid_media_catalog_products_external_ci
  on brand_profiles.paid_media_catalog_products (brand_id, catalog_id, lower(external_product_id));

create unique index if not exists uniq_paid_media_ad_objects_external
  on brand_profiles.paid_media_ad_objects (brand_id, platform, object_type, external_object_id);

create index if not exists idx_paid_media_ad_objects_external_ci
  on brand_profiles.paid_media_ad_objects (brand_id, platform, object_type, lower(external_object_id));

create unique index if not exists uniq_paid_media_product_ad_activity_link
  on brand_profiles.paid_media_product_ad_activity (brand_id, catalog_id, product_id, ad_object_id);

create index if not exists idx_paid_media_product_ad_activity_product
  on brand_profiles.paid_media_product_ad_activity (brand_id, product_id, is_active);

create index if not exists idx_paid_media_product_ad_activity_ad_object
  on brand_profiles.paid_media_product_ad_activity (brand_id, ad_object_id, is_active);

create index if not exists idx_paid_media_product_ad_activity_seen
  on brand_profiles.paid_media_product_ad_activity (brand_id, catalog_id, last_seen_at desc);

create or replace function brand_profiles.touch_catalog_product_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create or replace function brand_profiles.touch_ad_object_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create or replace function brand_profiles.touch_product_ad_activity_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists paid_media_catalog_products_touch_updated_at on brand_profiles.paid_media_catalog_products;
create trigger paid_media_catalog_products_touch_updated_at
before update on brand_profiles.paid_media_catalog_products
for each row execute function brand_profiles.touch_catalog_product_updated_at();

drop trigger if exists paid_media_ad_objects_touch_updated_at on brand_profiles.paid_media_ad_objects;
create trigger paid_media_ad_objects_touch_updated_at
before update on brand_profiles.paid_media_ad_objects
for each row execute function brand_profiles.touch_ad_object_updated_at();

drop trigger if exists paid_media_product_ad_activity_touch_updated_at on brand_profiles.paid_media_product_ad_activity;
create trigger paid_media_product_ad_activity_touch_updated_at
before update on brand_profiles.paid_media_product_ad_activity
for each row execute function brand_profiles.touch_product_ad_activity_updated_at();

alter table brand_profiles.paid_media_catalog_products enable row level security;
alter table brand_profiles.paid_media_ad_objects enable row level security;
alter table brand_profiles.paid_media_product_ad_activity enable row level security;

drop policy if exists "Manage paid media catalog products (member)" on brand_profiles.paid_media_catalog_products;
create policy "Manage paid media catalog products (member)"
  on brand_profiles.paid_media_catalog_products
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

drop policy if exists "Manage paid media ad objects (member)" on brand_profiles.paid_media_ad_objects;
create policy "Manage paid media ad objects (member)"
  on brand_profiles.paid_media_ad_objects
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

drop policy if exists "Manage paid media product ad activity (member)" on brand_profiles.paid_media_product_ad_activity;
create policy "Manage paid media product ad activity (member)"
  on brand_profiles.paid_media_product_ad_activity
  for all
  to authenticated
  using (brand_profiles.has_brand_access(brand_id))
  with check (brand_profiles.has_brand_access(brand_id));

grant all on table brand_profiles.paid_media_catalog_products to authenticated, service_role, anon;
grant all on table brand_profiles.paid_media_ad_objects to authenticated, service_role, anon;
grant all on table brand_profiles.paid_media_product_ad_activity to authenticated, service_role, anon;
grant usage on schema brand_profiles to authenticated, service_role, anon;
