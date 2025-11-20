-- Update policies to reference onboarding ownership during brand creation
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'brand_documents'
      and policyname = 'Manage brand documents (owner)'
  ) then
    drop policy "Manage brand documents (owner)" on brand_profiles.brand_documents;
  end if;
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'brand_document_chunks'
      and policyname = 'Manage brand document chunks (owner)'
  ) then
    drop policy "Manage brand document chunks (owner)" on brand_profiles.brand_document_chunks;
  end if;
end $$;

create policy "Manage brand documents (onboarding owner)"
  on brand_profiles.brand_documents
  for all
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_documents.brand_id
        and uos.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from brand_profiles.user_onboarding_states uos
      where uos.brand_id = brand_profiles.brand_documents.brand_id
        and uos.user_id = auth.uid()
    )
  );

create policy "Manage brand document chunks (onboarding owner)"
  on brand_profiles.brand_document_chunks
  for all
  to authenticated
  using (
    exists (
      select 1
      from brand_profiles.brand_documents bd
      join brand_profiles.user_onboarding_states uos
        on uos.brand_id = bd.brand_id
      where bd.id = brand_profiles.brand_document_chunks.document_id
        and uos.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from brand_profiles.brand_documents bd
      join brand_profiles.user_onboarding_states uos
        on uos.brand_id = bd.brand_id
      where bd.id = brand_profiles.brand_document_chunks.document_id
        and uos.user_id = auth.uid()
    )
  );

