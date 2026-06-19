# Plan 008: Jaina stream schemas live in @continuum/contracts and are imported by the frontend

> **Executor instructions**: Follow this plan stage by stage. Each stage ends with a green test run before the next begins. If a STOP condition occurs, stop and report — do not improvise. This is a pure relocation: no runtime behavior changes. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: open `Continuum-Frontend/src/lib/jaina/schemas.ts`, `src/lib/jaina/stream.ts`, `packages/contracts/src/streaming/jaina.ts`, and `packages/contracts/src/streaming/organic.ts`; confirm the anchors below still match. These are large files (3,200+ lines) — anchor on the named symbols, not line numbers alone. On mismatch, STOP. Working tree was dirty at the planned commit.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: 001 (run on a green CI gate)
- **Category**: tech-debt
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

`src/lib/jaina/schemas.ts` (3,216 lines) hand-rolls the Jaina stream contract on the frontend — exactly the anti-pattern root `AGENTS.md` §4 forbids ("hand-rolling a TS stream-event union … when the Backend has its own parallel hand-rolled union"). The FE `CLAUDE.md` explicitly names this a deferred migration. Because the canonical union lives only in the FE, the FE↔BE Jaina stream contract can drift silently. The organic stream already does this correctly (schema in contracts, imported both sides), and the report-block half of Jaina is already migrated — this plan finishes the job for the stream-event schemas.

## Current state

- **Foothold (already migrated)**: `schemas.ts:2-18` imports report-block schemas from `@continuum/contracts` and `.extend()`s them at `:452-514` (narrative/metric/chart/table/insight/comparison V2). Those `.extend()` wrappers are **FE-presentation-only — keep them local**. The blocks they extend live in `packages/contracts/src/streaming/jaina-report.ts`.
- **The payload to move**: root union `jainaStreamEventSchema` (`schemas.ts:1106`, a `z.union` of ~30 members) and the inferred `JainaStreamEvent` type (`schemas.ts:1073`). Members are built with the `streamEventSchema(type, dataSchema)` factory (`schemas.ts:116`).
- **The single FE boundary**: `parseJainaStreamEvent(line)` (`stream.ts:1098`) → `jainaStreamEventSchema.safeParse(json)` (`:1101`) → `compatibilityStreamEventSchema.safeParse` fallback (`:1105`). `compatibilityStreamEventSchema` is file-local at `stream.ts:91`; `ParsedJainaStreamEvent = JainaStreamEvent | CompatibilityStreamEvent` at `stream.ts:106`. `stream.ts:1-62` imports ~50 schemas/types from `./schemas`.
- **Contracts placeholder**: `packages/contracts/src/streaming/jaina.ts` exists but is **type-only / dormant** — it defines a *generic* `JainaStreamEvent<TType, TData>` (jaina.ts:16) plus literal-union types, and **nothing imports it** (name collides with the FE's concrete `JainaStreamEvent`). The re-export chain is already wired: `packages/contracts/src/index.ts` → `streaming/index.ts:9` (`export * from "./jaina"`).
- **Organic exemplar (the pattern)**: `packages/contracts/src/streaming/organic.ts:416` (`export const organicStreamFrameSchema = z.discriminatedUnion("type", [...])`, inferred type at `:451`); FE consumer `src/components/organic/agent/streamEventParser.ts:2-12` imports it and runs `organicStreamFrameSchema.safeParse(raw)` at `:732`.
- **Safety net (must stay green)**: `src/lib/jaina/stream.test.ts` (2,689 lines), `src/lib/jaina/schemas.test.ts` (564), `src/lib/jaina/report_parsing.test.ts` (463), `src/lib/jaina/integration.test.ts` (114); contracts `packages/contracts/src/streaming/jaina-report.test.ts`.

> **Cross-boundary note**: this FE-focused work requires editing `packages/contracts/`. That is intended and necessary to close the drift. Do not touch the Backend emit side here — a separate BE PR completes the loop (Maintenance).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| FE jaina tests | `cd Continuum-Frontend && bun test src/lib/jaina/` | pass |
| Contracts tests | `bun test packages/contracts` (from monorepo root) | pass |
| FE typecheck | `cd Continuum-Frontend && bunx tsc --noEmit` | exit 0 |
| Contracts typecheck | per the contracts package's typecheck script | exit 0 |

## Scope

**In scope**: `packages/contracts/src/streaming/jaina.ts` (populate with the Zod schemas lifted from FE), new `packages/contracts/src/streaming/jaina.test.ts`, FE `src/lib/jaina/schemas.ts` + `src/lib/jaina/stream.ts` (re-point imports).

**Out of scope** (do NOT touch): the `.extend()` presentation wrappers (`schemas.ts:452-514`) and the `reduceJainaStreamEvent` reducer in `stream.ts` (FE render layer — stay local); the Backend emit side; the compatibility tier and chat-request/response DTOs (`jainaChatRequestSchema` et al.) — keep FE-local this pass, migrate in a follow-up.

## Git workflow

- Branch: `advisor/008-jaina-schemas-to-contracts`
- One commit per stage below.
- Do NOT push or open a PR unless instructed.

## Stages

### Stage 0: Lock the baseline

Run `cd Continuum-Frontend && bun test src/lib/jaina/` and `bun test packages/contracts` (root). Record results — these are the characterization tests; they must stay green throughout. Do not modify them.

### Stage 1: Move the Zod schemas into contracts

Lift the per-event member schemas, the `streamEventSchema(type, data)` factory (`schemas.ts:116`), the root `jainaStreamEventSchema` union (`:1106`), and the inferred `JainaStreamEvent` type (`:1073`) into `packages/contracts/src/streaming/jaina.ts`. Reuse the already-migrated `jaina-report.ts` blocks as the report-block dependency. **Resolve the name collision**: rename the dormant generic `JainaStreamEvent<T,D>` (e.g. to `JainaStreamEnvelope`) so the concrete Zod-inferred `JainaStreamEvent` can take its place. Add `packages/contracts/src/streaming/jaina.test.ts` mirroring `jaina-report.test.ts` (parse representative frames; assert the union accepts/rejects correctly).

**Verify**: `bun test packages/contracts` green; contracts typecheck clean.

### Stage 2: Confirm the re-export resolves

From the FE, confirm `import { jainaStreamEventSchema } from "@continuum/contracts"` resolves (the `index.ts` → `streaming/index.ts:9` chain already re-exports `./jaina`). No new wiring expected.

### Stage 3: Re-point FE imports

Update `src/lib/jaina/schemas.ts` and `src/lib/jaina/stream.ts:1-62` to import the moved schemas/types from `@continuum/contracts` (**root entry only** — the Backend uses `moduleResolution: node` and can't use subpaths). Keep `parseJainaStreamEvent` (`stream.ts:1098`) as the single boundary, now calling the contracts `jainaStreamEventSchema.safeParse`. Keep `compatibilityStreamEventSchema` (`stream.ts:91`) and the chat DTOs FE-local for now.

**Verify**: `cd Continuum-Frontend && bunx tsc --noEmit` exit 0.

### Stage 4: Keep presentation extensions local

Confirm the `.extend()` V2 wrappers (`schemas.ts:452-514`) and the `reduceJainaStreamEvent` switch still compile against the contracts base schemas (they should — they extend the same blocks).

**Verify**: `cd Continuum-Frontend && bunx tsc --noEmit` exit 0.

### Stage 5: Re-run the safety net + confirm shrinkage

Re-run all Stage-0 suites + contracts. Confirm `schemas.ts` is materially smaller (now mostly the `.extend()` wrappers + DTOs) and that `jainaStreamEventSchema` is sourced from contracts.

**Verify**: `bun test src/lib/jaina/` + `bun test packages/contracts` all green; no runtime diff.

## Done criteria

- [ ] `jainaStreamEventSchema` (+ inferred `JainaStreamEvent`) live in `packages/contracts/src/streaming/jaina.ts`.
- [ ] `packages/contracts/src/streaming/jaina.test.ts` exists and passes.
- [ ] FE `schemas.ts`/`stream.ts` import the schema from `@continuum/contracts` (root entry); `parseJainaStreamEvent` unchanged in behavior.
- [ ] All FE jaina tests + contracts tests green; FE + contracts typecheck clean.
- [ ] `schemas.ts` materially smaller (extensions + DTOs only).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- Converting to `z.discriminatedUnion` breaks the three inline literal members (`agent.spawn`, `agent.complete`, `canvas.context.loaded`) — keep the existing `z.union`; do not force discrimination.
- A moved schema can't resolve an FE-only dependency in contracts — keep that schema FE-local and report.
- The Backend already has its own copy of these schemas that would now diverge — STOP and coordinate a BE PR before finishing.
- Any Stage-0 test goes red and can't be made green by re-pointing imports alone (indicates a behavior change, not a relocation).

## Maintenance notes

- The Backend emit side must import the same root union (separate BE PR) to fully close the drift loop the monorepo policy mandates.
- Follow-ups: migrate the compatibility tier (`compatibilityStreamEventSchema`) and chat DTOs (`jainaChatRequestSchema`, `jainaChatStopRequestSchema`, etc.) into contracts; retire the renamed dormant generic placeholder once nothing depends on it.
- Reviewer should scrutinize the name-collision resolution and confirm no behavioral parse change (diff a few real frames through `parseJainaStreamEvent`).
