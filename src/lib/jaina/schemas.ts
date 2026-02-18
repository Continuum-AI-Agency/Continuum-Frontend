import { z } from "zod";

// ============================================================================
// Request/Response Schemas
// ============================================================================

export const jainaChatRequestSchema = z.object({
  query: z.string().min(1),
  plan: z.boolean().default(false),
  userId: z.string().optional(),
  context: z.object({
    adAccountId: z.string().min(1),
    brandId: z.string().min(1),
  }),
});

export type JainaChatRequest = z.infer<typeof jainaChatRequestSchema>;

export const jainaChatStopRequestSchema = z.union([
  z.object({
    context: z.object({
      adAccountId: z.string().min(1),
      brandId: z.string().min(1),
    }),
  }),
  z.object({
    ad_account_id: z.string().min(1),
  }),
]);

export type JainaChatStopRequest = z.infer<typeof jainaChatStopRequestSchema>;

export const jainaChatStopResponseSchema = z.object({
  status: z.enum(["stopped", "idle"]),
  stopped_runs: z.number().int().nonnegative(),
});

export type JainaChatStopResponse = z.infer<typeof jainaChatStopResponseSchema>;

export const jainaChatInputSchema = z.object({
  query: z.string().min(3, "Ask Jaina a specific question."),
});

export type JainaChatInputValues = z.infer<typeof jainaChatInputSchema>;

// ============================================================================
// Stream Event Schemas
// ============================================================================

export const jainaStreamEventSchema = z.object({
  type: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export type JainaStreamEvent = z.infer<typeof jainaStreamEventSchema>;

export const progressEventSchema = z.object({
  stage: z.string(),
}).passthrough();

export type ProgressEventData = z.infer<typeof progressEventSchema>;

export const outputJsonDeltaSchema = z.object({
  item_id: z.string().optional(),
  part_id: z.string().optional(),
  delta: z.string(),
});

export const outputTextDeltaSchema = z.object({
  item_id: z.string().optional(),
  part_id: z.string().optional(),
  delta: z.string(),
});

export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
});

export type ToolCallEventData = z.infer<typeof toolCallSchema>;

export const toolResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  ok: z.boolean(),
  cached: z.boolean(),
  shared: z.boolean().optional(),
  duration_ms: z.number().optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolResultEventData = z.infer<typeof toolResultSchema>;

export const stateDeltaSchema = z.object({
  source: z.string(),
  delta: z.record(z.string(), z.unknown()),
});

export type StateDeltaEventData = z.infer<typeof stateDeltaSchema>;

export const creativeArtifactSchema = z.object({
  id: z.string(),
  type: z.literal("creative"),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  post_copy: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
  call_to_action: z.string().optional(),
  platform: z.enum(["facebook", "instagram", "tiktok", "google"]).optional(),
  format: z.enum(["image", "video", "carousel"]).optional(),
});

export type CreativeArtifact = z.infer<typeof creativeArtifactSchema>;

export const artifactDeltaSchema = z.object({
  creatives: z.array(creativeArtifactSchema).optional(),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().optional(),
  })).optional(),
});

export type ArtifactDeltaEventData = z.infer<typeof artifactDeltaSchema>;

export const planStepSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
});

export type PlanStep = z.infer<typeof planStepSchema>;

export const responsePlanDeltaSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(planStepSchema).optional(),
  status: z.enum(["pending", "awaiting_approval", "approved", "rejected", "in_progress", "completed"]).optional(),
});

export type ResponsePlanDeltaEventData = z.infer<typeof responsePlanDeltaSchema>;

export const responseCreatedSchema = z.object({
  id: z.string(),
});

export const responseOutputItemSchema = z.object({
  item: z.object({
    id: z.string(),
  }),
});

export const responseOutputItemDoneSchema = z.object({
  item_id: z.string(),
});

export const responseContentPartSchema = z.object({
  item_id: z.string(),
  part: z.object({
    id: z.string(),
  }),
});

export const streamErrorSchema = z.object({
  type: z.string().optional(),
  code: z.string().optional(),
  message: z.string(),
  param: z.unknown().nullable().optional(),
});

export const thoughtEventSchema = z.object({
  text: z.string(),
  chunk: z.boolean().optional(),
});

export type ThoughtEventData = z.infer<typeof thoughtEventSchema>;

export const adkEventSchema = z.object({
  author: z.string().optional(),
  content: z.object({
    role: z.string().optional(),
    parts: z.array(
      z.union([
        z.object({ text: z.string() }),
        z.object({
          functionCall: z.object({
            name: z.string(),
            args: z.record(z.string(), z.unknown()),
            id: z.string(),
          }),
        }),
        z.object({
          functionResponse: z.object({
            name: z.string(),
            response: z.record(z.string(), z.unknown()),
            id: z.string(),
          }),
        }),
      ])
    ),
  }),
}).passthrough();

export type AdkEventData = z.infer<typeof adkEventSchema>;

// ============================================================================
// SoT Report Schemas - The main report structure
// ============================================================================

export const metricItemSchema = z.object({
  metric: z.string(),
  value: z.union([z.string(), z.number()]),
  change: z.union([z.string(), z.number()]).optional(),
  direction: z.string().optional(),
  context: z.string().optional(),
  sub_label: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  status: z.string().nullable().optional(),
  format: z.string().optional(),
});

export const chartDataPointSchema = z.object({
  label: z.string().optional(),
  value: z.number().optional(),
  x: z.union([z.string(), z.number()]).optional(),
  y: z.number().optional(),
  fill: z.string().optional(),
});

export const chartSeriesDataPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number(),
});

export const chartSeriesSchema = z.object({
  name: z.string(),
  data: z.array(chartSeriesDataPointSchema),
});

export const chartSchema = z.object({
  title: z.string(),
  type: z.enum(["line", "bar", "pie", "area", "stacked_bar"]),
  data: z.array(chartDataPointSchema).optional(),
  series: z.array(chartSeriesSchema).optional(),
  x_axis_label: z.string().optional(),
  y_axis_label: z.string().optional(),
  description: z.string().optional(),
});

export const tableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export const insightSchema = z.object({
  category: z.string().optional(),
  title: z.string().optional(),
  text: z.string(),
  impact: z.string().nullable().optional(),
  severity: z.enum(["positive", "neutral", "watch", "risk"]).default("neutral"),
  confidence: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
});

export const recommendationSchema = z.object({
  title: z.string().optional(),
  action: z.string().optional(),
  type: z.string().optional(),
  target: z.string().optional(),
  description: z.string().optional(),
  reasoning: z.string().optional(),
  rationale: z.string().optional(),
  impact: z.string().optional(),
  effort: z.string().optional(),
  expected_impact: z.string().optional(),
  expected_outcome: z.string().optional(),
  priority: z.string().optional(),
});

export const soTSectionSchema = z.object({
  heading: z.string(),
  scope: z.string(),
  summary: z.string(),
  highlights: z.array(insightSchema).default([]),
  tables: z.array(tableSchema).default([]),
  actions: z.array(recommendationSchema).default([]),
  confidence: z.string().nullable().optional(),
  cached_sources: z.array(z.string()).default([]),
  graphs: z.array(z.any()).default([]),
});

export const sotReportSchema = z.object({
  reasoning_trace: z.string().optional(),
  language: z.string().default("en"),
  executive_summary: z.string().optional(),
  performance_snapshot: z.array(metricItemSchema).default([]),
  sections: z.array(soTSectionSchema).default([]),
  strategic_recommendations: z.array(recommendationSchema).default([]),
  follow_up_questions: z.array(z.string()).default([]),
  handoff_trace: z.array(z.any()).default([]),
  cached_sources: z.array(z.string()).default([]),
  graphs: z.array(z.any()).default([]),
});

export type SoTReport = z.infer<typeof sotReportSchema>;

// ============================================================================
// Legacy/Direct Answer Schemas
// ============================================================================

export const directAnswerSchema = z.object({
  type: z.literal("direct_answer"),
  content: z.string(),
});

export type DirectAnswerPayload = z.infer<typeof directAnswerSchema>;

// ============================================================================
// Backend Response Parsing
// ============================================================================

function extractJsonArrayFromString(str: string): any[] {
  const startIdx = str.indexOf('[');
  const endIdx = str.lastIndexOf(']');
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }
  
  try {
    return JSON.parse(str.slice(startIdx, endIdx + 1));
  } catch {
    return [];
  }
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value);
}

function formatEnumLabel(value: unknown): string {
  const raw = toDisplayString(value).trim();
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeChartType(value: unknown): "line" | "bar" | "pie" | "area" | "stacked_bar" {
  const raw = toDisplayString(value).toLowerCase().trim();
  if (!raw) return "bar";

  if (raw === "stacked-bar" || raw === "stackedbar" || raw === "stacked_bar") {
    return "stacked_bar";
  }
  if (raw === "line") return "line";
  if (raw === "bar" || raw === "column") return "bar";
  if (raw === "pie" || raw === "donut") return "pie";
  if (raw === "area") return "area";
  return "bar";
}

function toMetricStatus(input: any): string {
  if (typeof input?.status === "string" && input.status.trim().length > 0) {
    return input.status;
  }
  if (typeof input?.impact === "string") {
    const impact = input.impact.toLowerCase();
    if (impact.includes("negative") || impact.includes("risk") || impact.includes("critical")) {
      return "risk";
    }
    if (impact.includes("positive")) {
      return "positive";
    }
  }
  if (typeof input?.is_positive_change === "boolean") {
    return input.is_positive_change ? "positive" : "risk";
  }
  if (typeof input?.is_positive === "boolean") {
    return input.is_positive ? "positive" : "risk";
  }
  return "neutral";
}

function toInsightSeverity(input: any): "positive" | "neutral" | "watch" | "risk" {
  if (typeof input?.severity === "string") {
    const severity = input.severity.toLowerCase();
    if (severity === "positive" || severity === "neutral" || severity === "watch" || severity === "risk") {
      return severity;
    }
  }
  if (typeof input?.impact === "string") {
    const impact = input.impact.toLowerCase();
    if (impact.includes("negative") || impact.includes("risk") || impact.includes("critical")) {
      return "risk";
    }
    if (impact.includes("watch") || impact.includes("caution")) {
      return "watch";
    }
    if (impact.includes("positive")) {
      return "positive";
    }
  }
  if (typeof input?.type === "string") {
    const type = input.type.toLowerCase();
    if (type === "risk") return "risk";
    if (type === "opportunity" || type === "performance" || type === "positive") return "positive";
  }
  return "neutral";
}

function toTableFromRows(rows: any[] | undefined): { headers: string[]; rows: string[][] } | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const headers = Object.keys(rows[0] || {});
  if (headers.length === 0) return null;
  return {
    headers,
    rows: rows.map((row) => headers.map((header) => toDisplayString(row?.[header]))),
  };
}

function parseWideChartsFromRows(graph: any): any[] {
  const rows = Array.isArray(graph?.data)
    ? graph.data.filter((row: unknown) => row && typeof row === "object")
    : [];
  if (rows.length === 0) return [];

  const firstRow = rows[0] as Record<string, unknown>;
  const keys = Object.keys(firstRow);
  if (keys.length === 0) return [];

  const candidateLabelKeys = ["label", "name", "x", "category", "campaign", "ad_set", "ad_set_name"];
  const labelKey =
    candidateLabelKeys.find((key) => key in firstRow) ??
    keys.find((key) => typeof firstRow[key] === "string") ??
    keys[0];

  const numericKeys = keys.filter((key) => {
    if (key === labelKey) return false;
    const value = firstRow[key];
    if (typeof value === "number") return true;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed);
    }
    return false;
  });

  if (numericKeys.length === 0) return [];

  const baseTitle = toDisplayString(graph?.title || graph?.graph_name || "Chart");
  const chartType = normalizeChartType(graph?.type || graph?.graph_type || "bar");
  const xAxisLabel = graph?.x_axis_label || formatEnumLabel(labelKey);
  const description = graph?.description || graph?.graph_description;

  return numericKeys.map((metricKey) => ({
    title: numericKeys.length > 1 ? `${baseTitle} — ${metricKey}` : baseTitle,
    type: chartType,
    data: rows.map((row: Record<string, unknown>) => ({
      label: toDisplayString(row[labelKey]),
      value: toFiniteNumber(row[metricKey]),
    })),
    x_axis_label: xAxisLabel,
    y_axis_label: metricKey,
    description,
  }));
}

function parseGraph(graph: any): any {
  if (!graph) return null;
  
  const baseChart = {
    title: graph.title || graph.graph_name || "Chart",
    type: normalizeChartType(graph.type || graph.graph_type || "bar"),
    description: graph.description || graph.graph_description,
  };
  
  if (Array.isArray(graph.series)) {
    return {
      ...baseChart,
      series: graph.series.map((s: any) => ({
        name: s.name || "Series",
        data: (s.data || []).map((d: any, index: number) => ({
          x: d.x || d.label || d.name || d.category || String(index + 1),
          y: toFiniteNumber(d.y ?? d.value),
        })),
      })),
      x_axis_label: graph.x_axis_label,
      y_axis_label: graph.y_axis_label,
    };
  }

  if (Array.isArray(graph.labels) && Array.isArray(graph.datasets)) {
    const labels = graph.labels.map((label: unknown) => String(label ?? ""));
    const datasets = graph.datasets;

    if (datasets.length === 1) {
      const dataset = datasets[0] || {};
      return {
        ...baseChart,
        title: graph.title || dataset.label || baseChart.title,
        data: labels.map((label: string, index: number) => ({
          label,
          value: toFiniteNumber(dataset.data?.[index]),
        })),
      };
    }

    return {
      ...baseChart,
      series: datasets.map((dataset: any, datasetIndex: number) => ({
        name: dataset.label || `Series ${datasetIndex + 1}`,
        data: labels.map((label: string, index: number) => ({
          x: label,
          y: toFiniteNumber(dataset.data?.[index]),
        })),
      })),
      x_axis_label: graph.x_axis_label,
      y_axis_label: graph.y_axis_label,
    };
  }
  
  return {
    ...baseChart,
    data: (graph.data || []).map((d: any) => ({
      label: d.label || d.name || d.x || d.category || "",
      value: toFiniteNumber(d.value ?? d.y),
      fill: d.fill,
    })),
  };
}

function parseGraphsFromInput(graph: any): any[] {
  if (!graph) return [];
  const wideCharts = parseWideChartsFromRows(graph);
  if (wideCharts.length > 0) {
    return wideCharts;
  }
  const parsed = parseGraph(graph);
  return parsed ? [parsed] : [];
}

function parseReportData(reportData: any): { 
  metrics: any[]; 
  graphs: any[]; 
  table: any | null;
  title: string;
  summary: string;
  sectionSummary: string;
} {
  const result = {
    metrics: [] as any[],
    graphs: [] as any[],
    table: null as any | null,
    title: reportData.title || "",
    summary: reportData.summary || "",
    sectionSummary:
      reportData.section_summary ||
      reportData.analysis_summary ||
      "",
  };
  
  // Support key_metrics (Lead Strategist format)
  if (Array.isArray(reportData.key_metrics)) {
    result.metrics = reportData.key_metrics.map((m: any) => ({
      metric: m.label || m.metric || "Metric",
      value: m.value ?? "0",
      change: m.change,
      status: toMetricStatus(m),
      direction: m.direction,
      context: m.context,
      sub_label: m.sub_label,
      prefix: m.prefix,
      suffix: m.suffix,
    }));
  }
  
  // Support performance_snapshot (SoT format)
  if (Array.isArray(reportData.performance_snapshot)) {
    result.metrics = reportData.performance_snapshot.map((m: any) => ({
      metric: m.label || m.metric || "Metric",
      value: m.value ?? "0",
      change: m.change,
      status: toMetricStatus(m),
      direction: m.direction,
      context: m.context,
      sub_label: m.sub_label,
      prefix: m.prefix,
      suffix: m.suffix,
    }));
  }
  
  if (Array.isArray(reportData.graphs)) {
    result.graphs = reportData.graphs.flatMap((graph: any) =>
      parseGraphsFromInput(graph)
    );
  }
  if (Array.isArray(reportData.charts)) {
    result.graphs.push(
      ...reportData.charts.flatMap((graph: any) => parseGraphsFromInput(graph))
    );
  }
  if (reportData.main_graph) {
    result.graphs.push(...parseGraphsFromInput(reportData.main_graph));
  }
  if (reportData.primary_performance_graph) {
    result.graphs.push(...parseGraphsFromInput(reportData.primary_performance_graph));
  }
  
  if (reportData.table) {
    result.table = {
      headers: reportData.table.headers || [],
      rows: reportData.table.rows || [],
    };
  } else if (Array.isArray(reportData.campaign_table) && reportData.campaign_table.length > 0) {
    const table = toTableFromRows(reportData.campaign_table);
    if (table) result.table = table;
  } else if (Array.isArray(reportData.performance_table) && reportData.performance_table.length > 0) {
    const table = toTableFromRows(reportData.performance_table);
    if (table) result.table = table;
  }
  
  return result;
}

// ============================================================================
// Report Payload Schema - Main entry point for parsing backend responses
// ============================================================================

export const reportPayloadSchema = z.union([
  // specialist_insights format (JSON wrapped in strings) - ONLY match if specialist_insights exists
  z.object({
    specialist_insights: z.array(z.string()),
  }).transform((data) => {
    const insights = data.specialist_insights || [];
    
    let reasoningTrace = "";
    let executiveSummary = "";
    let performanceSnapshot: any[] = [];
    let sections: any[] = [];
    let strategicRecommendations: any[] = [];
    let allGraphs: any[] = [];
    
    for (const insightStr of insights) {
      const items = extractJsonArrayFromString(insightStr);
      
      for (const item of items) {
        if (!item) continue;
        
        const explanation = item.explanation || "";
        if (explanation && !reasoningTrace) {
          reasoningTrace = explanation;
        }
        
        if (item.report_data) {
          const reportData = item.report_data;
          const parsed = parseReportData(reportData);
          
          if (parsed.summary && !executiveSummary) {
            executiveSummary = parsed.summary;
          }
          
          if (parsed.metrics.length > 0 && performanceSnapshot.length === 0) {
            performanceSnapshot = parsed.metrics;
          }
          
          if (parsed.graphs.length > 0) {
            allGraphs.push(...parsed.graphs);
          }
          
          const sectionTables = parsed.table ? [parsed.table] : [];
          const sectionGraphs = parsed.graphs;
          
          if (sectionTables.length > 0 || sectionGraphs.length > 0 || parsed.sectionSummary) {
            sections.push({
              heading: parsed.title || "Analysis",
              scope: "account",
              summary: parsed.sectionSummary,
              highlights: [],
              tables: sectionTables,
              actions: [],
              confidence: null,
              cached_sources: [],
              graphs: sectionGraphs,
            });
          }
        }
        
        const itemRecommendations = item.recommendations || item.reccomendations;
        if (Array.isArray(itemRecommendations)) {
          strategicRecommendations.push(...itemRecommendations.map((r: any) => ({
            title: r.title || r.action || formatEnumLabel(r.type) || "Recommendation",
            action: r.action || r.title || formatEnumLabel(r.type) || "Recommendation",
            type: formatEnumLabel(r.type) || undefined,
            description: r.rationale || r.description || r.reasoning || "",
            impact: r.expected_impact || r.impact,
            priority: r.priority,
            target: r.target,
            expected_outcome: r.expected_outcome,
          })));
        }
      }
    }
    
    return {
      reasoning_trace: reasoningTrace,
      language: "en",
      executive_summary: executiveSummary || "Analysis complete.",
      performance_snapshot: performanceSnapshot,
      sections,
      strategic_recommendations: strategicRecommendations,
      follow_up_questions: [],
      handoff_trace: [],
      cached_sources: [],
      graphs: allGraphs,
    };
  }),
  // Catch-all for flexible/streaming JSON formats - try this BEFORE strict sotReportSchema
  z.record(z.string(), z.unknown()).transform((data) => {
    const anyData = data as any;
    
    // Support multiple field name variations
    const executiveSummary = anyData.executive_summary || anyData.summary || anyData.title || "";
    const sectionSummary =
      anyData.section_summary ||
      anyData.analysis_summary ||
      anyData.section_overview ||
      "";
    const reasoningTrace = anyData.reasoning_trace || "";
    
    const performanceSnapshot: any[] = [];
    // Support: key_metrics (Lead Strategist), performance_snapshot (SoT)
    const metricsSource = anyData.key_metrics || anyData.performance_snapshot || [];
    if (Array.isArray(metricsSource)) {
      performanceSnapshot.push(...metricsSource.map((m: any) => ({
        metric: m.label || m.metric || "Metric",
        value: m.value ?? m.value ?? "0",
        change: m.change,
        direction: m.direction,
        context: m.context,
        sub_label: m.sub_label,
        status: toMetricStatus(m),
        prefix: m.prefix,
        suffix: m.suffix,
      })));
    }
    
    const allGraphs: any[] = [];
    // Support: main_graph, primary_performance_graph, graphs, charts
    if (anyData.main_graph) {
      allGraphs.push(...parseGraphsFromInput(anyData.main_graph));
    }
    if (anyData.primary_performance_graph) {
      allGraphs.push(...parseGraphsFromInput(anyData.primary_performance_graph));
    }
    if (Array.isArray(anyData.graphs)) {
      allGraphs.push(
        ...anyData.graphs.flatMap((graph: any) => parseGraphsFromInput(graph))
      );
    }
    if (Array.isArray(anyData.charts)) {
      allGraphs.push(
        ...anyData.charts.flatMap((graph: any) => parseGraphsFromInput(graph))
      );
    }
    
    const sections: any[] = [];
    const sectionTables: any[] = [];
    
    // Support: campaign_table, performance_table
    const campaignTable = toTableFromRows(anyData.campaign_table);
    if (campaignTable) {
      sectionTables.push(campaignTable);
    }
    const performanceTable = toTableFromRows(anyData.performance_table);
    if (performanceTable) {
      sectionTables.push(performanceTable);
    }
    if (anyData.table && Array.isArray(anyData.table.headers) && Array.isArray(anyData.table.rows)) {
      sectionTables.push({
        headers: anyData.table.headers.map((header: unknown) => toDisplayString(header)),
        rows: anyData.table.rows.map((row: unknown) =>
          Array.isArray(row) ? row.map((cell) => toDisplayString(cell)) : []
        ),
      });
    }
    
    // Support: key_insights, strategy_and_insights, strategic_analysis, insights
    const highlights: any[] = [];
    const insightsSources = [
      anyData.key_insights,
      anyData.strategic_analysis,
      anyData.strategy_and_insights,
      anyData.insights,
      anyData.key_findings,
    ];
    for (const source of insightsSources) {
      if (!Array.isArray(source)) continue;
      highlights.push(...source.map((a: any) => ({
        title: a.title || a.name || "",
        text: a.content || a.description || a.text || "",
        impact: a.impact || a.metric,
        severity: toInsightSeverity(a),
      })));
    }
    
    if (sectionTables.length > 0 || highlights.length > 0 || allGraphs.length > 0 || sectionSummary) {
      sections.push({
        heading: anyData.section_title || anyData.analysis_title || "Analysis",
        scope: "account",
        summary: sectionSummary,
        highlights,
        tables: sectionTables,
        actions: [],
        confidence: null,
        cached_sources: [],
        graphs: allGraphs,
      });
    }
    
    // Support: action_plan, next_steps, recommendations, priority_recommendations
    const strategicRecommendations: any[] = [];
    const recommendationSources = [
      anyData.action_plan,
      anyData.next_steps,
      anyData.recommendations,
      anyData.reccomendations,
      anyData.priority_recommendations,
      anyData.priority_reccomendations,
      anyData["priority reccomendations"],
    ];
    for (const source of recommendationSources) {
      if (!Array.isArray(source)) continue;
      strategicRecommendations.push(...source.map((s: any) => ({
        title: s.action || s.title || formatEnumLabel(s.type) || "Recommendation",
        action: s.action || s.title || formatEnumLabel(s.type) || "Recommendation",
        type: formatEnumLabel(s.type) || undefined,
        target: s.target,
        description: s.description || s.recommendation || s.reasoning || s.rationale || "",
        reasoning: s.reasoning,
        impact: s.impact || s.expected_impact,
        expected_impact: s.expected_impact,
        expected_outcome: s.expected_outcome,
        priority: s.priority ? String(s.priority).toUpperCase() : undefined,
        rationale: s.rationale,
      })));
    }
    
    return {
      reasoning_trace: reasoningTrace,
      language: "en",
      // Primary field names (SoT format)
      executive_summary: executiveSummary,
      performance_snapshot: performanceSnapshot,
      sections,
      strategic_recommendations: strategicRecommendations,
      follow_up_questions: anyData.follow_up_questions || [],
      handoff_trace: anyData.handoff_trace || [],
      cached_sources: anyData.cached_sources || [],
      graphs: allGraphs,
      // Aliases for backward compatibility / other formats
      summary: executiveSummary,
      charts: allGraphs,
      priority_recommendations: strategicRecommendations.map((r) => ({
        ...r,
        action: r.action || r.title,
      })),
      strategic_insights: highlights,
      title: anyData.title || "",
      // Legacy fields
      data_integrity_notes: ["Date Range", `Date Range: ${anyData.date_range || "N/A"}`],
    };
  }),
  // Strict SoTReport schema - only matches if data has meaningful SoT fields
  sotReportSchema,
  // Direct answer format
  directAnswerSchema,
]);

export type ReportPayload = z.infer<typeof reportPayloadSchema>;

// ============================================================================
// Helper to check if report has content
// ============================================================================

export function hasReportContent(report: ReportPayload | null): boolean {
  if (!report) return false;
  if ("type" in report && report.type === "direct_answer") return true;
  
  const r = report as SoTReport;
  return !!(
    r.executive_summary ||
    r.performance_snapshot?.length ||
    r.sections?.length ||
    r.strategic_recommendations?.length ||
    r.graphs?.length
  );
}
