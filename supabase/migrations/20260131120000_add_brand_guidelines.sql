create table if not exists brand_profiles.brand_guidelines (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brand_profiles.brand_profiles(id) on delete cascade,
  purpose text not null,
  notes text,
  status text not null default 'draft',
  version int not null default 1,
  colors jsonb not null,
  logo jsonb not null,
  typography jsonb not null,
  stationery jsonb not null,
  style_design jsonb not null,
  verbal_identity jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  created_by uuid,
  updated_by uuid
);

create table if not exists brand_profiles.brand_guideline_tags (
  id uuid primary key default gen_random_uuid(),
  guideline_id uuid not null references brand_profiles.brand_guidelines(id) on delete cascade,
  section text not null,
  label text not null,
  description text not null,
  embedding vector(1536),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_guidelines_brand_id on brand_profiles.brand_guidelines (brand_id);
create index if not exists idx_brand_guidelines_status on brand_profiles.brand_guidelines (status);
create index if not exists idx_brand_guidelines_purpose on brand_profiles.brand_guidelines (purpose);
create unique index if not exists uniq_brand_guidelines_version on brand_profiles.brand_guidelines (brand_id, purpose, version);
create index if not exists idx_guideline_tags_guideline_id on brand_profiles.brand_guideline_tags (guideline_id);
create index if not exists idx_guideline_tags_section on brand_profiles.brand_guideline_tags (section);

do $$ begin
  execute 'create index if not exists idx_guideline_tags_embedding_hnsw on brand_profiles.brand_guideline_tags using hnsw (embedding vector_cosine_ops)';
exception when others then
  null;
end $$;

alter table brand_profiles.brand_guidelines enable row level security;
alter table brand_profiles.brand_guideline_tags enable row level security;

grant usage on schema brand_profiles to authenticated;
grant select, insert, update, delete on brand_profiles.brand_guidelines to authenticated;
grant select, insert, update, delete on brand_profiles.brand_guideline_tags to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'brand_guidelines_status_check'
  ) then
    alter table brand_profiles.brand_guidelines
      add constraint brand_guidelines_status_check
      check (status in ('draft', 'review', 'approved', 'archived'));
  end if;
end $$;

create policy "Manage brand guidelines (onboarding owner)"
  on brand_profiles.brand_guidelines
  for all
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_guidelines.brand_id
        and uos.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_guidelines.brand_id
        and uos.user_id = auth.uid()
    )
  );

create policy "Manage brand guideline tags (onboarding owner)"
  on brand_profiles.brand_guideline_tags
  for all
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.brand_guidelines bg
      join brand_profiles.user_onboarding_states uos on uos.brand_id = bg.brand_id
      where bg.id = brand_profiles.brand_guideline_tags.guideline_id
        and uos.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from brand_profiles.brand_guidelines bg
      join brand_profiles.user_onboarding_states uos on uos.brand_id = bg.brand_id
      where bg.id = brand_profiles.brand_guideline_tags.guideline_id
        and uos.user_id = auth.uid()
    )
  );
