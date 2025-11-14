# Supabase Edge Functions (draft)

## embed_document

Async adapter-driven pipeline for onboarding documents.

- Endpoint: `POST /functions/v1/embed_document`
- Input JSON:
  - `brandId` (string)
  - `documentId` (string) — stable id used in Storage and DB
  - `source` ("upload" | "google-drive" | "canva" | "figma" | "sharepoint" | "notion" | "website")
  - `storagePath?` (string) — when the raw file is in Supabase Storage
  - `externalUrl?` (string) — when pulling from Google Drive etc. (use alt=media)
  - `mimeType?` (string)
  - `fileName?` (string)
- Response: `202 { ok: true, jobId, documentId }`

### Local dev

```bash
# From repo root
supabase start  # if needed
supabase functions serve embed_document --no-verify-jwt
```

### Deploy (later)

```bash
supabase functions deploy embed_document
```

### Notes
- Google Drive downloads/exports: https://developers.google.com/workspace/drive/api/guides/manage-downloads
- This draft includes stubs: source adapters, extraction, chunking, and a zero-vector embedder placeholder.
- Replace the embedding logic and add DB tables (`brand_documents`, `brand_document_chunks`) before production.


