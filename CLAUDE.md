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

### State Management

- **Zustand** for canvas stores (`useStudioStore`, `useCampaignStore`, `useCalendarStore`) — each with undo/redo history (50 snapshots)
- **Jotai** for lightweight atomic state
- **React Query** (TanStack) for server state caching
- **Component state first** (`useState`/`useReducer`); Context only for UI concerns (theme, modals)

### API Layer (`src/lib/api/`)

- `http.ts` / `http.server.ts` — typed fetch wrappers with auth (Bearer token via `getBrowserAccessToken()`)
- Domain clients follow `*.client.ts` (browser) / `*.server.ts` (RSC/actions) naming
- Optional Zod schema validation on responses

### Auth

Supabase-based: `useAuth()` hook wraps server actions (`loginAction`, `signupAction`, `logoutAction`). OAuth (Google), magic link, and email/password flows. Middleware at `src/middleware.ts` protects routes.

### Testing

- **Bun test runner** with happy-dom for DOM APIs
- Tests co-located with source: `*.test.ts` / `*.test.tsx`
- Setup in `bun-test-setup.ts` mocks `server-only`, `next/navigation`, and theme provider
- Write tests covering true functionality — never simulate pass conditions

### Styling

- **Tailwind CSS 4** utility-first; custom CSS only when utilities are insufficient
- **Radix UI** (`@radix-ui/themes` + primitives) for accessible interactive components
- **shadcn/ui** (new-york style, zinc base) for component recipes
- **Framer Motion** for animations (variants-based, 200-300ms transitions)
- Brand primary: `#5A48F9`; 8-point grid spacing; Inter font
- Full design system in `docs/styleguide.md`

## Conventions from AGENTS.md

- **Server-first:** Default to RSC. Use `"use client"` only for interactivity, at the highest possible tree level.
- **No direct DB access in client components.** Data flows through RSCs, Server Actions, or Route Handlers.
- **Functions ≤60 lines.** Single responsibility. 0-1 args preferred; 3+ use object param.
- **Naming:** PascalCase components, descriptive names (`calculateUserBmi` not `calc`). Server functions suffixed with `Action` or prefixed with `Server`.
- **Zod validation** on all client/server boundaries. React Hook Form + Zod for all forms.
- **No commented-out code.** Self-documenting code; comments only for intent/why.
- **Strict TypeScript.** No `any`; use `unknown` if needed.
- **Plan mode:** Keep plans extremely concise. List unresolved questions at the end.
- **No emojis** in code comments.
- **Use skills aggressively.**

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
