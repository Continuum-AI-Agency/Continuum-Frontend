# Plan 007: First-paint organic dashboard KPIs are fetched server-side (RSC) and seeded as props

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. This plan has spike gates: if a STOP fires, report findings rather than forcing the change. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: open `Continuum-Frontend/src/components/organic/OrganicMetricsDashboard.tsx`, `OrganicMetricsDashboardLazy.tsx`, `src/app/(post-auth)/organic/page.tsx`, and `src/lib/api/organicAnalytics.client.ts`; confirm the anchors below still match (this is a 2,366-line component — anchor on the mount effect and the lazy wrapper). On mismatch, STOP. Working tree was dirty at the planned commit.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (best run after 001 so CI guards it)
- **Category**: perf
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

`OrganicMetricsDashboard` is mounted with `ssr:false` and fetches its first-paint account KPIs (and Instagram demographics) client-side in a mount `useEffect`. The result is a render → hydrate → fetch waterfall on one of the app's primary surfaces, hurting LCP/TTI. The RSC + Suspense + props pattern that fixes this is already proven elsewhere in the repo. This plan moves only the **first-paint account KPI** fetch server-side; interactive drill-down stays client-side.

## Current state

- **Exemplar to mirror**: `src/components/dashboard/server/OrganicDashboardDataWrapper.tsx:6-14` (async RSC, `Promise.all` → props) rendered under `<Suspense>` in `src/app/(post-auth)/dashboard/page.tsx:25-34`. Server caller convention: `src/lib/api/brandInsights.server.ts` (`import "server-only"`, `getServerAccessToken()`, Next `fetch` caching). `src/app/(post-auth)/organic/page.tsx` already RSC-fetches via `Promise.allSettled`.
- **Mount chain**: `organic/page.tsx:327-332` renders `<OrganicMetricsDashboardLazy>` → `OrganicMetricsDashboardLazy.tsx:7-13` (`dynamic(() => import(...), { ssr:false, loading: <skeleton> })`) → `OrganicMetricsDashboard.tsx` (`"use client"`, 2,366 lines).
- **First-paint fetch**: `OrganicMetricsDashboard.tsx:2066-2090` (mount effect spanning `:2022-2112`) calls `fetchOrganicAnalytics({ ...base, scope: "kpis" })` and, for Instagram, `scope: "demographics"`. `fetchOrganicAnalytics` is in `src/lib/api/organicAnalytics.client.ts:24-48` — POSTs to `/api/organic-analytics/<platform>` and Zod-parses the response.
- **Route handler** (the auth/transport to replicate): `src/app/api/organic-analytics/instagram/route.ts` (facebook/tiktok/youtube are siblings) — `createSupabaseServerClient()` → `supabase.auth.getSession()` (401 if none) → `supabase.functions.invoke("organic-reporting/analytics", { body: { brandId, integrationAccountId, platform, range, forceRefresh, scope, selectedPostId } })` → `normalizeInstagramOrganicMetricsResponse(...)`. **No server-side fetch util exists yet.**
- **RSC already has the inputs**: default platform at `organic/page.tsx:296-300` (`initialMetricsPlatform`); `integrationAccountId` at `organic/page.tsx:335` (`metricsPrefetchParams`).
- **Existing client warm-cache** (third source of the same data): `src/lib/prefetch/organic-metrics-cache.ts` (`consumePrefetched` used at `OrganicMetricsDashboard.tsx:2074`) warmed via `requestIdleCallback` in `src/components/organic/OrganicWorkspaceTabs.tsx:60-76`.

## Gotchas (read before coding)

- `ssr:false` means the component never renders on the server today → **seed via props; do NOT drop `ssr:false`** (the component is heavily interactive). Data arrives as `initialMetrics` props into the still-client component.
- The component mixes first-paint and interactive state; the mount effect re-fires on `[brandId, platform, rangePreset, reloadTick, selectedAccountId, viewMode]` (`:2112`).
- Demographics is Instagram-only (`:2064, :2088`).
- The default account is currently chosen **client-side** at `:1982-2020` — the RSC seed must target the same account or it will fetch the wrong one.
- The warm-cache already targets this payload; a naive RSC seed becomes a third fetch source.

## Commands you will need

| Purpose | Command (from `Continuum-Frontend/`) | Expected |
|---------|--------------------------------------|----------|
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Organic tests | `bun test src/components/organic src/lib/api` | pass |
| Manual | load `/organic` in the running app | KPIs visible first paint, no client KPI fetch |

## Scope

**In scope**: new `src/lib/api/organicAnalytics.server.ts`; `src/app/(post-auth)/organic/page.tsx` (RSC fetch for the default account/platform); `OrganicMetricsDashboardLazy.tsx` + `OrganicMetricsDashboard.tsx` (accept optional `initialMetrics` prop, seed first-paint state, skip the initial fetch when seeded).

**Out of scope** (stay client-side, do NOT migrate): per-post lazy detail (`:1782-1839`), posts-window pagination (`:1749-1767`), CSV/HTML export (`:1888-1980`), range/account/platform switching, and the client warm-cache (leave it for now — see STOP/Maintenance).

## Git workflow

- Branch: `advisor/007-rsc-seed-organic-dashboard`
- Commits per logical unit: (1) server util; (2) RSC fetch + prop threading; (3) seed + skip-initial-fetch in the component.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Server-side fetch util

Create `src/lib/api/organicAnalytics.server.ts` with `import "server-only"` and `getServerOrganicKpis({ brandId, integrationAccountId, platform, rangePreset })`: use `createSupabaseServerClient()` and `supabase.functions.invoke("organic-reporting/analytics", { body: { brandId, integrationAccountId, platform, range: { preset: rangePreset }, scope: "kpis" } })`, then parse/normalize with the SAME schema + normalizer the route handler uses (import the normalizer; do not re-implement). Add a sibling `getServerOrganicDemographics` (Instagram only) or a `scope` param. Mirror `brandInsights.server.ts` for session + caching. Return `undefined` on any failure (best-effort).

**Verify**: `bunx tsc --noEmit` exit 0.

### Step 2: RSC fetch + thread props

In `organic/page.tsx`, for the default `initialMetricsPlatform` and `metricsPrefetchParams.integrationAccountId`, if an account id is present, call the new server util (KPIs always; demographics if Instagram), `catch → undefined`. Pass the result as a new `initialMetrics` prop through `OrganicMetricsDashboardLazy` to `OrganicMetricsDashboard`. Guard the empty-account case (`integrationAccountId === ""` → pass `undefined`).

**Verify**: `bunx tsc --noEmit` exit 0.

### Step 3: Seed + skip the initial client fetch

In `OrganicMetricsDashboard.tsx`: accept `initialMetrics?`; initialize the KPI/demographics state from it when present; in the mount effect (`:2022-2112`), **skip** the initial fetch when `initialMetrics` matches the current default account + platform + range (so a later switch still refetches). Keep `ssr:false` on the lazy wrapper.

**Verify**: `bunx tsc --noEmit` exit 0; `bun test src/components/organic` green.

## Test plan

- Unit: a test for `getServerOrganicKpis` (mock the server Supabase client's `functions.invoke`; assert it parses/normalizes and returns `undefined` on error). Model after any existing `*.server` test or the route handler test.
- Component: assert `OrganicMetricsDashboard` seeded with `initialMetrics` renders KPIs without calling `fetchOrganicAnalytics` for the default account on mount (spy on the client fetch).
- Manual: load `/organic`; confirm KPIs render on first paint and the Network tab shows **no** `/api/organic-analytics` call for the default account on initial load (a switch still triggers one).

## Done criteria

- [ ] `src/lib/api/organicAnalytics.server.ts` exists (`server-only`) and is unit-tested.
- [ ] `organic/page.tsx` fetches initial KPIs server-side and threads `initialMetrics` down.
- [ ] `OrganicMetricsDashboard` seeds from `initialMetrics` and skips the matching initial client fetch.
- [ ] `bunx tsc --noEmit` exits 0; organic tests green.
- [ ] Manual check: no initial client KPI fetch for the default account.
- [ ] `plans/README.md` status row updated.

## STOP conditions (spike gates — report, don't force)

- The default account cannot be determined in the RSC (it is currently decided client-side at `:1982-2020`) → STOP and report; the account-selection logic may need extraction first.
- `supabase.functions.invoke` from an RSC needs a token/session shape unavailable server-side → STOP.
- Seeding causes an unguardable double-fetch with the client warm-cache → STOP (the right fix may be to retire the warm-cache instead — report that finding).

## Maintenance notes

- Once the RSC seed is solid, retire the client warm-cache (`organic-metrics-cache.ts` + the `OrganicWorkspaceTabs` idle warmer) so there is one source of first-paint data.
- Apply the same RSC-seed pattern to `src/app/(post-auth)/scale/PaidMediaClient.tsx` (it bootstraps via ~15 client effects).
- Revisit when the client-side default-account selection is refactored.
