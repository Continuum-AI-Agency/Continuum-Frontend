# Architecture

**Analysis Date:** 2026-03-25

## Summary

Continuum is a Next.js 16 App Router application built server-first: RSCs handle auth-gated data fetching via Supabase, while client components drive interactive canvases, calendar planners, and real-time collaboration surfaces. State is partitioned by domain into Zustand stores (canvas editors), Zustand-persist (organic planner), and React Query (server cache). A Server-Sent Events bus at `/api/events` bridges server-side AI task progress to client listeners across modules.

## Pattern Overview

**Overall:** Server-First RSC + Domain-Scoped Client Islands

**Key Characteristics:**
- Route pages are async RSCs that resolve `getActiveBrandContext()`, perform authorization/tier checks, and inject pre-fetched data into client entry components
- Client components are isolated "islands" — heavy interactive surfaces (canvas editors, planner) receive props from the RSC boundary and own their own Zustand stores
- No direct Supabase DB calls in client components — data flows through RSCs, Server Actions, or Route Handlers
- Multi-tenant: all data is scoped to `brandProfileId` resolved at the RSC layer before rendering any client component

## Layers

**Route Layer (RSC Pages):**
- Purpose: Auth guard, brand context resolution, tier access checks, SSR data prefetch
- Location: `src/app/(post-auth)/*/page.tsx`
- Contains: `async` page functions, `getActiveBrandContext()` calls, `redirect()` guards, Server Action invocations
- Depends on: `src/lib/brands/active-brand-context.ts`, `src/lib/supabase/server.ts`, Server Actions in adjacent `actions.ts` files
- Used by: Next.js App Router

**Client Entry Components:**
- Purpose: Interactive shells that receive RSC-resolved data as props and mount domain stores/hooks
- Location: `src/app/(post-auth)/*/[ModuleName]Client.tsx` (e.g., `AIStudioClient.tsx`, `PaidMediaClient.tsx`)
- Contains: `"use client"` directive, tab/mode routing, domain store initialization
- Depends on: Domain components in `src/components/[domain]/`, domain stores in `src/StudioCanvas/`, `src/CampaignCanvas/`, `src/lib/organic/store.ts`
- Used by: RSC page files

**Domain Component Layer:**
- Purpose: Feature-specific UI components organized by product area
- Location: `src/components/ai-studio/`, `src/components/organic/`, `src/components/paid-media/`, `src/components/dashboard/`
- Contains: Client components with hooks, Base UI / shadcn primitives, Framer Motion animations
- Depends on: `src/lib/api/*.client.ts` for data, `src/hooks/` for shared logic
- Used by: Client entry components

**Canvas Module Layer:**
- Purpose: Self-contained visual editors built on `@xyflow/react`
- Location: `src/StudioCanvas/`, `src/CampaignCanvas/`
- Contains: Node components, edge types, stores, utils, types, hooks — fully encapsulated per canvas
- Depends on: `src/lib/ai-studio/`, `src/lib/api/aiStudio.ts`, `src/lib/campaign-canvas/`
- Used by: `AIStudioClient.tsx`, `src/app/(post-auth)/paid-media/campaign-canvas/`

**API Layer (Route Handlers):**
- Purpose: Typed REST endpoints consumed by browser clients; also proxy layer to backend/external services
- Location: `src/app/api/`
- Contains: `route.ts` files with GET/POST handlers, Zod validation, Supabase auth token extraction, SSE streaming
- Depends on: `src/lib/supabase/server.ts`, `src/lib/server/events.ts`
- Used by: `src/lib/api/*.client.ts` wrappers, external webhooks

**Library / Domain Logic Layer:**
- Purpose: Pure business logic, schemas, API client wrappers, and server utilities — no React
- Location: `src/lib/`
- Contains: Zod schemas (`src/lib/schemas/`), typed HTTP clients (`src/lib/api/`), Supabase wrappers (`src/lib/supabase/`), domain logic (`src/lib/organic/`, `src/lib/paid-media/`, `src/lib/ai-studio/`)
- Depends on: External SDKs wrapped behind thin abstractions
- Used by: Components, hooks, route handlers, server actions

## Data Flow

**Protected Page Load:**
1. Browser requests `/organic` (or any protected route)
2. Middleware (`src/middleware.ts`) calls `supabase.auth.getUser()` — redirects to `/login` if unauthenticated
3. RSC page calls `getActiveBrandContext()` (React `cache()`-wrapped) — resolves brand permissions and active brand ID via Supabase
4. Page fetches domain data (brand insights, integrations, etc.) via `src/lib/api/*.server.ts` or direct Supabase queries
5. RSC renders client entry component with pre-fetched data as props

**Client-Side Data Mutation:**
1. Client component calls a Server Action (e.g., `createPromptTemplateAction`)
2. Server Action validates input with Zod, performs Supabase operation, optionally emits a `ContinuumEvent` via `broadcastContinuumEvent()`
3. React Query invalidation or optimistic update refreshes UI

**AI Task Progress (Real-Time):**
1. Route handler or Server Action emits event via `emitContinuumEvent()` in `src/lib/server/events.ts`
2. In-process pub/sub broadcasts to all SSE subscribers connected to `GET /api/events`
3. Client `useContinuumServerEvents()` hook (`src/lib/sse/useContinuumServerEvents.ts`) dispatches typed event to registered handlers
4. Handler updates component/store state

**Organic Planner → AI Studio Handoff:**
1. User clicks "Open in AI Studio" on a planner draft
2. Planner writes a `PlannerAiStudioHandoff` payload (Zod-validated) to `localStorage` under a `continuum:organic-planner:ai-studio-context:*` key
3. Browser navigates to `/ai-studio?mode=canvas&source=planner&draftId=<id>`
4. `AIStudioClient` reads and parses the seed context from `localStorage` on mount, pre-populates the canvas

**State Management:**
- Canvas state: Zustand stores (`useStudioStore`, `useCampaignStore`) — ephemeral, in-memory, with 50-snapshot undo/redo history
- Organic planner state: Zustand with `persist` middleware → `localStorage` — survives navigation
- Server data: React Query via `ReactQueryProvider` — cache keyed by brand/entity IDs
- Auth/session: Supabase session cookies — read server-side in RSCs and middleware, read client-side via `createSupabaseBrowserClient()`

## Key Abstractions

**`getActiveBrandContext()`:**
- Purpose: Central RSC utility that resolves the authenticated user's brand permissions, active brand ID, tier, and brand summaries in a single cached call
- File: `src/lib/brands/active-brand-context.ts`
- Pattern: React `cache()` wrapper around Supabase queries; falls back to admin client on RLS `54001` errors; every protected RSC page starts with this call

**Typed HTTP Wrappers:**
- Purpose: Shared fetch utility that injects Bearer tokens and optionally validates responses with Zod schemas
- Files: `src/lib/api/http.ts` (browser), `src/lib/api/http.server.ts` (RSC/server — marked `server-only`)
- Pattern: `request<TResponse>({ path, method, body, schema })` — domain clients import and wrap these

**Domain API Clients:**
- Purpose: Named, typed wrappers around Route Handler endpoints — co-located by surface
- Pattern: `*.client.ts` for browser usage, `*.server.ts` for RSC/Server Action usage
- Examples: `src/lib/api/brandInsights.client.ts`, `src/lib/api/brandInsights.server.ts`, `src/lib/api/productCatalogs.client.ts`

**Continuum Event Bus:**
- Purpose: Typed in-process pub/sub for real-time server→client messages (AI task progress, integration status changes, etc.)
- Files: `src/lib/events/schema.ts` (event type registry + Zod schemas), `src/lib/server/events.ts` (in-process pub/sub), `src/app/api/events/route.ts` (SSE endpoint), `src/lib/sse/useContinuumServerEvents.ts` (client hook), `src/app/_actions/eventBridge.ts` (Server Actions to emit events)
- Pattern: Server emits → SSE stream delivers → client hook dispatches to handlers

**`StudioCanvas` Module:**
- Purpose: Self-contained visual workflow editor for AI content generation
- Location: `src/StudioCanvas/`
- Pattern: `@xyflow/react` nodes represent generative operations (image gen, video gen, LLM string processing, media references). `useStudioStore` (Zustand) owns all graph state. `GraphExecutor` (`src/lib/ai-studio/execution/GraphExecutor.ts`) orchestrates topological execution by creating AI Studio jobs via `src/lib/api/aiStudio.ts`.

**`CampaignCanvas` Module:**
- Purpose: Paid media campaign hierarchy builder with graph validation
- Location: `src/CampaignCanvas/`
- Pattern: `@xyflow/react` graph with typed node hierarchy (campaign → ad set → ad/audience → creative). `useCampaignStore` validates hierarchy relationships on every graph change and exposes `validateGraph()` for pre-submit checks.

## Entry Points

**Root Layout:**
- Location: `src/app/layout.tsx`
- Triggers: All routes
- Responsibilities: Theme hydration (no-flash script + cookie-based `data-theme`), `ReactQueryProvider`, `ToastProvider`, `ThemeProvider`, Vercel Analytics/SpeedInsights, Mixpanel init

**Auth Middleware:**
- Location: `src/middleware.ts`
- Triggers: All requests except static assets, `/socket.io`, `/.well-known/appspecific/*`
- Responsibilities: Session validation via Supabase SSR client; redirect unauthenticated users to `/login`; redirect email users without passwords to `/set-password`; allow impersonation sessions to bypass `/set-password`

**Protected Route Pages:**
- Location: `src/app/(post-auth)/*/page.tsx`
- Triggers: Direct navigation to `/dashboard`, `/organic`, `/ai-studio`, `/paid-media`, etc.
- Responsibilities: `getActiveBrandContext()` call, tier access gate (`activeBrandTier === 0` check), RSC data prefetch, render of client entry component

## Error Handling

**Strategy:** Zod validation at all boundaries; custom `Error` objects with context; no raw `null` returns from utilities

**Patterns:**
- API layer: `assertOk(response)` in `src/lib/api/errors.ts` throws structured errors on non-2xx HTTP responses
- Server Actions: Return `{ success: boolean; error?: string; data?: T }` discriminated unions — never throw across the server/client boundary
- RSC pages: Call `redirect()` for missing brand context; return `<TierAccessRedirect>` for tier failures
- Canvas execution: `GraphExecutor` uses `try/catch` per node execution and propagates `NodeExecutionResult.error` strings
- Supabase RLS fallback: `getActiveBrandContext` detects `54001` (statement too complex) and retries with admin client

## Cross-Cutting Concerns

**Logging:** `console.log/console.error` with `[module]` prefixes (e.g., `[activeBrand]`, `[http]`). No structured logging framework detected.

**Validation:** Zod at every client/server boundary — HTTP request bodies, Server Action inputs, SSE event payloads, `localStorage` seed data. Schemas co-located with domain logic in `src/lib/schemas/` and `src/lib/organic/calendar-generation.ts`, etc.

**Authentication:** Supabase SSR — server client for RSCs/actions/middleware, browser client (singleton pattern) for client components. Bearer token injected into all `http.ts` / `http.server.ts` calls via `getBrowserAccessToken()` / `getServerAccessToken()`.

**Theme:** Dual synchronization via `data-theme` attribute and `html.dark`/`html.light` class. Cookie-based initial value prevents flash. `ThemeProvider` in `src/components/theme-provider.tsx` controls runtime switching.

**Multi-Tenancy:** `brandProfileId` is the tenant key. Every RSC page resolves it via `getActiveBrandContext()` before rendering. All Supabase queries are scoped to the resolved `activeBrandId`.

**Realtime Collaboration:** `useCanvasRealtime` and `useAIStudioChatRealtime` hooks in `src/components/ai-studio/hooks/` use Supabase Realtime for canvas room presence and chat streaming.

## Notable Observations

- `getActiveBrandContext()` is wrapped with React `cache()` — it deduplicates within a single RSC render pass but is called independently in each page, meaning layout files do not share this context; each page re-fetches.
- The Continuum Event Bus (`/api/events` SSE) uses an in-process pub/sub mechanism (`src/lib/server/events.ts`), which means events do not propagate across multiple Node.js instances in a horizontally scaled deployment.
- `localStorage` is used as the handoff channel between the Organic Planner and AI Studio — a deliberate architecture choice to avoid server round-trips, but creates a tight coupling between modules via key naming conventions in `src/lib/organic/ai-studio-bridge.ts`.
- The `GraphExecutor` in `src/lib/ai-studio/execution/GraphExecutor.ts` has an iterator/generator execution model that is partially implemented (comment references a simplification).
- Domain API clients follow a strict `*.client.ts` / `*.server.ts` naming split but the pattern is not universally applied — `src/lib/api/integrations.ts` and `src/lib/api/aiStudio.ts` are unsuffixed, indicating the convention was introduced progressively.

---

*Architecture analysis: 2026-03-25*
