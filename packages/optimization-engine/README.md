# @continuum/optimization-engine

Portfolio **budget reallocation engine** for Meta, at the **ad-set level**, assuming
**daily ABO budgets** (the budget brain, the alternative to CBO / Advantage+).
Pure TypeScript, no runtime dependencies (Zod only at the IO edge — `./schemas`).

```
Pacing → classify → triggers (recommendations + starve) → reallocate (solver) → mode
```

`runCycle(snapshots, { mode, total, maxBudget, pacing, config })` returns a
`CycleResult` = `{ mode, pacing, reallocation, recommendations }`. The solver
guarantees **conservation**: `Σ final budgets = total` exactly.

## Usage

```ts
import { runCycle } from "@continuum/optimization-engine";
import { AdSetSnapshotSchema } from "@continuum/optimization-engine/schemas";
```

## Provenance

Source mirrors the upstream `continuum-engine-handoff` package 1:1; only the
relative-import `.ts` extensions were stripped to match this repo's `bundler`
module resolution. **Do not rewrite the math** — port fixes from upstream and
keep its test suite green (`node --test --experimental-strip-types tests/*.test.ts`).
