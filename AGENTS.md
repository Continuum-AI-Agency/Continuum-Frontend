# AGENTS.md — Continuum Frontend

> **Monorepo conventions live at [`../AGENTS.md`](../AGENTS.md).** Read that first for layout, shared infrastructure, cross-project communication, env handling, and engineering principles. This file covers **Frontend-specific** practices only (Next.js patterns, Server Components, canvas modules, planner gotchas).

---

This document outlines the architectural and code quality rules specific to the **Continuum Frontend** (Next.js 16 + Bun + Vercel). Universal craftsmanship principles (Clean Code / TDD / boundary defense) are in the root `AGENTS.md` — they apply here too.

---

## 1. Core Philosophy & Professionalism

Our approach is governed by the principles of software craftsmanship:

* **Readability is Priority #1:** Code is read far more often than it is written. We strive to make our code as clear, expressive, and direct as good prose. If it's hard to read, it's hard to maintain.
* **Commitment to Quality:** We are professionals. Code is only "done" when it is clean, fully tested, and passing all checks. We never check in code that we are not proud of.
* **The Boy Scout Rule (No Broken Windows):** If you find messy code, fix it. Continuous, minor refactoring is mandatory. **Always leave the code cleaner than you found it.**
* **Testing Mindset:** We follow a **Test-Driven Development (TDD) mindset**: a test fails, we write the minimal code to make it pass, and then we refactor. **Never write production code without an automated test.**
* **Defend Boundaries:** We treat external code (libraries, APIs) as boundaries. We must **wrap these external dependencies** (e.g., Supabase SDK) to limit their impact on our core domain logic. The wrapping layer must be clean and easily swapped.
* **Honest Estimates:** When asked for an estimate, it must be a **commitment** based on analysis and preparation, not a guess. We are responsible for communicating potential risks and honoring our commitments.

---

## 2. Code Quality (Clean Code)

These rules apply universally to all TypeScript, React, and Next.js code.

### Naming

* **Clarity over Brevity:** Use names that clearly articulate their purpose, location (Client/Server), and type. Avoid single-letter variables unless they are loop counters in trivial scopes.
    * **Good:** `calculateUserBmi`, `fetchUserDataFromServer`, `useAuthSession`
    * **Bad:** `calc`, `getData`, `auth`
* **Component Naming:** Components must be **PascalCase** and include a clear, descriptive noun (e.g., `SettingsModal`, `UserProfileCard`).
* **Server vs. Client Demarcation:** Functions responsible for Server Actions or Server-Side logic must be clearly named (e.g., `createPostAction`, `getServerPosts`).

### Functions & Components

* **Single Responsibility Principle (SRP):** Functions, components, and server actions must **do one thing, and one thing only**, and do it well. If a function's name contains "and," "or," or "handle," it's likely doing too much.
* **Smallness:** Functions should be small—ideally no more than **60 lines** of executable code. Components should aim to fit on a single screen.
* **Argument Count:** Functions should have the fewest arguments possible, ideally **zero or one**. Avoid three or more arguments unless a strong, specific case can be made (**prefer passing an object**).
* **Side Effects:** Functions must not contain hidden side effects.

### Comments

* **Code Should Be Self-Documenting:** Comments are a sign of failure to express intent in code. We only use comments for:
    * **Legal/License Notices.**
    * **Explanation of Intent/Why:** Explaining the reason for a non-obvious decision, **not what the code does.**
    * **TODOs/FIXMEs:** Used sparingly and removed as soon as the task is addressed.
* **Avoid Commenting Out Code:** **Delete old code.** Version control exists for a reason.

### Error Handling & TypeScript

* **Graceful Errors:** Do not return `null` or raw error codes from functions. Use `try/catch` blocks for expected failures and **throw custom, meaningful `Error` objects** that provide context.
* **Strict Typing:** All code must be strongly typed. Avoid `any`; use `unknown` or specific generics when type uncertainty is unavoidable. Enforce **Zod schemas strictly** on both client and server boundaries.

---

## 3. Architecture (Next.js / App Router)

### Server-First Principle & Rendering

* **Default to RSC/SSR:** All new components must default to being a **React Server Component (RSC)**. We must utilize Server-Side Rendering (SSR) via RSCs and Next.js caching to achieve optimal performance, faster initial load, and minimized client-side JavaScript bundle size. **Use Client Components only for interactivity.**
* **The "use client" Boundary:** The `"use client"` directive must be placed at the **highest possible level of the component tree**. Client Components should be small leaves that handle UI interaction, wrapping RSC-rendered content when possible (e.g., a Client button wraps Server-rendered content).

### Data Access & Supabase

* **Server-Side Data Only:** Direct database access (via Supabase SDK, PostgREST queries, or Server Actions) is **strictly forbidden in Client Components**. All data fetching must be proxied through:
    * **RSCs:** Direct `fetch()` calls or Server Actions.
    * **Route Handlers (`route.ts`):** For public/unauthenticated API endpoints.
* **Next.js Caching:** Utilize Next.js native `fetch` caching and revalidation (`next: { revalidate }`) to ensure predictable data freshness and optimal performance (SSR, SSG, ISR).

### API Layer (`src/lib/api/`)

* **Browser → agents-ts:** Client components call the agents-ts backend directly using `http.request()` from `src/lib/api/http.ts`. This client resolves `getApiBaseUrl()` and attaches `Authorization: Bearer ${token}` automatically via `getBrowserAccessToken()`. **Do NOT add Next.js route handlers as thin auth-forwarding proxies** — they add indirection with no benefit. Only add a route handler when genuinely needed server-side (e.g., streaming responses, server secrets, PostHog analytics).

### Shared Contracts (`@continuum/contracts`) — MANDATORY for response interpreters

Frontend response interpreters that parse Backend agent outputs (NDJSON stream frames, agent output objects, HTTP envelopes) must import their types and Zod schemas from `@continuum/contracts`. The Backend emits frames defined in the same package, so a `safeParse` against the imported schema is the boundary check.

* **Where it lives:** `packages/contracts/src/streaming/<domain>.ts` for stream frames; `packages/contracts/src/<domain>/` for HTTP request/response.
* **How to import:** `import { organicStreamFrameSchema, type OrganicStreamFrame } from '@continuum/contracts'` — root entry only (kept consistent with Backend, which can't use subpath imports under `moduleResolution: "node"`).
* **Pattern:** see `src/components/organic/agent/streamEventParser.ts` — it imports `organicStreamFrameSchema`, runs `safeParse` against incoming frames, and uses the inferred type for compile-time linkage with the Backend emit side.
* **Forbidden:** hand-rolling a TypeScript stream-event union in `src/lib/<domain>/stream.ts` or `src/components/<domain>/streamEventParser.ts` when the Backend has its own parallel hand-rolled union. New event types are added in `packages/contracts/` first, then the interpreter switch-case imports the literal type.
* **Jaina note:** the heavy Zod schemas in `src/lib/jaina/schemas.ts` (3000+ lines) are scheduled for migration into `packages/contracts/src/streaming/jaina.ts` in a follow-up PR; for now, the cross-side type linkage is via the `JainaStreamEvent` type alias in contracts.
* **Refer to:** root `AGENTS.md` §4 *Shared contracts* for the cross-project policy.

### State Management

* **Component State First:** Prefer `useState` or `useReducer` for local, component-specific state.
* **Context for UI/Cross-Cutting:** React Context is reserved only for low-frequency UI concerns like theme settings or global modal state. **No application-specific data** (e.g., lists of users, posts) should live in Context. External state libraries are prohibited unless cleared by the architectural lead.
* **Local Storage Use:** `localStorage` is permitted only for non-critical, ephemeral UI state that needs to persist across sessions (e.g., remembering a user's chosen theme, the last-used layout for a dashboard, or the open/closed status of a panel). **It must never be used for synchronization, storing sensitive data, or critical application data.**

---

## 4. UI/UX and Dependencies

### Styling & Accessibility

* **Style Guide Adherence:** All design decisions, spacing, color palettes, and typographic rules must **strictly adhere** to the guidelines set in the `styleguide.md` document.
* **Tailwind Preference:** We prioritize **Tailwind CSS 4 utility classes**. Custom CSS must be minimal and only used when utilities are insufficient.
* **Radix UI for Foundation:** All interactive primitives (buttons, menus, dialogs) must be built using **Radix UI components** (`@radix-ui/themes`, `@radix-ui/react-icons`) to ensure default, high-quality accessibility (ARIA, focus management, keyboard support).
* **Framer Motion:** Use **Framer Motion variants** for defined animation states. Complex animations must be lazy-loaded.

### Forms

* **Stack:** All forms must use the **React Hook Form + Zod stack** for controlled, performant, and type-safe validation.
* **Dual Validation:** Client-side Zod validation provides fast user feedback. **Server-side validation** (in Server Actions or Route Handlers) is mandatory to enforce invariants and security rules.

---

## 5. Linear Workflow & Project Operations

Our Linear workspace is the source of truth for delivery planning. Treat every interaction as a professional contract with the team.

### Estimation Discipline

* **Always estimate:** Every issue and sub-issue must carry an estimate from the team scale (`1, 2, 4, 8, 16`). Add or adjust the estimate before work begins.
* **Anchor on scope, not hope:** Estimate only after clarifying acceptance criteria, risks, and dependencies. Escalate unknowns instead of guessing.
* **Refine continuously:** Update estimates when scope changes. Communicate deltas in the issue comments and relevant standups.

### Issue Shape & Chunking

* **Right-size work:** Break initiatives into issues that fit within a single sprint window (≤16 points). Split anything larger into sequenced sub-issues.
* **Single outcome per issue:** Each issue should deliver one testable outcome. Use clear titles (`Verb + Object`) and maintain crisp acceptance criteria.
* **Connect the tree:** Use parent issues or projects to show hierarchy. Ensure sub-issues reference their parent so burndown and rollups stay accurate.

### Projects, Status, and Flow

* **Projects as umbrellas:** Every major initiative belongs to a Linear project. Keep project documents, milestones, and health updated weekly.
* **Status is signal:** Move issues through the workflow promptly (`Backlog → In Progress → Review → Done`). Leave a comment when blocking or handing off.
* **Link the work:** Attach related PRs, docs, analytics dashboards, or Looms directly to the issue. Cross-link dependent issues so risk can be tracked.
* **Close the loop:** Before marking an issue Done, confirm acceptance criteria, tests, and documentation updates are complete. Summarize outcomes in the final comment.

## 6. MCP Usage

* **Purpose:** MCP tools are for reference and guidance only; they must not mutate production data or state.
* **Supabase MCP (Read-Only):** Use it for looking up schemas, tables, migrations, and query behavior to inform frontend work. Do not run write operations or migrations unless explicitly requested and approved.
* **Radix MCP (Design System):** Use it to retrieve official Radix primitives documentation/source for building our UI foundations. Prefer Radix primitives over custom equivalents unless a clear gap exists.
* **shadcn MCP (Component Recipes):** Use it for vetted component patterns and composition guidance; adapt to our styleguide and Radix-first foundations.
* **Document Gaps:** If MCP data is missing or unclear, state assumptions and ask for clarification rather than guessing.

## 7. Tests

* **Don't cheat, don't be lazy, just be Honest.** Write tests that cover TRUE functionality. NEVER simulate a pass condition, and it should always attempt the function's intended behavior.
* **Tests are Atomized** Tests should cover the smallest amount of functions at a time, to give clarity on what is breaking. A test can have multiple calls/arguments at a time, but it should be for the function they are covering.
* **Tests are Critical** Tests are critical to effective codebases, functions, and behavior. Always write the full test, covering 100% of functionality.
* **You can Iterate on them yourself** Running `bun test path/to/function` runs that singular test. `bun tests` runs all tests in the codebase. You may run them iteratively within your context in order to confirm your work.
* **Logging in Edge Functions** Putting logs into Edge Functions is critical for tracing and debugging.

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.

Do NOT write comments every line. Write comments at the top of the file if necessary. Do NOT use emojis to write comments.

Use skills aggressively.

When you learn something, place a note of it here:
- If a rebase regresses the planner UI, restore `OrganicCalendarWorkspaceClient` + `TimeGridCanvas` to the `PlannerHeader/PlannerMatrix` path and keep DnD targets in the `planner-cell::day::platform` format.
- Keep trends UI minimal: use `TrendWorkbench` (no momentum chart/filter chips) and keep seeded/quick drafts tag-free (`tags: []`) while relying on `seedTrendId`.
- Coming-soon platform rows in the planner should render in compact/collapsed density so they consume minimal vertical space versus active scheduling rows.
- Planner cells should display all same-day posts (scrollable stack) and support posting-time edits via card quick actions (`Time: ...` presets + `Time: Custom...`).
- Keep theming synchronized via both `data-theme` and `html.dark/html.light` so Tailwind `dark:` utilities, CSS variables, and chart/map theme detection stay consistent.
- Keep skeleton loaders neutral (`bg-muted/70`), and shape each skeleton to match real page structure (headers, controls, cards, tables) instead of generic full-bleed blocks.
- `StringNode` enrichment payload sends uploads under `context.images`; the `/api/ai-studio/enrich` route should parse `context.*` and stream SSE (`text` + `complete`) for `useWorkflowExecution`.
- Avoid self-referential RLS policies on `brand_profiles.permissions`; they can trigger PostgreSQL `54001` (`statement_too_complex`). Use `brand_profiles.has_brand_access(...)` as a `SECURITY DEFINER` helper for cross-row visibility checks.
- Paid media observability should use a two-step exploration model: `Campaigns` snapshot first (including index-level averaged cards), then `Ad Sets` drill-in with a single selected ad set timeline and one metric visualized at a time.
- Campaign compare should support TradingView-style multi-entity plotting: add/remove multiple campaigns/indexes to one metric chart, and keep indexes grouped by default with an optional `Decompose` toggle to expose member campaigns.
- Minimize dropdown-driven selection for paid media exploration: prefer left-rail ticker-style list menus for campaign/index/ad set selection with quick row actions and lightweight chart focus.
- Replace full-page paid media action logs with a compact, context-aware alert feed (search + status filter + sort + pagination) so the primary chart/explorer keeps most visual real estate.
- In brand integration assignment UIs, always merge brand-assigned integration accounts into selectable assets so invited members can view and keep existing brand-linked accounts even without personal OAuth ownership.
- Brand integration assignment UIs must render Meta `assets_without_ad_account`; standalone Instagram business accounts can be personal-connected without an ad-account parent and still need to be assignable to the brand.
- Impersonation callbacks must persist `is_impersonating` (for `/auth/callback` and `/callback` paths) so middleware bypasses the `/set-password` requirement for admin impersonation sessions.
- Use the `fetch-brand-integrations` Edge Function as the source of truth for brand-assigned assets. It ensures members can see owner-linked integrations by using the Service Role bypass while verifying the requester's brand access.
- Avoid redundant permission upserts in brand initialization paths (e.g. `ensureBrandProfileRecord`) to prevent role drift for invited members; always sync global brand data (name, logo, `completed_at`) back to user-scoped onboarding states.
- Campaign compare should support TradingView-style multi-entity plotting: add/remove multiple campaigns/indexes to one metric chart, and keep indexes grouped by default with an optional `Decompose` toggle to expose member campaigns.
- Minimize dropdown-driven selection for paid media exploration: prefer left-rail ticker-style list menus for campaign/index/ad set selection with quick row actions and lightweight chart focus.
- Replace full-page paid media action logs with a compact, context-aware alert feed (search + status filter + sort + pagination) so the primary chart/explorer keeps most visual real estate.
- In brand integration assignment UIs, always merge brand-assigned integration accounts into selectable assets so invited members can view and keep existing brand-linked accounts even without personal OAuth ownership.
- Impersonation callbacks must persist `is_impersonating` (for `/auth/callback` and `/callback` paths) so middleware bypasses the `/set-password` requirement for admin impersonation sessions.
- Exclude `/socket.io` and `/.well-known/appspecific/*` probes from Next middleware matchers so extension/devtools polling does not trigger Supabase auth lookups on 404 noise requests.
- Keep paid-media marker placement synchronized with alerts refresh: when `DCOActionAlertsBox` refreshes, trigger `CampaignAdSetWorkspace` action-log refresh so chart markers re-render against the latest alerts.
- In paid-media observability charts, place action markers at the nearest in-window chart timestamp (time-sensitive), render full top markers only for the active layer (`CAMPAIGN` in campaign view, `ADSET` in adset view), and demote non-layer scopes (for example `AD`) to bottom bookmarks.
- Timeline bootstrap should fetch the active resolution first and prefetch the opposite resolution best-effort; a secondary-resolution failure (for example upstream `546`) must not break paid-media initial load.
- Organic planner AI Studio handoff persistence must never assume quota headroom: catch `QuotaExceededError`, prune stale `continuum:organic-planner:ai-studio-context:*` draft seeds, and retry with progressively smaller payloads (drop `assetBase64`, then heavy optional context) before giving up.
- For Zustand object selectors in planner client hooks/components, wrap selectors with `useShallow` from `zustand/react/shallow` to stabilize `getSnapshot` identity and avoid React infinite-loop warnings.
- Organic agent session job hydration must tolerate non-array payloads from `GET /api/organic/agent/sessions/{sessionId}/jobs` (for example wrapped `{ jobs: [...] }` / `{ data: [...] }` responses) and never assume `jobs` is directly iterable.
- Jaina backend Supabase Edge Function calls may use the service-role bearer token instead of a browser user JWT; authenticated Edge functions that are safe for trusted backend use should explicitly accept exact service-role auth instead of calling `auth.getUser(serviceRoleKey)`.
