alter table brand_profiles.paid_media_product_catalogs
  add column if not exists catalog_store_id text;

create index if not exists idx_paid_media_product_catalogs_brand_catalog_store_id
  on brand_profiles.paid_media_product_catalogs (brand_id, catalog_store_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'paid_media_product_catalogs_catalog_store_id_length'
  ) THEN
    ALTER TABLE brand_profiles.paid_media_product_catalogs
      ADD CONSTRAINT paid_media_product_catalogs_catalog_store_id_length
      CHECK (
        catalog_store_id IS NULL
        OR char_length(trim(catalog_store_id)) BETWEEN 1 AND 64
      );
  END IF;
END
$$;
