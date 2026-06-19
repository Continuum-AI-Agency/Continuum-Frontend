# Plan 006: A single shared format module replaces duplicated currency/number/percent helpers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `grep -rn "new Intl.NumberFormat" Continuum-Frontend/src | grep -v ".test."` and confirm the consumer list below still matches. Working tree was dirty at the planned commit.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

Currency/number/percent formatting is re-implemented in 11+ files with real drift: USD is hardcoded everywhere, some use `minimumFractionDigits:2` and others `maximumFractionDigits:2` (different output for whole values), some emit signed `±X.X%` and others unsigned, and several use whole-dollar (`fractionDigits:0`). A canonical engine already exists (`src/lib/jaina/formatValue.ts`) and an organic helper (`src/components/organic/organic-format.ts`), but paid-media ignores both. Any format change today means editing 11 files in lockstep, and outputs drift between surfaces.

## Current state

- **Canonical engine**: `src/lib/jaina/formatValue.ts` — `formatValue(value, format, { currency='USD', locale })` supporting `currency` (max 2 frac), `percent` (max 1, `/100` when `|num|>=1`), `multiplier` (`Nx`), `number` (max 2), `integer` (max 0), `compact` (max 1), `text`.
- **Organic helper**: `src/components/organic/organic-format.ts` — `formatNumber`, `formatCompactNumber`, `formatRate`, `formatPercentChange`, `formatShortDate`, `formatDateTime`; returns `-` for absent/non-finite. Has tests: `src/components/organic/organic-format.test.ts` (one `describe` per function, exact-string assertions) — use it as the structural pattern.
- **Straightforward duplicate consumers** (USD-2dp / grouped-int / 2dp-%) to migrate:
  - `src/components/paid-media/dashboard/CampaignAdSetWorkspace.tsx:205` (currency max2; number default; percent `${toFixed(2)}%`)
  - `src/components/paid-media/dashboard/CampaignTimelineWorkspace.tsx:225` (currency max2)
  - `src/components/paid-media/dashboard/PerformanceDetails.tsx:42` (currency **min2**; signed percent)
  - `src/components/paid-media/dashboard/AdSetTable.tsx:82` (currency **min2**)
  - `src/components/paid-media/dashboard/CampaignAccordion.tsx:62` (currency **min2**)
  - `src/components/paid-media/timeline/TimelineContainer.tsx:57` (currency max2)
  - `src/components/paid-media/timeline/TimelineCampaignInsights.tsx:11` (currency **max0**, whole-dollar)
  - `src/components/paid-media/budget-pacing/BudgetPacingTable.tsx:23` (currency **max0**, whole-dollar)

## Behavioral divergences to PRESERVE (do not blindly replace)

The new API must support these; do NOT collapse them:
1. **Variable currency** — `src/CampaignCanvas/components/EditableAmount.tsx:70` uses a `currency` prop (default USD). New `formatCurrency` must accept a `currency` arg.
2. **Whole-dollar (`fractionDigits:0`)** — `TimelineCampaignInsights`, `BudgetPacingTable`, `budget-pacing/BudgetPacingSummaryStrip.tsx:15`, `lib/paid-media/heatmap.ts` (≥100), `components/approvals/formatters.ts` (`spend`).
3. **`minimumFractionDigits:2` vs `maximumFractionDigits:2`** — `PerformanceDetails`/`AdSetTable`/`CampaignAccordion` use `min` (`$5.00`), others use `max` (`$5`). Match per consumer via the `fractionDigits` option semantics you choose.
4. **Magnitude-threshold switching** — `lib/paid-media/heatmap.ts` (max0 ≥100 / max2 <100; compact ≥100k / plain <100k). Keep its logic.
5. **Signed `±X.X%` deltas** — `PerformanceDetails`, `components/paid-media/PaidMediaReportingWidget.tsx`, `components/dashboard/InstagramOrganicReportingWidget.tsx`, `CampaignAdSetWorkspace.formatDeltaPercent`.
6. **CTR `/100` rescale** — `components/approvals/formatters.ts:30`.
7. **Per-metric dispatch tables** — `approvals/formatters.ts` (`METRIC_FORMAT`), `heatmap.formatMetric`, `CampaignAdSetWorkspace.formatMetric`, `CampaignTimelineWorkspace.formatMetricValue`: keep the dispatch logic; they may call the new primitives, but do not replace their key→format maps.
8. **Hand-rolled `k`/`M` casing** — `components/competitors/CompetitorSearchPanel.tsx:42` (lowercase `k`). Out of scope (changing it changes output).
9. **Token/cost domain** — `src/components/ai-elements/context.tsx` (LLM tokens, sub-cent costs up to ~20 frac digits). **Out of scope.**

## Commands you will need

| Purpose | Command (from `Continuum-Frontend/`) | Expected |
|---------|--------------------------------------|----------|
| Test new module | `bun test src/lib/format` | pass |
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Touched-component tests | `bun test src/components/paid-media` | pass |
| Full suite | `bun test` | pass |

## Scope

**In scope**: new `src/lib/format/index.ts` + `src/lib/format/index.test.ts`; replace local defs in the ~8 straightforward consumers listed under "Current state".

**Out of scope** (do NOT touch this pass): `ai-elements/context.tsx`; the per-metric dispatch *logic* in `approvals/formatters.ts` and `heatmap.ts` (they may import the new primitives, but keep their maps); `CompetitorSearchPanel` casing; `EditableAmount` (only migrate if the new `currency` arg reproduces its output exactly); `organic-format.ts`'s public API.

## Git workflow

- Branch: `advisor/006-shared-format-module`
- Commits per logical unit: (1) add module + tests; (2) migrate consumers.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create the shared module

Create `src/lib/format/index.ts` exporting:
- `formatCurrency(value: number | undefined, opts?: { currency?: string; fractionDigits?: number })` — default `currency='USD'`; when `fractionDigits` given, use it for both min and max (so `0` → whole-dollar, `2` → cents); locale `"en-US"`.
- `formatNumber(value: number | undefined)` — grouped integer; `"en-US"`.
- `formatPercent(value: number | undefined, opts?: { signed?: boolean; fractionDigits?: number; scale?: number })` — default `fractionDigits=1`; `signed` prepends `+`/`-`; `scale` (e.g. `0.01`) applied before formatting for already-percent inputs.
- `formatCompact(value: number | undefined)` — `notation:"compact"`, max 1 frac.

All return `-` for absent/non-finite (match `organic-format.ts`). Reuse `formatValue` from `src/lib/jaina/formatValue.ts` internally where it fits.

### Step 2: Write tests

Create `src/lib/format/index.test.ts` modeled on `organic-format.test.ts`: one `describe` per function, exact-string assertions including absent input, currency override (e.g. `EUR`), whole-dollar (`fractionDigits:0`), `min`/`max`-equivalent fraction handling, and signed percent.

**Verify**: `bun test src/lib/format` → all pass.

### Step 3: Migrate the ~8 consumers

For each consumer, delete its local `formatCurrency`/`formatNumber`/`formatPercent` and import from `@/lib/format`, choosing options that reproduce the current output (per the divergence notes): e.g. `CampaignAccordion`/`AdSetTable`/`PerformanceDetails` → `formatCurrency(v, { fractionDigits: 2 })`; `BudgetPacingTable`/`TimelineCampaignInsights` → `formatCurrency(v, { fractionDigits: 0 })`; signed-% consumers → `formatPercent(v, { signed: true })`.

**Verify after each**: `bunx tsc --noEmit` exit 0; the component's existing tests (if any) still pass.

## Test plan

- New `src/lib/format/index.test.ts` covering each function + edge cases.
- Re-run `bun test src/components/paid-media` and full `bun test` to confirm no output regression in migrated components.

## Done criteria

- [ ] `src/lib/format/index.ts` + `index.test.ts` exist; `bun test src/lib/format` passes.
- [ ] The ~8 consumers import from `@/lib/format` and no longer define local formatters.
- [ ] `bunx tsc --noEmit` exits 0; full `bun test` green.
- [ ] No output change in migrated components (verified by their tests / spot-check).
- [ ] `plans/README.md` status row updated.

## STOP conditions

- A consumer's output would change (especially `min` vs `max` fraction digits) and can't be reproduced via the new options — leave that consumer untouched and report it.
- Reproducing a divergence would require expanding the API beyond the four functions — report before adding surface.

## Maintenance notes

- Follow-ups: fold `organic-format.ts` and the approvals/heatmap dispatchers onto the shared primitives; decide `CompetitorSearchPanel` casing; the `ai-elements` token/cost domain stays intentionally separate.
- Reviewer should diff a few rendered values (a whole-dollar budget cell, a 2dp CPC, a signed delta) before/after to confirm parity.
