-- Enable vector extension for pgvector embeddings
create extension if not exists vector;

-- Ensure schema exists
create schema if not exists brand_profiles;

-- Documents table stores per-document metadata; `id` is the stable documentId
create table if not exists brand_profiles.brand_documents (
  id uuid primary key,
  brand_id uuid not null,
  name text not null,
  source text not null,
  status text not null default 'processing',
  size bigint,
  mime_type text,
  storage_path text,
  external_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK to the canonical brand profile table
alter table brand_profiles.brand_documents
  add constraint brand_documents_brand_profile_id_fkey
  foreign key (brand_id) references brand_profiles.brand_profiles(id)
  on delete cascade;

-- Chunk table with pgvector embeddings
create table if not exists brand_profiles.brand_document_chunks (
  id bigserial primary key,
  document_id uuid not null references brand_profiles.brand_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  tokens int,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_brand_documents_brand_id on brand_profiles.brand_documents (brand_id);
create unique index if not exists uniq_brand_document_chunk on brand_profiles.brand_document_chunks (document_id, chunk_index);

-- Example HNSW index (if supported); otherwise swap for IVFFlat
-- Requires pgvector >= 0.5.0
do $$ begin
  execute 'create index if not exists idx_chunks_embedding_hnsw on brand_profiles.brand_document_chunks using hnsw (embedding vector_cosine_ops)';
exception when others then
  -- fallback; ignore if not supported in local env
  null;
end $$;

alter table brand_profiles.brand_documents enable row level security;
alter table brand_profiles.brand_document_chunks enable row level security;


