-- Create brand_profiles.permissions table to track user membership, role, and tier (payment plan).
create table if not exists brand_profiles.permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  role text not null default 'viewer',
  tier integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, brand_profile_id)
);

-- Add tier column if the table already existed without it.
alter table if exists brand_profiles.permissions
  add column if not exists tier integer;

-- Touch updated_at on changes.
create or replace function brand_profiles.touch_permissions_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists permissions_touch_updated_at on brand_profiles.permissions;
create trigger permissions_touch_updated_at
before update on brand_profiles.permissions
for each row execute function brand_profiles.touch_permissions_updated_at();

-- Basic RLS setup (admins will use service role; keep permissive for now for authenticated users).
alter table if exists brand_profiles.permissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'permissions'
      and policyname = 'Permissions owner access'
  ) then
    create policy "Permissions owner access"
      on brand_profiles.permissions
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
