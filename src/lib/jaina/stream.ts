import {
  jainaStreamEventSchema,
  frontendSoTReportSchema,
  outputJsonDeltaSchema,
  outputTextDeltaSchema,
  progressEventSchema,
  responseContentPartSchema,
  responseContentPartDoneSchema,
  responseCreatedSchema,
  responseDoneSchema,
  responseOutputItemSchema,
  responseOutputItemDoneSchema,
  responseReportAssemblySchema,
  responseSoTReportSchema,
  reportPayloadSchema,
  stateDeltaSchema,
  hitlPausedSchema,
  canvasActionsProposedSchema,
  artifactDeltaSchema,
  streamErrorSchema,
  toolCallSchema,
  toolResultSchema,
  thoughtEventSchema,
  adkEventSchema,
  parsePlanDecisionPayload,
  parsePlanRequestedPayload,
  responsePlanDeltaSchema,
  type JainaStreamEvent,
  type ProgressEventData,
  type ReportAssembly,
  type ReportPayload,
  type StateDeltaEventData,
  type ArtifactDeltaEventData,
  type ToolCallEventData,
  type ToolResultEventData,
  type ResponsePlanDecisionEventData,
  type FrontendSoTReport,
} from "./schemas";
import type { CampaignCanvasActionsEnvelope } from "@/lib/campaign-canvas/agent-actions";
import { z } from "zod";
import type { JainaPlan } from "@/components/paid-media/jaina/types";

export type JainaStreamStatus = "idle" | "starting" | "streaming" | "complete" | "error";

const compatibilityStreamEventSchema = z.object({
  type: z.enum([
    "response.output_json.delta",
    "tool.call",
    "tool.result",
    "thought",
    "adk.event",
    "artifact.delta",
    "response.plan.requested",
    "response.plan.decision",
  ]),
  data: z.unknown().optional(),
});

type CompatibilityStreamEvent = z.infer<typeof compatibilityStreamEventSchema>;
export type ParsedJainaStreamEvent = JainaStreamEvent | CompatibilityStreamEvent;

export type JainaProgressEntry = {
  stage: string;
  at: string;
  detail?: string;
  data: any;
};

export type JainaPendingPlan = {
  prompt: string;
  status: "awaiting_approval";
};

export type JainaStreamState = {
  status: JainaStreamStatus;
  reportJson: string;
  planJson: string;
  responseText: string;
  report: ReportPayload | null;
  reportAssembly: ReportAssembly | null;
  reportAssemblyHtml: string | null;
  plan: JainaPlan | null;
  pendingPlan: JainaPendingPlan | null;
  lastPlanDecision: ResponsePlanDecisionEventData | null;
  error?: string;
  responseId?: string;

  itemId?: string;
  partId?: string;
  outputItemId?: string;
  progress: JainaProgressEntry[];
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
  stateDeltas: StateDeltaEventData[];
  artifacts: ArtifactDeltaEventData;
  canvasActions: CampaignCanvasActionsEnvelope[];
  lastEventType?: string;
};

export function createInitialJainaStreamState(): JainaStreamState {
  return {
    status: "idle",
    reportJson: "",
    planJson: "",
    responseText: "",
    report: null,
    reportAssembly: null,
    reportAssemblyHtml: null,
    plan: null,
    pendingPlan: null,
    lastPlanDecision: null,
    progress: [],
    toolCalls: [],
    toolResults: [],
    stateDeltas: [],
    artifacts: {},
    canvasActions: [],
  };
}

function normalizeReportAssemblyToSoT(reportAssembly: ReportAssembly): ReportPayload {
  const snapshot = reportAssembly.metrics.map((metric) => ({
    metric: metric.label,
    value: metric.actual,
    change: metric.index_percent,
    suffix: metric.unit === "%" ? "%" : undefined,
    context: `Planned: ${metric.planned}`,
    status:
      metric.deviation_type === "positive"
        ? "positive"
        : metric.deviation_type === "negative"
          ? "risk"
          : "neutral",
  }));

  const recommendations = reportAssembly.recommendations.map((entry) => {
    if (typeof entry === "string") {
      return {
        title: entry,
        rationale: entry,
        expected_impact: null,
        priority: "MEDIUM",
      };
    }

    return {
      title: entry.title,
      rationale: entry.rationale,
      expected_impact: entry.expected_impact,
      priority: entry.priority,
    };
  });

  return {
    language: "en",
    executive_summary: reportAssembly.summary.narrative,
    performance_snapshot: snapshot,
    sections: [
      {
        heading: reportAssembly.header.title,
        scope: reportAssembly.header.period,
        summary: reportAssembly.summary.principal_deviation || "",
        highlights: reportAssembly.insights,
        tables: [],
        actions: recommendations,
        confidence: null,
        cached_sources: [],
        graphs: reportAssembly.charts,
      },
    ],
    strategic_recommendations: recommendations,
    follow_up_questions: [],
    handoff_trace: [],
    cached_sources: [],
    graphs: reportAssembly.charts,
  };
}

function normalizeInsightSeverity(value: unknown): "positive" | "neutral" | "watch" | "risk" {
  const raw = getNonEmptyString(value)?.toLowerCase();
  if (!raw) return "neutral";
  if (raw === "positive" || raw === "neutral" || raw === "watch" || raw === "risk") {
    return raw;
  }
  if (raw.includes("positive") || raw.includes("success")) return "positive";
  if (raw.includes("warning") || raw.includes("watch")) return "watch";
  if (raw.includes("risk") || raw.includes("negative") || raw.includes("critical")) return "risk";
  return "neutral";
}

function normalizeMetricStatus(value: unknown): string | undefined {
  const raw = getNonEmptyString(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw === "success") return "positive";
  if (raw === "error" || raw === "critical") return "risk";
  return raw;
}

function normalizeRecommendation(value: unknown): FrontendSoTReport["strategic_recommendations"][number] | null {
  if (typeof value === "string") {
    const title = getNonEmptyString(value);
    if (!title) return null;
    return {
      title,
      rationale: title,
      expected_impact: null,
      priority: "MEDIUM",
    };
  }

  const record = asRecord(value);
  if (!record) return null;

  const title =
    getNonEmptyString(record.title) ??
    getNonEmptyString(record.action) ??
    getNonEmptyString(record.type) ??
    "Recommendation";
  const rationale =
    getNonEmptyString(record.rationale) ??
    getNonEmptyString(record.reasoning) ??
    getNonEmptyString(record.description) ??
    getNonEmptyString(record.summary) ??
    "No rationale provided.";
  const expectedImpactRaw = getNonEmptyString(record.expected_impact) ?? getNonEmptyString(record.impact);

  return {
    title,
    rationale,
    expected_impact: expectedImpactRaw ?? null,
    priority: getNonEmptyString(record.priority) ?? "MEDIUM",
  };
}

function normalizeMetric(
  value: unknown
): FrontendSoTReport["performance_snapshot"][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  const metric =
    getNonEmptyString(record.metric) ??
    getNonEmptyString(record.label) ??
    getNonEmptyString(record.title) ??
    "Metric";

  const valueRaw = record.value;
  const normalizedMetric: FrontendSoTReport["performance_snapshot"][number] = {
    metric,
    value:
      typeof valueRaw === "number" || typeof valueRaw === "string"
        ? valueRaw
        : String(valueRaw ?? ""),
  };

  const changeRaw = record.change ?? (typeof record.trend === "number" ? record.trend : undefined);
  if (typeof changeRaw === "number" || typeof changeRaw === "string") {
    normalizedMetric.change = changeRaw;
  }

  const status = normalizeMetricStatus(record.status ?? record.trend);
  if (status) normalizedMetric.status = status;

  const direction = getNonEmptyString(record.direction);
  if (direction) normalizedMetric.direction = direction;

  const context = getNonEmptyString(record.context);
  if (context) normalizedMetric.context = context;

  const subLabel = getNonEmptyString(record.sub_label);
  if (subLabel) normalizedMetric.sub_label = subLabel;

  const prefix = getNonEmptyString(record.prefix);
  if (prefix) normalizedMetric.prefix = prefix;

  const suffix = getNonEmptyString(record.suffix);
  if (suffix) normalizedMetric.suffix = suffix;

  const format = getNonEmptyString(record.format);
  if (format) normalizedMetric.format = format;

  return normalizedMetric;
}

function normalizeGraph(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;

  const title = getNonEmptyString(record.title) ?? getNonEmptyString(record.label);
  return title ? { ...record, title } : record;
}

function normalizeTable(
  value: unknown
): FrontendSoTReport["sections"][number]["tables"][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  const rowsRaw = asArray(record.rows);
  const hasHeaders = Array.isArray(record.headers) && record.headers.length > 0;
  const headers = hasHeaders
    ? (record.headers as unknown[]).map((header) => String(header))
    : [];

  const normalizedRows: Array<unknown[] | Record<string, unknown>> = rowsRaw
    .map((row) => {
      if (Array.isArray(row)) return row;
      const objectRow = asRecord(row);
      return objectRow ?? [row];
    })
    .filter((row) => row.length !== 0);

  if (headers.length === 0 && normalizedRows.length > 0) {
    const firstRow = normalizedRows[0];
    if (Array.isArray(firstRow)) {
      headers.push(...Array.from({ length: firstRow.length }, (_, index) => `Column ${index + 1}`));
    } else {
      headers.push(...Object.keys(firstRow));
    }
  }

  if (headers.length === 0 && normalizedRows.length === 0) {
    const title = getNonEmptyString(record.title);
    if (!title) return null;
    return {
      title,
      subtitle: getNonEmptyString(record.subtitle) ?? null,
      rows: [],
      notes: getNonEmptyString(record.notes) ?? null,
    };
  }

  return {
    title: getNonEmptyString(record.title),
    subtitle: getNonEmptyString(record.subtitle) ?? null,
    headers,
    rows: normalizedRows,
    notes: getNonEmptyString(record.notes) ?? null,
  };
}

function normalizeHighlight(
  value: unknown
): FrontendSoTReport["sections"][number]["highlights"][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  const text =
    getNonEmptyString(record.text) ??
    getNonEmptyString(record.description) ??
    getNonEmptyString(record.content);
  if (!text) return null;

  const title = getNonEmptyString(record.title) ?? getNonEmptyString(record.category);
  const impact = getNonEmptyString(record.impact) ?? getNonEmptyString(record.metric);
  const confidence = getNonEmptyString(record.confidence);
  const evidence = asArray(record.evidence)
    .map((item) => getNonEmptyString(item))
    .filter((item): item is string => Boolean(item));

  return {
    category: getNonEmptyString(record.category) ?? "general",
    ...(title ? { title } : {}),
    text,
    impact: impact ?? null,
    severity: normalizeInsightSeverity(record.severity ?? record.impact),
    confidence: confidence ?? null,
    evidence,
  };
}

function normalizeSection(
  value: unknown
): FrontendSoTReport["sections"][number] | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    heading: getNonEmptyString(record.heading) ?? getNonEmptyString(record.title) ?? "Analysis",
    scope: getNonEmptyString(record.scope) ?? "account",
    summary: getNonEmptyString(record.summary) ?? "",
    highlights: asArray(record.highlights ?? record.insights ?? record.key_insights)
      .map((item) => normalizeHighlight(item))
      .filter((item): item is FrontendSoTReport["sections"][number]["highlights"][number] => Boolean(item)),
    tables: asArray(record.tables)
      .map((item) => normalizeTable(item))
      .filter((item): item is FrontendSoTReport["sections"][number]["tables"][number] => Boolean(item)),
    actions: asArray(
      record.actions ?? record.recommendations ?? record.reccomendations
    )
      .map((item) => normalizeRecommendation(item))
      .filter((item): item is FrontendSoTReport["sections"][number]["actions"][number] => Boolean(item)),
    confidence: getNonEmptyString(record.confidence) ?? null,
    cached_sources: asArray(record.cached_sources)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    graphs: asArray(record.graphs)
      .map((item) => normalizeGraph(item))
      .filter((item): item is Record<string, unknown> => Boolean(item)),
  };
}

function normalizeSoTReportPayload(value: unknown): FrontendSoTReport | null {
  const strict = frontendSoTReportSchema.safeParse(value);
  if (strict.success) return strict.data;

  const payloadRecord = asRecord(value);
  if (!payloadRecord) return null;

  const normalized: FrontendSoTReport = {
    language: getNonEmptyString(payloadRecord.language) ?? "en",
    executive_summary:
      getNonEmptyString(payloadRecord.executive_summary) ??
      getNonEmptyString(payloadRecord.summary) ??
      getNonEmptyString(payloadRecord.title) ??
      "",
    performance_snapshot: asArray(payloadRecord.performance_snapshot)
      .map((item) => normalizeMetric(item))
      .filter((item): item is FrontendSoTReport["performance_snapshot"][number] => Boolean(item)),
    sections: asArray(payloadRecord.sections)
      .map((item) => normalizeSection(item))
      .filter((item): item is FrontendSoTReport["sections"][number] => Boolean(item)),
    strategic_recommendations: asArray(
      payloadRecord.strategic_recommendations ??
        payloadRecord.recommendations ??
        payloadRecord.reccomendations ??
        payloadRecord.priority_recommendations ??
        payloadRecord.priority_reccomendations ??
        payloadRecord["priority reccomendations"]
    )
      .map((item) => normalizeRecommendation(item))
      .filter((item): item is FrontendSoTReport["strategic_recommendations"][number] => Boolean(item)),
    follow_up_questions: asArray(payloadRecord.follow_up_questions)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    handoff_trace: asArray(payloadRecord.handoff_trace),
    cached_sources: asArray(payloadRecord.cached_sources)
      .map((item) => getNonEmptyString(item))
      .filter((item): item is string => Boolean(item)),
    graphs: asArray(payloadRecord.graphs ?? payloadRecord.charts)
      .map((item) => normalizeGraph(item))
      .filter((item): item is Record<string, unknown> => Boolean(item)),
  };

  const normalizedResult = frontendSoTReportSchema.safeParse(normalized);
  if (normalizedResult.success) return normalizedResult.data;

  const fallback = reportPayloadSchema.safeParse(payloadRecord);
  if (!fallback.success) return null;
  if ("type" in fallback.data && fallback.data.type === "direct_answer") return null;

  const fallbackResult = frontendSoTReportSchema.safeParse(fallback.data);
  return fallbackResult.success ? fallbackResult.data : null;
}

function parseReportFromAccumulatedText(reportJson: string): ReportPayload | null {
  const trimmed = reportJson.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const extracted = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (extracted !== trimmed) candidates.push(extracted);
  }

  for (const candidate of candidates) {
    try {
      const parsedJson = JSON.parse(candidate);
      const parsedReport = reportPayloadSchema.safeParse(parsedJson);
      if (parsedReport.success) return parsedReport.data;
    } catch {
      continue;
    }
  }

  return null;
}

function scoreReport(report: ReportPayload | null): number {
  if (!report) return -1;
  if ("type" in report && report.type === "direct_answer") {
    return report.content.trim().length > 0 ? 1 : 0;
  }

  const structured = report as any;
  return (
    (structured.executive_summary ? 1 : 0) +
    (Array.isArray(structured.performance_snapshot)
      ? structured.performance_snapshot.length
      : 0) +
    (Array.isArray(structured.graphs) ? structured.graphs.length : 0) +
    (Array.isArray(structured.strategic_recommendations)
      ? structured.strategic_recommendations.length
      : 0) +
    (Array.isArray(structured.sections)
      ? structured.sections.reduce(
          (acc: number, section: any) =>
            acc +
            (section?.summary ? 1 : 0) +
            (Array.isArray(section?.highlights) ? section.highlights.length : 0) +
            (Array.isArray(section?.tables) ? section.tables.length : 0) +
            (Array.isArray(section?.graphs) ? section.graphs.length : 0),
          0
        )
      : 0)
  );
}

function pickRicherReport(
  currentReport: ReportPayload | null,
  candidateReport: ReportPayload | null
): ReportPayload | null {
  if (!candidateReport) return currentReport;
  if (!currentReport) return candidateReport;
  return scoreReport(candidateReport) >= scoreReport(currentReport)
    ? candidateReport
    : currentReport;
}

function skipWhitespace(text: string, index: number): number {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function findJsonValueStartByKey(text: string, key: string): number | null {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const keyIndex = text.indexOf(`"${key}"`, searchFrom);
    if (keyIndex === -1) return null;
    let cursor = skipWhitespace(text, keyIndex + key.length + 2);
    if (text[cursor] !== ":") {
      searchFrom = keyIndex + 1;
      continue;
    }
    cursor = skipWhitespace(text, cursor + 1);
    return cursor;
  }
  return null;
}

function extractBalancedJsonSegment(
  text: string,
  startIndex: number,
  openChar: "{" | "["
): string | null {
  const closeChar = openChar === "{" ? "}" : "]";
  if (text[startIndex] !== openChar) return null;

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let cursor = startIndex; cursor < text.length; cursor += 1) {
    const char = text[cursor];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === openChar) {
      depth += 1;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, cursor + 1);
      }
    }
  }

  return null;
}

function extractStringFieldByKeys(
  text: string,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "\"") continue;

    let cursor = valueStart + 1;
    let isEscaped = false;
    while (cursor < text.length) {
      const char = text[cursor];
      if (isEscaped) {
        isEscaped = false;
        cursor += 1;
        continue;
      }
      if (char === "\\") {
        isEscaped = true;
        cursor += 1;
        continue;
      }
      if (char === "\"") {
        const encoded = text.slice(valueStart, cursor + 1);
        try {
          return JSON.parse(encoded);
        } catch {
          return undefined;
        }
      }
      cursor += 1;
    }
  }
  return undefined;
}

function extractArrayFieldByKeys(text: string, keys: string[]): unknown[] | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "[") continue;
    const segment = extractBalancedJsonSegment(text, valueStart, "[");
    if (!segment) continue;
    try {
      const parsed = JSON.parse(segment);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      continue;
    }
  }
  return undefined;
}

function extractObjectFieldByKeys(
  text: string,
  keys: string[]
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const valueStart = findJsonValueStartByKey(text, key);
    if (valueStart === null || text[valueStart] !== "{") continue;
    const segment = extractBalancedJsonSegment(text, valueStart, "{");
    if (!segment) continue;
    try {
      const parsed = JSON.parse(segment);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function parsePartialReportFromAccumulatedText(
  reportJson: string
): ReportPayload | null {
  const trimmed = reportJson.trim();
  if (!trimmed) return null;

  const raw: Record<string, unknown> = {};

  const executiveSummary = extractStringFieldByKeys(trimmed, [
    "executive_summary",
    "summary",
    "title",
  ]);
  if (executiveSummary) {
    raw.summary = executiveSummary;
  }

  const sectionSummary = extractStringFieldByKeys(trimmed, [
    "section_summary",
    "analysis_summary",
    "section_overview",
  ]);
  if (sectionSummary) {
    raw.section_summary = sectionSummary;
  }

  const performanceSnapshot = extractArrayFieldByKeys(trimmed, [
    "performance_snapshot",
    "key_metrics",
  ]);
  if (performanceSnapshot) {
    raw.performance_snapshot = performanceSnapshot;
  }

  const keyInsights = extractArrayFieldByKeys(trimmed, [
    "key_insights",
    "strategic_analysis",
    "strategy_and_insights",
    "insights",
    "key_findings",
  ]);
  if (keyInsights) {
    raw.key_insights = keyInsights;
  }

  const recommendationList = extractArrayFieldByKeys(trimmed, [
    "action_plan",
    "next_steps",
    "recommendations",
    "reccomendations",
    "priority_recommendations",
    "priority_reccomendations",
    "priority reccomendations",
  ]);
  if (recommendationList) {
    raw.recommendations = recommendationList;
  }

  const charts = extractArrayFieldByKeys(trimmed, ["charts", "graphs"]);
  if (charts) {
    raw.charts = charts;
  }

  const mainGraph = extractObjectFieldByKeys(trimmed, [
    "main_graph",
    "primary_performance_graph",
  ]);
  if (mainGraph) {
    raw.main_graph = mainGraph;
  }

  const tableRows = extractArrayFieldByKeys(trimmed, [
    "performance_table",
    "campaign_table",
  ]);
  if (tableRows) {
    raw.performance_table = tableRows;
  }

  const hasData = Object.keys(raw).length > 0;
  if (!hasData) return null;

  const parsed = reportPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

export function parseJainaStreamEvent(line: string): ParsedJainaStreamEvent | null {
  try {
    const json = JSON.parse(line);
    const parsed = jainaStreamEventSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
    const compatibilityEvent = compatibilityStreamEventSchema.safeParse(json);
    if (compatibilityEvent.success) {
      return compatibilityEvent.data;
    }
    const rawType =
      json && typeof json === "object" && "type" in json
        ? String((json as { type?: unknown }).type ?? "")
        : "unknown";
    console.warn("Invalid Jaina stream event schema for type:", rawType);
  } catch (error) {
    console.error("Failed to parse Jaina stream event JSON:", error, "Line:", line);
  }
  return null;
}

function parsePlanFromAccumulatedDelta(
  planJson: string,
  currentPlan: JainaPlan | null
): JainaPlan | null {
  const trimmed = planJson.trim();
  if (!trimmed) return currentPlan;

  const candidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const extracted = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (extracted !== trimmed) candidates.push(extracted);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const stepsRaw = Array.isArray(parsed.steps) ? parsed.steps : [];
      const steps = stepsRaw.reduce<JainaPlan["steps"]>((acc, step) => {
        if (!step || typeof step !== "object") return acc;
        const record = step as Record<string, unknown>;
        const title = typeof record.title === "string" ? record.title : "";
        if (!title) return acc;
        acc.push({
          title,
          description:
            typeof record.description === "string" ? record.description : undefined,
          status:
            typeof record.status === "string"
              ? (record.status as JainaPlan["steps"][number]["status"])
              : "pending",
        });
        return acc;
      }, []);

      return {
        id:
          (typeof parsed.id === "string" && parsed.id) ||
          (typeof parsed.plan_id === "string" && parsed.plan_id) ||
          currentPlan?.id ||
          "plan-1",
        title:
          (typeof parsed.title === "string" && parsed.title) ||
          currentPlan?.title ||
          "Execution Plan",
        description:
          (typeof parsed.description === "string" && parsed.description) ||
          (typeof parsed.summary === "string" && parsed.summary) ||
          currentPlan?.description ||
          "Review this execution plan.",
        status:
          (typeof parsed.status === "string"
            ? (parsed.status as JainaPlan["status"])
            : currentPlan?.status) || "pending",
        steps: steps.length > 0 ? steps : currentPlan?.steps || [],
      };
    } catch {
      continue;
    }
  }

  return currentPlan;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectToolDeltaCandidates(
  delta: Record<string, unknown>,
  singleKeys: string[],
  listKeys: string[]
): unknown[] {
  const candidates: unknown[] = [];
  for (const key of singleKeys) {
    if (key in delta) {
      candidates.push(delta[key]);
    }
  }
  for (const key of listKeys) {
    const value = delta[key];
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  }
  return candidates;
}

function buildToolCallFromDelta(value: unknown): ToolCallEventData | null {
  const strict = toolCallSchema.safeParse(value);
  if (strict.success) return strict.data;

  const raw = asRecord(value);
  if (!raw) return null;

  const name =
    typeof raw.name === "string"
      ? raw.name
      : typeof raw.tool_name === "string"
        ? raw.tool_name
        : "";
  if (!name) return null;

  const id =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.tool_call_id === "string"
        ? raw.tool_call_id
        : `${name}-${Date.now()}`;

  return {
    id,
    name,
    args:
      raw.args && typeof raw.args === "object" && !Array.isArray(raw.args)
        ? (raw.args as Record<string, unknown>)
        : {},
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : { source: "state.delta" },
  };
}

function buildToolResultFromDelta(value: unknown): ToolResultEventData | null {
  const strict = toolResultSchema.safeParse(value);
  if (strict.success) return strict.data;

  const raw = asRecord(value);
  if (!raw) return null;

  const name =
    typeof raw.name === "string"
      ? raw.name
      : typeof raw.tool_name === "string"
        ? raw.tool_name
        : "";
  if (!name) return null;

  const id =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.tool_call_id === "string"
        ? raw.tool_call_id
        : `${name}-${Date.now()}`;

  const error = typeof raw.error === "string" ? raw.error : undefined;
  const ok = typeof raw.ok === "boolean" ? raw.ok : !error;

  return {
    id,
    name,
    ok,
    cached: Boolean(raw.cached),
    shared: typeof raw.shared === "boolean" ? raw.shared : undefined,
    duration_ms: typeof raw.duration_ms === "number" ? raw.duration_ms : undefined,
    output: raw.output,
    error,
  };
}

function hydrateToolsFromStateDelta(delta: Record<string, unknown>): {
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
} {
  const toolCallCandidates = collectToolDeltaCandidates(
    delta,
    ["tool_call", "call", "latest_tool_call"],
    ["tool_calls", "calls"]
  );
  const toolResultCandidates = collectToolDeltaCandidates(
    delta,
    ["tool_result", "result", "latest_tool_result"],
    ["tool_results", "results"]
  );

  return {
    toolCalls: toolCallCandidates
      .map((candidate) => buildToolCallFromDelta(candidate))
      .filter((candidate): candidate is ToolCallEventData => Boolean(candidate)),
    toolResults: toolResultCandidates
      .map((candidate) => buildToolResultFromDelta(candidate))
      .filter((candidate): candidate is ToolResultEventData => Boolean(candidate)),
  };
}

function mergeToolCalls(
  existing: ToolCallEventData[],
  incoming: ToolCallEventData[]
): { merged: ToolCallEventData[]; added: ToolCallEventData[] } {
  if (incoming.length === 0) return { merged: existing, added: [] };
  const seenIds = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  const added: ToolCallEventData[] = [];
  for (const item of incoming) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    merged.push(item);
    added.push(item);
  }
  return { merged, added };
}

function mergeToolResults(
  existing: ToolResultEventData[],
  incoming: ToolResultEventData[]
): { merged: ToolResultEventData[]; added: ToolResultEventData[] } {
  if (incoming.length === 0) return { merged: existing, added: [] };
  const seenIds = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  const added: ToolResultEventData[] = [];
  for (const item of incoming) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    merged.push(item);
    added.push(item);
  }
  return { merged, added };
}

export function reduceJainaStreamEvent(
  state: JainaStreamState,
  event: ParsedJainaStreamEvent
): JainaStreamState {
  const nextBase: JainaStreamState = {
    ...state,
    status: state.status === "idle" ? "streaming" : state.status,
    lastEventType: event.type,
  };

  const eventType = event.type as string | undefined;
  switch (eventType) {
    case "response.plan.delta": {
      const parsed = responsePlanDeltaSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.plan.delta event" };
      }

      const nextPlanJson = `${state.planJson}${parsed.data.data.delta}`;
      const nextPlan = parsePlanFromAccumulatedDelta(nextPlanJson, state.plan);
      return {
        ...nextBase,
        planJson: nextPlanJson,
        plan: nextPlan,
      };
    }
    case "hitl.paused": {
      const parsed = hitlPausedSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed hitl.paused event" };
      }

      return {
        ...nextBase,
        pendingPlan: {
          prompt: parsed.data.data.prompt,
          status: "awaiting_approval",
        },
      };
    }
    case "canvas.actions.proposed": {
      const parsed = canvasActionsProposedSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed canvas.actions.proposed event" };
      }

      const envelope = parsed.data.data;
      const envelopeKey = JSON.stringify({
        brandId: envelope.brandId,
        userId: envelope.userId,
        sessionId: envelope.sessionId,
        actions: envelope.actions,
      });
      const hasEnvelope = state.canvasActions.some(
        (candidate) =>
          JSON.stringify({
            brandId: candidate.brandId,
            userId: candidate.userId,
            sessionId: candidate.sessionId,
            actions: candidate.actions,
          }) === envelopeKey
      );

      return {
        ...nextBase,
        canvasActions: hasEnvelope ? state.canvasActions : [...state.canvasActions, envelope],
      };
    }
    case "response.sot_report": {
      const parsed = responseSoTReportSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.sot_report event" };
      }

      const normalizedReport = normalizeSoTReportPayload(parsed.data.data.report);
      if (!normalizedReport) {
        return { ...nextBase, status: "error", error: "Invalid response.sot_report payload" };
      }

      return {
        ...nextBase,
        itemId: parsed.data.data.item_id,
        partId: parsed.data.data.part_id,
        report: normalizedReport,
        reportJson: JSON.stringify(normalizedReport),
      };
    }
    case "response.report_assembly": {
      const parsed = responseReportAssemblySchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.report_assembly event" };
      }

      return {
        ...nextBase,
        itemId: parsed.data.data.item_id,
        partId: parsed.data.data.part_id,
        reportAssembly: parsed.data.data.report,
        reportAssemblyHtml: parsed.data.data.html_preview,
        report: normalizeReportAssemblyToSoT(parsed.data.data.report),
      };
    }
    case "response.created": {
      const parsed = responseCreatedSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.created event" };
      }
      return { ...nextBase, responseId: parsed.data.data.id };
    }
    case "response.output_item.added": {
      const parsed = responseOutputItemSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.output_item.added event" };
      }
      return {
        ...nextBase,
        itemId: parsed.data.data.item.id,
        outputItemId: parsed.data.data.item.id,
      };
    }
    case "response.content_part.added": {
      const parsed = responseContentPartSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.content_part.added event" };
      }
      return {
        ...nextBase,
        itemId: parsed.data.data.item_id,
        partId: parsed.data.data.part.id,
      };
    }
    case "response.progress": {
      const parsed = progressEventSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.progress event" };
      }
      const progressPayload = parsed.data.data;
      const detail = buildProgressDetail(progressPayload);
      let nextToolCalls = state.toolCalls;
      let nextToolResults = state.toolResults;

      if (progressPayload.stage === "tool_start") {
        const toolName = String(progressPayload.tool_name ?? "").trim();
        const toolCallId = String(
          progressPayload.tool_call_id ?? progressPayload.call_id ?? ""
        ).trim();
        if (toolName) {
          const hasToolCall = state.toolCalls.some(
            (item) =>
              (toolCallId && item.id === toolCallId) ||
              (!toolCallId && item.name === toolName)
          );
          if (!hasToolCall) {
            nextToolCalls = [
              ...state.toolCalls,
              {
                id:
                  toolCallId ||
                  `${toolName}-${Date.now()}-${state.toolCalls.length + 1}`,
                name: toolName,
                args:
                  progressPayload.args &&
                  typeof progressPayload.args === "object" &&
                  !Array.isArray(progressPayload.args)
                    ? (progressPayload.args as Record<string, unknown>)
                    : {},
                metadata: { source: "response.progress", ...progressPayload },
              },
            ];
          }
        }
      }

      if (progressPayload.stage === "tool_complete") {
        const toolName = String(progressPayload.tool_name ?? "").trim();
        const toolCallId = String(
          progressPayload.tool_call_id ?? progressPayload.call_id ?? ""
        ).trim();
        if (toolName) {
          const hasToolResult = state.toolResults.some(
            (item) =>
              (toolCallId && item.id === toolCallId) ||
              (!toolCallId && item.name === toolName)
          );
          if (!hasToolResult) {
            const errorMessage =
              typeof progressPayload.error === "string"
                ? progressPayload.error
                : undefined;
            const hasError = Boolean(errorMessage && errorMessage.trim().length > 0);
            nextToolResults = [
              ...state.toolResults,
              {
                id:
                  toolCallId ||
                  `${toolName}-${Date.now()}-${state.toolResults.length + 1}`,
                name: toolName,
                ok: !hasError,
                cached: Boolean(progressPayload.cached),
                duration_ms:
                  typeof progressPayload.duration_ms === "number"
                    ? progressPayload.duration_ms
                    : undefined,
                output: progressPayload.output,
                error: hasError ? errorMessage : undefined,
              },
            ];
          }
        }
      }

      return {
        ...nextBase,
        toolCalls: nextToolCalls,
        toolResults: nextToolResults,
        progress: [
          ...state.progress,
          {
            stage: progressPayload.stage,
            at: new Date().toISOString(),
            detail,
            data: progressPayload,
          },
        ],
      };
    }
    case "thought": {
      const parsed = thoughtEventSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return nextBase;
      }
      const detail = formatThoughtDetail(parsed.data.text);
      return {
        ...nextBase,
        progress: [
          ...state.progress,
          {
            stage: "thinking",
            at: new Date().toISOString(),
            detail,
            data: parsed.data,
          },
        ],
      };
    }
    case "adk.event": {
      const parsed = adkEventSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return nextBase;
      }

      let nextState = { ...nextBase };
      const author = parsed.data.author;

      const lastAuthorEntry = [...state.progress]
        .reverse()
        .find(
          (entry) =>
            entry.data &&
            typeof entry.data === "object" &&
            "author" in (entry.data as Record<string, unknown>) &&
            (entry.data as Record<string, unknown>).author
        );
      const lastAuthor = (lastAuthorEntry?.data as Record<string, unknown> | undefined)
        ?.author as string | undefined;

      if (author && lastAuthor && author !== lastAuthor) {
        nextState = {
          ...nextState,
          progress: [
            ...nextState.progress,
            {
              stage: "handoff_start",
              at: new Date().toISOString(),
              detail: `Delegating to ${author}`,
              data: { stage: "handoff_start", to: author, from: lastAuthor },
            },
          ],
        };
      }

      for (const part of parsed.data.content.parts) {
        if ("text" in part) {
          const detail = formatThoughtDetail(part.text);
          nextState = {
            ...nextState,
            progress: [
              ...nextState.progress,
              {
                stage: "thinking",
                at: new Date().toISOString(),
                detail,
                data: { ...parsed.data, author },
              },
            ],
          };
          continue;
        }

        if ("functionCall" in part) {
          const call = part.functionCall;
          const callRecord = {
            id: call.id,
            name: call.name,
            args: call.args,
            metadata: { source: "adk.event", author },
          };

          nextState = {
            ...nextState,
            toolCalls: [...nextState.toolCalls, callRecord],
            progress: [
              ...nextState.progress,
              {
                stage: "tool_start",
                at: new Date().toISOString(),
                detail: `Running tool: ${formatToolLabel(call.name)}`,
                data: {
                  stage: "tool_start",
                  tool_name: call.name,
                  tool_call_id: call.id,
                  author,
                },
              },
            ],
          };
          continue;
        }

        if ("functionResponse" in part) {
          const response = part.functionResponse;
          const isError =
            response.response &&
            typeof response.response === "object" &&
            "error" in response.response;

          const resultRecord = {
            id: response.id,
            name: response.name,
            ok: !isError,
            cached: false,
            output: response.response,
            error: isError
              ? String((response.response as Record<string, unknown>).error)
              : undefined,
          };

          nextState = {
            ...nextState,
            toolResults: [...nextState.toolResults, resultRecord],
            progress: [
              ...nextState.progress,
              {
                stage: "tool_complete",
                at: new Date().toISOString(),
                detail: `Finished tool: ${formatToolLabel(response.name)}`,
                data: {
                  stage: "tool_complete",
                  tool_name: response.name,
                  tool_call_id: response.id,
                  author,
                },
              },
            ],
          };
        }
      }

      return nextState;
    }
    case "tool.call": {
      const parsed = toolCallSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed tool.call event" };
      }

      const hasToolCall = state.toolCalls.some((item) => item.id === parsed.data.id);
      return hasToolCall
        ? nextBase
        : { ...nextBase, toolCalls: [...state.toolCalls, parsed.data] };
    }
    case "tool.result": {
      const parsed = toolResultSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed tool.result event" };
      }

      const hasToolResult = state.toolResults.some((item) => item.id === parsed.data.id);
      return hasToolResult
        ? nextBase
        : { ...nextBase, toolResults: [...state.toolResults, parsed.data] };
    }
    case "artifact.delta": {
      const parsed = artifactDeltaSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return nextBase;
      }
      return {
        ...nextBase,
        artifacts: {
          creatives: [...(state.artifacts.creatives || []), ...(parsed.data.creatives || [])],
          images: [...(state.artifacts.images || []), ...(parsed.data.images || [])],
        },
      };
    }
    case "response.plan.requested": {
      const parsed = parsePlanRequestedPayload((event as { data?: unknown }).data ?? {});
      if (!parsed) {
        return { ...nextBase, status: "error", error: "Malformed response.plan.requested event" };
      }
      const currentPlan = state.plan;
      return {
        ...nextBase,
        pendingPlan: {
          prompt: parsed.summary,
          status: "awaiting_approval",
        },
        plan: {
          id: parsed.plan_id,
          title: currentPlan?.title || "Execution Plan",
          description: parsed.summary || currentPlan?.description || "Review and approve this plan.",
          status: "awaiting_approval",
          steps: currentPlan?.steps || [],
        },
      };
    }
    case "response.plan.decision": {
      const parsed = parsePlanDecisionPayload((event as { data?: unknown }).data ?? {});
      if (!parsed) {
        return { ...nextBase, status: "error", error: "Malformed response.plan.decision event" };
      }
      const nextPlan =
        state.plan && state.plan.id === parsed.plan_id
          ? {
              ...state.plan,
              status: parsed.status,
            }
          : state.plan;

      return {
        ...nextBase,
        plan: nextPlan,
        pendingPlan: null,
        lastPlanDecision: parsed,
      };
    }
    case "response.output_json.delta": {
      const parsed = outputJsonDeltaSchema.safeParse((event as { data?: unknown }).data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.output_json.delta event" };
      }
      const nextReportJson = `${state.reportJson}${parsed.data.delta}`;
      const parsedReport =
        parseReportFromAccumulatedText(nextReportJson) ??
        parsePartialReportFromAccumulatedText(nextReportJson);
      return {
        ...nextBase,
        reportJson: nextReportJson,
        report: pickRicherReport(state.report, parsedReport),
      };
    }
    case "response.output_text.delta": {
      const parsed = outputTextDeltaSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed response.output_text.delta event" };
      }

      const payload = parsed.data.data;
      const nextReportJson = `${state.reportJson}${payload.delta}`;
      const parsedReport =
        parseReportFromAccumulatedText(nextReportJson) ??
        parsePartialReportFromAccumulatedText(nextReportJson);

      return {
        ...nextBase,
        ...(payload.item_id && !nextBase.outputItemId
          ? { outputItemId: payload.item_id }
          : {}),
        reportJson: nextReportJson,
        responseText: `${state.responseText}${payload.delta}`,
        report: pickRicherReport(state.report, parsedReport),
      };
    }
    case "state.delta": {
      const parsed = stateDeltaSchema.safeParse(event);
      if (!parsed.success || !parsed.data.data) {
        return { ...nextBase, status: "error", error: "Malformed state.delta event" };
      }

      const payload = parsed.data.data;
      const nextStateDeltas = [...state.stateDeltas, payload];
      const toolDeltaPayload = asRecord(payload.delta) ?? {};
      const hydratedTools = hydrateToolsFromStateDelta(toolDeltaPayload);
      const { merged: mergedToolCalls, added: addedToolCalls } = mergeToolCalls(
        state.toolCalls,
        hydratedTools.toolCalls
      );
      const { merged: mergedToolResults, added: addedToolResults } = mergeToolResults(
        state.toolResults,
        hydratedTools.toolResults
      );
      const nextProgress = [
        ...state.progress,
        ...addedToolCalls.map((toolCall) => ({
          stage: "tool_start",
          at: new Date().toISOString(),
          detail: `Running tool: ${formatToolLabel(toolCall.name)}`,
          data: {
            stage: "tool_start",
            source: payload.source,
            tool_name: toolCall.name,
            tool_call_id: toolCall.id,
            args: toolCall.args,
          },
        })),
        ...addedToolResults.map((toolResult) => ({
          stage: "tool_complete",
          at: new Date().toISOString(),
          detail: `Finished tool: ${formatToolLabel(toolResult.name)}`,
          data: {
            stage: "tool_complete",
            source: payload.source,
            tool_name: toolResult.name,
            tool_call_id: toolResult.id,
            output: toolResult.output,
            error: toolResult.error,
          },
        })),
      ];
      if (payload.source !== "hitl_feedback") {
        return {
          ...nextBase,
          stateDeltas: nextStateDeltas,
          toolCalls: mergedToolCalls,
          toolResults: mergedToolResults,
          progress: nextProgress,
        };
      }

      const decision = parsePlanDecisionPayload(payload.delta);
      if (!decision) {
        return {
          ...nextBase,
          stateDeltas: nextStateDeltas,
          toolCalls: mergedToolCalls,
          toolResults: mergedToolResults,
          progress: nextProgress,
        };
      }

      const nextPlan =
        state.plan && state.plan.id === decision.plan_id
          ? {
              ...state.plan,
              status: decision.status,
            }
          : state.plan;

      return {
        ...nextBase,
        stateDeltas: nextStateDeltas,
        toolCalls: mergedToolCalls,
        toolResults: mergedToolResults,
        progress: nextProgress,
        plan: nextPlan,
        pendingPlan: null,
        lastPlanDecision: decision,
      };
    }
    case "error": {
      const parsed = streamErrorSchema.safeParse(event);
      const message =
        parsed.success && parsed.data.data ? parsed.data.data.message : "Stream error";
      return { ...nextBase, status: "error", error: message };
    }
    case "response.output_item.done": {
      const parsed = responseOutputItemDoneSchema.safeParse(event);
      if (parsed.success && parsed.data.data?.item_id && parsed.data.data.item_id !== state.outputItemId) {
        return nextBase;
      }
      if (!state.reportJson.trim() || state.report) {
        return nextBase;
      }
      const parsedReport = parseReportFromAccumulatedText(state.reportJson);
      if (parsedReport) {
        return { ...nextBase, report: parsedReport };
      }
      return nextBase;
    }
    case "response.content_part.done": {
      const parsed = responseContentPartDoneSchema.safeParse(event);
      if (parsed.success && parsed.data.data?.part_id && state.partId && parsed.data.data.part_id !== state.partId) {
        return nextBase;
      }
      if (!state.reportJson.trim() || state.report) {
        return nextBase;
      }
      const parsedReport = parseReportFromAccumulatedText(state.reportJson);
      if (parsedReport) {
        return { ...nextBase, report: parsedReport };
      }
      return nextBase;
    }
    case "response.done": {
      const parsed = responseDoneSchema.safeParse(event);
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.done event" };
      }
      if (!state.reportJson.trim()) {
        return { ...nextBase, status: "complete" };
      }
      const parsedReport = parseReportFromAccumulatedText(state.reportJson);
      if (parsedReport) {
        return { ...nextBase, status: "complete", report: parsedReport };
      }
      return { ...nextBase, status: "complete" };
    }
    default:
      return nextBase;
  }
}

function buildProgressDetail(data: ProgressEventData): string | undefined {
  if (data.stage === "handoff_start") {
    return `Delegating to ${String(data.to ?? "specialist")}`;
  }
  if (data.stage === "handoff_complete") {
    return `Completed ${String(data.from ?? "handoff")}`;
  }
  if (data.stage === "synthesis_start") {
    return `Synthesizing across ${String(
      data.specialist_count ?? "multiple"
    )} specialists`;
  }
  if (data.stage === "synthesis_complete") {
    return "Synthesis complete";
  }
  if (data.stage === "report_ready") {
    return "Report ready";
  }
  if (data.stage === "canvas_complete") {
    return "Canvas update complete";
  }
  if (data.stage === "tool_start") {
    return `Running tool: ${formatToolLabel(data.tool_name)}`;
  }
  if (data.stage === "tool_complete") {
    return `Finished tool: ${formatToolLabel(data.tool_name)}`;
  }
  return undefined;
}

function formatToolLabel(toolName: unknown) {
  const value = String(toolName ?? "unknown");
  if (value === "router") {
    return "Consulting the Council";
  }
  return value.replace(/_/g, " ");
}

type ThoughtPayload = Record<string, unknown>;

function formatThoughtDetail(text: string | undefined): string | undefined {
  if (!text) return text;

  const parsed = parseThoughtPayload(text);
  if (!parsed) {
    return stripThoughtCodeFence(text);
  }

  const summary =
    getNonEmptyString(parsed.summary) ??
    getNonEmptyString(parsed.summary_text) ??
    getNonEmptyString(parsed.summaryText) ??
    getNonEmptyString(parsed.content);

  const insights = formatInsightItems(parsed.insights);
  const recommendations = formatRecommendationItems(parsed.recommendations);
  const nextSteps = formatNextStepItems(parsed.next_steps);
  const tables = formatTableItems(parsed.tables);

  const parts: string[] = [];
  if (summary) {
    parts.push(summary);
  } else {
    const scope = getNonEmptyString(parsed.scope);
    if (scope) {
      parts.push(`Scope: ${scope}`);
    }
  }

  if (insights.length > 0) {
    parts.push(`Insights: ${insights.join("; ")}`);
  }
  if (recommendations.length > 0) {
    parts.push(`Recommendations: ${recommendations.join("; ")}`);
  }
  if (nextSteps.length > 0) {
    parts.push(`Next steps: ${nextSteps.join("; ")}`);
  }
  if (tables.length > 0) {
    parts.push(`Tables: ${tables.join("; ")}`);
  }

  return parts.length > 0 ? parts.join(" • ") : undefined;
}

function parseThoughtPayload(text: string): ThoughtPayload | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as ThoughtPayload;
  } catch {
    return null;
  }
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  return null;
}

function stripThoughtCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return text.trim();
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatInsightItems(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return getNonEmptyString(item);
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const title =
        getNonEmptyString(record.title) ??
        getNonEmptyString(record.label) ??
        getNonEmptyString(record.value);
      const description = getNonEmptyString(record.description);
      if (title && description) return `${title} — ${description}`;
      return title ?? description;
    })
    .filter((item): item is string => Boolean(item));
}

function formatRecommendationItems(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return getNonEmptyString(item);
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const title =
        getNonEmptyString(record.title) ?? getNonEmptyString(record.action);
      const priority = getNonEmptyString(record.priority);
      const rationale = getNonEmptyString(record.rationale);
      if (title && priority) return `${title} (${priority})`;
      if (title) return title;
      return rationale;
    })
    .filter((item): item is string => Boolean(item));
}

function formatNextStepItems(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (typeof item === "string") return getNonEmptyString(item);
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      return (
        getNonEmptyString(record.title) ??
        getNonEmptyString(record.action) ??
        getNonEmptyString(record.step)
      );
    })
    .filter((item): item is string => Boolean(item));
}

function formatTableItems(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      return getNonEmptyString(record.title);
    })
    .filter((item): item is string => Boolean(item));
}
