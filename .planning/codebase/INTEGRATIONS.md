# External Integrations

## Summary

Continuum connects to Supabase (auth, database, storage, edge functions), a custom backend API (Node.js), and a Python/brand-insights service. Third-party integrations include Meta (Facebook Ads) and Google (OAuth + Drive Picker), with Mixpanel and Vercel for analytics. AI capabilities are proxied through the backend rather than called directly from the frontend.

## APIs & External Services

### Primary Backend API (Node.js)
- Purpose: Core application API — campaigns, brands, organic content, paid media, integrations
- Client: `src/lib/api/http.ts` (browser) and `src/lib/api/http.server.ts` (RSC/Server Actions)
- Auth: Bearer token from `getBrowserAccessToken()` (Supabase access token)
- Base URL env vars: `API_URL`, `API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BASE_URL`
- Fallback: `http://localhost:4000`
- Pattern: typed `request<TResponse>()` wrapper with optional Zod schema validation on responses

### Python / Brand Insights API
- Purpose: Brand analysis, competitor insights, strategic analyses
- Client: `src/lib/api/brandInsights.client.ts`, `src/lib/api/brandInsights.server.ts`
- Base URL env vars: `PYTHON_API_URL`, `PYTHON_API_BASE_URL`, `NEXT_PUBLIC_PYTHON_API_URL`, `NEXT_PUBLIC_PYTHON_API_BASE_URL`, `BRAND_INSIGHTS_API_URL`, `BRAND_INSIGHTS_API_BASE_URL`, `NEXT_PUBLIC_BRAND_INSIGHTS_API_URL`, `NEXT_PUBLIC_BRAND_INSIGHTS_API_BASE_URL`
- Fallback: falls through to the primary API base URL

### Competitors API
- Purpose: Competitor data fetching
- Client: `src/lib/api/competitors.server.ts`, `src/services/competitorService.ts`
- Base URL env vars: `COMPETITORS_API_URL`, `COMPETITORS_API_BASE_URL`, `NEXT_PUBLIC_COMPETITORS_API_URL`, `NEXT_PUBLIC_COMPETITORS_API_BASE_URL`

### Meta (Facebook / Instagram Ads)
- Purpose: Ad account sync, campaign data, ad sets, ad creative
- OAuth flow: `GET /integrations/meta/sync?callback_url=...` → redirects to Meta OAuth
- Deauth: `POST /integrations/meta/deauthorize`
- Client hook: `useStartMetaSync()`, `useDeauthorizeMeta()` in `src/lib/api/integrations.ts`
- Supabase Edge Functions: `fetch-meta-ads`, `fetch-meta-adsets`, `fetch-meta-campaigns`, `catalog-create-meta`, `catalog-sync-meta` (called via `NEXT_PUBLIC_SUPABASE_URL/functions/v1/...`)

### Google (Ads + Drive)
- Purpose: Google Ads account sync + Drive file picker for creative assets
- OAuth flow: `GET /integrations/google/sync?callback_url=...`
- Drive picker: `GET /integrations/google-drive/picker?brand_id=...&callback_url=...&context=...`
- Deauth: `POST /integrations/google/deauthorize`
- Client hooks: `useStartGoogleSync()`, `useDeauthorizeGoogle()`, `useStartGoogleDrivePicker()` in `src/lib/api/integrations.ts`

## Data Storage

### Supabase Database (PostgreSQL)
- Provider: Supabase
- Client (browser): `src/lib/supabase/client.ts` — singleton `createSupabaseBrowserClient()`
- Client (server): `src/lib/supabase/server.ts` — per-request `createSupabaseServerClient()`
- Admin client: `src/lib/supabase/admin.ts` — uses `SUPABASE_SERVICE_ROLE_KEY` for admin operations
- Type generation: `scripts/generate-supabase-types.mjs` → `src/lib/supabase/types.ts`
- Connection env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (preferred) or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Migrations: `supabase/migrations/`

### Supabase Storage
- Purpose: Creative asset management (images, videos) for brand profiles
- Client: `src/lib/creative-assets/storageClient.ts` — uses `createSupabaseBrowserClient().storage`
- Bucket config: `NEXT_PUBLIC_SUPABASE_CREATIVE_BUCKET` env var (defaults to a hardcoded bucket name in `src/lib/creative-assets/config.ts`)
- Public vs signed URLs: controlled by `NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC=true` env var
- Signed URLs include image transform (resize to 1280px width) for image assets; videos skip transforms

### Local Storage (Browser Persistence)
- Organic planner store (`src/lib/organic/store.ts`) — persisted via lz-string compressed JSON
- Other Zustand stores use in-memory state only

## Authentication & Identity

### Supabase Auth
- Provider: Supabase Auth
- Flows supported: email/password, magic link, OAuth (Google), password reset
- Server Actions: `src/lib/auth/actions.ts` — `loginAction`, `signupAction`, `logoutAction`, `recoverAction`, `magicLinkAction`
- Middleware: `src/middleware.ts` — validates session on every request, redirects unauthenticated users to `/login`
- Cookie handling: `src/lib/supabase/cookies.ts` — secure, HTTP-only cookies in production
- Token access: `src/lib/auth/getBrowserAccessToken.ts` — returns Supabase JWT for API Bearer auth
- Admin operations: `src/lib/supabase/admin.ts` with `SUPABASE_SERVICE_ROLE_KEY`
- Impersonation: `is_impersonating` cookie checked in middleware for admin impersonation bypass

### Protected Routes
Routes guarded by middleware: `/dashboard`, `/organic`, `/paid-media`, `/ai-studio`, `/integrations`, `/settings`

## Supabase Edge Functions

Edge functions are deployed to Supabase and called directly via `NEXT_PUBLIC_SUPABASE_URL/functions/v1/<name>` with Bearer auth.

| Function | Purpose |
|----------|---------|
| `jaina-speech-realtime` | WebSocket-based real-time speech-to-text (used by `src/lib/jaina/speechRealtime.ts`) |
| `jaina-speech-to-text` | Batch speech-to-text transcription |
| `ai_studio_workflows` | AI Studio workflow execution (image/video/LLM node processing) |
| `prompt-fast-enrich` | StringNode context enrichment with streaming SSE response |
| `prompt_templates` | Prompt template management |
| `fetch-meta-ads`, `fetch-meta-adsets`, `fetch-meta-campaigns` | Meta Ads data fetching |
| `catalog-create-meta`, `catalog-sync-meta`, `catalog-reconcile-activity`, `catalog-backfill-history` | Product catalog sync with Meta |
| `fetch-organic-analytics`, `fetch-organic-metrics` | Organic social analytics |
| `fetch-timeline-accounts`, `fetch-timeline-blocks` | Organic calendar timeline data |
| `paid-media-metrics` | Paid media performance metrics |
| `fetch-ad-accounts-for-selector`, `fetch-campaigns-for-selector` | Ad account and campaign pickers |
| `fetch-rule-action-logs` | DCO rule action log fetching |
| `fetch-brand-integrations`, `integration_accounts`, `update_brand_integration_accounts`, `update_integration_account_assets` | Brand integration account management |
| `process-brand-insights`, `process-brand-insights-context` | Brand insight processing |
| `embed_document` | Document embedding for RAG |
| `brand-draft-audience`, `brand-draft-voice` | Brand voice/audience drafting |
| `brand_invite` | Brand invitation emails |
| `auth-send-email` | Transactional auth emails |
| `admin-list-users`, `admin-set-admin`, `admin-update-tier`, `impersonate-user` | Admin operations |
| `delete_brand_profile` | Brand profile deletion |

## AI Agent System (Jaina)

- Purpose: Conversational AI assistant with memory, planning, and speech capabilities
- Chat stream: `src/app/api/agents/jaina/chat/stream/route.ts` — proxies to backend API with Supabase JWT
- Speech (batch): `src/lib/jaina/speech.ts` → `src/app/api/agents/jaina/speech/stream/route.ts`
- Speech (real-time): `src/lib/jaina/speechRealtime.ts` → WebSocket to Supabase Edge Function `jaina-speech-realtime`
- AI SDK: `@ai-sdk/react` `useChat` hook used in `src/CampaignCanvas/components/CampaignChat.tsx` and AI Studio chat components

## Server-Sent Events (Internal)

- Purpose: Real-time AI task progress, workflow completion events pushed from Server Actions to client
- Endpoint: `GET /api/events` — SSE stream with 25s keepalive heartbeat
- Ingest: `POST /api/events` — accepts events with optional `CONTINUUM_EVENT_INGEST_TOKEN` header auth
- Server action: `src/app/_actions/eventBridge.ts` — `broadcastContinuumEvent()`, `broadcastAiTaskProgress()`, `broadcastAiTaskCompletion()`
- Client hook: `src/lib/sse/useContinuumServerEvents.ts`

## WebSocket (Backend)

- Purpose: Real-time data from backend services
- URL builder: `src/lib/api/ws.ts` — converts API base URL `http://` → `ws://`

## Analytics & Monitoring

### Mixpanel
- SDK: `mixpanel-browser ^2.75.0`
- Init: `src/components/analytics/MixpanelInit.tsx` — production only (disabled in development)
- Token: hardcoded in `MixpanelInit.tsx` (not env-driven)
- Config: `autocapture: true`, `record_sessions_percent: 100`

### Vercel Analytics
- SDK: `@vercel/analytics ^1.6.1`
- Speed Insights: `@vercel/speed-insights ^1.3.1`
- Both are passive/automatic — no explicit configuration required beyond including the component

## Deployment

**Platform:** Vercel
- Project ID: `prj_84q6ZMn6oFixwer8uRCDjtReedlo` (in `.vercel/project.json`)
- Org: `team_V1tMiaWemtF6z37x92EtSrDQ`
- `VERCEL_URL` env var used as fallback for `NEXT_PUBLIC_SITE_URL` in AI Studio URL resolution

## Environment Variables Reference

| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Supabase anon/publishable key (preferred name) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (fallback name) | If above not set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for admin operations | Yes (server) |
| `NEXT_PUBLIC_SITE_URL` | Public site URL for auth redirects and OAuth callbacks | Yes |
| `SITE_URL` | Server-side site URL fallback | Optional |
| `API_URL` / `NEXT_PUBLIC_API_URL` | Primary backend API base URL | Yes |
| `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` | Primary backend API base URL (alternate name) | Optional |
| `PYTHON_API_URL` / `NEXT_PUBLIC_PYTHON_API_URL` | Brand insights Python API URL | Optional |
| `BRAND_INSIGHTS_API_URL` / `NEXT_PUBLIC_BRAND_INSIGHTS_API_URL` | Brand insights API URL (alternate names) | Optional |
| `COMPETITORS_API_URL` / `NEXT_PUBLIC_COMPETITORS_API_URL` | Competitors API URL | Optional |
| `NEXT_PUBLIC_SUPABASE_CREATIVE_BUCKET` | Supabase storage bucket name for creative assets | Optional |
| `NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC` | Set to `"true"` for public bucket (vs signed URLs) | Optional |
| `CONTINUUM_EVENT_INGEST_TOKEN` | Auth token for external event ingest via `POST /api/events` | Optional |
| `NEXT_PUBLIC_APP_URL` | App URL used in AI Studio self-referencing routes | Optional |
| `VERCEL_URL` | Auto-set by Vercel, used as URL fallback | Auto |
| `NEXT_PUBLIC_COMMIT_SHA` | Commit SHA for versioning (auto-set from `VERCEL_GIT_COMMIT_SHA`) | Auto |

## OAuth Callback Handling

- OAuth redirect handling: `src/lib/oauth.ts` and `src/lib/auth/callback-handler.ts`
- Callback URL: `NEXT_PUBLIC_SITE_URL/callback`
- Password reset: `NEXT_PUBLIC_SITE_URL/auth/reset-password`
- Third-party integration callbacks (Meta, Google) use `callback_url` query params passed to the backend

## Notable Observations

- The Mixpanel token is **hardcoded in source code** at `src/components/analytics/MixpanelInit.tsx:6`. This is a minor security concern — while Mixpanel tokens are not secret (they're meant to be public), the convention is to use env vars for maintainability.
- There are **two parallel API naming conventions** for the backend: `API_URL`/`API_BASE_URL` and `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_API_BASE_URL`. The config resolves all four with environment-aware priority, but this creates redundancy.
- Supabase Edge Functions are called **directly from the browser** in several places (e.g., DCO action logs in `src/hooks/useDCOActionLogs.ts`) by constructing `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/...` URLs manually, bypassing the API layer.
- The AI Studio workflow execution (`src/StudioCanvas/utils/executeWorkflow.ts`) also calls `prompt-fast-enrich` edge function directly from the client, using the Supabase anon key as a fallback token if no session is present.
- No webhook receiver endpoints are detected in the Next.js app — Meta/Google OAuth callbacks are handled via redirect flows, not webhooks.

---

*Integration audit: 2026-03-25*
