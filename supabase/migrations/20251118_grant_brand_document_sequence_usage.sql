-- Ensure authenticated users can insert into brand document chunk table sequences
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'brand_profiles'
      and c.relname = 'brand_document_chunks_id_seq'
  ) then
    execute 'grant usage, select on sequence brand_profiles.brand_document_chunks_id_seq to authenticated';
  end if;
end $$;


