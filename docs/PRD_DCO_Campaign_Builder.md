# PRD: Continuum DCO Campaign Builder

Source of truth: this document. Linked from README and Linear project once created.

- Linear project: [DCO Campaign Builder](https://linear.app/continuum-ai/project/dco-campaign-builder-e2dca350493b)

Backend lives in a separate backend repo (Node.js + Fastify + Drizzle). This PRD specifies end-to-end contracts and acceptance criteria for both FE and BE.

---

## 1. Vision & Goals

The Continuum DCO Campaign Builder is a no-code, full-stack dynamic creative optimization system that lets marketers visually orchestrate campaigns using signals, triggers, and actions. Inspired by n8n, Zapier, and React Flow, the builder replaces rigid templates with a visual automation canvas to define dynamic behavior across campaigns, ad sets, and creatives.

Continuum unifies creative intelligence (Picnic templates), rules (Antonidas logic engine), and campaign management (Jaina layer) into a composable experience.

- Business goals
  - Decrease time-to-first-campaign to ≤ 30 minutes for new users
  - Improve editing latency to feel instant (≤ 200 ms perceived; ≤ 500 ms p95 server roundtrip for save)
  - Achieve ≥ 99.9% successful autosave operations without data loss
  - Support 1000+ nodes with smooth zoom/pan and editing

- Success signals
  - Teams can launch and iterate campaigns without developer involvement
  - All edits are versioned and recoverable; diffs are comprehensible
  - Guardrails prevent runaway automations and enforce policy compliance

---

## 2. Non-Functional Requirements (NFRs)

- Performance
  - Canvas: render and interact smoothly with 1000+ nodes (virtualization + batched movement updates)
  - Save: p50 ≤ 150 ms, p95 ≤ 500 ms per PATCH (server-side apply + persist)
  - Simulation: p95 ≤ 2s for sandbox runs on typical flows (≤ 150 nodes)
- Availability & Reliability
  - Autosave: ≥ 99.9% success; offline queue guarantees eventual sync
  - Version history: every edit is recoverable via patches and checkpoints
- Security & Compliance
  - RBAC: `viewer | operator | publisher | admin`
  - Audit logging: actor_id, IP, user_agent recorded for all mutating ops
  - PII minimization: audience identifiers stored as hashed keys
- Accessibility
  - WCAG 2.1 AA; full keyboard navigation; screen reader labels on nodes and connectors
- Maintainability
  - Strong typing (TypeScript) and Zod validation on every boundary
  - Server-first architecture with clear client/server demarcation

---

## 3. Domain Model & Hierarchy

Campaigns are hierarchical; each level inherits and may override attributes from its parent.

```
Campaign → Ad Set → Ad → Creative
```

### 3.1 Campaign (Top-level)

Required: `goal`, `optimization`

- id, name
- goal: Conversions | Traffic | Reach | Sales
- optimization: Lowest CPA | Highest ROAS | Max CTR
- schedule: { start, end, timezone }
- spend_cap: { amount, currency }
- policies: brand, geo, compliance settings
- labels/tags
- ad_sets[]

### 3.2 Ad Set (Middle-level)

Required: `audiences`, `budget`

- id, name
- audiences[]: custom | lookalike | remarketing
- budget: { type: daily | lifetime, amount, currency }
- placements: platforms and surfaces
- bidding: strategy or inheritance flag
- frequency_cap
- ads[]

### 3.3 Ad / Creative (Leaf)

- id, name
- creative_template_id
- variants[]: per ratio/locale/platform
- tracking: { UTMs, pixel_id, inheritance }
- status: draft | active | paused

### 3.4 Zod schema outlines (indicative)

```ts
// Non-executable outline to guide both FE and BE
const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  goal: z.enum(["Conversions","Traffic","Reach","Sales"]),
  optimization: z.enum(["Lowest CPA","Highest ROAS","Max CTR"]),
  schedule: z.object({ start: z.string(), end: z.string().nullable(), timezone: z.string() }),
  spend_cap: z.object({ amount: z.number().nonnegative(), currency: z.string().length(3) }).optional(),
  policies: z.object({ brand: z.string().optional(), geo: z.array(z.string()).optional(), compliance: z.any().optional() }).optional(),
  labels: z.array(z.string()).optional(),
  ad_sets: z.array(z.any()).default([])
});
```

---

## 4. DCO Logic Layer: Triggers, Actions, Monitors

### 4.1 Triggers

Trigger rules listen for metric deltas across time windows and scopes.

```ts
interface Trigger {
  id: string;
  scope: 'campaign' | 'adset' | 'ad';
  metric: 'CTR' | 'CPC' | 'CPA' | 'ROAS' | string;
  delta_type: 'percent' | 'absolute';
  direction: 'increase' | 'decrease';
  threshold: number; // e.g., 15 means ±15%
  window: { lookback: '1h' | '6h' | '24h' | '7d'; min_events?: number };
  baseline: 'previous_window' | 'moving_avg' | 'control_group';
  cooldown_minutes: number;
  max_fires_per_24h?: number;
  filters?: { audience_ids?: string[]; geo?: string[]; placement?: string[] };
}
```

### 4.2 Actions

```ts
interface Action {
  id: string;
  type:
    | 'swap_creative'
    | 'update_copy'
    | 'adjust_budget'
    | 'pause_entity'
    | 'route_audience'
    | 'change_optimization';
  params: Record<string, any>;
  scope: 'campaign' | 'adset' | 'ad';
  safety?: { min_runtime_mins?: number; rollback_on_breach?: MonitorRef };
}
```

### 4.3 Monitors (Guardrails)

```ts
interface MonitorRef { monitor_id: string }
```

- Metric thresholds (CTR, CPA, ROAS)
- Optional linked rollback actions
- Always executed before actions; breach halts or rolls back

### 4.4 Compatibility & Constraints

- Action-scope compatibility
  - Budget changes: campaign/adset only
  - Creative swaps: ad level only
  - Optimization changes: campaign/adset
- Cooldown windows prevent thrashing; max fires per 24h applied per trigger id + scope target
- Circular dependency detection across nodes to prevent loops

---

## 5. UX/UI & Design System

- Rendering model: Next.js App Router with Server Components by default; Client Components only for interactive canvas (React Flow) and forms
- UI Kit: Radix UI + shadcn/ui; Tailwind CSS utilities per `styleguide.md`
- Forms: React Hook Form + Zod for schema-driven validation (client + server)
- Color coding

| Layer         | Color   | Description                           |
| ------------- | ------- | ------------------------------------- |
| Campaign      | Indigo  | Overall structure & optimization goal |
| Ad Set        | Blue    | Audience + budget layer               |
| Ad / Creative | Green   | Actual content layer                  |
| Trigger       | Amber   | Logic initiating automation           |
| Action        | Violet  | Behavior modifier / response          |
| Monitor       | Fuchsia | Guardrail and validation node         |

- Canvas Layout
  - Left Sidebar: Palette + Campaign List + Search
  - Center Canvas: Node graph (signals → logic → actions)
  - Right Panel: Inspector + Creative Preview + Simulation controls

- Node Types (React Flow custom components)

| Node Type | Icon | Description                                      |
| --------- | ---- | ------------------------------------------------ |
| Signal    | 🌐   | Audience, weather, device, etc.                  |
| Logic     | 🔀   | If/else, thresholds, AND/OR combinations         |
| Action    | 🎯   | Dynamic creative, budget, or optimization change |
| Monitor   | 📈   | Guardrail enforcement and rollback               |

- Micro-patterns
  - Drag from Palette → Canvas
  - Snap-to-grid; smooth zoom/pan
  - Inspector auto-forms from Zod schemas via RHF
  - Hover edges → show metric deltas and window
  - Context menu → duplicate / wrap in guardrail / delete
  - MiniMap for navigation

---

## 6. Autosave & Server Sync

Design goals: instant feel (optimistic UI), no data loss (offline persistence), collaborative safety (versioned patches), auditability (event log).

### 6.1 Entities

| Entity       | Purpose                                          |
| ------------ | ------------------------------------------------ |
| Flow         | Full snapshot (nodes, edges, metadata)           |
| Patch        | Incremental diff, JSON Patch ops applied to Flow |
| Checkpoint   | Versioned snapshot for fast reload               |
| Lock         | Optional for edit contention prevention          |

### 6.2 Strategy (Optimistic + Debounced Patch)

1. Every edit emits an op into a local buffer
2. Debounce (300–600 ms) batches ops → `PATCH /flows/:id`
3. Server validates via Zod; returns `{version, etag}`
4. Client updates base version; clears buffer
5. On HTTP 412 (version mismatch), pull latest, rebase pending ops, retry
6. Offline fallback: queue in IndexedDB with idempotency keys

### 6.3 API Contract

```http
PATCH /flows/:id
If-Match: <etag>
Idempotency-Key: <uuid>
{
  "base_version": number,
  "ops": JsonPatch[]
}
```

Response

```json
{
  "version": 42,
  "etag": "abc123",
  "warnings": [],
  "errors": []
}
```

---

## 7. Realtime Collaboration (v1.1+)

- WebSocket rooms per `flow:<id>`
- Events: `flow.join`, `flow.leave`, `flow.patched` (ops), `presence.update`
- Presence state in Redis (transient)
- Upgrade path: Y.js doc syncing (y-websocket/Liveblocks) and awareness protocol

---

## 8. Backend Architecture (separate repo)

- Fastify (typed routes) + Drizzle ORM (Postgres)
- Event-sourced data model: `flows`, `patches`, `checkpoints`, `memberships`, `audits`
- Redis for idempotency keys, pub/sub, presence
- BullMQ workers for compile, simulate, snapshot, actions
- Observability: pino logs, OpenTelemetry tracing, Prometheus metrics

Version & ETag
- ETag = sha256(flowId + version + hash(snapshot))
- Each PATCH increments `version`; store patch and updated snapshot in a transaction

---

## 9. Data Model & DB

- `flows`
  - `id` (uuid), `version` (int), `etag` (text), `snapshot` (jsonb), `updated_at`
- `patches`
  - `id` (uuid), `flow_id` (fk), `version` (int), `ops` (jsonb), `actor_id`, `ip`, `user_agent`, `created_at`
- `checkpoints`
  - `id` (uuid), `flow_id` (fk), `version` (int), `snapshot` (jsonb), `created_at`
- `memberships`
  - `flow_id`, `user_id`, `role`
- `audits`
  - append-only event log of all administrative and sensitive changes

Indices: (`flow_id`, `version`), GIN on `snapshot` for targeted queries as needed.

---

## 10. Security & RBAC

- Roles: `viewer`, `editor`, `publisher`, `admin`
- Route guards (BE) enforce role on operations
- Field-level guards (FE+BE) restrict budget/optimization mutations to `publisher+`
- Audit logs for all mutating routes with actor metadata
- PII minimization: hash or tokenize audience identifiers

---

## 11. Performance & Scalability

- Render virtualization for node lists; coalesced movement updates
- Web workers for patch diff computation and heavy transforms
- Lazy loading of creative thumbnails
- Server snapshots in Postgres JSONB with Redis cache of hot flows
- IndexedDB persistence for offline recovery

---

## 12. Simulation & Preview

Purpose: test logic in sandbox before activation.

UI
- Simulation panel to adjust signals, time window, audience weights
- Playhead animation highlights firing branches
- Creative preview grid per ratio/locale
- KPI projection overlays vs baseline

API

```http
POST /flows/:id/simulate
{
  "signals": [],
  "timeWindow": { "start": "ISO", "end": "ISO" }
}
→ { "path": [], "variant": { /* creative */ }, "kpis": { /* metrics */ } }
```

---

## 13. Acceptance Criteria

Functional
- Create/edit a campaign with required fields validated (goal, optimization)
- Add Ad Sets (≥1 audience, valid budget) and Ads/Creatives
- Add Trigger/Action/Monitor nodes and connect them with validation
- Autosave buffers and persists edits; on refresh, state is recovered
- Restore to a prior `version` via UI and API

Reliability
- Offline editing queues and replays changes; no data loss on reconnect
- Server returns 412 on version mismatch; client rebases and retries automatically

Performance
- Canvas interactions remain smooth with 1000 nodes; p95 save ≤ 500 ms

Security
- RBAC enforced; restricted fields gated to `publisher+`
- Audit events recorded for all mutations

Accessibility
- Keyboard nav across palette, canvas nodes, and inspector
- Screen reader labels for node types and connections

---

## 14. Risks & Mitigations

- Concurrency conflicts → ETag + version + rebase; idempotency keys
- Runaway automations → cooldowns, max fires, monitors-before-actions, rollback hooks
- Schema drift → Zod as single source of truth; typed contracts shared FE/BE
- External instability (APIs) → boundary wrappers, retries with backoff, circuit breakers for actions

---

## 15. Phased Delivery & Milestones

- v1 (MVP)
  - Canvas with node types, inspector, palette
  - Autosave + JSON Patch + versioning + checkpoints
  - Base RBAC and audit logging
- v1.1
  - Realtime presence and flow.patched broadcasts
  - Simulation panel (basic)
- v1.2
  - KPI overlays, guardrail rollback wiring, advanced simulations

---

## 16. Linear Breakdown (post-PRD)

After approval, create a Linear project and:
- Add epics aligned to sections 3–12 (Domain, Logic, UX, Autosave, Realtime, Backend, Data, Security, Performance, Simulation)
- Split into issues with clear acceptance criteria and estimates
- Link relevant docs and PRDs; cross-link FE and BE tasks

---

## References

- `AGENTS.md` (Clean Code, SSR-first, RHF+Zod, error handling)
- `styleguide.md` (UI/theming)
- Existing docs in `docs/` (auth, realtime patterns)
