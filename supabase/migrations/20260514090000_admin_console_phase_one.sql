create extension if not exists pg_trgm with schema extensions;

create table if not exists brand_profiles.admin_user_directory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  is_admin boolean not null default false,
  auth_created_at timestamptz,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists admin_user_directory_email_trgm_idx
  on brand_profiles.admin_user_directory
  using gin (lower(email) extensions.gin_trgm_ops);

create index if not exists admin_user_directory_name_trgm_idx
  on brand_profiles.admin_user_directory
  using gin (lower(coalesce(name, '')) extensions.gin_trgm_ops);

create index if not exists admin_user_directory_created_idx
  on brand_profiles.admin_user_directory (auth_created_at desc nulls last);

alter table brand_profiles.admin_user_directory enable row level security;

create or replace function brand_profiles.resolve_admin_user_directory_name(metadata jsonb)
returns text
language sql
stable
as $$
  select nullif(
    trim(
      coalesce(metadata->>'name', metadata->>'full_name', metadata->>'display_name', '') ||
      case
        when metadata ? 'first_name' or metadata ? 'last_name'
          then ' ' || coalesce(metadata->>'first_name', '') || ' ' || coalesce(metadata->>'last_name', '')
        else ''
      end
    ),
    ''
  );
$$;

create or replace function brand_profiles.sync_admin_user_directory()
returns trigger
language plpgsql
security definer
set search_path = brand_profiles, public
as $$
begin
  insert into brand_profiles.admin_user_directory (
    user_id,
    email,
    name,
    is_admin,
    auth_created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(new.email, 'unknown'),
    brand_profiles.resolve_admin_user_directory_name(coalesce(new.raw_user_meta_data, '{}'::jsonb)),
    case
      when new.raw_app_meta_data->>'is_admin' in ('true', 'false')
        then (new.raw_app_meta_data->>'is_admin')::boolean
      else false
    end,
    new.created_at,
    timezone('utc'::text, now())
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    name = excluded.name,
    is_admin = excluded.is_admin,
    auth_created_at = excluded.auth_created_at,
    updated_at = timezone('utc'::text, now());

  return new;
end;
$$;

drop trigger if exists sync_admin_user_directory_on_auth_users on auth.users;
create trigger sync_admin_user_directory_on_auth_users
after insert or update of email, raw_user_meta_data, raw_app_meta_data, created_at
on auth.users
for each row execute function brand_profiles.sync_admin_user_directory();

insert into brand_profiles.admin_user_directory (
  user_id,
  email,
  name,
  is_admin,
  auth_created_at,
  updated_at
)
select
  id,
  coalesce(email, 'unknown'),
  brand_profiles.resolve_admin_user_directory_name(coalesce(raw_user_meta_data, '{}'::jsonb)),
  case
    when raw_app_meta_data->>'is_admin' in ('true', 'false')
      then (raw_app_meta_data->>'is_admin')::boolean
    else false
  end,
  created_at,
  timezone('utc'::text, now())
from auth.users
on conflict (user_id) do update
set
  email = excluded.email,
  name = excluded.name,
  is_admin = excluded.is_admin,
  auth_created_at = excluded.auth_created_at,
  updated_at = timezone('utc'::text, now());

create or replace function brand_profiles.search_admin_user_directory(
  p_query text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  email text,
  name text,
  is_admin boolean,
  auth_created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = brand_profiles, public
as $$
  with normalized as (
    select
      lower(trim(coalesce(p_query, ''))) as query,
      greatest(1, least(coalesce(p_limit, 50), 200)) as limit_value,
      greatest(0, coalesce(p_offset, 0)) as offset_value
  ),
  filtered as (
    select d.*
    from brand_profiles.admin_user_directory d, normalized n
    where n.query = ''
       or lower(d.email) like '%' || n.query || '%'
       or lower(coalesce(d.name, '')) like '%' || n.query || '%'
  )
  select
    f.user_id,
    f.email,
    f.name,
    f.is_admin,
    f.auth_created_at,
    count(*) over() as total_count
  from filtered f, normalized n
  order by f.auth_created_at desc nulls last, f.email asc
  limit (select limit_value from normalized)
  offset (select offset_value from normalized);
$$;

revoke all on function brand_profiles.search_admin_user_directory(text, integer, integer) from public, anon, authenticated;
grant execute on function brand_profiles.search_admin_user_directory(text, integer, integer) to service_role;

create table if not exists brand_profiles.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  brand_profile_id uuid references brand_profiles.brand_profiles(id) on delete set null,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id uuid,
  status text not null default 'success',
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint admin_audit_status_check check (status in ('success', 'failed'))
);

create index if not exists admin_audit_log_created_idx
  on brand_profiles.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_actor_idx
  on brand_profiles.admin_audit_log (actor_user_id, created_at desc);

create index if not exists admin_audit_log_brand_idx
  on brand_profiles.admin_audit_log (brand_profile_id, created_at desc);

alter table brand_profiles.admin_audit_log enable row level security;

create table if not exists brand_profiles.workflow_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  content jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  source_canvas_workflow_id uuid,
  source_brand_profile_id uuid references brand_profiles.brand_profiles(id) on delete set null,
  promoted_by uuid,
  promoted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint brand_workflow_library_name_length check (char_length(trim(name)) between 1 and 160)
);

create index if not exists brand_workflow_library_name_idx
  on brand_profiles.workflow_library (lower(name));

alter table brand_profiles.workflow_library enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'workflow_library'
      and policyname = 'Workflow library readable by brand members'
  ) then
    create policy "Workflow library readable by brand members"
      on brand_profiles.workflow_library
      for select
      to authenticated
      using (true);
  end if;
end $$;

insert into brand_profiles.workflow_library (
  name,
  description,
  content,
  tags,
  created_at,
  updated_at
)
select
  name,
  description,
  content,
  tags,
  created_at,
  updated_at
from public.workflow_library
on conflict do nothing;
