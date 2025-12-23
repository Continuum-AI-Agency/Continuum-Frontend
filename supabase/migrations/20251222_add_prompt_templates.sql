-- Add prompt templates for AI Studio
create table if not exists brand_profiles.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  name text not null,
  prompt text not null,
  category text not null default 'Custom',
  source text not null default 'custom',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_prompt_templates_brand_profile_id
  on brand_profiles.prompt_templates (brand_profile_id);

create index if not exists idx_prompt_templates_name
  on brand_profiles.prompt_templates (lower(name));

grant usage on schema brand_profiles to authenticated;

grant select, insert, update, delete
  on brand_profiles.prompt_templates
  to authenticated;

alter table brand_profiles.prompt_templates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'prompt_templates'
      and policyname = 'Manage prompt templates (member)'
  ) then
    create policy "Manage prompt templates (member)"
      on brand_profiles.prompt_templates
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.prompt_templates.brand_profile_id
            and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.permissions p
          where p.brand_profile_id = brand_profiles.prompt_templates.brand_profile_id
            and p.user_id = auth.uid()
        )
      );
  end if;
end $$;
