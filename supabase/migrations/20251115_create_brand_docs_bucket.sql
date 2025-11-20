-- Ensure storage buckets required by onboarding flows exist
insert into storage.buckets (id, name, public)
values ('brand-docs', 'brand-docs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('brand-profile-assets', 'brand-profile-assets', false)
on conflict (id) do nothing;

-- Grant authenticated users controlled access to the brand-profile-assets bucket
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand profile assets - authenticated upload'
  ) then
    create policy "Brand profile assets - authenticated upload"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'brand-profile-assets');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand profile assets - authenticated read'
  ) then
    create policy "Brand profile assets - authenticated read"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'brand-profile-assets');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand profile assets - authenticated update own'
  ) then
    create policy "Brand profile assets - authenticated update own"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'brand-profile-assets' and owner = auth.uid())
      with check (bucket_id = 'brand-profile-assets' and owner = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand profile assets - authenticated delete own'
  ) then
    create policy "Brand profile assets - authenticated delete own"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'brand-profile-assets' and owner = auth.uid());
  end if;
end $$;

-- Grant authenticated users controlled access to the brand-docs bucket
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand docs - authenticated upload'
  ) then
    create policy "Brand docs - authenticated upload"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'brand-docs');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand docs - authenticated read'
  ) then
    create policy "Brand docs - authenticated read"
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'brand-docs');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand docs - authenticated update own'
  ) then
    create policy "Brand docs - authenticated update own"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'brand-docs' and owner = auth.uid())
      with check (bucket_id = 'brand-docs' and owner = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand docs - authenticated delete own'
  ) then
    create policy "Brand docs - authenticated delete own"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'brand-docs' and owner = auth.uid());
  end if;
end $$;

