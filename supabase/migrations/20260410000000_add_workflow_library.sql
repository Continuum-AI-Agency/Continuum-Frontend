create table if not exists public.workflow_library (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  content     jsonb       not null default '{}'::jsonb,
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default timezone('utc'::text, now()),
  updated_at  timestamptz not null default timezone('utc'::text, now()),
  constraint workflow_library_name_length check (char_length(trim(name)) between 1 and 160)
);

create index if not exists idx_workflow_library_name
  on public.workflow_library (lower(name));

grant select on table public.workflow_library to authenticated, anon;

alter table public.workflow_library enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename  = 'workflow_library'
      and policyname = 'Workflow library is readable by all'
  ) then
    create policy "Workflow library is readable by all"
      on public.workflow_library
      for select
      to authenticated
      using (true);
  end if;
end $$;
