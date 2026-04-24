# Jaina Frontend Integration Contract

**Source of truth:** `app/agents-ts/Jaina/src/`  
**Last updated:** 2026-04-23  
**Schema version:** 2 (V2 block architecture)

---

## Table of Contents

1. [HTTP API Routes](#1-http-api-routes)
2. [Authentication](#2-authentication)
3. [NDJSON Streaming Protocol](#3-ndjson-streaming-protocol)
4. [Streaming Event Catalog](#4-streaming-event-catalog)
5. [Response Result Types](#5-response-result-types)
6. [How Charts Are Produced](#6-how-charts-are-produced)
7. [V2 Block Architecture (Primary Report Format)](#7-v2-block-architecture-primary-report-format)
8. [Chart Block — Deep Dive](#8-chart-block--deep-dive)
9. [V1 GraphSpec (Legacy — Do Not Use for New UI)](#9-v1-graphspec-legacy--do-not-use-for-new-ui)
10. [Metric Grid Block](#10-metric-grid-block)
11. [Supporting Types](#11-supporting-types)
12. [Plan Approval Flow](#12-plan-approval-flow)
13. [Clarification Flow](#13-clarification-flow)
14. [Background Run & Event Polling](#14-background-run--event-polling)
15. [Report Jobs API](#15-report-jobs-api)
16. [Session Management](#16-session-management)
17. [Date Presets](#17-date-presets)

---

## 1. HTTP API Routes

All routes mount under `/api/agents/jaina`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat/stream` | Primary chat endpoint — NDJSON stream |
| `POST` | `/chat/background` | Fire-and-forget background run |
| `POST` | `/sessions` | Create conversation session |
| `GET` | `/sessions` | List sessions for a brand/account |
| `GET` | `/sessions/:session_id/messages` | List stored messages |
| `DELETE` | `/sessions/:session_id` | Delete session and all runs |
| `GET` | `/sessions/:session_id/runs` | List runs in a session |
| `GET` | `/runs/:run_id` | Get a single run record |
| `GET` | `/runs/:run_id/events` | Poll stored run events (background runs) |
| `POST` | `/report-artifacts/jobs` | Create a PDF report job |
| `GET` | `/report-artifacts/jobs/:job_id` | Get report job status |
| `GET` | `/report-artifacts/jobs/:job_id/file-url` | Get signed S3 URL for completed report |

---

## 2. Authentication

All routes require a Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

The server extracts `userEmail` from the token. A 401 is returned if the token is missing or invalid.

---

## 3. NDJSON Streaming Protocol

**Endpoint:** `POST /api/agents/jaina/chat/stream`

### Request Body

```typescript
{
  query: string;                    // required, min 1 char
  userId?: string;                  // optional
  include_thoughts?: boolean;       // stream internal reasoning (default: false)
  clarification?: {
    id: string;                     // ID of the pending clarification being resolved
  };
  plan_action?: {
    type: "approve" | "refine" | "abandon";
    plan_id: string;
    edits?: string;                 // refinement instructions (for type="refine")
  };
  context: {
    adAccountId: string;            // required — Meta ad account ID
    brandId: string;                // required — Supabase brand UUID
    sessionId?: string;             // omit to start a new session
  };
}
```

### Response

`Content-Type: application/x-ndjson`

Each line is a JSON object terminated by `\n`. Parse with `JSON.parse()` per line.

```
{"type":"response.created","data":{...}}\n
{"type":"tool.call","data":{...}}\n
{"type":"response.output_text.delta","data":{...}}\n
...
{"type":"response.done","data":{...}}\n
```

The stream always ends with either `response.done` or `error`.

---

## 4. Streaming Event Catalog

### Lifecycle Events

#### `response.created`
Stream has started.
```typescript
{
  type: "response.created";
  data: {
    id: string;           // response ID
    object: "realtime.response";
    status: "in_progress";
    status_details: null;
    output: [];
  };
}
```

#### `response.output_item.added`
A new output item (message) has been opened.
```typescript
{
  type: "response.output_item.added";
  data: {
    item: {
      id: string;
      object: "realtime.item";
      type: "message";
      status: "in_progress";
      role: "assistant";
      content: [];
    };
  };
}
```

#### `response.content_part.added`
A new content part (text or json) has been opened within an item.
```typescript
{
  type: "response.content_part.added";
  data: {
    item_id: string;
    part: {
      id: string;
      object: "realtime.content_part";
      type: "text" | "json";
      text?: "";      // if type="text"
      json?: "";      // if type="json"
    };
  };
}
```

#### `response.output_text.delta`
Incremental text chunk for a streaming text response.
```typescript
{
  type: "response.output_text.delta";
  data: {
    item_id: string;
    part_id: string;
    delta: string;    // append to buffer
  };
}
```

#### `response.plan.delta`
Incremental text chunk for a plan being streamed before user approval.
```typescript
{
  type: "response.plan.delta";
  data: {
    item_id: string;
    part_id: string;
    delta: string;
  };
}
```

#### `response.output_json.delta`
Incremental JSON delta (structured report streaming). Accumulate and parse when done.
```typescript
{
  type: "response.output_json.delta";
  data: {
    item_id: string;
    part_id: string;
    delta: string;    // JSON string fragment — accumulate all deltas then parse
  };
}
```

#### `response.content_part.done`
Content part streaming complete.
```typescript
{
  type: "response.content_part.done";
  data: { item_id: string; part_id: string; };
}
```

#### `response.output_item.done`
Output item complete.
```typescript
{
  type: "response.output_item.done";
  data: { item_id: string; };
}
```

#### `response.done`
Stream complete. The full structured result is delivered via the final result event (see §5) not here.
```typescript
{
  type: "response.done";
  data: {
    id: string;
    object: "realtime.response";
    status: "completed";
    status_details: null;
    output: [];
  };
}
```

#### `error`
Unrecoverable error. Stream terminates.
```typescript
{
  type: "error";
  data: {
    type: string;     // error code
    code: string;
    message: string;
    param: null;
  };
}
```

---

### Observability Events (read-only, for debug panels / activity feeds)

#### `tool.call`
```typescript
{
  type: "tool.call";
  data: {
    id: string;
    name: string;                        // tool name
    args: Record<string, unknown>;
    metadata: Record<string, unknown>;
    correlation_id?: string;
    parent_correlation_id?: string | null;
    agent_id?: string | null;
    parent_agent_id?: string | null;
    display_name?: string | null;
    agent_name?: string | null;
  };
}
```

#### `tool.result`
```typescript
{
  type: "tool.result";
  data: {
    id: string;
    name: string;
    ok: boolean;
    cached: boolean;
    shared?: boolean;
    duration_ms?: number;
    output?: unknown;
    error?: string;
    correlation_id?: string;
    parent_correlation_id?: string | null;
    agent_id?: string | null;
    parent_agent_id?: string | null;
    display_name?: string | null;
    agent_name?: string | null;
  };
}
```

#### `agent.spawn`
L2/L3 sub-agent spawned.
```typescript
{
  type: "agent.spawn";
  data: {
    agent_id: string;
    task_id: string;
    task_description: string;
    started_at: string;          // ISO timestamp
    parent_agent_id?: string | null;
    display_name?: string | null;
    name?: string | null;
  };
}
```

#### `agent.complete`
```typescript
{
  type: "agent.complete";
  data: {
    agent_id: string;
    task_id: string;
    status: "completed" | "failed" | "partial";
    duration_ms: number;
    error?: string;
    display_name?: string | null;
    name?: string | null;
  };
}
```

#### `handoff.start` / `handoff.complete`
```typescript
{
  type: "handoff.start" | "handoff.complete";
  data: Record<string, unknown>;
}
```

#### `agent.envelope`
Low-level ADK envelope (for trace/debug panels only).
```typescript
{
  type: "agent.envelope";
  data: {
    version: "1";
    kind: "tool" | "handoff" | "agent";
    event: "start" | "complete" | "error";
    correlation_id: string;
    parent_correlation_id: string | null;
    session_id: string | null;
    scope: string | null;
    timestamp: string;
    payload: Record<string, unknown>;
  };
}
```

#### `state.delta`
Shared state has been updated.
```typescript
{
  type: "state.delta";
  data: {
    source: string;
    delta: Record<string, unknown>;
  };
}
```

#### `response.progress`
Progress update during long-running operations.
```typescript
{
  type: "response.progress";
  data: {
    stage: string;
    [key: string]: unknown;
  };
}
```

#### `response.objectives`
Full objectives list emitted at planning time.
```typescript
{
  type: "response.objectives";
  data: Record<string, unknown>;
}
```

#### `response.objective.updated`
A single objective's status has changed.
```typescript
{
  type: "response.objective.updated";
  data: Record<string, unknown>;  // ExecutionObjective shape
}
```

---

### Interaction Events

#### `hitl.paused` — Clarification Requested
The agent needs clarification before proceeding.
```typescript
{
  type: "hitl.paused";
  data: {
    id: string;
    question: string;
    source_scope: string | null;
    source_agent: string | null;
    requested_at: string;           // ISO timestamp
  };
}
```
**Action:** Prompt the user, then re-submit with `clarification: { id }` in the next request.

#### `response.plan_ready` — Plan Awaiting Approval
```typescript
{
  type: "response.plan_ready";
  data: {
    plan_id: string;
    intent: "quick_lookup" | "analysis" | "canvas";
    date_preset: MetaDatePreset;
    objectives: Array<{
      objective_id: string;
      scope: "account" | "campaign" | "adset" | "ad" | "creative";
      task: string;
      description: string;
      depends_on: string[];
      hints: Record<string, unknown>;
      success_criteria: string;
    }>;
  };
}
```
**Action:** Show plan to user. Re-submit with `plan_action: { type, plan_id, edits? }`.

---

### Canvas Events (canvas mode only)

#### `canvas.context.loaded`
```typescript
{ type: "canvas.context.loaded"; data: Record<string, unknown>; }
```

#### `canvas.actions.proposed`
```typescript
{ type: "canvas.actions.proposed"; data: Record<string, unknown>; }
```

---

## 5. Response Result Types

At the end of a successful run the orchestrator emits a typed result. This arrives either:
- As the accumulated `response.output_json.delta` payload (parse when `response.content_part.done` fires), or
- Via the background run events API (see §13)

The discriminant is `result.type`:

```typescript
type JainaResult =
  | { type: "text"; content: string }
  | { type: "clarification_request"; clarification: ClarificationRequest }
  | { type: "plan_ready"; plan: ObjectivePlan }
  | { type: "checkpoint_report"; report: FrontendCheckpointReport }   // PRIMARY
  | { type: "report_assembly"; report: ReportAssembly; htmlPreview: string };
```

**The primary result type is `checkpoint_report`.** `report_assembly` is a legacy PDF-style report used only by the report jobs worker. `text` is emitted for simple conversational answers.

---

## 6. How Charts Are Produced

Charts are **guaranteed to appear in the normal `checkpoint_report` response** when the right tool data is present. They are not a separate mode or endpoint. `blocks[]` on `FrontendCheckpointReport` is where all charts land inline.

### Two Production Pathways

#### Pathway 1: Data-Driven (Deterministic) — `chartEvaluator.ts`

After all tool calls finish, `evaluateDataBlocks(context)` inspects `factual_tool_memory` and `runCache` and constructs chart/table blocks directly from tool results — no LLM involved. These are called **pre-built blocks**.

| Tool called | Block type produced | Chart type | Trigger condition |
|---|---|---|---|
| `get_trend_metrics` | `chart` | `line` | `trends[]` has ≥ 3 rows |
| `get_key_metrics` | `chart` | `line` | result carries a `trends[]` array |
| `get_key_metrics` (multi-entity) | `chart` | `bar` | 2+ entity comparison |
| `get_breakdown_insights` | `chart` | `doughnut` | breakdown dimension present |
| `get_campaigns` / `get_ad_sets` | `data_table` | — | ≥ 2 entities returned |
| `get_key_metrics` | `metric_grid` | — | single snapshot, no trend |
| `get_key_metrics` (comparison) | `comparison` | — | comparison period in result |

Spend/efficiency metrics split into separate line charts to keep units coherent (spend+ROAS on one chart, impressions+clicks on another, CTR+CPC on a third).

#### Pathway 2: LLM-Synthesized — Synthesis Agent

The synthesis agent receives `pre_built_blocks` (from Pathway 1) plus `graph_hints` per objective. It may produce additional `graphs[]` in its JSON output using the V1 GraphSpec format. These are converted to V2 `ChartBlock` via `convertGraphSpecToChart()`.

`graph_hint` per objective controls LLM chart generation:
- `"none"` — LLM is not asked to produce charts for this objective
- `"if_warranted"` — LLM decides based on data (default)
- `"requested"` — user explicitly asked for a chart

#### Merge and Deduplication

Pre-built blocks take priority. Both sets are fingerprinted as `category:scope:title` and deduped. Final `blocks[]` is sorted: `primary` → `secondary` → `supplementary`.

#### Post-Validation (Data Thresholds)

Charts are silently dropped if data is insufficient:
- Line charts with < 3 data points are removed
- Bar charts with < 2 data points are removed
- `_meta.has_charts` reflects whether any charts survive

**Implication for frontend:** always check `_meta.has_charts` before rendering a "chart available" indicator. A response with only 1 day of trend data will have no charts even if the query asked for a graph.

### Chart Colors

Pre-built charts use this color palette in order:

```typescript
const CHART_COLORS = [
  "#2563eb", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#6366f1",
];
```

For shadcn charts, override with CSS variables: `hsl(var(--chart-1))` through `hsl(var(--chart-10))`.

### Pie/Doughnut Special Case

Pie and doughnut chart data rows include a `fill` key:

```typescript
// Each row in data[] looks like:
{ label: "18-24", spend: 4200, fill: "var(--color-18_24)" }
```

The `fill` key uses the sanitized series key: `label.toLowerCase().replace(/[^a-z0-9_]/g, "_")`.

---

## 7. V2 Block Architecture (Primary Report Format)


`FrontendCheckpointReport` is what the frontend renders for `checkpoint_report` results. It is `CheckpointReport` with `reasoning_trace` stripped.

```typescript
type FrontendCheckpointReport = {
  language: string;                          // BCP-47 language code
  executive_summary: string;                 // 1-2 paragraph lead
  blocks: CheckpointBlockV2[];               // ordered render list
  media_map: MediaMap;                       // entity_id → MediaPreview
  follow_up_questions: string[];             // suggested next queries
  handoff_trace: HandoffTraceEntry[];        // agent delegation trace
  execution_objectives: ExecutionObjective[];// objective execution record
  cached_sources: string[];                  // tool cache keys used
  _meta?: CheckpointMeta;                   // rendering hints
};

type CheckpointMeta = {
  schema_version: "2";
  block_count: number;
  has_charts: boolean;
  has_media: boolean;
  has_citations: boolean;
  primary_scope: string;
};
```

### Block Discriminated Union

```typescript
type CheckpointBlockV2 =
  | NarrativeBlock
  | MetricGridBlock
  | ChartBlock
  | DataTableBlock
  | InsightListBlock
  | ComparisonBlock;
```

Discriminant field: `block.category`

```typescript
type BlockCategory =
  | "narrative"
  | "metric_grid"
  | "chart"
  | "data_table"
  | "insight_list"
  | "comparison";
```

All blocks share a base:

```typescript
type BlockBase = {
  block_id: string;
  category: BlockCategory;
  scope: string;                // "account" | "campaign" | campaign_id | etc.
  title: string;
  priority: "primary" | "secondary" | "supplementary";
};
```

---

## 8. Chart Block — Deep Dive

**This is the canonical charting format for new UI.** Uses Recharts v3 / shadcn chart primitives.

```typescript
type ChartBlock = BlockBase & {
  category: "chart";
  chart_type: ChartType;
  data: Array<Record<string, string | number>>;  // row-oriented
  chart_config: Record<string, ChartSeriesConfig>;
  category_key: string;                           // which data key is the x-axis/category
  value_key: string | null;                       // for single-series charts
  x_axis_label: string | null;
  y_axis_label: string | null;
  value_format: "number" | "currency" | "percent" | "multiplier";
  annotation: string | null;
  description: string | null;
};

type ChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "stacked_bar"
  | "radar";

type ChartSeriesConfig = {
  label: string;
  color: string;   // CSS color string (e.g. "hsl(var(--chart-1))")
};
```

### Data Shape Example

```typescript
// chart_type: "bar", category_key: "week", chart_config keys: "spend", "roas"
data = [
  { week: "Apr 7", spend: 4200, roas: 3.1 },
  { week: "Apr 14", spend: 5800, roas: 2.8 },
  { week: "Apr 21", spend: 6100, roas: 3.4 },
];
chart_config = {
  spend:  { label: "Spend ($)",  color: "hsl(var(--chart-1))" },
  roas:   { label: "ROAS",       color: "hsl(var(--chart-2))" },
};
category_key = "week";
value_key = null;         // null → multi-series, render all keys in chart_config
```

### Rendering Rules

| `chart_type` | Recharts component | Notes |
|---|---|---|
| `bar` | `BarChart` | Use `category_key` for XAxis |
| `stacked_bar` | `BarChart` with `stackId` | All series stacked |
| `line` | `LineChart` | |
| `area` | `AreaChart` | |
| `pie` | `PieChart` | `value_key` holds the value field |
| `doughnut` | `PieChart` with inner radius | |
| `radar` | `RadarChart` | |

**Multi-series:** When `value_key` is `null`, render one `<Bar>` / `<Line>` / `<Area>` per key in `chart_config`.  
**Single-series:** When `value_key` is set, render only that key.

### Value Format

```typescript
// Apply to axis tick formatters and tooltips
switch (value_format) {
  case "currency":    return `$${value.toLocaleString()}`;
  case "percent":     return `${value.toFixed(1)}%`;
  case "multiplier":  return `${value.toFixed(2)}x`;
  default:            return value.toLocaleString();
}
```

---

## 9. V1 GraphSpec (Legacy — Do Not Use for New UI)

Used inside `SpecialistReport.graphs[]` (internal agent reports). **Not emitted in `FrontendCheckpointReport`.**  
Documented here for completeness only.

```typescript
type GraphSpec = {
  title: string;
  description: string | null;
  graph_type: "line" | "bar" | "stacked_bar" | "area" | "pie" | "doughnut";
  graph_intent: "time_series" | "comparison" | "composition" | "distribution" | "funnel";
  x_axis_type: "time" | "category" | "numeric";
  data_format: "series" | "chartjs";
  frontend_parser: "series_v1" | "chartjs_v1";
  labels: string[];
  series: DataSeries[];    // populated when data_format="series"
  datasets: GraphDataset[]; // populated when data_format="chartjs"
  cached_sources: string[];
};

// series_v1 format
type DataSeries = {
  name: string;
  values: number[];        // length must match labels.length
  cached: boolean;
  unit: string | null;
  derived_metrics?: unknown;
};

// chartjs_v1 format (Chart.js compatible)
type GraphDataset = {
  label: string;
  data: number[];          // length must match labels.length
  backgroundColor?: string;
  borderColor?: string;
};
```

---

## 10. Metric Grid Block

```typescript
type MetricGridBlock = BlockBase & {
  category: "metric_grid";
  metrics: MetricItem[];   // min 1
};

type MetricItem = {
  label: string;
  value: number | string;
  unit: string | null;
  format: "number" | "currency" | "percent" | "multiplier";
  change: number | null;           // delta vs comparison period
  change_direction: "up" | "down" | "flat" | null;
  severity: "positive" | "neutral" | "watch" | "risk";
};
```

---

## 11. Supporting Types

### NarrativeBlock
```typescript
type NarrativeBlock = BlockBase & {
  category: "narrative";
  body: string;
  highlights: InsightItem[];
  citations: Citation[];
};
```

### DataTableBlock
```typescript
type DataTableBlock = BlockBase & {
  category: "data_table";
  columns: TableColumn[];
  rows: Array<Record<string, string | number | null>>;
  notes: string | null;
};

type TableColumn = {
  key: string;
  label: string;
  format: "text" | "number" | "currency" | "percent" | "multiplier";
  align: "left" | "center" | "right";
};
```

### InsightListBlock
```typescript
type InsightListBlock = BlockBase & {
  category: "insight_list";
  items: InsightListItem[];
  citations: Citation[];
};

type InsightListItem = {
  item_type: "insight" | "action" | "recommendation" | "question";
  title: string;
  summary: string;
  rationale: string;
  impact: string;
  severity: "positive" | "neutral" | "watch" | "risk";
  priority: string;   // e.g. "now", "soon", "later"
  cite_ids: string[]; // references into citations[]
};
```

### ComparisonBlock
```typescript
type ComparisonBlock = BlockBase & {
  category: "comparison";
  before_label: string;
  after_label: string;
  pairs: ComparisonPair[];
  citations: Citation[];
};

type ComparisonPair = {
  label: string;
  before: number | string;
  after: number | string;
  unit: string | null;
  format: "number" | "currency" | "percent" | "multiplier";
  change: number | null;
  change_direction: "up" | "down" | "flat" | null;
  severity: "positive" | "neutral" | "watch" | "risk";
  cite_ids: string[];
};
```

### Citation
```typescript
type Citation = {
  id: string;
  tool: string;        // tool name that produced this data
  cache_key: string | null;
  label: string;
};
```

### MediaMap
```typescript
type MediaMap = Record<string, MediaPreview>;

type MediaPreview = {
  image_url: string | null;
  thumbnail_url: string | null;
  entity_type: "ad" | "creative";
  entity_id: string;
};
```

### InsightItem (shared)
```typescript
type InsightItem = {
  category: string;
  title?: string;
  text: string;
  impact: string | null;
  severity: "positive" | "neutral" | "watch" | "risk";
  confidence: string | null;
  evidence: string[];
};
```

### ExecutionObjective
```typescript
type ExecutionObjective = {
  id: string;
  objective_key: string | null;
  title: string;
  description: string | null;
  status: "pending" | "in_progress" | "blocked" | "deferred" | "partial" | "completed" | "failed" | "cancelled";
  scope: string | null;
  reason_code: string | null;
  details: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};
```

### ClarificationRequest
```typescript
type ClarificationRequest = {
  id: string;
  question: string;
  source_scope: string | null;
  source_agent: string | null;
  requested_at: string;
};
```

---

## 12. Plan Approval Flow

```
Frontend                    Jaina
   │                           │
   │  POST /chat/stream        │
   │  { query: "..." }  ──────►│
   │                           │  (plan generated)
   │◄── response.plan.delta ───│  (streamed plan text)
   │◄── response.plan_ready ───│  { plan_id, objectives[] }
   │◄── response.done ─────────│
   │                           │
   │  [Show plan to user]      │
   │                           │
   │  POST /chat/stream        │
   │  { plan_action: {         │
   │      type: "approve",     │
   │      plan_id: "..."       │
   │    } }             ──────►│
   │                           │  (executes plan)
   │◄── (checkpoint_report) ───│
```

**Refine example:**
```typescript
plan_action: {
  type: "refine",
  plan_id: "plan_abc123",
  edits: "Also include adset-level breakdown for Campaign X"
}
```

---

## 13. Clarification Flow

```
Frontend                    Jaina
   │                           │
   │  POST /chat/stream        │
   │  { query: "..." }  ──────►│
   │                           │  (needs clarification)
   │◄── hitl.paused ───────────│  { id, question }
   │◄── response.done ─────────│
   │                           │
   │  [Show question to user]  │
   │                           │
   │  POST /chat/stream        │
   │  { query: "user answer",  │
   │    clarification: {       │
   │      id: "clf_abc123"     │
   │    } }             ──────►│
   │                           │  (continues with context)
   │◄── (result) ──────────────│
```

---

## 14. Background Run & Event Polling

Use `POST /chat/background` with the same body as `/chat/stream`. Returns immediately:

```typescript
{ run_id: string; session_id: string; status: "queued" }
```

Poll for events:

```
GET /runs/:run_id/events?after_id=<last_seen_id>&limit=100
```

Each event record:
```typescript
{
  id: number;               // monotonic, use as after_id cursor
  run_id: string;
  event_type: string;       // matches stream event type catalog
  payload: Record<string, unknown>;
  created_at: string;
}
```

Poll until you see an event with `event_type === "response.done"` or `"error"`.

---

## 15. Report Jobs API

For generating downloadable PDF-style reports.

### Create Job
```
POST /report-artifacts/jobs
```
```typescript
{
  brand_id: string;
  ad_account_id: string;
  campaign_ids?: string[];
  campaign_targets?: Array<{
    campaign_id: string;
    ad_set_ids?: string[];
  }>;
  directionality?: string;
  artifact_grounding: Record<string, unknown>;
}
```

**Response:**
```typescript
{ job_id: string; status: "queued" | "running" | "completed" | "failed" }
```

### Get Job Status
```
GET /report-artifacts/jobs/:job_id
```
Returns job record with `status`, `created_at`, `completed_at`, `error`.

### Get Download URL
```
GET /report-artifacts/jobs/:job_id/file-url?ttl_seconds=900
```
Returns:
```typescript
{ url: string; expires_at: string }
```
`ttl_seconds` range: 60–86400. Default: 900.

---

## 16. Session Management

### List Sessions
```
GET /sessions?brand_id=<id>&ad_account_id=<id>&limit=20
```

### Create Session
```
POST /sessions
{ context: { adAccountId, brandId, sessionId? } }
```

### List Messages
```
GET /sessions/:session_id/messages?limit=150
```

Returns stored `ConversationHistoryMessage[]`:
```typescript
type ConversationHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};
```

---

## 17. Date Presets

Valid values for `date_preset` fields:

```typescript
type MetaDatePreset =
  | "today"
  | "yesterday"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "maximum"
  | "data_maximum"
  | "last_3d"
  | "last_7d"
  | "last_14d"
  | "last_28d"
  | "last_30d"
  | "last_90d"
  | "last_week_mon_sun"
  | "last_week_sun_sat"
  | "last_quarter"
  | "last_year"
  | "this_week_mon_today"
  | "this_week_sun_today"
  | "this_year";
```

**Note:** `maximum`, `data_maximum`, `last_quarter`, `last_year`, `this_quarter`, `this_year` are automatically clamped server-side to a 30-day window to avoid Meta API `#3018` errors. The frontend can display the user's requested preset label, but data will reflect up to 30 days.

---

## Appendix: Severity Color Mapping

```typescript
const SEVERITY_COLORS = {
  positive: "text-green-600",
  neutral:  "text-gray-600",
  watch:    "text-yellow-600",
  risk:     "text-red-600",
} as const;
```

## Appendix: Block Render Order

The `blocks` array is already in the intended render order. The `priority` field can be used for progressive disclosure:

- `"primary"` — always visible
- `"secondary"` — visible by default
- `"supplementary"` — collapsible / "show more"
