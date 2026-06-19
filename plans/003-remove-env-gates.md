# Plan 003: Prohibited `*_ENABLED` env gates removed; enabled path is unconditional

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `grep -rnE "CANVAS_AUTO_REGISTER_ENABLED|NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED" Continuum-Frontend/src`. Confirm the three sites below still exist as described before editing. Working tree was dirty at the planned commit.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

The root `CLAUDE.md` §6.7 and the team's standing policy explicitly ban long-lived `*_ENABLED` migration/cutover gates: "A migration's end state is a reviewed code change … not a runtime switch someone has to remember to flip." Three live, default-on FE gates violate this. They accrete dead "disabled" branches and bloat the config surface. The end state is the enabled path made unconditional.

## Current state

1. `src/app/api/library/register-canvas/route.ts:11-15` —
   ```ts
   // Kill switch (defaults ON). Set CANVAS_AUTO_REGISTER_ENABLED=false to stop ...
   function autoRegisterEnabled(): boolean {
     return process.env.CANVAS_AUTO_REGISTER_ENABLED !== "false";
   }
   ```
   and `:22-24` inside `POST`: `if (!autoRegisterEnabled()) { return NextResponse.json({ assetId: null }); }`.

2. `src/app/onboarding/actions.ts:170` —
   ```ts
   if (process.env.NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED !== "false") {
     after(async () => { /* ... warmOnboardingCompetitorsServer ... */ });
   }
   ```

3. `src/components/onboarding/v2/OnboardingExperience.tsx:53-54` —
   ```ts
   const INSPIRATIONS_ENABLED =
     process.env.NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED !== "false";
   ```
   consumed at `:396` (`inspirationsEnabled: INSPIRATIONS_ENABLED` in a props/hook object) and `:525` (`if (INSPIRATIONS_ENABLED) { /* persist brand kit + generate creatives */ }`).

4. Root `.env.example`: line 80 `ONBOARDING_INSPIRATIONS_ENABLED=true` (BE), line 81 `NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED=true` (FE mirror), line 206 `CANVAS_AUTO_REGISTER_ENABLED=true` (FE).

All three gates default ON (behavior is "enabled" unless the env var is literally `"false"`).

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Grep gates | `grep -rnE "CANVAS_AUTO_REGISTER_ENABLED\|NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED" Continuum-Frontend/src` | 0 after edits |
| Typecheck | `bunx tsc --noEmit` (from `Continuum-Frontend/`) | exit 0 |
| Tests | `bun test src/app/onboarding src/app/api/library` (adjust to existing test paths) | pass |

## Scope

**In scope**: the 3 source files above + root `.env.example` (lines 81 and 206 only).

**Out of scope** (do NOT touch):
- The **BE** `ONBOARDING_INSPIRATIONS_ENABLED` consumer (backend / edge function) and `.env.example` line 80 — that gate lives outside the frontend; leave line 80 and file a follow-up.
- Any behavior change other than making the enabled path unconditional.

## Git workflow

- Branch: `advisor/003-remove-env-gates`
- One commit: `refactor: remove *_ENABLED runtime gates, converge to enabled path`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: register-canvas route

In `register-canvas/route.ts`, delete the `autoRegisterEnabled()` function (and its `// Kill switch ...` comment) and the `if (!autoRegisterEnabled()) { return ... }` early-return in `POST`. The remaining body (parse + register) becomes unconditional.

**Verify**: `bunx tsc --noEmit` exit 0; no reference to `CANVAS_AUTO_REGISTER_ENABLED` remains in the file.

### Step 2: onboarding action

In `onboarding/actions.ts:170`, remove the `if (process.env.NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED !== "false") {` wrapper and its closing brace; keep the inner `after(async () => { ... })` block, now unconditional.

**Verify**: `bunx tsc --noEmit` exit 0.

### Step 3: OnboardingExperience component

Read the `:396` consumer to see how `inspirationsEnabled` is used (the hook/props object and any branch it feeds). Then:
- Remove the `INSPIRATIONS_ENABLED` const (`:53-54`).
- At `:396`, inline `true` (or drop the `inspirationsEnabled` param entirely if it only existed to gate this flow and the consumer can be simplified).
- At `:525`, remove the `if (INSPIRATIONS_ENABLED)` wrapper, keeping the body unconditional.

**STOP** if removing a branch reveals a meaningful "disabled" alternate path (an `else` with real behavior) — none is expected (both default on), but if found, report instead of guessing.

**Verify**: `bunx tsc --noEmit` exit 0; no `INSPIRATIONS_ENABLED` reference remains.

### Step 4: env templates

In root `.env.example`, delete line 81 (`NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED`) and line 206 (`CANVAS_AUTO_REGISTER_ENABLED`). Leave line 80 (`ONBOARDING_INSPIRATIONS_ENABLED`, BE) and append an inline comment: `# follow-up: converge BE gate in code (out of FE scope)`.

**Verify**: the two FE keys are gone from `.env.example`.

## Test plan

- Run the existing onboarding and register-canvas test suites; if any test asserts the **disabled** branch, update it to the new unconditional behavior (or STOP and report if the disabled behavior was load-bearing).
- `bunx tsc --noEmit` clean; full `bun test` green.

## Done criteria

- [ ] `grep -rnE "CANVAS_AUTO_REGISTER_ENABLED|NEXT_PUBLIC_ONBOARDING_INSPIRATIONS_ENABLED" Continuum-Frontend/src` → 0.
- [ ] `bunx tsc --noEmit` exits 0.
- [ ] The two FE keys removed from `.env.example`; BE line 80 retained with follow-up note.
- [ ] Affected tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- A removed gate exposes a real disabled-path behavior (meaningful `else`).
- A test asserts the disabled path and the intended behavior is ambiguous.

## Maintenance notes

- File a follow-up to converge the BE `ONBOARDING_INSPIRATIONS_ENABLED` gate in the backend/edge function (mount the path unconditionally, delete the env check) — same policy, BE-scoped.
- Reviewer should confirm no deployment currently sets either FE var to `"false"` (removing the gate makes that setting a no-op).
