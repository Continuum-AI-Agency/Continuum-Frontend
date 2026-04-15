# Continuum Frontend: Vercel/Next.js Performance Deep Dive

Date: 2026-04-14  
Scope requested: Code-splitting findings `2, 3, 4, 5` + deeper analysis of finding `7` (multi-instance safety on Vercel).

---

## 2) Paid-Media shell eagerly bundles both major tabs

### Current evidence
- Static imports pull both heavy tab surfaces into the initial paid-media client bundle:
  - `src/app/(post-auth)/paid-media/PaidMediaClient.tsx:6`
  - `src/app/(post-auth)/paid-media/PaidMediaClient.tsx:7`
- Only canvas is currently code-split:
  - `src/app/(post-auth)/paid-media/PaidMediaClient.tsx:17`

### Why this hurts
- Users landing on `Dashboard` still pay parse/execute cost for `Jaina` (and vice versa).
- This adds JS transfer, parse, and hydration overhead on one of the heaviest app surfaces.

### Improvements
1. Dynamic import `PaidMediaDashboard` and `JainaChatSurface` behind tab boundaries.
2. Keep current `CampaignCanvas` dynamic import.
3. Add idle/intent prefetch for the non-active tab chunk:
   - prefetch on `TabsTrigger` hover/focus.
   - prefetch in `requestIdleCallback` after first contentful render.

### Expected performance gain
- Initial paid-media route JS reduction: typically `25–45%` (depends on vendor chunk sharing).
- Faster tab-first paint and hydration responsiveness.

---

## 3) Very large client modules limit effective code splitting

### Current evidence
- Very large client files:
  - `src/components/paid-media/dashboard/CampaignTimelineWorkspace.tsx` (3033 LOC)
  - `src/components/paid-media/dashboard/CampaignAdSetWorkspace.tsx` (2897 LOC)
  - `src/components/paid-media/jaina/JainaChatSurface.tsx` (1871 LOC)
  - `src/components/organic/OrganicMetricsDashboard.tsx` (1915 LOC)

### Why this hurts
- Large leaf bundles are hard to chunk efficiently and expensive to parse.
- Any single import boundary can pull a large dependency graph into the same chunk.
- Frequent re-renders in large components amplify CPU cost.

### Improvements
1. Break heavy clients into domain islands:
   - `data-fetch/controller`
   - `chart rendering`
   - `list/table virtualization`
   - `action dialogs/editors`
2. Keep server-first wrappers for non-interactive framing and data preparation.
3. Dynamic-load rare UI paths (dialogs, heavy charts, editors).
4. For paid-media dashboard, move per-campaign metrics fan-out behind a server aggregator route (or edge function), then stream/incremental hydrate.

### Expected performance gain
- Main-thread parse/execute reduction on hot pages: commonly `15–35%`.
- Lower interaction latency (especially under throttled CPU).

---

## 4) Predictive loading exists in Organic but is not generalized

### Current evidence
- Organic has explicit metrics prefetch:
  - `src/components/organic/OrganicWorkspaceTabs.tsx:33`
  - `src/lib/prefetch/organic-metrics-cache.ts:35`
- Paid-media and Jaina do not use equivalent tab-intent/idle prefetch for major code/data paths.

### Why this hurts
- Tab switches in other surfaces are still cold-starting both code and data.
- This causes avoidable wait spikes despite predictable navigation patterns.

### Improvements
1. Reuse the Organic pattern for paid-media:
   - prefetch next tab chunk.
   - pre-warm key data calls for likely next action.
2. Add shallow in-memory cache for short-lived tab transitions (`3–5 min` TTL).
3. Add "intent signals" (hover/focus/near-viewport) for prefetch.
4. Instrument prefetch hit-rate and bail out when on constrained connection (Save-Data).

### Expected performance gain
- First tab-switch latency reduction: often `30–60%`.
- More stable perceived performance under normal user navigation.

---

## 5) Global analytics init runs in root layout for all routes

### Current evidence
- Mounted globally:
  - `src/app/layout.tsx:94`
- Eager third-party import:
  - `src/components/analytics/MixpanelInit.tsx:4`

### Why this hurts
- Adds startup work even for routes where analytics is not needed immediately.
- Competes with critical rendering/hydration work on initial load.

### Improvements
1. Move analytics init to post-auth layout only, or defer via idle callback.
2. Load analytics conditionally based on route segment and consent state.
3. Keep a lightweight queue shim until full analytics library is loaded.

### Expected performance gain
- Lower startup CPU contention; measurable TTI/INP improvement on non-dashboard entries.
- Reduced bytes and execution for auth/onboarding/utility routes.

---

## 7) Deep Dive: In-memory state/event patterns are not multi-instance safe on Vercel

### Current evidence
- In-memory fallback job store:
  - `src/app/api/ai-studio/fallback.ts:140`
  - used by `src/app/api/ai-studio/generate/route.ts:84`, `:102`, `:124`, `:144`
  - read via `src/app/api/ai-studio/jobs/route.ts:60`
- In-process event bus singleton:
  - `src/lib/server/events.ts:56`
  - SSE consumer endpoint subscribes in `src/app/api/events/route.ts:88`
  - event emitters in `src/app/_actions/eventBridge.ts:16` and `src/app/api/events/route.ts:148`

### Why this fails on Vercel
1. **Instance-local memory**: one request can write to instance A while the next read hits instance B and misses data.
2. **Scale-out fanout gaps**: SSE clients connected to instance B will not see events emitted on instance A.
3. **Cold-start resets**: all in-memory jobs/events are lost when instance recycles.
4. **Ghost behavior**: users can observe inconsistent "job exists / job missing" and intermittent real-time updates.

### User-visible failure modes
- AI Studio job appears in one tab/session but disappears after refresh or poll.
- Event stream connected successfully, but important events never arrive.
- Duplicate or missing completion notifications after redeploy/scale.

### Performance impact of current design
- Extra retries/poll loops due to missing state increase function invocations and cost.
- User retries from stale UI states produce duplicate upstream work.
- SSE reconnect churn increases network and server load.

## Recommended target architecture (balanced option)

### A) Durable job store (replace `fallbackJobsStore`)
- Persist fallback jobs in a shared store:
  - Preferred: Redis (Upstash) for low-latency ephemeral job metadata.
  - Alternative: Postgres table if stronger queryability/audit is needed.
- Key model:
  - `ai:jobs:{brandId}` sorted index (newest first)
  - `ai:job:{jobId}` hash/json payload
  - TTL for fallback-only jobs (for example `24–72h`).

### B) Distributed event bus + optional replay
- Publish events to Redis Pub/Sub (or Streams).
- Each API instance subscribes and forwards to local SSE clients.
- For reliability across reconnects, add short replay window via Redis Streams:
  - emit with event id
  - client can send `Last-Event-ID`
  - server replays missed events before switching to live subscription.

### C) Keep current SSE route contract
- Maintain `/api/events` shape and event payload schema (`src/lib/events/schema.ts`).
- Swap transport internals only, minimizing frontend churn.

## Migration plan (low-risk phases)

### Phase 1: Interface extraction (no behavior change)
1. Introduce `JobStore` interface and `EventBus` interface.
2. Keep existing memory-backed implementations as defaults.
3. Add contract tests around current behavior.

### Phase 2: Redis-backed job store
1. Implement `RedisJobStore`.
2. Dual-write in `ai-studio/generate` route (memory + redis).
3. Read-prefer Redis in `ai-studio/jobs`; fallback to memory.
4. Remove memory write path after confidence window.

### Phase 3: Distributed event bus
1. Implement `RedisEventBus` publish/subscribe.
2. Route `emitContinuumEvent` through interface.
3. Update `/api/events` to subscribe to distributed bus.
4. Add optional stream replay with bounded history.

### Phase 4: Hardening + observability
1. Add per-route timeout budgets and backpressure guards.
2. Add metrics:
   - publish->deliver latency
   - dropped events
   - replay served count
   - job-read miss rate
3. Add alerting for event delivery degradation.

## Effort vs. impact

1. **Phase 1**: Low effort, medium risk reduction (enables safe migration).
2. **Phase 2**: Medium effort, high consistency gain for AI Studio jobs.
3. **Phase 3**: Medium-high effort, very high real-time reliability gain.
4. **Phase 4**: Medium effort, high operational confidence and lower MTTR.

## Expected net gains after item 7 migration
- Near-elimination of cross-instance "missing job" and "missing event" failures.
- Fewer duplicate retries and less wasted server compute.
- More stable SSE behavior during autoscaling/cold starts/deploys.
- Better p95/p99 user-perceived reliability for AI and planner workflows.

---

## Alignment to requested principles
- `next-best-practices`: server/client boundary tightening, targeted dynamic imports, route-level optimization.
- `vercel-react-best-practices`: minimize initial JS, defer non-critical work, optimize hot interactions.
- `vercel-composition-patterns`: split monolith components into composable feature islands.
- `api-design-principles`: consistent route contracts and reliability semantics.
- `harden`: eliminate non-durable in-memory state for production multi-instance deployments.

