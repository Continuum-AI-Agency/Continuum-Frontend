-- Ensure authenticated users can manage brand document metadata for brands they own
grant usage on schema brand_profiles to authenticated;

grant select, insert, update, delete on brand_profiles.brand_documents to authenticated;
grant select, insert, update, delete on brand_profiles.brand_document_chunks to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'brand_documents'
      and policyname = 'Manage brand documents (owner)'
  ) then
    create policy "Manage brand documents (owner)"
      on brand_profiles.brand_documents
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.brand_profiles bp
          where bp.id = brand_profiles.brand_documents.brand_id
            and bp.created_by = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.brand_profiles bp
          where bp.id = brand_profiles.brand_documents.brand_id
            and bp.created_by = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'brand_profiles'
      and tablename = 'brand_document_chunks'
      and policyname = 'Manage brand document chunks (owner)'
  ) then
    create policy "Manage brand document chunks (owner)"
      on brand_profiles.brand_document_chunks
      for all
      to authenticated
      using (
        exists (
          select 1
          from brand_profiles.brand_documents bd
          join brand_profiles.brand_profiles bp on bp.id = bd.brand_id
          where bd.id = brand_profiles.brand_document_chunks.document_id
            and bp.created_by = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from brand_profiles.brand_documents bd
          join brand_profiles.brand_profiles bp on bp.id = bd.brand_id
          where bd.id = brand_profiles.brand_document_chunks.document_id
            and bp.created_by = auth.uid()
        )
      );
  end if;
end $$;

