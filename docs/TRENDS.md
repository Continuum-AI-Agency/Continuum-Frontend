# Trends Frontend – Reality Log

This note tracks how the Trends/Brand Insights surface actually works today in the Next.js app (as of 2025-11-25). It replaces the old Vite bootstrap guide.

## Current shape
- **Framework**: Next.js App Router (RSC-first). Data fetch happens on the server via `src/lib/api/brandInsights.server.ts`; client-only actions live in `src/lib/api/brandInsights.client.ts`.
- **Data contract**: Frontend types are Zod-backed in `src/lib/schemas/brandInsights.ts`. Backend responses are snake_case; `src/lib/brand-insights/backend.ts` maps them to camelCase and normalizes defaults.
- **API host**: Brand Insights calls read from `NEXT_PUBLIC_PYTHON_API_URL` first (then `*_PYTHON_API_BASE_URL`, `BRAND_INSIGHTS_API_URL`, `BRAND_INSIGHTS_API_BASE_URL`, or NEXT_PUBLIC_* variants), defaulting to `http://localhost:8000`. This must point at the FastAPI service that serves `/api/brand-insights/{brand_id}` and `/api/brand-insights/profile/{brand_id}`.
- **Endpoints in play**: `POST /api/brand-insights/generate` (start, returns task_id if async), `GET /api/brand-insights/status/{task_id}` (poll), `GET /api/brand-insights/{brand_id}` (latest insights), `GET /api/brand-insights/profile/{brand_id}` (curated profile), `GET /api/brand-insights/health` (liveness).
- **Primary components** (shared across surfaces):
  - `BrandTrendsPanel` → header badges + `BrandTrendsGrid` list of trends with search/filter/sort.
  - `BrandEventsPanel` (new) → header + `BrandEventsList` for upcoming events/opportunities.
  - These components are embedded in the dashboard and organic planner; no standalone `/trends` route.
- **Organic helper**: `src/lib/organic/trends.ts` provides fallback trend scaffolding; live data from Brand Insights is mapped for OrganicExperience in `src/app/(post-auth)/organic/page.tsx`.

## Data flow (happy path)
1) **Brand profile ID is the key**: `ensureOnboardingState` yields `brandId` (brand profile id). All fetch/generate calls use this id, not legacy `platform_account_id`.
2) **Read**: Server fetch via `fetchBrandInsights(brandId)` → `httpServer.request(/api/brand-insights/:id)` → `mapBackendInsightsResponse` → components consume normalized data.
3) **Generate** (client): `generateBrandInsights` posts to `/api/brand-insights/generate`; status polling via `/api/brand-insights/status/:taskId` is handled in client land (not yet wired to UI buttons here).

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

## Known gaps / TODOs
- No per-item detail view yet (trends/events/questions). Future: route or modal drill-in fed by normalized data.
- Generation/regeneration UI wiring is pending; the service calls exist.
- Organic fallback trends (`DEFAULT_TRENDS`) are kept for safety but currently unused; revisit once live data is guaranteed.

## Decisions
- Keep Trends UI as shared components embedded in existing pages; the dedicated `/trends` route was removed to avoid duplication.
- Treat Supabase as the source of truth for schema; adapters must continue to bridge snake_case → camelCase and defaults.
- All new UI should stay Radix-first, server-driven where possible; client components only for interactivity.
