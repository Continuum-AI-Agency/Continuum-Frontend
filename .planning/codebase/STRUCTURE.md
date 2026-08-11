# Codebase Structure

**Analysis Date:** 2026-03-25

## Summary

The project uses Next.js App Router with route groups for auth separation. Domain logic is split between large self-contained canvas modules (`src/StudioCanvas/`, `src/CampaignCanvas/`) and feature-area component/lib pairs under `src/components/[domain]/` + `src/lib/[domain]/`. All interactive client surfaces follow a pattern of an RSC page wrapping a `*Client.tsx` entry component.

## Directory Layout

```
Continuum-Frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Public auth routes (login, signup, recovery, set-password, callback)
│   │   ├── (post-auth)/              # Protected routes (dashboard, organic, ai-studio, paid-media, etc.)
│   │   ├── _actions/                 # Server Actions (eventBridge.ts — centralized event broadcasting)
│   │   ├── api/                      # Route Handlers (REST + SSE endpoints)
│   │   ├── auth/                     # Auth callbacks (/auth/callback, /auth/impersonate)
│   │   ├── documents/                # Document preview routes
│   │   ├── invite/                   # Team invite accept flow
│   │   ├── login/                    # Login redirect (legacy path)
│   │   ├── oauth/                    # OAuth flow (start, callback, mock)
│   │   ├── onboarding/               # Onboarding wizard route
│   │   └── layout.tsx                # Root layout (theme, providers, analytics)
│   ├── StudioCanvas/                 # AI Studio visual workflow editor (self-contained module)
│   │   ├── components/               # Canvas UI chrome (toolbar, panels, dialogs)
│   │   ├── contexts/                 # Canvas-scoped React contexts
│   │   ├── edges/                    # Custom edge types
│   │   ├── hooks/                    # Canvas-specific hooks
│   │   ├── nodes/                    # Node components (ImageNode, VideoReferenceNode, StringNode, etc.)
│   │   ├── stores/                   # useStudioStore (Zustand)
│   │   ├── types/                    # StudioNode types, execution types
│   │   └── utils/                    # Graph utilities (isValidConnection, buildNodePayload, workflowSerialization, etc.)
│   ├── CampaignCanvas/               # Paid media campaign hierarchy builder (self-contained module)
│   │   ├── components/               # Canvas chrome
│   │   ├── hooks/                    # Canvas hooks
│   │   ├── nodes/                    # CampaignNode, AdSetNode, AdNode, AudienceNode, CreativeNode
│   │   ├── stores/                   # useCampaignStore (Zustand)
│   │   ├── types/                    # CampaignCanvas types
│   │   └── validation/               # Graph validation, hierarchy relationship rules
│   ├── components/                   # Shared and domain-specific React components
│   │   ├── ai-studio/                # AI Studio UI (canvas integration, chat surface, hooks)
│   │   ├── analytics/                # Analytics tracking components (Mixpanel)
│   │   ├── auth/                     # Auth form components
│   │   ├── brand-insights/           # Brand insights widgets
│   │   ├── competitors/              # Competitor analysis UI
│   │   ├── creative-assets/          # Creative library sidebar
│   │   ├── dashboard/                # Dashboard home (server/, skeletons/, views/)
│   │   ├── integrations/             # Integration connection UI
│   │   ├── navigation/               # AppSidebar, BrandSwitcher, route definitions
│   │   ├── onboarding/               # Multi-step onboarding wizard (steps/, providers/, hooks/)
│   │   ├── organic/                  # Organic social planner UI (primitives/, hooks/)
│   │   ├── paid-media/               # Paid media observability UI (dashboard/, primitives/, jaina/)
│   │   ├── providers/                # ActiveBrandProvider
│   │   ├── realtime/                 # Supabase Realtime client components
│   │   ├── settings/                 # Settings page components
│   │   ├── ui/                       # Shared primitives (shadcn/ui recipes, Base UI wrappers)
│   │   └── [misc]/                   # loader-animations, presence, site, strategic-analyses, etc.
│   ├── hooks/                        # Shared React hooks (useAuth, useSession, useBrandIntegrations, etc.)
│   ├── lib/                          # Business logic, API clients, schemas, utilities (no React)
│   │   ├── ai-studio/                # AI Studio execution (GraphExecutor, inputResolution, portTypes, backend)
│   │   ├── api/                      # HTTP wrappers + domain API clients
│   │   ├── auth/                     # Auth actions, schemas, token helpers
│   │   ├── brand-insights/           # Brand insights logic
│   │   ├── brands/                   # Brand context resolution, preferences
│   │   ├── campaign-canvas/          # Campaign payload building
│   │   ├── events/                   # ContinuumEvent schema registry (Zod)
│   │   ├── integrations/             # Integration account fetching
│   │   ├── jaina/                    # Jaina AI agent utilities
│   │   ├── onboarding/               # Onboarding state machine and storage
│   │   ├── organic/                  # Organic planner logic (store, calendar-generation, platforms, trends, ai-studio-bridge)
│   │   ├── paid-media/               # Paid media domain logic (campaign-indexes)
│   │   ├── react-query/              # ReactQueryProvider + query client setup
│   │   ├── repositories/             # Data access objects (brandProfile.ts)
│   │   ├── schemas/                  # Shared Zod schemas (promptTemplates, etc.)
│   │   ├── server/                   # Server-only utilities (events pub/sub, auth helpers)
│   │   ├── sse/                      # SSE client hook (useContinuumServerEvents), reader
│   │   ├── storage/                  # Supabase storage helpers
│   │   ├── streaming/                # Streaming response utilities
│   │   ├── supabase/                 # Supabase client wrappers (client.ts, server.ts, admin.ts, cookies.ts)
│   │   ├── theme/                    # Theme DOM utilities
│   │   └── utils/                    # General utilities (cn, etc.)
│   ├── services/                     # Higher-level service abstractions (thin layer, rarely used)
│   ├── types/                        # Global TypeScript types (timeline/, shared declarations)
│   └── middleware.ts                 # Next.js middleware (auth guard, route protection)
├── .planning/                        # GSD planning artifacts
├── docs/                             # Documentation (styleguide, organic spec, etc.)
├── bun-test-setup.ts                 # Bun test environment setup (happy-dom, mocks)
├── next.config.ts                    # Next.js config
└── package.json                      # Dependencies (bun@1.3.5)
```

## Directory Purposes

**`src/app/(auth)/`:**
- Purpose: Public-facing auth routes not protected by middleware
- Contains: `/login`, `/signup`, `/recovery`, `/set-password`, `/callback`
- Key files: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/callback/route.ts`

**`src/app/(post-auth)/`:**
- Purpose: All protected application routes; middleware enforces authentication before these routes render
- Contains: One directory per major feature — `dashboard`, `organic`, `ai-studio`, `paid-media`, `integrations`, `settings`, `admin`, `brand-profiles`
- Key files: Each directory has a `page.tsx` (RSC) and often a `*Client.tsx` or `actions.ts` alongside it

**`src/app/api/`:**
- Purpose: Route Handlers for REST endpoints consumed by client-side code
- Structure mirrors product domains: `api/ai-studio/`, `api/organic/`, `api/paid-media/`, `api/campaigns/`, `api/agents/jaina/`
- Key files: `src/app/api/events/route.ts` (SSE bus), `src/app/api/ai-studio/generate/stream/route.ts` (streaming generation)

**`src/app/_actions/`:**
- Purpose: Server Actions accessible from client components for cross-cutting server operations
- Key files: `src/app/_actions/eventBridge.ts` — exposes `broadcastContinuumEvent()` and typed event broadcast helpers

**`src/StudioCanvas/`:**
- Purpose: Fully self-contained AI workflow canvas module; imported as `import { StudioCanvas } from "@/StudioCanvas"`
- Key files: `src/StudioCanvas/stores/useStudioStore.ts`, `src/StudioCanvas/nodes/`, `src/StudioCanvas/utils/buildNodePayload.ts`, `src/StudioCanvas/utils/workflowSerialization.ts`

**`src/CampaignCanvas/`:**
- Purpose: Fully self-contained campaign hierarchy canvas module
- Key files: `src/CampaignCanvas/stores/useCampaignStore.ts`, `src/CampaignCanvas/validation/applyCampaignGraphValidation.ts`

**`src/components/ui/`:**
- Purpose: Shared primitive components — shadcn/ui recipes adapted to project design system, Base UI wrappers, generic utilities
- Key files: `ClientOnly.tsx`, `TierAccessRedirect.tsx`, `ToastProvider.tsx`, `GalaxyBackground.tsx`

**`src/lib/api/`:**
- Purpose: All HTTP client code — typed wrappers around Route Handlers, split by rendering environment
- Key files: `http.ts` (browser), `http.server.ts` (RSC/server-only), `config.ts` (base URL), `errors.ts` (`assertOk`)
- Domain clients: `brandInsights.client.ts`, `brandInsights.server.ts`, `productCatalogs.client.ts`, `paidMetrics.client.ts`, etc.

**`src/lib/supabase/`:**
- Purpose: Wrapped Supabase client factory functions — never import Supabase SDK directly outside this directory
- Key files: `client.ts` (singleton browser client), `server.ts` (per-request server client + session helpers), `admin.ts` (service-role admin client for RLS bypasses), `cookies.ts` (shared cookie options)

**`src/lib/organic/`:**
- Purpose: Organic social planner domain logic — calendar generation schemas, platform definitions, trend types, AI Studio handoff bridge, Zustand store
- Key files: `store.ts` (persisted Zustand store), `calendar-generation.ts` (Zod schemas for calendar API), `ai-studio-bridge.ts` (localStorage handoff contract), `platforms.ts`

**`src/lib/events/`:**
- Purpose: Type-safe event registry for the Continuum SSE bus
- Key files: `schema.ts` — defines all `ContinuumEventName` values, Zod payload schemas, and `ContinuumEventMap` type

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout — wraps all routes with providers
- `src/middleware.ts`: Auth guard for all non-static routes

**Auth:**
- `src/lib/auth/actions.ts`: Server Actions for login/signup/logout/OAuth
- `src/lib/auth/getBrowserAccessToken.ts`: Client-side Bearer token retrieval
- `src/lib/brands/active-brand-context.ts`: RSC brand resolution (central auth utility)
- `src/hooks/useAuth.ts`: Client hook wrapping auth Server Actions

**Canvas Modules:**
- `src/StudioCanvas/stores/useStudioStore.ts`: AI Studio canvas state
- `src/CampaignCanvas/stores/useCampaignStore.ts`: Campaign canvas state
- `src/lib/ai-studio/execution/GraphExecutor.ts`: Workflow execution orchestrator

**Organic Planner:**
- `src/lib/organic/store.ts`: Persisted planner Zustand store
- `src/lib/organic/ai-studio-bridge.ts`: Cross-module handoff via localStorage
- `src/components/organic/primitives/OrganicCalendarWorkspace.tsx`: Calendar workspace RSC wrapper
- `src/components/organic/primitives/OrganicCalendarWorkspaceClient.tsx`: Calendar workspace client

**API Infrastructure:**
- `src/lib/api/http.ts`: Browser HTTP client
- `src/lib/api/http.server.ts`: Server HTTP client (server-only)
- `src/app/api/events/route.ts`: SSE event stream endpoint
- `src/lib/sse/useContinuumServerEvents.ts`: Client SSE subscription hook
- `src/app/_actions/eventBridge.ts`: Server Actions for event emission

**Testing:**
- `bun-test-setup.ts`: Global test setup (happy-dom, mocks for `server-only`, `next/navigation`, theme)

## Naming Conventions

**Files:**
- RSC pages: `page.tsx` (always — App Router convention)
- Client entry components: `[FeatureName]Client.tsx` (e.g., `AIStudioClient.tsx`, `PaidMediaClient.tsx`)
- Server Actions files: `actions.ts` co-located with the route that uses them
- Browser API clients: `[domain].client.ts` (e.g., `brandInsights.client.ts`)
- Server API clients: `[domain].server.ts` (e.g., `brandInsights.server.ts`)
- Shared/unsuffixed API clients (older pattern): `[domain].ts` (e.g., `aiStudio.ts`, `integrations.ts`)
- Hooks: `use[HookName].ts` or `use-[hook-name].ts` (both styles present)
- Test files: co-located `*.test.ts` / `*.test.tsx`

**Directories:**
- Feature areas use kebab-case: `paid-media`, `ai-studio`, `brand-insights`, `creative-assets`
- Canvas modules use PascalCase: `StudioCanvas`, `CampaignCanvas`

**Components:**
- PascalCase always: `OrganicWorkspaceTabs`, `BrandSwitcherMenu`, `TierAccessRedirect`
- Server-side functions: suffixed `Action` (Server Actions) or prefixed `fetch`/`get` + suffixed `Server` (e.g., `fetchBrandInsights`, `getServerSession`)

## Module Boundaries and Interactions

**StudioCanvas ↔ lib/ai-studio:**
- `StudioCanvas/` imports from `src/lib/ai-studio/` for execution, node type definitions, and input resolution
- `StudioCanvas/` imports from `src/lib/api/aiStudio.ts` for job creation API calls

**Organic Planner ↔ AI Studio:**
- No direct import dependency; communication is via `localStorage` using the contract defined in `src/lib/organic/ai-studio-bridge.ts`
- `AIStudioClient.tsx` reads the seed context key; Organic Planner writes it

**Components ↔ lib:**
- `src/components/[domain]/` imports from `src/lib/[domain]/` for domain logic and API clients
- Components never import from `src/app/api/` directly

**Route Handlers ↔ lib/server:**
- `src/app/api/` route handlers import from `src/lib/server/events.ts` (SSE pub/sub) and `src/lib/supabase/server.ts` (auth)

**Cross-domain via Event Bus:**
- Any server-side code can emit `ContinuumEvent` via `src/lib/server/events.ts`
- Client components in any domain can subscribe via `useContinuumServerEvents()`

## Route Structure

```
/                          → redirect to /login
/login                     → (auth) login page
/signup                    → (auth) signup page
/recovery                  → (auth) password recovery
/set-password              → (auth) set password (email users without password)
/callback                  → (auth) Supabase auth callback
/onboarding                → onboarding wizard (pre-brand setup)
/dashboard                 → (post-auth) home dashboard
/organic                   → (post-auth) organic social planner + metrics
/ai-studio                 → (post-auth) AI workflow canvas + chat
/paid-media                → (post-auth) paid media observability + campaign builder
/paid-media/campaign-canvas → (post-auth) campaign canvas editor
/integrations              → (post-auth) integration connections
/settings                  → (post-auth) account + brand settings
/settings/integrations     → (post-auth) integration settings
/brand-profiles/[id]/assets → (post-auth) brand asset management
/admin                     → (post-auth) admin panel
/auth/callback             → Supabase OAuth callback handler
/auth/impersonate          → Admin impersonation entry
/oauth/start               → OAuth initiation (popup flow)
/oauth/callback            → OAuth completion handler
/invite/callback           → Team invite acceptance
/api/events                → SSE stream (GET) + event ingest (POST)
/api/ai-studio/*           → AI Studio job management, generation, enrichment, templates
/api/organic/*             → Calendar generation, grid generation, daily details streaming
/api/paid-media/*          → Campaign indexes, product catalogs, timeline
/api/agents/jaina/*        → Jaina AI agent chat, streaming, speech, memory
/api/campaigns             → Campaign data
/api/organic-metrics/*     → Organic platform metrics (Facebook, Instagram)
/api/healthz               → Health check
/api/system/version        → Version info
```

## Where to Add New Code

**New protected feature route:**
- RSC page: `src/app/(post-auth)/[feature-name]/page.tsx`
- Client entry (if interactive): `src/app/(post-auth)/[feature-name]/[FeatureName]Client.tsx`
- Server Actions: `src/app/(post-auth)/[feature-name]/actions.ts`

**New API endpoint:**
- Route handler: `src/app/api/[domain]/[resource]/route.ts`

**New domain component:**
- Implementation: `src/components/[domain]/[ComponentName].tsx`
- If server component fetching data: `src/components/[domain]/server/[ComponentName].tsx`

**New domain library/logic:**
- Business logic: `src/lib/[domain]/[module].ts`
- API client (browser): `src/lib/api/[domain].client.ts`
- API client (server): `src/lib/api/[domain].server.ts`

**New shared hook:**
- `src/hooks/use[HookName].ts`

**New Zod schema:**
- Domain-specific: co-locate in `src/lib/[domain]/[module].ts`
- Shared cross-domain: `src/lib/schemas/[schema-name].ts`

**New canvas node (StudioCanvas):**
- Node component: `src/StudioCanvas/nodes/[NodeName]Node.tsx`
- Node type registration: update `src/lib/ai-studio/nodeTypes.ts` and `src/StudioCanvas/types/index.ts`
- Tests: `src/StudioCanvas/nodes/[NodeName]Node.test.tsx`

**New ContinuumEvent type:**
- Add to `CONTINUUM_EVENT_TYPES` array in `src/lib/events/schema.ts`
- Add Zod schema and register in `continuumEventPayloadSchemas` map

## Special Directories

**`.planning/`:**
- Purpose: GSD planning artifacts and codebase analysis documents
- Generated: No
- Committed: Yes

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`bun-test-setup.ts`:**
- Purpose: Configures happy-dom, mocks `server-only` package, stubs `next/navigation` and theme provider for test environment
- Referenced by: Bun test runner (via `package.json` preload)

---

*Structure analysis: 2026-03-25*
