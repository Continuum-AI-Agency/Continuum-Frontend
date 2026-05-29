# Onboarding Contracts — Gap Analysis (FE ↔ BE)

**Date:** 2026-05-28
**Scope:** Onboarding domain only — firecrawl scraper, brand-report agents (voice/audience/business/website/first_impression), readiness/scoring, BrandProfile, SSE event envelope.
**Out of scope:** Organic-marketing NDJSON contracts, Paid/Intel/Jaina contracts. Same drift pattern likely applies; covered when those domains adopt the same workspace package.

## TL;DR

`Continuum-Frontend` and `Continuum-Backend` each hand-author Zod schemas for the same wire format. The audit found six concrete drift points — one of which (the firecrawl shape) is silently dropping 7+ rich-scrape fields on the frontend today. Bun workspaces and `packages/contracts/` are already wired but unused; this report's recommendation is to populate the package and switch both sides to import from it. Migration order: scrape → readiness → SSE envelope → remaining payload schemas.

## Workspace state (current, not aspirational)

ADR 0001 says workspaces are deferred; reality says they're done. The repo right now:

- Root `package.json:5-8` declares `"workspaces": ["Continuum-Frontend", "Continuum-Backend", "packages/*"]`.
- Both projects depend on `"@continuum/contracts": "workspace:*"` (`Continuum-Frontend/package.json`, `Continuum-Backend/package.json`).
- Root `bunfig.toml:7-8` sets `linker = "hoisted"` for Turbopack/Next.js compatibility.
- A single root `bun.lock` and root `node_modules/` exist.
- Root `vercel.json` moved the Vercel Root Directory to the monorepo root: `installCommand: "bun install"`, `buildCommand: "cd Continuum-Frontend && bun run --bun next build --turbopack"`.
- `Continuum-Backend/App/app.dockerfile:11,66,73` rebuilt around workspaces: build context is the monorepo root, the symlink `/app/node_modules/@continuum/contracts → ../../packages/contracts` survives into the runtime stage.
- `packages/contracts/package.json` declares subpath exports (`.`, `./organic`, `./paid-media`, `./jaina`) — but `src/index.ts` is empty (`export {};`) and there is no `./onboarding` subpath yet. Nothing in `Continuum-Frontend/src` or `Continuum-Backend/App` actually imports from `@continuum/contracts` (only `app.dockerfile` comments reference the package).

So the forcing function for adoption is the onboarding contracts, and the only blocker is that `packages/contracts/src/` is empty.

## Side-by-side inventory

Every shape exchanged across the boundary, with its current authoring location on each side.

| Shape | Backend (`Continuum-Backend/App/agents-ts/onboarding/src/`) | Frontend (`Continuum-Frontend/src/lib/onboarding/`) | Drift today |
|---|---|---|---|
| `Scrape` (firecrawl) | `schemas.ts:828` — `scrapeSchema` (full: `url, title, description, logoUrl, colors, typography, colorScheme, hero_copy, nav_labels, cta_text, body_sample, meta, language`) | `scrape.ts:1-8` — `ScrapeResult` type (only: `url, title, description, logoUrl, colors, typography`) | **YES — FE missing 7 fields** |
| `BrandProfile` | `schemas.ts:204` — `brandProfileSchema` (lenient input, `.passthrough()`) | `agentClient.ts:173-180` — `AgentBrandProfile` | YES — likely subset |
| `BrandVoice` | `schemas.ts:115` — `brandVoiceSchema` | `agentClient.ts:68-79` — `brandVoiceSchema` | Authored twice; nominally aligned |
| `TargetAudience` + `AudiencePersona` | `schemas.ts:170` — `targetAudienceSchema` | `agentClient.ts:83-114` | Authored twice; nominally aligned |
| `BusinessSummary` | `schemas.ts` (within section schemas) — `businessSummarySchema` | `agentClient.ts:151-161` | Authored twice |
| `WebsiteSummary` | `schemas.ts` — `websiteSummarySchema` | `agentClient.ts:133-141` | Authored twice |
| `ReadinessAnalysis` | `schemas.ts:912-960` — `readinessAnalysisSchema` (7-dimension enum, 0-100 score) | `agentClient.ts:235-243` | Authored twice; nominally aligned |
| `ReadinessFinding` | `schemas.ts:912-960` (nested) | `agentClient.ts:224-231` | Authored twice |
| `ReadinessDimension` enum | `schemas.ts:912` — `readinessDimensionKey` (7 values) | `agentClient.ts:212-220` (7 values) + **`ReadinessCard.tsx:15-23` hardcoded array** | YES — third declaration in a component |
| `FirstImpression` | `schemas.ts:963` — `firstImpressionSchema` | `agentClient.ts:267-270` | Authored twice |
| `BrandReportSection` enum | `types.ts:217` area — `BrandReportSection` (`brand_profile \| voice \| audience \| website \| business \| readiness \| first_impression`) | `agentPreview.ts:59-79` + `agentClient.ts:247-255` | Authored twice |
| `BrandReportSectionStatus` enum | `types.ts:217` — `running \| done \| skipped \| error` (4 values) | `agentPreview.ts:44` — `idle \| running \| done \| skipped \| error` (5 values) | **YES — FE has extra `"idle"`** |
| `BrandReportProgressEvent` (SSE) | `types.ts:248-268` — discriminated union of 8 event kinds (`data, stream, status, spark, complete, enrich, error`, plus handshake) | `agentClient.ts` — implicit, parsed via switch | YES — FE switch has no exhaustiveness guard |

## The six confirmed drift points

### 1. Firecrawl `Scrape` — frontend silently drops 7+ rich fields *(highest impact)*

Backend `scrapeSchema` at `Continuum-Backend/App/agents-ts/onboarding/src/schemas.ts:828` emits the full Phase 16a rich-scrape priming bundle:

```ts
{ url, title, description, logoUrl, colors, typography, colorScheme,
  hero_copy: { headline, subhead } | null,
  nav_labels: string[] | null,
  cta_text: string[] | null,
  body_sample: string | null,
  meta: { og_title, og_description, twitter_card_description } | null,
  language: string | null }
```

Frontend declares only the original six fields at `Continuum-Frontend/src/lib/onboarding/scrape.ts:1-8`:

```ts
export type ScrapeResult = {
  url: string; title: string | null; description: string | null;
  logoUrl: string | null; colors: string[];
  typography: { primary: string | null; secondary: string | null };
};
```

Consequence: `scrapeToBrandPatch` in `JobPersistor.tsx` reads only the declared keys; the rich fields are unreachable from React state. **The data is sent and ignored.** This is a real product gap — those fields are exactly the kind of priming the BrandDNA hero would benefit from.

**Fix:** adopt the backend (richer) shape in `packages/contracts/src/onboarding/scrape.ts`. The FE gains the missing fields for free; mappers in `JobPersistor.tsx` can then read them.

### 2. `BrandReportSectionStatus` enum — FE has an extra `"idle"` *(silent breakage risk)*

Backend at `Continuum-Backend/App/agents-ts/onboarding/src/types.ts:217` defines four states: `running | done | skipped | error`. Frontend at `Continuum-Frontend/src/components/onboarding/v2/state/agentPreview.ts:44` adds `idle` — a legitimate FE-side "not yet started" state that the backend never emits.

Today the values happen to align. But: any backend rename (e.g. `skipped` → `bypassed`) lands silently in the FE as a fall-through case until someone notices the section badge stops rendering correctly.

**Fix:** share the backend enum as `BackendSectionStatus`; FE composes `FrontendSectionStatus = BackendSectionStatus | "idle"` locally. Codified, type-checked.

### 3. `ReadinessDimension` enum hardcoded in `ReadinessCard.tsx` *(third declaration)*

The 7-value dimension enum is now authored **three times**:

1. Backend: `Continuum-Backend/App/agents-ts/onboarding/src/schemas.ts:912` (authoritative `readinessDimensionKey`)
2. Frontend Zod mirror: `Continuum-Frontend/src/lib/onboarding/agentClient.ts:212-220`
3. **Frontend display order**: `Continuum-Frontend/src/components/onboarding/v2/dna/ReadinessCard.tsx:15-23` — a hardcoded `DIMENSIONS` const array used for iteration order

Item 3 is the silent one: if backend adds an 8th dimension, the FE Zod schema would still parse the payload (assuming the schema is updated), but `ReadinessCard` would not render the new dimension — the iteration array is closed.

**Fix:** export the canonical ordered list from the shared package; `ReadinessCard` imports it instead of declaring its own.

### 4. Schemas duplicated, not imported *(maintenance tax)*

Five payload schemas (`brandVoiceSchema`, `targetAudienceSchema`, `businessSummarySchema`, `websiteSummarySchema`, `readinessAnalysisSchema`, `firstImpressionSchema`) are authored from scratch on both sides. Today they're nominally aligned; in a year, they won't be. Every backend bounds-tighten (e.g., `keywords: max(20) → max(15)`) is a silent FE divergence.

**Fix:** move authoritative versions to `packages/contracts/src/onboarding/*.ts`; both sides import. Both runtimes already depend on `zod` so the peer dependency declared in `packages/contracts/package.json:15-17` is satisfied with no extra work.

### 5. SSE event envelope hand-mirrored *(no exhaustiveness guard)*

Backend `BrandReportProgressEvent` at `Continuum-Backend/App/agents-ts/onboarding/src/types.ts:248-268` is a discriminated union of eight `kind` values. Frontend parses it in `agentClient.ts` with a switch that has no `assertNever(_)` default — a new event kind backend-side lands as a silent fall-through frontend-side until a user reports "the readiness card doesn't update mid-stream."

**Fix:** export the discriminated union from the shared package; have the FE switch end with `default: { const _: never = e; throw new Error(...); }`. New kinds become typecheck errors.

### 6. `ScrapeResult` consumed without re-validation *(weak boundary)*

`Continuum-Frontend/src/components/onboarding/v2/state/JobPersistor.tsx:88` casts the persisted job result:

```ts
jobs[key].data as ScrapeResult | null
```

The SSE handler in `agentClient.ts` is strict (every section payload goes through Zod). But once a result is persisted to background-job storage and read back, the FE drops to a cast. If the persisted payload is ever corrupted, mismatched-version, or simply stale across a backend bounds change, the bug surfaces deep in `scrapeToBrandPatch` rather than at the boundary.

**Fix:** `scrapeSchema.safeParse(jobs[key].data)` and handle the `success: false` case explicitly. Cheap, eliminates a class of latent bugs.

## Validation-discipline assessment

| Boundary | Today | After plan |
|---|---|---|
| SSE `data` event (per section) | Strict — `<sectionSchema>.parse()` in `agentClient.ts` handler | Same, but `<sectionSchema>` is the shared package's schema (no second authoring) |
| SSE `complete` event | Strict — `previewCompleteSchema.parse()` | Same, shared |
| Persisted job result (`jobs[key].data`) | **Weak — `as` cast in `JobPersistor.tsx:88`** | Strict — `scrapeSchema.safeParse(...)` |
| HTTP responses from `src/lib/api/http.ts` | Optional `schema` param; if omitted, no runtime check | Unchanged — out of scope for onboarding |
| Backend inbound request bodies | Strict — lenient input schemas via `safeParse()` in handlers | Same |
| Backend agent generation | Strict — `Output.object({ schema })` enforces bounds server-side | Same |

## Recommended migration order

Smallest-blast-radius-first, with a verification milestone after the first migration so we don't fan out blind:

1. **`scrapeSchema` + `ScrapeResult`** — riskiest drift (7 missing fields). One migration unlocks the rich-scrape data path end-to-end.
2. **`readinessAnalysisSchema` + `ReadinessFinding` + `ReadinessDimension`** — 7-dimension enum needs to be the canonical list for both the Zod parser and `ReadinessCard.tsx`'s iteration order.
3. **`BrandReportSectionStatus`** — split into `BackendSectionStatus` (shared) and `FrontendSectionStatus = BackendSectionStatus | "idle"` (local).
4. **`BrandReportProgressEvent`** — formalize the discriminated union, add exhaustiveness guard to the FE switch.
5. **Remaining payload schemas** — `brandVoiceSchema`, `targetAudienceSchema` (with `AudiencePersona`), `businessSummarySchema`, `websiteSummarySchema`, `firstImpressionSchema`, `brandProfileSchema`.

After step 1 lands, run `bun run typecheck` + `bun run test:fe` + a manual `bun run dev:all` scrape of a marketing landing page → confirm the new `hero_copy` field surfaces in React DevTools brand state. That single observation proves the loop end-to-end.

## What landed in this PR

- `packages/contracts/src/onboarding/` populated with 10 files covering every onboarding payload shape (scrape, brand-voice, target-audience, brand-profile, business-summary, website-summary, readiness, first-impression, brand-report types, SSE events).
- Backend (`Continuum-Backend/App/agents-ts/onboarding/src/schemas.ts`): imports `Scrape`, `ReadinessAnalysis`, `ReadinessFinding` as TYPES from `@continuum/contracts`; keeps local Zod schemas; uses compile-time `extends` guards to assert alignment.
- Frontend (`src/lib/onboarding/agentClient.ts`): imports `readinessDimensionKey` + `readinessFindingSchema` + `readinessAnalysisSchema` as VALUES from `@continuum/contracts`; deletes the duplicated local Zod definitions.
- Frontend (`src/lib/onboarding/scrape.ts`): re-exports `Scrape as ScrapeResult` and `scrapeSchema` from `@continuum/contracts`. Frontend now sees the full 13-field scrape shape including `hero_copy`, `nav_labels`, `cta_text`, `body_sample`, `meta`, `language`, `colorScheme`.
- Frontend (`src/components/onboarding/v2/state/JobPersistor.tsx:88`): `as ScrapeResult` cast replaced with `scrapeSchema.safeParse(...)`.
- Frontend (`src/components/onboarding/v2/dna/ReadinessCard.tsx:15-27`): hardcoded `DIMENSIONS` array gains a compile-time exhaustiveness check (`type _ExhaustiveDimensions = Exclude<ReadinessDimension, …>`) that fails tsc when a backend dimension is added without a UI handler.
- `AGENTS.md §2` updated to reflect Vercel Root Directory = monorepo root.
- `docs/adr/0004-shared-contracts-via-workspaces.md` supersedes `0001-loose-monorepo-over-bun-workspaces.md` (which is now status: Superseded).

## Deferred to a follow-up PR

- **Migration steps 3–5 above** (BrandReportSectionStatus, BrandReportProgressEvent, brand-voice/audience/business/website/first-impression/brand-profile payload schemas).
- Reason: Backend's onboarding agent sub-package pins `zod ^3.25` while Frontend is on `zod ^4`. Backend can only consume types (not Zod schema values) from `@continuum/contracts` until that asymmetry is resolved. FE-side schema replacements also require dedicated regression coverage because the existing FE schemas are more permissive (no max bounds, `.passthrough()` differences) than the BE-authored versions — direct swaps could surface runtime parse failures on edge-case payloads.
- The pattern is proven by Phase C; the remaining work is mechanical once the FE has regression coverage and/or the BE onboarding sub-package migrates to Zod 4 (tracked alongside the Jaina schema migration per `Continuum-Frontend/CLAUDE.md` §3).

## What this report does not recommend

- **Code generation.** An earlier draft proposed a root-level `contracts/` directory with `bun run contracts:gen` emitting `.generated.ts` into each project. That was the right pattern *before* workspaces landed. Workspaces are now live; direct workspace imports (`@continuum/contracts/onboarding`) are simpler and have no codegen drift risk.
- **A separate validation layer.** Zod is already on both sides; the shared package is just a Zod export. No additional runtime overhead.
- **OpenAPI generation.** Possible (zod-to-openapi) but unnecessary while both consumers are TypeScript. Revisit if a Python/Go consumer appears.
