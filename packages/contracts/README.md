# @continuum/contracts

Shared Zod-defined schemas and TypeScript types between **Continuum-Frontend** and **Continuum-Backend**. Single source of truth for everything that crosses the FE↔BE boundary.

**Status: live.** Both projects import from `@continuum/contracts` via Bun workspaces (root `node_modules/@continuum/contracts` is a symlink to this directory).

## What goes here

Anything the Frontend and Backend both touch:

- **Agent stream-event types** (`src/streaming/<domain>.ts`): the discriminated union of NDJSON frames a Backend agent emits. The Backend imports the type at emit sites; the Frontend imports the same type at parse sites.
- **NDJSON envelope** (`src/streaming/envelope.ts`): the canonical `{ eventId, seq, ts }` Zod schema, plus `serializeFrame`/`parseFrame` helpers in `src/streaming/ndjson.ts`. Every stream uses these — no per-feature envelopes.
- **Agent output object schemas** (planned, `src/<domain>/`): plan cards, checkpoint reports, report assemblies, post drafts. Anything the Backend produces and the Frontend renders.
- **HTTP request/response schemas** (planned): for endpoints the Frontend calls on the Backend.

## How consumers import

```ts
// Backend (Continuum-Backend, moduleResolution: "node")
import { OrganicStreamFrame, serializeFrame, type StreamEnvelope } from '@continuum/contracts';

// Frontend (Continuum-Frontend, moduleResolution: "bundler")
import { organicStreamFrameSchema, type OrganicStreamFrame } from '@continuum/contracts';
```

**Always import from the root entry (`@continuum/contracts`).** Subpath imports (`@continuum/contracts/streaming/organic`) resolve in the Frontend's `bundler` resolution but NOT in the Backend's classic `node` resolution — using the root entry keeps both sides identical and prevents drift.

## Files (current)

```
src/
  index.ts                    re-exports everything in streaming/ and onboarding/
  streaming/
    index.ts                  barrel
    envelope.ts               { eventId, seq, ts } schema + helpers
    ndjson.ts                 serializeFrame / parseFrame
    common.ts                 shared frame shapes (tool.*, response.*)
    organic.ts                Organic agent stream union (Zod)
    jaina.ts                  Jaina stream frame TS-level union (Zod migration deferred — see note)
  onboarding/
    index.ts                  barrel
    _shared.ts                httpUrl, hexColor, integrationProvider, datetime
    scrape.ts                 Firecrawl scrape result (rich-scrape priming fields)
    brand-voice.ts            voice/tone/keywords/banned_words
    target-audience.ts        segments, demographics, journey stages
    brand-profile.ts          BrandProfile composite (voice + audience + url)
    business-summary.ts       business name/description/features/CTAs
    website-summary.ts        hero copy + palette + typography
    readiness.ts              7-dimension scoring + findings + READINESS_DIMENSIONS list
    first-impression.ts       optional 1-line tagline
    brand-report.ts           section enum, BackendSectionStatus, BrandReportResult (types)
    sse-events.ts             BrandReportProgressEvent discriminated union + assertNeverEvent
```

## Discipline

This is the canonical place for cross-project types. Per the root `AGENTS.md` §4 *Shared contracts*:

- New agent event types are defined here **first**, then imported on both sides in the same PR.
- Hand-rolling a TypeScript stream-event union inside `Continuum-Backend/App/.../events.ts` *and* a parallel union inside `Continuum-Frontend/src/.../streamEventParser.ts` is forbidden — that drift is exactly what this package exists to prevent.
- Frontend response interpreters `safeParse` against the imported schema; failures get logged, not silently coerced.

## Backend ↔ Frontend Zod-version asymmetry

Important: the Backend currently pins `zod ^3.25` (via `Continuum-Backend/App/agents-ts/onboarding/package.json`) while the Frontend is on `zod ^4`. They coexist in the same workspace.

Consequence: **the Backend cannot consume Zod schema VALUES from this package** — Zod 3's `ZodType` is structurally incompatible with Zod 4's. The Backend imports TYPES only (`import type { Scrape } from '@continuum/contracts'`), keeps its own local Zod schemas, and uses compile-time `extends`/`satisfies` assertions to keep its runtime shape aligned with the contracts-defined type.

The Frontend imports both schemas and types as values (`import { scrapeSchema, type Scrape } from '@continuum/contracts'`) and `safeParse`s at every boundary.

When the Backend migrates to Zod 4 (tracked alongside the Jaina schema migration), the asymmetry collapses and both sides will import the schemas as values.

## Roadmap

- **Done:** Organic stream frames (full Zod union, FE + BE flipped).
- **Done:** Jaina stream-event type-level union (BE imports `JainaStreamEvent`).
- **Done:** Onboarding contracts (scrape, brand-voice, target-audience, brand-profile, business-summary, website-summary, readiness, first-impression, brand-report types, SSE events). FE imports schemas + types; BE imports types only (pending Zod 4 migration).
- **Next:** Migrate `Continuum-Frontend/src/lib/jaina/schemas.ts` (~3000 lines) into `src/streaming/jaina.ts` and `src/jaina/`, splitting the wire-format schemas from the FE-specific report-normalization helpers.
- **Next:** Migrate Backend's onboarding agent sub-package from `zod ^3.25` to `zod ^4` so it can consume schema values directly instead of via type-only imports.
- **Future:** HTTP request/response schemas under `src/<domain>/` (e.g. `src/organic/runs.ts`, `src/jaina/chat.ts`).
- **Future:** generated OpenAPI from the schemas (`zod-to-openapi`) once external API consumers exist.

## Versioning

`"private": true`, version pinned at `0.0.0`. Consumers use `"workspace:*"` — no semver, no publish, no version negotiation. Atomic deploys + same-commit-SHA on both sides keep FE/BE in lockstep.
