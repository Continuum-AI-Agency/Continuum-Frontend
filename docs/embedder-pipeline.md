# Embedder Pipeline Architecture

This document outlines how Continuum ingests brand documents (uploads and external integrations) and processes them through an embedding pipeline without blocking the onboarding experience.

---

## 1. Goals

* Transform documents into vector representations stored alongside metadata for future retrieval/augmentation.
* Decouple embedding work from the onboarding UI so large uploads or third-party pulls never block the wizard.
* Support ingestion sources: direct upload, Canva, Figma, Google Drive, SharePoint (extensible).
* Provide clear job tracking and recovery on failure.

---

## 2. High-Level Flow

1. **Ingestion Trigger**  
   * Direct upload hits `/api/onboarding/documents` (see `docs/onboarding-and-collaboration.md`). Files are saved to Supabase Storage (`brand-documents` bucket) with a unique path, and a `brand_documents` row is created with `status = 'processing'`.  
   * External integrations (Canva, etc.) post metadata via popup → server action. The server records a `brand_documents` row with `source`, `external_url`, and `status = 'processing'`.

2. **Job Enqueue**  
   * After persisting the document row, the API publishes a message to a job queue. Recommended options:
     - Supabase Functions (Edge Functions) + Supabase Queue (PG background workers via `pgmq`).
     - External queue (e.g., Cloud Tasks, RabbitMQ) if latency or throughput demands are higher.
   * Payload includes `brand_document_id`, `brand_profile_id`, `storage_path` or `external_url`, `source`.

3. **Worker Execution**  
   * A dedicated worker (Supabase Edge Function invoked by schedule/queue, or a long-running Node worker) pulls jobs in FIFO order.
   * For uploads: the worker fetches the binary from Supabase Storage. For integrations: downloads the file using the provided `external_url` (with OAuth tokens if needed).
   * The worker normalizes the content (PDF → text, DOCX → text, images → OCR optional) and runs embedding through a high-capacity model (e.g., OpenAI `text-embedding-3-large` or Vertex PaLM Embeddings).  
   * Embedding vectors are stored in a `brand_document_embeddings` table (see schema below) or an external vector database. Each row references `brand_document_id`, chunk metadata, and the embedding array.

4. **Completion & Errors**  
   * On success, update `brand_documents.status = 'ready'`, `embed_job_id`, `processed_at`, and optionally `content_checksum` for deduplication.  
   * On failure, set `status = 'error'`, store `error_reason` and allow retry.

5. **Realtime Updates (Optional)**  
   * Use Supabase Realtime to notify connected clients when `brand_documents.status` changes so the onboarding UI can reflect progress instantly.

---

## 3. Suggested Supabase Tables

### 3.1 `brand_documents` (extended)

Add columns to the baseline schema:

```sql
ALTER TABLE brand_documents
  ADD COLUMN storage_path TEXT,
  ADD COLUMN processed_at TIMESTAMPTZ,
  ADD COLUMN embed_job_id UUID,
  ADD COLUMN error_reason TEXT,
  ADD COLUMN content_checksum TEXT;
```

* `storage_path` is required for uploads; `external_url` remains for integrations.
* `content_checksum` (SHA-256) helps deduplicate future uploads.

### 3.2 `brand_document_embeddings`

```sql
CREATE TABLE brand_document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_document_id UUID NOT NULL REFERENCES brand_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(3072), -- dimension depends on chosen model
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

* Use PostgreSQL `vector` extension or an external vector store (Pinecone, Weaviate) if required.
* Store `chunk_index` + `content` to enable exact source reconstruction.

### 3.3 `embed_jobs` (optional)

If you need granular job tracking:

```sql
CREATE TABLE embed_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_document_id UUID NOT NULL REFERENCES brand_documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','processing','succeeded','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
```

---

## 4. Queue Mechanics

### Option A: Supabase Queue (`pgmq`)

1. API inserts a row into `embed_jobs` and enqueues the job ID via `SELECT pgmq.send(queue_name, job_payload)`.
2. A scheduled Supabase Function (or containerized worker) polls `pgmq`, processes the document, updates tables, and deletes the message on success.

### Option B: External Worker

1. API publishes to a managed queue (e.g., Cloud Tasks).
2. A serverless worker retrieves the payload, interacts with Supabase via service key, performs embedding, and updates the database.

> **Recommendation**: Start with `pgmq` for simplicity; migrate to an external queue if throughput requires scaling beyond PostgreSQL.

---

## 5. Background Execution Best Practices

* **Idempotency**: Re-running a job should upsert embeddings and reset status safely (use `content_checksum`).
* **Chunking**: Large documents should be chunked (e.g., 500 tokens overlap 50) before embedding for better retrieval quality.
* **Rate Limits**: Batch embedding requests to respect provider quotas. Implement exponential backoff on failures.
* **Isolation**: Workers run with the Supabase service role key and should only access the storage bucket and tables needed. Avoid processing in the same request cycle as onboarding UI actions.
* **Monitoring**: Log pipeline events (queued, processed, failed) to an observability stack (e.g., Supabase logs, Datadog). Surface metrics/dashboards per brand profile.

---

## 6. Integration Touchpoints

* **Onboarding UI** – should poll `brand_documents` or subscribe to Realtime to reflect statuses. The wizard never waits for embedding to finish; it only shows whether documents are ready.
* **Content Generation** – downstream features query `brand_document_embeddings` filtered by `brand_profile_id` and optionally by `source` or `tag`.
* **Reprocessing** – admins should be able to re-run embedding for a document (e.g., after model upgrades). Trigger by enqueuing a new job with the same document ID.

---

## 7. Open Questions

1. Do we separate images vs. text content into different embedding models?  
2. Should we store raw text in Supabase or only in storage to reduce DB bloat?  
3. What is the retry policy for failing external downloads (e.g., revoked Drive permissions)?  
4. How will we audit or notify users when a document fails to embed?

Document any decisions here as we flesh out the production pipeline.
