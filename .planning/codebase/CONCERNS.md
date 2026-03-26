# Codebase Concerns

**Analysis Date:** 2026-03-25

## Summary

The codebase is a well-structured Next.js 16 / React 19 application with a clear modular layout and solid test coverage in core library areas. The primary risks cluster around missing error monitoring infrastructure, several unauthenticated API routes, a deleted `tsconfig.json`, a mixed test-runner state (Bun + Vitest), and a handful of very large components that have grown beyond the 60-line function guideline. Technical debt is moderate and largely concentrated in the AI Studio canvas and paid-media dashboard modules.

---

## High Priority Concerns

### 1. tsconfig.json Deleted from Root

**Severity:** HIGH

- **Issue:** `tsconfig.json` is marked `D` (deleted) in `git status`. The file does not exist at project root. TypeScript compilation, IDE type-checking, and Next.js build rely on this file.
- **Impact:** Any CI build that runs `tsc` or `next build` without this file will fail or silently skip type-checking. IDEs lose path alias resolution (`@/*`). A copy exists at `.worktrees/organic/tsconfig.json` but is not at root.
- **Fix approach:** Restore `tsconfig.json` to project root (recover from git history or copy from `.worktrees/organic/tsconfig.json`).

---

### 2. vitest.config.ts Deleted; Mixed Test Runners in Active Use

**Severity:** HIGH

- **Issue:** `vitest.config.ts` is deleted (`D` in git status), yet 32 test files import from `vitest` and 55 import from `bun:test`. With no config, `vitest` imports will fail under `bun test` and Vitest tests cannot be run separately.
- **Files:** Any `src/**/*.test.{ts,tsx}` using `import { describe, it, expect, vi } from "vitest"` — e.g., `src/components/organic/hooks/useDraftGeneration.test.ts`, `src/components/paid-media/jaina/persistedReport.test.ts`.
- **Impact:** CI will report false failures or skip tests silently depending on the runner invoked. Cannot guarantee test suite is green.
- **Fix approach:** Restore `vitest.config.ts` and standardize on one runner, or maintain explicit separate configs with separate run scripts.

---

### 3. Unauthenticated API Routes (campaigns, ad-accounts)

**Severity:** HIGH

- **Issue:** `src/app/api/campaigns/route.ts` and `src/app/api/ad-accounts/route.ts` accept any request that includes an `Authorization` header — they pass the header straight through to a Supabase edge function but perform **no server-side identity check**. If the header is absent, the downstream call proceeds without auth. There is no `401` short-circuit at the Next.js layer.
- **Impact:** These routes proxy to Meta campaign and ad-account data. A caller with a forged or missing token gets an upstream error rather than a clean rejection, leaking whether accounts exist.
- **Fix approach:** Add `getServerUser()` (pattern from `src/app/api/brand-integrations/route.ts`) at the top of each handler; return `401` if null.

---

### 4. No Error Monitoring / Observability

**Severity:** HIGH

- **Issue:** No Sentry, Datadog, Rollbar, Logtail, Axiom, or equivalent error tracking is integrated. The only analytics present is Mixpanel (user events, not errors). Production exceptions from SSE streams, workflow execution, and AI generation routes are swallowed by `console.error` and lost.
- **Files:** Error handling throughout `src/StudioCanvas/utils/executeWorkflow.ts`, `src/app/api/ai-studio/generate/route.ts`, `src/app/api/agents/jaina/chat/stream/route.ts` — all log to `console.error` only.
- **Impact:** Silent production failures, no alerting, no stack trace aggregation.
- **Fix approach:** Add Sentry (or equivalent) as a Next.js instrumentation file (`instrumentation.ts`); wire `captureException` to the existing `console.error` call sites.

---

### 5. Hardcoded Mixpanel Token in Source

**Severity:** HIGH

- **Issue:** `src/components/analytics/MixpanelInit.tsx:6` embeds the Mixpanel project token as a string literal: `const MIXPANEL_TOKEN = "c4c6970ea649d1a205fbf340cdbb97d7"`. This token is committed to the repository.
- **Impact:** Anyone with repo access can send arbitrary events to the production Mixpanel project. Token cannot be rotated without a code deploy.
- **Fix approach:** Move to `NEXT_PUBLIC_MIXPANEL_TOKEN` env var; remove hardcoded value.

---

## Medium Priority Concerns

### 6. `getSession()` Used Instead of `getUser()` in Server API Routes

**Severity:** MEDIUM

- **Issue:** Multiple server-side API routes use `supabase.auth.getSession()` to verify auth, including `src/app/api/paid-media/campaign-indexes/route.ts`, `src/app/api/paid-media/timeline/route.ts`, and `src/app/api/paid-media/product-catalogs/route.ts`. Supabase's own security guidance warns that `getSession()` reads from an unverified cookie and should not be trusted on the server; `getUser()` performs a network round-trip to validate the JWT.
- **Impact:** A tampered session cookie could bypass auth checks in these routes.
- **Fix approach:** Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` in all server-side route handlers.

---

### 7. GraphExecutor Has Hardcoded `"current-brand"` Placeholder

**Severity:** MEDIUM

- **Issue:** `src/lib/ai-studio/execution/GraphExecutor.ts:115` passes `brandProfileId: "current-brand"` as a literal string, accompanied by two `TODO` comments noting `brandProfileId` and `guidance/seed` are not wired.
- **Impact:** This executor path will submit AI jobs with a bogus brand ID; jobs will silently fail or be attributed to the wrong brand if `"current-brand"` is a valid ID in any environment.
- **Fix approach:** Pass `brandProfileId` through the `GraphExecutor` constructor (already noted in the TODO); complete the seed/guidance wiring.

---

### 8. Massively Oversized Components

**Severity:** MEDIUM

- **Issue:** Several files far exceed maintainable size and mix responsibilities:
  - `src/lib/jaina/stream.ts` — 3,092 lines
  - `src/components/paid-media/dashboard/CampaignTimelineWorkspace.tsx` — 3,033 lines, 12 `useEffect` calls
  - `src/components/paid-media/dashboard/CampaignAdSetWorkspace.tsx` — 2,876 lines
  - `src/lib/jaina/schemas.ts` — 2,722 lines
  - `src/components/organic/hooks/useDraftGeneration.ts` — 1,263 lines
  - `src/StudioCanvas/components/StudioCanvas.tsx` — 1,519 lines
- **Impact:** Extremely difficult to maintain, reason about, and test. High cognitive load for modifications. Increased risk of unintended side effects in changes.
- **Fix approach:** Extract sub-components and hooks from `CampaignTimelineWorkspace.tsx` first (highest complexity). Split `stream.ts` into stream, reducer, and event-handlers files. Decompose `schemas.ts` by domain.

---

### 9. Widespread `as any` Casts Masking Supabase Type Gaps

**Severity:** MEDIUM

- **Issue:** The generated Supabase types (`src/lib/supabase/types.ts`) do not include the `brand_profiles` schema tables (`canvas_rooms`, `canvas_sessions`) or `user_brand_preferences`. All queries to these tables require `as any` casts:
  - `src/components/ai-studio/hooks/useCanvasRealtime.ts` — 10+ `as any` casts on `.schema()` and `.from()` calls
  - `src/components/ai-studio/hooks/useCanvasRooms.ts` — 8 `as any` casts
  - `src/lib/brands/preferences.ts`, `src/lib/onboarding/storage.ts`, `src/app/invite/callback/page.tsx`
- **Impact:** Any column rename or type change in these tables will not surface at compile time. Silent runtime errors on schema drift.
- **Fix approach:** Run `bun run supabase:gen:types` including the `brand_profiles` schema (or add `SUPABASE_SCHEMAS=brand_profiles` to the generate script); remove `as any` casts once types are generated.

---

### 10. No React Error Boundaries

**Severity:** MEDIUM

- **Issue:** No `ErrorBoundary` components are present anywhere in the codebase. With three major Zustand canvas stores and complex SSE streaming hooks, unhandled render errors will crash entire page subtrees.
- **Impact:** A single runtime error in `StudioCanvas`, `CampaignCanvas`, or `OrganicCalendarWorkspaceClient` unmounts the entire page tree with no recovery UI.
- **Fix approach:** Add error boundaries at the top of each major module route: `AIStudioPage`, `PaidMediaClient`, `OrganicCalendarWorkspaceClient`. React 19 supports the new `<ErrorBoundary>` component directly.

---

### 11. Missing Code Splitting for Heavy Dependencies

**Severity:** MEDIUM

- **Issue:** `three.js`, `@react-three/fiber`, `@react-three/drei`, `@rive-app/react-webgl2`, and `maplibre-gl` are all imported statically. None of these are wrapped in `next/dynamic` with `ssr: false`. They add significant initial bundle weight to pages that may not need them.
- **Files:**
  - `src/components/ui/map.tsx` — static MapLibre import including CSS
  - `src/components/loader-animations/SaturnRingsScene.tsx`, `GalaxyParticles.tsx`, `SaturnRing.tsx` — Three.js
  - `src/components/ai-elements/persona.tsx` — Rive WebGL
- **Impact:** All users pay the parse/init cost for 3D and map libraries on every page load.
- **Fix approach:** Wrap each with `next/dynamic(() => import(...), { ssr: false })` at their consumer call sites.

---

### 12. Inconsistent Auth Pattern Across 25 Route Handlers

**Severity:** MEDIUM

- **Issue:** Of 44 API route files, 19 use Zod validation and auth varies: some use `getServerUser()`, some use `supabase.auth.getSession()`, some pass through Bearer tokens without verification (`campaigns`, `ad-accounts`), and some have no auth at all (SSE event bus GET endpoint has no auth).
- **Impact:** Hard to audit security posture. New routes are likely to copy the wrong pattern.
- **Fix approach:** Create a `src/lib/api/withAuth.ts` middleware wrapper; enforce it as the single auth pattern via a linting rule or code review checklist.

---

### 13. Test Coverage Gaps in Critical Paths

**Severity:** MEDIUM

- **Issue:**
  - `src/app/(post-auth)/` — 0 tests across 21 source files (all post-auth page routes)
  - `src/hooks/` — 0 tests across 14 hook files (`useAuth`, `useJainaChatStream`, `useImageSseStream`, `useBrandIntegrations`)
  - `src/components/settings/` — 0 tests across 7 files
  - `src/lib/brands/` — 0 tests across 8 files (includes `active-brand-context.ts`, the auth/brand resolution critical path)
  - `src/lib/integrations/` — 0 tests across 5 files
  - `src/app/_actions/eventBridge.ts` — no tests
- **Impact:** Changes to auth flows, brand resolution, or integration handling have no regression coverage.
- **Fix approach:** Prioritize tests for `src/lib/brands/active-brand-context.ts` and `src/hooks/useAuth.ts` as the highest-risk untested paths.

---

## Low Priority Concerns

### 14. Duplicate `getBrowserAccessToken` Implementation

**Severity:** LOW

- **Issue:** `src/lib/auth/getBrowserAccessToken.ts` is the canonical implementation, but `src/lib/api/brandInsights.client.ts:76` defines its own local copy with identical logic.
- **Impact:** Divergence risk if the canonical implementation changes (e.g., token refresh logic).
- **Fix approach:** Import from `@/lib/auth/getBrowserAccessToken` in `brandInsights.client.ts`; delete the local copy.

---

### 15. Widespread `console.log/warn/error` Debugging Statements

**Severity:** LOW

- **Issue:** 221 `console.*` calls across 91 files, including `console.error` in production API routes (`src/app/api/campaigns/route.ts`, `src/app/api/ad-accounts/route.ts`, `src/app/api/paid-metrics/route.ts`).
- **Impact:** Logs contain request URLs and auth header presence, leaking operational details in production. No structured logging.
- **Fix approach:** Replace with a structured logger (e.g., `pino`); remove debug `console.log` calls; keep `console.error` only where a proper logger is not yet wired.

---

### 16. 13 `react-hooks/exhaustive-deps` Suppressions

**Severity:** LOW

- **Issue:** 13 `eslint-disable-next-line react-hooks/exhaustive-deps` comments, concentrated in `src/components/ui/map.tsx` (11 instances) and `src/components/paid-media/CampaignList.tsx`, `src/components/ai-studio/chat/ChatPanel.tsx`.
- **Impact:** Stale closure bugs are likely in the map component due to the volume of suppressions.
- **Fix approach:** Audit each suppression; use `useCallback`/`useRef` patterns to stabilize references instead of suppressing the rule.

---

### 17. Unvalidated Environment Variables at Runtime

**Severity:** LOW

- **Issue:** `src/lib/api/config.ts` resolves API URLs from up to 8 env vars per service using a cascade with `localhost` fallback. There is no startup validation (e.g., a Zod schema or startup check) that required env vars are present. Missing `API_URL` in production silently falls back to `localhost:4000`.
- **Impact:** Misconfigurations cause silent failures — all API calls go to localhost in production rather than failing fast.
- **Fix approach:** Add a startup env validation module checked in `instrumentation.ts` or the root layout server component.

---

### 18. LocalStorage Used for Cross-Component AI Studio State

**Severity:** LOW

- **Issue:** `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx` uses `window.localStorage` and `window.sessionStorage` directly across 8+ call sites to persist AI Studio draft state, canvas payloads, and history. This is scattered rather than behind an abstraction.
- **Impact:** Key naming inconsistency risks cross-contamination between brands or sessions. SSR-incompatible code requires `"use client"` broader than necessary.
- **Fix approach:** Centralize in a typed localStorage adapter (similar to how `src/lib/organic/store.ts` uses Zustand persist); use brand-scoped keys consistently.

---

### 19. Model Strings Hardcoded in Chat Logic

**Severity:** LOW

- **Issue:** `src/components/ai-studio/chat/ChatSurface.tsx` contains 6+ comparisons to the literal string `"gemini-3-pro-image-preview"` and `"nano-banana"` scattered through conditionals rather than a constants/enum.
- **Impact:** Adding or renaming a model requires a multi-site find-and-replace; easy to miss one check.
- **Fix approach:** Extract to a `MODEL_IDS` const enum in `src/lib/ai-studio/models.ts`; reference by constant.

---

### 20. `useForm<any>` on Login Page

**Severity:** LOW

- **Issue:** `src/app/(auth)/login/page.tsx:59` uses `useForm<any>()`, bypassing React Hook Form's type inference and validation.
- **Impact:** No compile-time guarantee that form fields match the Zod schema; violates the project's own Zod-on-boundaries convention.
- **Fix approach:** Define a `loginSchema = z.object({...})` and use `useForm<z.infer<typeof loginSchema>>()` with `zodResolver`.

---

## Positive Observations

- Strong Zod schema coverage in the jaina stream parser (`src/lib/jaina/schemas.ts`) — all event types are validated.
- Well-structured undo/redo history (50 snapshots) across all three Zustand canvas stores.
- Supabase SSR client (`src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`) is cleanly abstracted; direct `createClient()` is not called in business logic.
- Organic library (`src/lib/organic/`) has healthy co-located test coverage (7 test files for 10 source files).
- `src/app/api/events/route.ts` has exemplary validation: Zod on input, optional token auth, clean SSE streaming pattern.
- Type-safe API layer (`src/lib/api/http.ts`) with consistent Bearer token injection.
- `bun-test-setup.ts` provides solid happy-dom environment mocking that enables component tests without jsdom overhead.

---

## Recommended Actions

1. **Restore `tsconfig.json` and `vitest.config.ts`** — Both are deleted in the working tree (per git status). Without `tsconfig.json` the project cannot type-check. Pick one test runner and delete tests using the other, or restore both configs.

2. **Add Sentry (or equivalent) error monitoring** — No production error tracking exists. Add `instrumentation.ts` with Sentry initialization; wrap the three major SSE stream handlers and workflow execution in `captureException`.

3. **Harden the two unauthenticated API routes** — `src/app/api/campaigns/route.ts` and `src/app/api/ad-accounts/route.ts` need a server-side `getUser()` check added before proxying to Supabase edge functions.

4. **Move Mixpanel token to an env var** — The hardcoded token in `src/components/analytics/MixpanelInit.tsx` should be `NEXT_PUBLIC_MIXPANEL_TOKEN`; rotate the old token after the change deploys.

5. **Regenerate Supabase types to include `brand_profiles` schema** — Eliminates the 20+ `as any` casts in canvas realtime hooks and establishes type safety on canvas_sessions and canvas_rooms queries. Run: `SUPABASE_SCHEMAS=brand_profiles bun run supabase:gen:types`.

---

*Concerns audit: 2026-03-25*
