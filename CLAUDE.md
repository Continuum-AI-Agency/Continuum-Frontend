# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install              # Install dependencies (uses bun@1.3.5)
bun dev                  # Dev server with Turbopack
bun run build            # Production build with Turbopack
bun test                 # Run all tests (Bun test runner)
bun test path/to/file    # Run a single test file
bun run lint             # ESLint (flat config, Next.js rules)
bun run supabase:gen:types   # Generate Supabase types
bun run cache:clear      # Clear .next and node_modules cache
```

## Core Philosophy

Informed by *Clean Code* and *The Clean Coder* (Robert C. Martin):

- **Readability first.** Code is read far more than written. Write prose-clear code.
- **Boy Scout Rule.** Always leave code cleaner than you found it.
- **Single Responsibility.** Functions, components, and server actions do one thing. If the name contains "and/or/handle," it's doing too much.
- **TDD mindset.** Test fails → minimal code to pass → refactor. Never write production code without a test.
- **Wrap external dependencies.** Supabase SDK, third-party APIs — wrap them at the boundary so core logic stays clean and swappable.
- **No broken windows.** Fix messy code you encounter. Continuous minor refactoring is mandatory.

## Code Quality

### Naming
- Clarity over brevity: `calculateUserBmi`, `fetchUserDataFromServer`, `useAuthSession` — not `calc`, `getData`, `auth`
- Components: PascalCase + descriptive noun (`SettingsModal`, `UserProfileCard`)
- Server demarcation: `createPostAction`, `getServerPosts`

### Functions & Components
- ≤60 lines of executable code; components fit on one screen
- 0–1 args preferred; 3+ args → use an object param
- No hidden side effects

### Comments
- **No line-by-line comments.** Code must be self-documenting.
- Comments only for: legal notices, intent/why (not what), TODOs (removed promptly).
- **No commented-out code.** Delete it — git exists for a reason.
- **No emojis** in comments.
- File-level comments at the top only if necessary.

### TypeScript & Error Handling
- Strict typing everywhere. No `any`; use `unknown` or generics.
- Throw meaningful `Error` objects with context; don't return `null` or raw error codes.
- **Zod schemas** on all client/server boundaries.

## Architecture

**Stack:** Next.js 16 (App Router, RSC) + React 19 + TypeScript 5 + Tailwind CSS 4 + Supabase + Bun

**Path alias:** `@/*` → `./src/*`

### App Router Layout

```
src/app/
├── (auth)/          # Public auth routes
├── (post-auth)/     # Protected routes (dashboard, ai-studio, organic, paid-media, etc.)
├── _actions/        # Server actions (eventBridge pattern)
├── api/             # Route handlers
├── login/           # Login page
└── onboarding/      # Onboarding flow
```

Root (`/`) redirects to `/login`. Protected routes use `getActiveBrandContext()` for auth checks in server layouts.

### Major Modules

- **StudioCanvas** (`src/StudioCanvas/`) — AI Studio visual workflow editor built on `@xyflow/react`. Nodes for image/video generation, LLM prompting, media references. Has its own store, types, hooks, utils, and node components.
- **CampaignCanvas** (`src/CampaignCanvas/`) — Paid media campaign hierarchy builder (campaign → ad-set → ad/audience → creative). Graph validation with error states.
- **Organic** (`src/components/organic/`, `src/lib/organic/`) — Social media planner with calendar workspace, trend analysis, and draft generation.
- **Paid Media** (`src/components/paid-media/`) — Campaign observability, metrics, action logs, TradingView-style charting.

### Server-First Principle

- Default to RSC. `"use client"` only for interactivity, placed at the **highest possible tree level**.
- No direct DB access in client components. Data flows through RSCs, Server Actions, or Route Handlers.
- Use Next.js native `fetch` caching and revalidation for predictable data freshness.

### State Management

- **Zustand** for canvas stores (`useStudioStore`, `useCampaignStore`, `useCalendarStore`) — each with undo/redo history (50 snapshots)
- **Jotai** for lightweight atomic state
- **React Query** (TanStack) for server state caching
- **Component state first** (`useState`/`useReducer`); Context only for UI concerns (theme, modals)
- `localStorage` only for non-critical ephemeral UI state (layout prefs, panel state) — never for sensitive or critical data.

### API Layer (`src/lib/api/`)

- `http.ts` / `http.server.ts` — typed fetch wrappers with auth (Bearer token via `getBrowserAccessToken()`)
- Domain clients follow `*.client.ts` (browser) / `*.server.ts` (RSC/actions) naming
- Optional Zod schema validation on responses

### Auth

Supabase-based: `useAuth()` hook wraps server actions (`loginAction`, `signupAction`, `logoutAction`). OAuth (Google), magic link, and email/password flows. Middleware at `src/middleware.ts` protects routes.

## UI/UX

- **Tailwind CSS 4** utility-first; custom CSS only when utilities are insufficient.
- **Radix UI** (`@radix-ui/themes` + primitives) for all interactive primitives — ensures accessibility (ARIA, focus, keyboard).
- **shadcn/ui** (new-york style, zinc base) for component recipes.
- **Framer Motion** variants for animations (200–300ms); complex animations lazy-loaded.
- Brand primary: `#5A48F9`; 8-point grid spacing; Inter font.
- Full design system in `docs/styleguide.md`.
- All forms: **React Hook Form + Zod** with both client-side and server-side validation.

## Testing

- **Bun test runner** with happy-dom for DOM APIs.
- Tests co-located with source: `*.test.ts` / `*.test.tsx`.
- Setup in `bun-test-setup.ts` mocks `server-only`, `next/navigation`, and theme provider.
- **Write tests covering true functionality.** Never simulate pass conditions.
- Atomize tests — cover the smallest unit at a time; multiple args/calls are fine within one function under test.
- Run iteratively: `bun test path/to/file` to verify incrementally.

**TDD Codex audit (REQUIRED):** After writing tests and confirming they fail for the right reason, invoke the `codex:rescue` skill to audit test coverage and correctness before implementing. Codex should verify: assertions test real behavior (not implementation details), edge cases are covered, and test names clearly describe intent.

## Documentation

### In-repo docs files
Sub-folders can maintain their own `docs.md` (or `README.md`) for module-level context: data shapes, architecture decisions, gotchas, edge cases relevant to that module only. Place these alongside the code they describe.

Examples:
- `src/components/organic/docs.md` — planner architecture, DnD model, cell format
- `src/StudioCanvas/docs.md` — node types, store shape, execution model

### `docs/` folder
Reserved for **large cross-cutting documents**: plans, roadmaps, analyses, design specs, style guides that span many files or modules. Not for module-level context.

## Planning & Sub-Agent Execution

> **MANDATORY:** Multi-agent parallelization is the default execution model. Single-agent sequential work is the exception, not the rule. If you find yourself reading multiple files, writing multiple components, or exploring multiple directories sequentially — stop and spawn agents instead.

**Planning phase:** Non-trivial features trigger `EnterPlanMode` to explore the codebase, understand existing patterns, and design an implementation approach before touching code. Plans are written to `.planning/PLAN.md`, reviewed by the user, then executed. Keep plans concise; list unresolved questions at the end.

**Plan Codex review (REQUIRED):** After a plan is written to `.planning/PLAN.md` and before presenting it to the user, invoke `codex:rescue` to review the plan for: missing edge cases, architectural blind spots, incorrect assumptions about the codebase, and sequencing issues. Incorporate Codex's findings into the plan before user review.

### Agent Dispatch Rules (REQUIRED)

These are hard rules. Violating them degrades throughput and is not acceptable. Spawn subagents using the same model as the parent.

| Trigger | Required action |
|---|---|
| Exploring 2+ files or directories | Spawn an **Explore agent** |
| Writing a plan or design doc | Spawn a **Plan agent** |
| Implementing 2+ independent concerns | Spawn parallel **executor agents** |
| Any background work while you proceed | `run_in_background=true` |
| Research + implementation in same task | Spawn research agent first, implement on its result |
| Verifying/testing after implementation | Spawn a **verifier agent** concurrently |

### Agent Roster

- **Explore** (`subagent_type=Explore`) — codebase search, pattern discovery, file navigation. MUST use for any investigation touching 2+ files.
- **Plan** (`subagent_type=Plan`) — architecture and design. MUST use whenever you would otherwise write a plan inline.
- **General-purpose** — research, multi-step tasks, anything not covered by specialists.
- **Specialized** (`gsd-executor`, `gsd-verifier`, `gsd-debugger`, `oh-my-claudecode:code-reviewer`, etc.) — use the most specific agent available for the job.
- **Custom agents** — propose new `subagent_type` definitions to the user whenever a recurring work pattern emerges (e.g., Canvas node generation, migration validation). Don't repeat yourself across sessions when an agent could encode the pattern.

### Codex Agents (long-running & context-heavy tasks)

Use Codex agents when tasks require sustained context, large diffs, or deep code reasoning that exceeds a single agent turn.

| Skill | When to use |
|---|---|
| `codex:rescue` | Plan review, test audit, second-opinion diagnosis, stuck implementation |
| `codex:codex-cli-runtime` | Long-running shared runtime — start once, reuse across multiple tasks in a session |
| `codex:codex-result-handling` | Processing and integrating large Codex output back into the codebase |
| `codex:gpt-5-4-prompting` | Crafting high-quality prompts for complex Codex tasks |

**When to reach for Codex over a standard agent:**
- Diff spans 5+ files
- Task requires holding full module context (e.g., refactoring a store + all consumers)
- You need an adversarial review (plan, tests, security)
- A standard agent has already failed or looped on the same problem

### Parallelization Protocol

1. Decompose the task before starting any work.
2. Identify which sub-tasks are independent (no data dependency between them).
3. Launch all independent agents in a **single message** with multiple `Agent` tool calls.
4. Collect results, then launch the next wave of dependent agents.
5. Never duplicate work: if an agent is researching something, do NOT also search it yourself.

### Direct Implementation (narrow exception)

Only implement without agents when ALL of the following are true:
- Single file touched
- Change is obvious and contained (<2 min effort)
- No investigation needed

**Plan mode format:** Extremely concise — sacrifice grammar for brevity. List unresolved questions at the end.

**Use skills aggressively.**

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Development principles and project standards |
| `docs/styleguide.md` | Design system (colors, typography, spacing, motion) |
| `bun-test-setup.ts` | Test environment setup (happy-dom, mocks) |
| `src/middleware.ts` | Route protection and auth middleware |
| `src/app/_actions/eventBridge.ts` | Centralized server action event broadcasting |
| `src/StudioCanvas/stores/useStudioStore.ts` | AI Studio canvas state |
| `src/CampaignCanvas/stores/useCampaignStore.ts` | Campaign canvas state |
| `src/lib/organic/store.ts` | Organic planner state (persisted to localStorage) |
| `src/lib/api/http.ts` | Client-side HTTP wrapper with auth |

## Learned Notes

- If a rebase regresses the planner UI, restore `OrganicCalendarWorkspaceClient` + `TimeGridCanvas` to the `PlannerHeader/PlannerMatrix` path and keep DnD targets in `planner-cell::day::platform` format.
- Keep theming synchronized via both `data-theme` and `html.dark/html.light` so Tailwind `dark:` utilities, CSS variables, and chart/map theme detection stay consistent.
- `StringNode` enrichment payload sends uploads under `context.images`; the `/api/ai-studio/enrich` route parses `context.*` and streams SSE (`text` + `complete`) for `useWorkflowExecution`.
- Exclude `/socket.io` and `/.well-known/appspecific/*` probes from Next middleware matchers to avoid Supabase auth lookups on 404 noise.
