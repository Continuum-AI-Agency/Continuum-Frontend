# Trends Frontend – Reality Log

This note tracks how the Trends/Brand Insights surface works in the Next.js app (updated 2026-02-22). It replaces the old Vite bootstrap guide.

## Current shape
- **Framework**: Next.js App Router (RSC-first). Data fetch happens on the server via `src/lib/api/brandInsights.server.ts`; client-only actions live in `src/lib/api/brandInsights.client.ts`.
- **Data contract**: Frontend types are Zod-backed in `src/lib/schemas/brandInsights.ts`. Backend responses are snake_case; `src/lib/brand-insights/backend.ts` maps them to camelCase and normalizes defaults.
- **API host**: Brand Insights calls read from `NEXT_PUBLIC_PYTHON_API_URL` first (then `*_PYTHON_API_BASE_URL`, `BRAND_INSIGHTS_API_URL`, `BRAND_INSIGHTS_API_BASE_URL`, or NEXT_PUBLIC_* variants), defaulting to `http://localhost:8000`. This must point at the service that serves the `/api/trends` namespace.
- **Auth**: `Authorization: Bearer <user_jwt>` is required for all non-health routes.
- **Endpoints in play**: `POST /api/trends/jobs/start` (recommended async start), `GET /api/trends/jobs/{generation_id}` (poll status/progress), `POST /api/trends/run` (sync/blocking, alias `/api/trends/scrape/meta`), `GET /api/trends/healthz` (liveness). Server reads currently try `/api/trends/{brand_id}` and `/api/trends/profile/{brand_id}` first, then fallback to legacy `/api/brand-insights/*` paths during migration.
- **Primary components** (shared across surfaces):
  - `BrandInsightsSignalsPanel` → single glass widget with Radix Tabs for Trends / Events / Questions / Competitors.
  - Tab content uses `BrandTrendsGrid`, `BrandEventsList`, `BrandQuestionsList`, and `CompetitorSearchPanel`.
  - Embedded in the dashboard and organic planner; no standalone `/trends` route.
- **Organic helper**: `src/lib/organic/trends.ts` provides fallback trend scaffolding; live data from Brand Insights is mapped for OrganicExperience in `src/app/(post-auth)/organic/page.tsx`.

## Data flow (happy path)
1) **Brand profile ID is the key**: `ensureOnboardingState` yields `brandId` (brand profile id). All fetch/generate calls use this id, not legacy `platform_account_id`.
2) **Generate (recommended)**: `generateBrandInsights` posts to `POST /api/trends/jobs/start` with `brand_id` plus optional `week_start_date`, `window_start`, `window_end`, `platforms` (`instagram | facebook`), `max_items_per_platform`.
3) **Poll**: client polls `GET /api/trends/jobs/:generationId` every ~2s until terminal status (`completed`, `failed`, `error`, `not_found`).
4) **Read**: server fetch via `fetchBrandInsights(brandId)` maps backend payloads through `mapBackendInsightsResponse`; this keeps UI data normalized while backend contracts evolve.

## Supabase shape (observed via MCP)
- **brand_insights_generations** (public): `id`, `platform_account_id` (legacy key), `country`, `week_start_date::date`, `status`, `generated_by`, timestamps.
- **brand_insights_trends** (public, implied by pipeline) mirrors generation id + text fields + embedding + selection metadata (similar to questions/events below).
- **brand_insights_events** (public, implied) stores `event_date`/`date`, opportunity text, selection flags.
- **brand_insights_questions** (public): `id`, `generation_id`, `platform_account_id`, `niche`, `question_text`, `social_platform`, `content_type_suggestion`, `why_relevant`, `is_selected` (bool default false), `times_used` (int default 0), embedding + timestamps.
- The API adapter reconstructs nested JSON for the most recent completed generation per brand profile.

## UI states & behaviors
- **Trends grid filtering**: search across title/description/relevance (case-insensitive), toggle “selected only,” and filter by source (case-insensitive). Sort order: selected → most-used → title.
- **Events list**: renders date, opportunity, selection badge, usage badge. Empty states use Radix Callouts.
- **Badges**: Country, week start date, generated timestamp, status badge shown on panels when data exists.
- **Progress stages**: use backend `progress_percent`, `stage`, and `stage_message` from jobs polling. Current stage map: `queued` 1%, `scraping` 8%, `raw_search` 34%, `synthesis` 58%, `questions` 76%, `persisting` 90%, `completed`/`failed` 100%.

## Known gaps / TODOs
- No per-item detail view yet (trends/events/questions). Future: route or modal drill-in fed by normalized data.
- Generation/regeneration is wired to async jobs and polling; final persistence read-by-`generation_id` is still backend-owned.
- Organic fallback trends (`DEFAULT_TRENDS`) are kept for safety but currently unused; revisit once live data is guaranteed.

## Decisions
- Keep Trends UI as shared components embedded in existing pages; the dedicated `/trends` route was removed to avoid duplication.
- Treat Supabase as the source of truth for schema; adapters must continue to bridge snake_case → camelCase and defaults.
- All new UI should stay Radix-first, server-driven where possible; client components only for interactivity.
