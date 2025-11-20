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

- Set `OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL`) in Supabase Edge Function secrets before invoking; the runtime calls OpenAI `text-embedding-3-small`.
- Google Drive downloads/exports: <https://developers.google.com/workspace/drive/api/guides/manage-downloads>
- The vector schema assumes 1,536 dimensions to match `text-embedding-3-small`.
