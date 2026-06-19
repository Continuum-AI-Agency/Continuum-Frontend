# Plan 005: OrganicAgentPanel clears its debounce timer on unmount

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: open `Continuum-Frontend/src/components/organic/agent/OrganicAgentPanel.tsx` and confirm `refreshDebounceRef` and `debouncedRefreshSessions` still match the excerpts below. Working tree was dirty at the planned commit.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

`OrganicAgentPanel` schedules a debounced session refresh with `setTimeout` but never clears it on unmount. If the panel unmounts (tab switch, brand switch) within the 300ms debounce window after a stream finishes, `refreshSessions()` fires after unmount — a wasted fetch plus a state update on an unmounted component (React warning, possible store interplay).

## Current state

File: `src/components/organic/agent/OrganicAgentPanel.tsx`.
- `:185` — `const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
- `:312-315` —
  ```ts
  const debouncedRefreshSessions = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => { void refreshSessions(); }, 300);
  }, [refreshSessions]);
  ```
- The component already uses cleanup-returning effects elsewhere (e.g. around `:199`, `:211`, `:232`, `:249`, `:286`) — match that style.

There is no `useEffect(() => () => clearTimeout(refreshDebounceRef.current), [])` anywhere in the file (verified).

## Commands you will need

| Purpose | Command (from `Continuum-Frontend/`) | Expected |
|---------|--------------------------------------|----------|
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Targeted test | `bun test src/components/organic/agent` (run whatever OrganicAgentPanel suite exists) | pass |

## Scope

**In scope**: `src/components/organic/agent/OrganicAgentPanel.tsx` (+ a test only if a render harness for the panel already exists).

**Out of scope** (do NOT touch):
- `refreshSessions` logic.
- Other lifecycle bugs in adjacent hooks (BUG-03 session-load race, BUG-06 cancel→complete) — deferred; see Maintenance.

## Git workflow

- Branch: `advisor/005-organicagentpanel-timer-leak`
- One commit: `fix(organic): clear OrganicAgentPanel debounce timer on unmount`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an unmount cleanup effect

Add near the other effects in the component:
```ts
useEffect(() => () => {
  if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
}, []);
```
(`useEffect` is already imported — `:3`.)

**Verify**: `bunx tsc --noEmit` exit 0.

## Test plan

- If a render/mount harness for `OrganicAgentPanel` already exists in the repo, add a test that mounts the panel, triggers `debouncedRefreshSessions`, unmounts before 300ms (with a spy on `refreshSessions` and fake/advanced timers), and asserts `refreshSessions` is not called after unmount.
- If no such harness exists, do NOT build one for a one-line guard — document manual verification (switch tabs within 300ms of a stream finishing; confirm no post-unmount refresh / React warning) and rely on `tsc` + the existing suite.

**Verify**: `bunx tsc --noEmit` exit 0; existing organic-agent tests green.

## Done criteria

- [ ] The unmount cleanup effect exists and clears `refreshDebounceRef`.
- [ ] `bunx tsc --noEmit` exits 0.
- [ ] Existing OrganicAgentPanel/organic-agent tests still pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- None expected. If adding the effect surfaces a lint/exhaustive-deps complaint that forces a non-trivial change, report rather than expanding scope.

## Maintenance notes

- Good follow-ups in the same area: BUG-03 — the session-load effect (`:199-208`) has no cancellation guard, so a late `selectSession` resolution can overwrite the current session's messages; BUG-06 — `useOrganicAgentStream`'s `finally` dispatches `STREAM_COMPLETE` even when the user cancelled/aborted.
