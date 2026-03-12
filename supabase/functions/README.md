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

- Set `GEMINI_API_KEY` in Supabase Edge Function secrets before invoking; the runtime calls Gemini `gemini-embedding-001`.
- Google Drive downloads/exports: <https://developers.google.com/workspace/drive/api/guides/manage-downloads>
- The vector schema assumes 1,536 dimensions; Gemini output is truncated to match.

## jaina-speech-to-text

Streaming-friendly speech-to-text endpoint for Jaina voice input.

- Endpoint: `POST /functions/v1/jaina-speech-to-text`
- Input JSON:
  - `audioBase64` (string, required) — base64 audio payload (`audio/webm` recommended)
  - `languageCode?` (string, default `en-US`)
  - `model?` (string, default `chirp_3`)
  - `stream?` (boolean, default `true`) — when `true`, returns SSE events
- SSE events:
  - `ready`
  - `transcript.delta`
  - `transcript.done`
  - `done`
- Required secrets:
  - `GOOGLE_STT_PROJECT_ID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - Uses hardcoded STT v2 location `us` and endpoint `us-speech.googleapis.com` (Chirp 3 compatible)

## jaina-speech-realtime

WebSocket speech-to-text endpoint for low-latency incremental transcription.

- Endpoint: `GET /functions/v1/jaina-speech-realtime` (WebSocket upgrade)
- Auth:
  - Function uses `verify_jwt = false` because browser WebSocket requests cannot set `Authorization` headers.
  - Client passes `?token=<supabase_access_token>` and function validates it via `supabase.auth.getUser`.
- Client messages:
  - `session.configure` with `languageCode`, `model`
  - `audio.chunk` with `sequence`, `audioBase64`, `mimeType` (e.g. `audio/webm;codecs=opus`)
  - `session.stop`
- Server events:
  - `ready`
  - `transcript.delta`
  - `transcript.done`
  - `error`
- Required secrets:
  - `GOOGLE_STT_PROJECT_ID`
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Uses hardcoded STT v2 location `us` and endpoint `us-speech.googleapis.com` (Chirp 3 compatible)
