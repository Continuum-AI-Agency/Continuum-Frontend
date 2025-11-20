# Brand Insights Frontend Work Plan

## Decisions (confirmed)
- Identifier: `brand_id` is the source of truth for access; prefer `brand_id` across all calls, optionally include `platform_account_id` only as a transitional fallback if backend supports it.
- UI primitives: reuse existing theme components and skeletons already in the app; no bespoke styling outside the styleguide.
- Date display: show `week_start_date` in the UI for insights.

## Current backend contract (for reference)
- Endpoints: `POST /api/brand-insights/generate` (body: brand_id, optional force_regenerate, selected_social_platforms), `GET /api/brand-insights/status/{task_id}`, `GET /api/brand-insights/{brand_id}`, `GET /api/brand-insights/profile/{brand_id}`.
- Generate short-circuits when insights exist in last 7 days; otherwise returns `status: processing` with `task_id` and relies on background task.
- Status endpoint is in-memory only (resets on server restart); final data is retrievable via `GET /{brand_id}`.
- Response shape already includes item ids, selection flags, and `from_cache`.

## Goals
- Deliver a full frontend flow to trigger, track, and display Brand Insights (trends, events, questions by niche) and the associated brand profile.
- Keep client components minimal (only for interactivity/polling); default to RSC for data fetching and rendering.
- Be resilient to identifier changes (platform_account_id vs brand_id) and backend restarts that drop in-memory statuses.

## Workstreams

### 1) API client + typing
- Create typed fetch wrappers for the four endpoints with clear error handling (no `any`), server-first where possible.
- Encode request/response types for generate/status/get/profile; include `from_cache`, `week_start_date`, `week_analyzed`, and selection flags.
- Add safe parsers (Zod) at the boundary to guard against schema drift; surface meaningful errors to the UI.

### 2) Data flow and caching
- Use RSC data fetching with appropriate `revalidate` strategy (likely `revalidate: 3600` for get/profile, `cache: 'no-store'` for status polling).
- Centralize identifier handling with `brand_id` first; keep an adapter to optionally include legacy `platform_account_id` if backend allows dual lookup.
- Avoid client-side global state for domain data; keep local state to interactivity only.

### 3) Generation trigger + status polling
- Build a client component that posts generate requests, then polls status until `completed` or `error` with exponential-ish backoff and a sensible timeout.
- Handle restart edge case: if status returns `not_found` but generation likely finished, fall back to fetching latest insights directly.
- Respect `from_cache` responses by short-circuiting polling when generation is skipped.
- Surface progress/error messaging inline with Radix primitives; no toasts unless already standardized.

### 4) Insights display (trends/events/questions)
- Server-render lists with sorting/grouping options (date for events, relevance/source for trends, platform/niche for questions).
- Include empty/loading/error states and `from_cache` indicator.
- Keep selection toggles client-side only (since no update endpoint); persist locally (in-memory or optional localStorage if acceptable for UX).
- Ensure cards follow styleguide spacing/typography and reuse existing primitives if available.

### 5) Brand profile view
- Update profile rendering to align with new strategic analysis fields (mission, vision, core_values, audience summary/segments, competitors, voice).
- Provide graceful “onboarding required” state when backend returns that status.
- Keep this as an RSC; wrap interactive affordances (e.g., copy buttons) in small client components if needed.

### 6) Identifier strategy migration
- Make all calls use `brand_id` as the primary identifier; include `platform_account_id` only if explicitly supported as a fallback.
- Trace all uses (generate, status, get, profile) through a single resolver to avoid duplicated conditionals; prefer brand_id-only paths.

### 7) UX states and accessibility
- Loading skeletons/spinners via Radix-friendly patterns; maintain keyboard/focus flows.
- Inline error banners with retry affordances for generate/poll/fetch steps.
- Support mobile layout (cards stack, readable typography).

### 8) Observability and logging
- Add structured client-side logging hooks for failures (include endpoint, identifier, correlation where available); keep PII out of logs.
- Consider lightweight analytics events for generation attempts/results if the project has an established pattern; otherwise, leave a placeholder hook.

### 9) Testing plan
- Unit: parsers/transformers for API responses, polling logic (status transitions/timeouts), identifier resolver.
- Integration/component: rendering of trends/events/questions with edge cases (empty, from_cache, error).
- E2E (if Playwright/Cypress present): happy path generate → poll → render; restart scenario fallback (mock status not_found then fetch succeeds).

### 10) Rollout and sequencing
- Phase 1: API clients + data parsers + types.
- Phase 2: Brand profile RSC update.
- Phase 3: Insights display RSC + client selection state.
- Phase 4: Generation trigger + polling client.
- Phase 5: Identifier dual-mode support + tests + cleanup.

## Open questions / dependencies
- Define revalidation windows for insights/profile.
- Any analytics/telemetry standards we should hook into for generate/poll events?
