# Plan 001: A CI pipeline runs typecheck, lint, and tests on every PR

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `find . -path ./node_modules -prune -o -type d -name workflows -print | grep github` from the monorepo root. If a `.github/workflows` already exists, compare it against this plan before proceeding (treat as a STOP — reconcile, don't clobber). Working tree was dirty when this plan was written; also run `git status` for the root `package.json`.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

No `.github/workflows` exists anywhere in the repo. Both `main` and `beta` auto-deploy to Vercel. The frontend is currently typecheck-clean with 208 test files, but nothing enforces that automatically — a type error, failing test, or lint regression only surfaces if a human remembers to run it locally, and can reach production. Adding CI converts the existing (but unenforced) quality scripts into a gate. This is the unblocker for every other plan: later changes should land against a green pipeline.

## Current state

- No `.github/` directory at the repo root (verified — only vendored copies inside `node_modules`).
- The monorepo **root** `package.json` already defines the scripts CI needs:
  - `typecheck:fe` → `cd Continuum-Frontend && bun run typecheck` (which runs `bunx tsc --noEmit`)
  - `lint:fe` → `cd Continuum-Frontend && bun run lint` (runs `eslint`)
  - `test:fe` → `cd Continuum-Frontend && bun run tests` (runs `bun test`)
- `packageManager`: `bun@1.3.5`. Lockfile of record: root `bun.lock` (Bun workspace, `linker = "hoisted"`). Per-project lockfiles are forbidden.

## Commands you will need

| Purpose | Command (from monorepo root) | Expected |
|---------|------------------------------|----------|
| Typecheck FE | `bun run typecheck:fe` | exit 0 |
| Lint FE | `bun run lint:fe` | exit 0 |
| Test FE | `bun run test:fe` | all pass |
| Frozen install | `bun install --frozen-lockfile` | exit 0 |

## Scope

**In scope** (only file to create):
- `.github/workflows/ci.yml` (at the **monorepo root**, not inside `Continuum-Frontend/`)

**Out of scope** (do NOT touch):
- Vercel project settings / deploy configuration.
- Backend (`Continuum-Backend`) typecheck/test steps — add later; FE-only this pass.
- Any source file. This plan adds CI only.

## Git workflow

- Branch: `advisor/001-ci-pipeline`
- One commit; message style matches repo (conventional commits, e.g. `ci: add frontend typecheck/lint/test workflow`).
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Pre-flight — confirm the scripts are green locally

Run from the monorepo root:
```
bun run typecheck:fe
bun run lint:fe
bun run test:fe
```
Record each exit code.

**STOP** if `bun run lint:fe` returns **errors** (warnings are fine) or `bun run test:fe` is red — report the failure; CI must reflect a green baseline, not encode a known-red state. Do not "fix" unrelated failures in this plan.

**Verify**: all three exit 0 (lint may print warnings).

### Step 2: Create the workflow

Create `.github/workflows/ci.yml` with: trigger on `pull_request` and `push` to `main` and `beta`; a single `ubuntu-latest` job with steps:
1. `actions/checkout@v4`
2. `oven-sh/setup-bun@v2` with `bun-version: 1.3.5`
3. `bun install --frozen-lockfile`
4. `bun run typecheck:fe`
5. `bun run lint:fe`
6. `bun run test:fe`

**Verify**: the YAML parses (open in editor / `cat`); every step references a script that exists in the root `package.json` (Step 1 confirmed they run).

## Test plan

- No new application tests. The deliverable is the workflow itself.
- Validation: the three scripts pass locally (Step 1); after merge, the operator pushes a branch and confirms the GitHub Action runs green.

## Done criteria

- [ ] `.github/workflows/ci.yml` exists with valid YAML.
- [ ] Steps reference only existing root scripts (`typecheck:fe`, `lint:fe`, `test:fe`) plus `bun install --frozen-lockfile`.
- [ ] Locally `bun run typecheck:fe` exits 0 and `bun run test:fe` is green.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- `bun run lint:fe` returns errors at baseline.
- `bun install --frozen-lockfile` fails (lockfile drift) — report; do not regenerate the lockfile here.
- `bun run test:fe` is red at baseline.
- A `.github/workflows` directory already exists — reconcile, don't overwrite.

## Maintenance notes

- Add Backend `typecheck:be`/`test:be` steps when the BE suite is ready.
- Once stable, gate Vercel deploys on this workflow.
- If `bun-version` is bumped in `package.json`, update the `setup-bun` step to match.
