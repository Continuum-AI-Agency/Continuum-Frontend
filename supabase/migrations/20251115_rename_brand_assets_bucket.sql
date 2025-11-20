-- Remove legacy brand-assets bucket and replace with brand-profile-assets
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand assets - authenticated delete own'
  ) then
    drop policy "Brand assets - authenticated delete own" on storage.objects;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand assets - authenticated update own'
  ) then
    drop policy "Brand assets - authenticated update own" on storage.objects;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand assets - authenticated read'
  ) then
    drop policy "Brand assets - authenticated read" on storage.objects;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Brand assets - authenticated upload'
  ) then
    drop policy "Brand assets - authenticated upload" on storage.objects;
  end if;
end $$;

delete from storage.objects where bucket_id = 'brand-assets';
delete from storage.buckets where id = 'brand-assets';

insert into storage.buckets (id, name, public)
values ('brand-profile-assets', 'brand-profile-assets', false)
on conflict (id) do nothing;

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

