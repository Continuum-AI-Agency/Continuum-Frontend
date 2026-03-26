# Continuum Frontend — Performance & Navigation Report
*Generated 2026-03-25. Goal: Linear-class snappiness.*

---

## Executive Summary

Four specialized sub-agents analyzed the codebase across Next.js patterns, React state management, navigation architecture, and bundle composition. The app has solid foundations (RSC in key pages, React Query, proper auth middleware) but has four systemic gaps that prevent it from feeling like Linear:

1. **No global command palette** — `command.tsx` exists but is wired nowhere
2. **No code-splitting anywhere** — zero `dynamic()` imports across 761 TS files
3. **Route rendering is waterfall-blocked** — layout auth blocks all child pages
4. **Critical thread-blocking on main interactions** — canvas validation, collision detection, and state cascades happen synchronously on every keystroke

---

## Part 1 — Navigation & Command Palette (Linear-like Meta-Navigation)

### What Linear Does That We Don't

| Feature | Linear | Continuum |
|---------|--------|-----------|
| Cmd+K global palette | ✅ | ❌ |
| Fuzzy route jumping | ✅ | ❌ |
| Keyboard shortcut registry | ✅ centralized | ❌ scattered in 4 files |
| Hover prefetch on nav items | ✅ | ❌ |
| Error boundaries per section | ✅ | ❌ zero error.tsx files |
| Loading skeletons per route | ✅ | ⚠️ only `/dashboard` has one |
| Intercepting routes (modal-over-page) | ✅ | ❌ |

### 1.1 Implement Global Command Palette (Cmd+K)

`src/components/ui/command.tsx` is complete (cmdk-based) but **has zero usages** in the app. Implement:

```tsx
// src/components/navigation/CommandPalette.tsx
// Wire Cmd+K globally in DashboardLayoutShell or AppSidebar
```

**Commands to index:**
- Route navigation (Dashboard, AI Studio, Organic, Paid Media, Primitives, Settings)
- Quick actions: "New Draft", "Open Canvas", "Switch Brand"
- Recent pages (store last 5 visited routes in localStorage)
- Search across brand primitives (audiences, products, personas)

**Keyboard shortcut centralization** — create `src/lib/keyboard/registry.ts` to replace the 4 independent `addEventListener('keydown')` listeners currently in:
- `sidebar.tsx:112-125` (Ctrl+B)
- `CampaignCanvas.tsx:263-292` (Cmd+Z, Cmd+D, Delete)
- `StudioCanvas.tsx` (window keydown)
- `ContextMenu.tsx` (document keydown)

### 1.2 Add Missing Route Infrastructure

**Add `loading.tsx` for each heavy route:**

| Route | Status | Skeleton to Use |
|-------|--------|-----------------|
| `/dashboard` | ✅ exists | `DashboardShellSkeleton` |
| `/organic` | ❌ missing | New `OrganicShellSkeleton` |
| `/paid-media` | ❌ missing | New `PaidMediaShellSkeleton` |
| `/ai-studio` | ❌ missing | New `StudioShellSkeleton` |
| `/primitives` | ❌ missing | New `PrimitivesShellSkeleton` |
| `/settings` | ❌ missing | Reuse card skeletons |

**Add `error.tsx` for each route segment** — currently zero error boundaries exist. A failed data fetch crashes the entire section with no recovery UI.

### 1.3 Fix Auth-Blocking Layout

**File:** `src/app/(post-auth)/layout.tsx:16`

```tsx
// CURRENT: Blocks ALL child routes
const { activeBrandId, ... } = await getActiveBrandContext(); // ← blocking
```

The middleware already validates auth. The layout does it again, creating a double-verification waterfall: Middleware → Layout auth → Page data → Component data.

**Fix:** Push the `redirect("/onboarding")` check into middleware only. The layout can receive brand context as a prop passed from middleware via headers, or stream the shell immediately and defer brand context to a Suspense boundary.

### 1.4 Prefetch on Navigation Hover

In `AppSidebar.tsx`, add `router.prefetch(item.href)` on `onMouseEnter` for each nav item. This is one line per nav item and gives Linear-like instant feel on click.

---

## Part 2 — Bundle Size & Code Splitting

### Current State: Zero Dynamic Imports

The codebase has **0 uses of `next/dynamic()`** across 761 TypeScript files. Every heavy dependency ships in the initial bundle.

### Estimated Bundle Composition

| Library | Approx Size | Currently Lazy? |
|---------|-------------|-----------------|
| Three.js + R3F + Drei | ~800 KB | ❌ |
| Recharts | ~500 KB | ❌ |
| Framer Motion / motion | ~380 KB (dual pkg) | ❌ |
| @xyflow/react | ~280 KB | ❌ |
| Streamdown + KaTeX + Shiki | ~280 KB | ❌ |
| lightweight-charts | ~160 KB | ❌ |
| MapLibre GL | ~180 KB | ❌ |
| **Total unoptimized** | **~2.6 MB** | |

### 2.1 Priority Dynamic Imports

```ts
// src/StudioCanvas/index.tsx — ssr: false, ~500 KB saved on non-canvas routes
const StudioCanvas = dynamic(() => import('./components/StudioCanvas'), { ssr: false });

// src/CampaignCanvas/index.tsx — ssr: false
const CampaignCanvas = dynamic(() => import('./CampaignCanvas'), { ssr: false });

// src/components/ui/chart.tsx — wrap RechartsPrimitive
const ChartContainer = dynamic(() => import('./ChartContainer'), { ssr: false });

// src/components/loader-animations/ — Three.js only needed for onboarding/loaders
const SaturnRingsScene = dynamic(() => import('./SaturnRingsScene'), { ssr: false });

// src/components/ui/SafeMarkdown.tsx
const SafeMarkdown = dynamic(() => import('./SafeMarkdown'), { ssr: false });

// src/components/ui/map.tsx
const Map = dynamic(() => import('./map'), { ssr: false });
```

### 2.2 Consolidate Dual Motion Libraries

`package.json` has both `framer-motion@12` and `motion@12`. These are the same package — `motion` is the renamed version. Pick one:
- **Keep `motion/react`** (newer API, same team)
- Remove `framer-motion` imports (33 files need updating)
- Saves ~20 KB and eliminates duplicate runtime

### 2.3 Add Bundle Analyzer

```ts
// next.config.ts
import bundleAnalyzer from '@next/bundle-analyzer';
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
export default withBundleAnalyzer(nextConfig);
```

Run: `ANALYZE=true bun run build` to establish a baseline before optimizing.

### 2.4 GalaxyBackground in Root Layout

`src/app/layout.tsx:97` renders `<GalaxyBackground intensity={1} speed="glacial" />` on every route. This loads Framer Motion and starts canvas/particle animations on every page load including auth pages. Move it to `(post-auth)/layout.tsx` at minimum, or behind a `dynamic()` with `ssr: false`.

---

## Part 3 — Server/Client Rendering Split

### 3.1 Suspense Strategy

Currently only 1 Suspense boundary in the entire app (dashboard page). Target pattern:

```tsx
// Each page should stream the shell immediately, defer data
export default async function OrganicPage() {
  return (
    <OrganicShell> {/* Renders immediately */}
      <Suspense fallback={<OrganicContentSkeleton />}>
        <OrganicContent /> {/* Streams in with data */}
      </Suspense>
    </OrganicShell>
  );
}
```

### 3.2 Client-Side Data Waterfalls to Fix

These components fetch data in `useEffect` on mount, causing render → empty state → fetch → fill:

| Component | Line | Fix |
|-----------|------|-----|
| `AdAccountSelector.tsx:67` | POST to `/api/paid-media/timeline/accounts` | Pass as RSC prop |
| `PaidMediaDashboard.tsx:267-273` | `loadCampaigns` + `loadCampaignIndexes` on mount | Server-side initial data + React Query for updates |
| `BrandIntegrationsCard.tsx:109` | Integration queries in useEffect | React Query with proper suspense |

### 3.3 Force-Dynamic Audit

5 pages are marked `export const dynamic = 'force-dynamic'`. Verify each is genuinely uncacheable — this disables all caching benefits including static shell rendering.

---

## Part 4 — React Performance (Main Thread Blocking)

### 4.1 CRITICAL: Campaign Canvas Validation on Every Keystroke

**File:** `src/CampaignCanvas/stores/useCampaignStore.ts:83,92`

`applyCampaignGraphValidation()` runs synchronously on every node/edge change including form keystrokes. Debounce it:

```ts
// Debounce validation 200ms — users won't notice, thread will
const debouncedValidation = debounce((nodes, edges) => {
  set({ nodes: applyCampaignGraphValidation(nodes, edges) });
}, 200);
```

### 4.2 HIGH: Studio Canvas Collision Detection O(n²) on Every Drag Frame

**File:** `src/StudioCanvas/utils/nodeCollisions.ts:56-87`

50 iterations × O(n²) node comparisons run on every `mousemove` during drag. With 30 nodes: ~45,000 operations per frame.

**Fix:** Run collision resolution only on `dragend`, not during drag:

```ts
// useStudioStore.ts — check isDragging before resolving
if (isDragging) {
  return { nodes: newNodes }; // Skip collision during drag
}
// Run once on dragend instead
```

### 4.3 HIGH: useEffect Cascade in OrganicCalendarWorkspaceClient

**File:** `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx:178-566`

6 chained `useEffect` hooks form a dependency cycle: `calendarDays` → `drafts` → `selectedDraft` → localStorage write → re-render. Adding one draft fires 4-5 consecutive render cycles.

**Fix:** Collapse effects 2-5 into a single `useEffect` with unified dependency array, or use a `useReducer` to batch these into one state transition.

### 4.4 HIGH: Index-Based Keys in Report Tables

**File:** `src/components/paid-media/jaina/components/JainaReportTables.tsx:20-68`

Four levels of nested `key={index}`. With 10 tables × 20 rows × 5 columns = 1,000 DOM nodes reconstructed on any data change.

**Fix:** Use `key={table.id}`, `key={header}`, `key={rowIndex}-${row[0]}` (stable string).

### 4.5 MEDIUM: Unbounded Undo History Memory

**File:** `src/lib/organic/store.ts:272`

50 history snapshots each contain full `calendarDays` hierarchy (7 days × 7 platforms × N slots). For media-rich drafts this can exceed 50 MB in memory over a session.

**Fix:** Implement snapshot diffing (store only changed keys) or reduce snapshot depth.

### 4.6 MEDIUM: JSON.stringify on Every Draft Selection

**File:** `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx:460`

`window.localStorage.setItem(key, JSON.stringify(payload))` runs synchronously on every `selectedDraft` change. Debounce 300ms and run in a `useEffect` cleanup to avoid blocking selection responsiveness.

---

## Part 5 — Implementation Roadmap

### Sprint 1 — Quick Wins (1-2 days each)
- [ ] Wire `CommandDialog` from `command.tsx` with Cmd+K, seed with route navigation
- [ ] Add `loading.tsx` skeletons for organic, paid-media, ai-studio, primitives
- [ ] Add `error.tsx` for all major route segments
- [ ] Fix index-based keys in `JainaReportTables.tsx`
- [ ] Debounce campaign canvas `updateNodeData` validation (200ms)
- [ ] Prefetch nav routes on hover in `AppSidebar.tsx`
- [ ] Add `@next/bundle-analyzer` and run baseline report

### Sprint 2 — Code Splitting (3-5 days)
- [ ] `next/dynamic` for `StudioCanvas`, `CampaignCanvas`
- [ ] `next/dynamic` for `SaturnRingsScene`, `GalaxyParticles` (Three.js)
- [ ] `next/dynamic` for `SafeMarkdown`, chart components
- [ ] Move `GalaxyBackground` out of root layout
- [ ] Consolidate `framer-motion` → `motion/react` (33 files)

### Sprint 3 — Rendering Pipeline (1 week)
- [ ] Lift layout auth redirect into middleware only (remove from `(post-auth)/layout.tsx:16`)
- [ ] Add Suspense shells to organic, paid-media, ai-studio pages
- [ ] Convert `AdAccountSelector` and `PaidMediaDashboard` mount-fetches to RSC props + React Query
- [ ] Fix Studio canvas collision to run only on `dragend`

### Sprint 4 — Polish (ongoing)
- [ ] Centralize keyboard shortcut registry (`src/lib/keyboard/registry.ts`)
- [ ] Add recent-pages tracking to command palette
- [ ] Implement `useTransition` for tab switches in Organic and Paid Media
- [ ] Explore intercepting routes for settings modals (Linear pattern)
- [ ] Set up bundle size CI budget (fail if chunk > N KB)

---

## Part 6 — Parallel Subagent Execution Plan

This section maps the work above into concurrent subagent workstreams. The goal is maximum parallelism while respecting file-level conflict zones and logical dependencies. Work is organized into waves — all agents within a wave execute simultaneously and the next wave starts only when all agents in the current wave have committed.

### Dependency Map

Before the wave breakdown, the non-obvious dependencies:

- Dynamic import work (Wave 2) should come *after* the bundle baseline (Wave 1) so impact is measurable.
- `framer-motion` consolidation (33 files) touches shared UI components — run it last to avoid merge conflicts with agents editing those same files.
- Auth pipeline fix must land before the Suspense shell work, since streaming shells assume the layout no longer blocks on auth.
- `error.tsx` / `loading.tsx` files are all new files with no overlap — fully parallelizable with everything.

---

### Wave 1 — Foundation (all agents run simultaneously)

Five independent agents with zero file overlap.

#### Agent W1-A: CSR Bailout Audit
**Priority: CRITICAL — likely silently disabling SSR on all protected routes today.**

Files to touch:
- `src/components/navigation/AppSidebar.tsx` — wrap `usePathname` in Suspense or extract to sub-component
- Audit all `(post-auth)` client components for bare `useSearchParams()` calls without Suspense

Deliverable: Every `useSearchParams` / `usePathname` usage in the protected layout tree is wrapped in a `<Suspense>` boundary.

---

#### Agent W1-B: Auth Pipeline Fix

Files to touch:
- `src/app/(post-auth)/layout.tsx` — remove double auth check; replace `redirect('/onboarding')` with `unauthorized()` / `forbidden()`; ensure `redirect()` is outside try-catch or use `unstable_rethrow`
- `src/app/unauthorized.tsx` — create
- `src/app/forbidden.tsx` — create
- `src/middleware.ts` — verify the hard-gate redirect is the sole auth enforcement point

Deliverable: Layout no longer blocks child routes. Auth errors use semantic `unauthorized()`/`forbidden()` APIs.

---

#### Agent W1-C: React Performance Fixes

Files to touch:
- `src/CampaignCanvas/stores/useCampaignStore.ts:83,92` — debounce `applyCampaignGraphValidation` 200ms
- `src/StudioCanvas/utils/nodeCollisions.ts:56-87` — gate collision resolution behind `isDragging` check; run only on `dragend`
- `src/components/paid-media/jaina/components/JainaReportTables.tsx:20-68` — replace index-based keys with stable identifiers
- `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx:460` — debounce localStorage write 300ms
- `src/lib/organic/store.ts:272` — cap undo history or implement snapshot diffing

No file overlap with any other Wave 1 agent.

---

#### Agent W1-D: Route Infrastructure (new files only)

All deliverables are new files — zero conflict risk with any other agent.

Files to create:
- `src/app/(post-auth)/organic/loading.tsx` — `OrganicShellSkeleton`
- `src/app/(post-auth)/paid-media/loading.tsx` — `PaidMediaShellSkeleton`
- `src/app/(post-auth)/ai-studio/loading.tsx` — `StudioShellSkeleton`
- `src/app/(post-auth)/primitives/loading.tsx` — `PrimitivesShellSkeleton`
- `src/app/(post-auth)/organic/error.tsx`
- `src/app/(post-auth)/paid-media/error.tsx`
- `src/app/(post-auth)/ai-studio/error.tsx`
- `src/app/(post-auth)/primitives/error.tsx`
- `src/app/(post-auth)/settings/error.tsx`
- `src/app/global-error.tsx` — root layout error boundary (must include `<html><body>`)

---

#### Agent W1-E: Bundle Baseline

Files to touch:
- `next.config.ts` — remove any `@next/bundle-analyzer` config if present; no new packages needed

Run:
```bash
next experimental-analyze --output
```

Deliverable: baseline report saved to `.next/diagnostics/analyze` with per-route chunk sizes documented. This data gates Wave 2 prioritization.

---

### Wave 2 — Code Splitting (starts after Wave 1 complete)

Auth and CSR fixes from Wave 1 must be merged first. Bundle baseline from W1-E informs which dynamic imports have highest ROI.

#### Agent W2-A: Canvas Dynamic Imports

Files to touch:
- Entry point for `StudioCanvas` (wherever it is imported in `ai-studio` page/client) — wrap with `dynamic(() => import(...), { ssr: false })`
- Entry point for `CampaignCanvas` — same pattern
- `src/app/layout.tsx:97` — move `GalaxyBackground` behind `dynamic(..., { ssr: false })` or relocate to `(post-auth)/layout.tsx`

Estimated savings: ~780 KB off non-canvas routes.

---

#### Agent W2-B: Heavy UI Dynamic Imports

Files to touch:
- `src/components/ui/chart.tsx` — wrap Recharts behind `dynamic()`
- `src/components/ui/SafeMarkdown.tsx` — wrap Shiki/KaTeX behind `dynamic()`
- `src/components/ui/map.tsx` — wrap MapLibre behind `dynamic()`
- `src/components/loader-animations/SaturnRingsScene.tsx` (and other Three.js scenes) — `dynamic(..., { ssr: false })`

No file overlap with W2-A.

---

#### Agent W2-C: Command Palette + Nav Prefetch

Files to touch:
- `src/components/navigation/CommandPalette.tsx` — already exists per git status; verify it's wired
- `src/components/navigation/CommandPaletteProvider.tsx` — already exists; ensure it wraps the layout
- `src/components/navigation/AppSidebar.tsx` — add `router.prefetch(item.href)` on `onMouseEnter` per nav item
- `src/components/DashboardLayoutShell.tsx` — confirm `CommandPaletteProvider` is mounted here

---

#### Agent W2-D: OrganicCalendarWorkspaceClient useEffect Collapse

This is isolated to one large file and benefits from Wave 1's localStorage debounce already being in.

Files to touch:
- `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx:178-566` — collapse the 6-chain `useEffect` hooks into a `useReducer` or unified effect with a single dependency array

---

### Wave 3 — Rendering Pipeline (starts after Wave 2 complete)

Auth is fixed (W1-B), CSR bailout is fixed (W1-A), dynamic imports are in (W2-A/B). Now stream the shells.

#### Agent W3-A: Suspense Shells

Files to touch:
- `src/app/(post-auth)/organic/page.tsx` — wrap content in `<Suspense fallback={<OrganicContentSkeleton />}>`
- `src/app/(post-auth)/paid-media/page.tsx` — same pattern
- `src/app/(post-auth)/ai-studio/AIStudioClient.tsx` — same pattern

---

#### Agent W3-B: RSC Data Fetching Migrations

Files to touch:
- `src/components/paid-media/AdAccountSelector.tsx:67` — remove `useEffect` fetch; receive accounts as prop from RSC parent
- `src/components/paid-media/PaidMediaDashboard.tsx:267-273` — move initial `loadCampaigns` / `loadCampaignIndexes` to server; pass as `initialData` to React Query
- Corresponding page/layout RSC files — add the server-side fetches

---

#### Agent W3-C: `force-dynamic` → `'use cache'` Audit

Files to touch:
- The 5 pages marked `export const dynamic = 'force-dynamic'` — audit each; replace with `'use cache'` on the specific data function where applicable; leave `force-dynamic` only where the entire page is session-dependent

Requires `cacheComponents: true` in `next.config.ts`.

---

### Wave 4 — Polish (starts after Wave 3 complete, or run independently as non-blocking)

#### Agent W4-A: `framer-motion` → `motion/react` Consolidation

Run last to avoid conflicts. Touches 33 files.

- Global find-and-replace `from 'framer-motion'` → `from 'motion/react'`
- Verify API surface matches (same package, same team — API is identical)
- Remove `framer-motion` from `package.json`

---

#### Agent W4-B: Keyboard Shortcut Registry

Files to touch:
- `src/lib/keyboard/registry.ts` — create centralized registry
- `src/components/navigation/AppSidebar.tsx` — migrate Ctrl+B listener
- `src/CampaignCanvas/CampaignCanvas.tsx:263-292` — migrate Cmd+Z, Cmd+D, Delete listeners
- `src/StudioCanvas/components/StudioCanvas.tsx` — migrate window keydown listener
- Any `ContextMenu.tsx` with document keydown

---

#### Agent W4-C: Bundle CI Budget

Files to touch:
- `.github/workflows/` (or equivalent CI config) — add step to run `next experimental-analyze --output` and fail if any client chunk exceeds a defined threshold (suggested: 200 KB per route entry point)

---

### Execution Summary

```
Wave 1 (parallel):   W1-A  W1-B  W1-C  W1-D  W1-E
                       |     |     |     |     |
                       └─────┴─────┴─────┴─────┘
                                   |
Wave 2 (parallel):   W2-A  W2-B  W2-C  W2-D
                       |     |     |     |
                       └─────┴─────┴─────┘
                                   |
Wave 3 (parallel):   W3-A  W3-B  W3-C
                       |     |     |
                       └─────┴─────┘
                                   |
Wave 4 (parallel):   W4-A  W4-B  W4-C
```

### File Conflict Zones to Watch

| File | Agents that touch it | Resolution |
|------|---------------------|------------|
| `AppSidebar.tsx` | W1-A (Suspense), W2-C (prefetch) | W1-A runs in Wave 1, W2-C runs in Wave 2 — sequential by design |
| `next.config.ts` | W1-E (analyzer), W3-C (cacheComponents) | W1-E runs first; W3-C adds to the same config in Wave 3 |
| `(post-auth)/layout.tsx` | W1-B only | No conflict |
| `OrganicCalendarWorkspaceClient.tsx` | W1-C (localStorage debounce), W2-D (useEffect collapse) | W1-C makes a targeted single-line edit; W2-D does the structural rewrite in Wave 2 — merge sequentially |

---

## Key Files Reference

| File | Issue |
|------|-------|
| `src/app/(post-auth)/layout.tsx:16` | Auth blocks all child route rendering |
| `src/CampaignCanvas/stores/useCampaignStore.ts:83,92,167` | Validation on every keystroke |
| `src/StudioCanvas/utils/nodeCollisions.ts:56-87` | O(n²) × 50 on every drag frame |
| `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx:178-566` | 6-effect cascade chain |
| `src/components/paid-media/jaina/components/JainaReportTables.tsx:20-68` | Index keys, full DOM rebuild |
| `src/app/layout.tsx:97` | GalaxyBackground on every route |
| `src/components/ui/command.tsx` | Ready to use, wired nowhere |
| `src/components/navigation/AppSidebar.tsx` | No hover prefetch |
| `next.config.ts` | No bundle analyzer, no dynamic imports |
