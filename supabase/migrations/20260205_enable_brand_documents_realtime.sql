begin;
  do $$
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'brand_profiles'
        and tablename = 'brand_documents'
    ) then
      alter publication supabase_realtime add table brand_profiles.brand_documents;
    end if;
  end $$;

  do $$
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'brand_profiles'
        and tablename = 'brand_document_chunks'
    ) then
      alter publication supabase_realtime add table brand_profiles.brand_document_chunks;
    end if;
  end $$;
commit;
