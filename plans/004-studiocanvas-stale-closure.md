# Plan 004: StudioCanvas reports the real generation error instead of a stale/generic one

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report — do not improvise. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git -C . diff --stat c07c0c6..HEAD -- Continuum-Frontend/src/StudioCanvas/hooks/useWorkflowExecution.ts` and open the file. Confirm the line references below still match (the file is ~400 lines; the streaming logic and return block are the anchors). On mismatch, STOP. Working tree was dirty at the planned commit.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `c07c0c6`, 2026-06-17

## Why this matters

When an AI Studio canvas node streams a generation, errors are surfaced incorrectly. After the stream pump finishes with no `finalOutput`, the code decides the return value by reading `streamState.status` (a closure variable). But during the run, errors are written via `setStreamState((prev) => ...)`, and React never reflects an intra-call `setState` in the same closure. So:
- a stream that emitted an `error` event returns the generic `"No output received from generation"` instead of the backend's real message, and
- a stale error from a *previous* run can leak into a later empty-but-successful run.

Users see wrong/misleading canvas error states.

## Current state

File: `src/StudioCanvas/hooks/useWorkflowExecution.ts`.
- `:22` — `const [streamState, setStreamState] = useState<ExecutionStreamState>({ status: "idle" });`
- `:292-303` — error branch updates state only via setter:
  ```ts
  if (eventName === "error") {
    setStreamState((prev) => ({ ...prev, status: "error", error: parsed.message }));
    show({ title: "Generation failed", description: parsed.message ?? "Stream error", variant: "error" });
  }
  ```
- `:318-330` — recursive `pump()` reads the stream.
- `:340-352` — return logic:
  ```ts
  if (finalOutput) { /* ...return success... */ }
  if (streamState.status === "error") {        // <-- stale closure read
     return { success: false, error: streamState.error || "Unknown stream error" };
  }
  return { success: false, error: "No output received from generation" };
  ```
- `:373` — the enclosing `useCallback` deps: `[streamState.status, streamState.error, show]` (confirms `streamState` is captured, not live).

## Commands you will need

| Purpose | Command (from `Continuum-Frontend/`) | Expected |
|---------|--------------------------------------|----------|
| Typecheck | `bunx tsc --noEmit` | exit 0 |
| Targeted test | `bun test src/StudioCanvas/hooks/useWorkflowExecution.test.ts` | pass |

## Scope

**In scope**: `src/StudioCanvas/hooks/useWorkflowExecution.ts` and a co-located `useWorkflowExecution.test.ts` (create or extend).

**Out of scope** (do NOT touch):
- The SSE protocol / backend.
- Other StudioCanvas hooks.
- The recursive-`pump` refactor (BUG-09) — deferred; see Maintenance.

## Git workflow

- Branch: `advisor/004-studiocanvas-stale-closure`
- One commit: `fix(studio-canvas): report real stream error via local accumulator`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Accumulate the error in a local variable

In the stream-running function (the one containing `processChunk` and `pump`, roughly `:130-352`), declare locals before the pump runs:
```ts
let streamErrored = false;
let streamErrorMessage: string | undefined;
```

### Step 2: Set the locals in the error branch

In the `eventName === "error"` branch (`:292-303`), in addition to the existing `setStreamState(...)`, add:
```ts
streamErrored = true;
streamErrorMessage = parsed.message;
```

### Step 3: Read the local at the return site

Replace the stale read at `:348-350` with:
```ts
if (streamErrored) {
  return { success: false, error: streamErrorMessage || "Unknown stream error" };
}
```
Leave the `if (finalOutput)` branch and the final `"No output received from generation"` fallback unchanged.

**Verify**: `bunx tsc --noEmit` exit 0; `grep -n 'streamState.status === "error"' src/StudioCanvas/hooks/useWorkflowExecution.ts` → no match.

## Test plan

Create/extend `src/StudioCanvas/hooks/useWorkflowExecution.test.ts` (bun:test; happy-dom preload is global via `bun-test-setup.ts`). Use `@testing-library/react`'s `renderHook` or the pattern used by any existing StudioCanvas hook test. Cases:
1. **Error surfaced**: mock a stream that emits an `error` event (with a message) then `done`, no `finalOutput` → the hook's execution result is `{ success: false, error: <that message> }`, NOT the generic string.
2. **No stale leak**: run once to an error, then run again on a stream that ends with no error and no output → the second result's error is the generic `"No output received from generation"`, not the first run's message.

**Verify**: `bun test src/StudioCanvas/hooks/useWorkflowExecution.test.ts` → both pass.

## Done criteria

- [ ] `bunx tsc --noEmit` exits 0.
- [ ] New tests for cases 1 and 2 exist and pass.
- [ ] `grep` confirms the return site no longer reads `streamState.status === "error"`.
- [ ] `plans/README.md` status row updated.

## STOP conditions

- The enclosing function relies on `streamState` for return semantics that the local variables can't capture (e.g. it reads `streamState` after an `await` in a way the locals don't mirror).
- Mocking the stream is infeasible with the available test utilities — report the blocker rather than shipping the fix untested.

## Maintenance notes

- **Deferred (BUG-09)**: the recursive `pump()` (`:318-330`) grows the async call chain per chunk on long streams, and a `return` around `:262` (non-video event when `expectedMedium !== "video"`) bails out of `processChunk`, skipping sibling events in the same chunk. A follow-up should convert `pump` to a `while (true)` loop and change that `return` to `continue`.
- Reviewer should confirm the error message now matches the backend's `parsed.message` in a real failed generation.
