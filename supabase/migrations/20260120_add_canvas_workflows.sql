-- Add Canvas workflows for AI Studio templates
create table if not exists brand_profiles.canvas_workflows (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  name text not null,
  description text,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_canvas_workflows_brand_profile_id
  on brand_profiles.canvas_workflows (brand_profile_id);

create index if not exists idx_canvas_workflows_name
  on brand_profiles.canvas_workflows (lower(name));

grant usage on schema brand_profiles to authenticated;

grant select, insert, update, delete
  on brand_profiles.canvas_workflows
  to authenticated;

alter table brand_profiles.canvas_workflows enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'canvas_workflows'
      and policyname = 'Manage canvas workflows (member)'
  ) then
    create policy "Manage canvas workflows (member)"
      on brand_profiles.canvas_workflows
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.canvas_workflows.brand_profile_id
            and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.canvas_workflows.brand_profile_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end $$;
