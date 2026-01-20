drop table if exists public.reporting_cache;

create table if not exists brand_profiles.reporting_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null,
  provider text not null,
  scope_type text not null,
  account_id text not null,
  scope_id text not null,
  range_preset text not null,
  range_since date,
  range_until date,
  payload jsonb not null,
  fetched_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_bp_reporting_cache_cache_key
  on brand_profiles.reporting_cache (cache_key);

create index if not exists idx_bp_reporting_cache_key_fetched
  on brand_profiles.reporting_cache (cache_key, fetched_at desc);

create index if not exists idx_bp_reporting_cache_lookup
  on brand_profiles.reporting_cache (provider, scope_type, account_id);

create index if not exists idx_bp_reporting_cache_expires
  on brand_profiles.reporting_cache (expires_at);

alter table brand_profiles.reporting_cache enable row level security;
