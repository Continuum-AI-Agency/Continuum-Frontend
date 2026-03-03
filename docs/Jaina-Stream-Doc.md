# Jaina HTTP Reporting Contract (NDJSON)

This document defines the strict reporting contract for:

- `POST /api/agents/jaina/chat/stream`

Scope:

- HTTP streaming only (no WebSocket behavior).
- Reporting outputs only (`checkpoint_report`, `report_assembly`, and text fallback path).

Transport:

- NDJSON (`Content-Type: application/x-ndjson`)
- Each line is one JSON event:

```json
{ "type": "event.name", "data": { "...": "..." } }
```

## Request Contract

```json
{
  "query": "How did our creatives perform last week?",
  "canvas": false,
  "context": {
    "adAccountId": "act_123",
    "brandId": "brand_456",
    "sessionId": "conv_7f6b2f8b",
    "canvas": false,
    "campaignCanvas": null
  }
}
```

Rules:

- `query` is required.
- `context.adAccountId` is required.
- `context.brandId` is required.
- `context.sessionId` is optional but recommended for memory continuity across turns.

## Event Envelope

```ts
type StreamEvent = {
  type: string;
  data?: Record<string, unknown>;
};
```

## Reporting Event Sequence

The server always starts with:

1. `response.created`
2. `response.output_item.added`

Then emits interleaved progress/telemetry events while generating:

- `response.progress`
- `tool.batch`
- `state.delta`
- `handoff.start`
- `handoff.complete`
- `agent.envelope`
- `response.plan.delta` (HITL plans)
- `hitl.paused` (HITL pause)
- `canvas.context.loaded` / `canvas.actions.proposed` (canvas flows)

Then final content events:

- `response.content_part.added` (type `json` for reports, `text` for text mode)
- one of:
  - `response.checkpoint_report`
  - `response.report_assembly`
  - `response.output_text.delta` (text fallback, chunked)
- `response.content_part.done`
- `response.output_item.done`
- `response.done`

On failure:

- `error`

## Event Types and Schemas

### Lifecycle Events

```ts
type ResponseCreatedEvent = {
  type: "response.created";
  data: {
    id: string;
    object: "realtime.response";
    status: "in_progress";
    status_details: null;
    output: unknown[];
  };
};

type ResponseOutputItemAddedEvent = {
  type: "response.output_item.added";
  data: {
    item: {
      id: string;
      object: "realtime.item";
      type: "message";
      status: "in_progress";
      role: "assistant";
      content: unknown[];
    };
  };
};

type ResponseContentPartAddedEvent = {
  type: "response.content_part.added";
  data: {
    item_id: string;
    part: {
      id: string;
      object: "realtime.content_part";
      type: "json" | "text";
      json?: string;
      text?: string;
    };
  };
};

type ResponseContentPartDoneEvent = {
  type: "response.content_part.done";
  data: { item_id: string; part_id: string };
};

type ResponseOutputItemDoneEvent = {
  type: "response.output_item.done";
  data: { item_id: string };
};

type ResponseDoneEvent = {
  type: "response.done";
  data: {
    id: string;
    object: "realtime.response";
    status: "completed";
    status_details: null;
    output: unknown[];
  };
};
```

### Progress Events

```ts
type ResponseProgressEvent = {
  type: "response.progress";
  data: {
    stage: string;
    [key: string]: unknown;
  };
};
```

Known stage values:

- `prefetch_start`
- `prefetch_complete`
- `working_memory_ready`
- `quick_path_start`
- `quick_path_complete`
- `canvas_start`
- `canvas_complete`
- `router_start`
- `router_complete`
- `specialist_wave_start`
- `specialist_wave_complete`
- `handoff_start`
- `handoff_complete`
- `synthesis_start`
- `synthesis_complete`
- `assembly_start`
- `assembly_complete`

Timing-emitted stage values (`duration_ms` present):

- `quick_path_prefetch`
- `quick_path_fallback`
- `canvas`
- `router`
- `specialists`
- `synthesis`

Examples:

```json
{ "type": "response.progress", "data": { "stage": "prefetch_start", "target": "active_campaigns" } }
{ "type": "response.progress", "data": { "stage": "router", "duration_ms": 241 } }
```

Note: clients should treat stage values as extensible.

### Tool Events (coalesced)

The HTTP transport coalesces tool events into batches:

```ts
type ToolCallEventData = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  metadata: Record<string, unknown>;
  correlation_id?: string;
  parent_correlation_id?: string | null;
};

type ToolResultEventData = {
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
};

type ToolBatchEvent = {
  type: "tool.batch";
  data: {
    calls: ToolCallEventData[];
    results: ToolResultEventData[];
  };
};
```

### Handoff Events

```ts
type HandoffStartEvent = {
  type: "handoff.start";
  data: {
    correlation_id: string;
    from_scope: string | null;
    to_scope: string;
    objective: string | null;
    entity_id: string | null;
  };
};

type HandoffCompleteEvent = {
  type: "handoff.complete";
  data: {
    correlation_id: string;
    status: "completed" | "failed";
    duration_ms: number;
    error: string | null;
    from_scope: string | null;
    to_scope: string;
    objective: string | null;
    entity_id: string | null;
  };
};
```

### Agent Envelope Events

```ts
type AgentEnvelopeEvent = {
  type: "agent.envelope";
  data: {
    envelope: {
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
  };
};
```

### State and HITL Events

```ts
type StateDeltaEvent = {
  type: "state.delta";
  data: {
    source: string;
    delta: Record<string, unknown>;
  };
};

type PlanDeltaEvent = {
  type: "response.plan.delta";
  data: {
    item_id: string;
    part_id: string;
    delta: string;
  };
};

type HitlPausedEvent = {
  type: "hitl.paused";
  data: { prompt: string };
};
```

### Canvas Events (reporting stream may include these if canvas path is used)

```ts
type CanvasContextLoadedEvent = {
  type: "canvas.context.loaded";
  data: Record<string, unknown>;
};

type CanvasActionsProposedEvent = {
  type: "canvas.actions.proposed";
  data: Record<string, unknown>;
};
```

### Final Reporting Payload Events

```ts
type ResponseCheckpointReportEvent = {
  type: "response.checkpoint_report";
  data: {
    item_id: string;
    part_id: string;
    report: FrontendCheckpointReport;
  };
};

type ResponseReportAssemblyEvent = {
  type: "response.report_assembly";
  data: {
    item_id: string;
    part_id: string;
    report: ReportAssembly;
    html_preview: string;
  };
};

type ResponseTextDeltaEvent = {
  type: "response.output_text.delta";
  data: {
    item_id: string;
    part_id: string;
    delta: string;
  };
};
```

### Error Event

```ts
type ErrorEvent = {
  type: "error";
  data: {
    type: string;
    code: string;
    message: string;
    param: null;
  };
};
```

## Structured Outputs

HTTP reporting produces one of these structured outputs:

1. `response.checkpoint_report` with `FrontendCheckpointReport`
2. `response.report_assembly` with `ReportAssembly`
3. text fallback via `response.output_text.delta`

### `FrontendCheckpointReport` (strict output for checkpoint mode)

`FrontendCheckpointReport` is `CheckpointReport` without `reasoning_trace`.

```ts
type FrontendCheckpointReport = {
  language: string;
  executive_summary: string;
  performance_snapshot: unknown[];
  sections: CheckpointSection[];
  strategic_recommendations: RecommendationItem[];
  follow_up_questions: string[];
  handoff_trace: HandoffTraceEntry[];
  cached_sources: string[];
  graphs: GraphSpec[];
};

type CheckpointSection = {
  heading: string;
  scope: string;
  summary: string;
  highlights: InsightItem[];
  tables: unknown[];
  actions: RecommendationItem[];
  confidence: string | null;
  cached_sources: string[];
  graphs: GraphSpec[];
};
```

### `ReportAssembly` (strict output for assembly mode)

```ts
type ReportAssembly = {
  header: ReportHeader;
  summary: ExecutiveSummary;
  metrics: MetricComparison[];
  charts: ChartSpecification[];
  insights: InsightItem[];
  recommendations: RecommendationItem[];
  metadata?: Record<string, unknown>;
};

type ReportHeader = {
  title: string;
  subtitle?: string;
  period: string;
  report_tags: string[];
};

type ExecutiveSummary = {
  narrative: string;
  principal_deviation?: string;
};

type MetricComparison = {
  label: string;
  planned: number | string;
  actual: number | string;
  index_percent: number;
  unit: string;
  deviation_type: "positive" | "negative" | "neutral";
};

type ChartSpecification = {
  title: string;
  chart_type: "bar" | "line" | "pie" | "doughnut";
  labels: string[];
  datasets: ChartDataset[];
  options?: Record<string, unknown>;
};

type ChartDataset = {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
};
```

### Shared structured types

```ts
type InsightItem = {
  category: string;
  title?: string;
  text: string;
  impact: string | null;
  severity: "positive" | "neutral" | "watch" | "risk";
  confidence: string | null;
  evidence: string[];
};

type RecommendationItem = {
  title: string;
  rationale: string;
  expected_impact: string | null;
  priority: string;
};

type GraphSpec = {
  title: string;
  description: string | null;
  graph_type: "line" | "bar" | "stacked_bar" | "area" | "pie" | "doughnut";
  data_format: "series" | "chartjs";
  labels: string[];
  series: DataSeries[];
  datasets: GraphDataset[];
  cached_sources: string[];
};

type DataSeries = {
  name: string;
  values: number[];
  cached: boolean;
  unit: string | null;
  derived_metrics?: unknown;
};

type GraphDataset = {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
};

type HandoffTraceEntry = {
  correlation_id: string;
  parent_correlation_id: string | null;
  from_scope: string | null;
  to_scope: string;
  objective: string | null;
  entity_id: string | null;
  status: "started" | "completed" | "failed";
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
};
```

## Frontend Parsing Guidance

- Treat the stream as append-only NDJSON lines.
- Handle `tool.batch` instead of expecting per-tool lines.
- For checkpoint UI, read `response.checkpoint_report.data.report`.
- For assembled-report UI, read `response.report_assembly.data.report` and optional `html_preview`.
- Keep `response.progress` stage handling open-ended (unknown stages should not break rendering).
