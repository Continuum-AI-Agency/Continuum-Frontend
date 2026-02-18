import {
  jainaStreamEventSchema,
  outputJsonDeltaSchema,
  outputTextDeltaSchema,
  progressEventSchema,
  responseContentPartSchema,
  responseCreatedSchema,
  responseOutputItemSchema,
  responseOutputItemDoneSchema,
  reportPayloadSchema,
  stateDeltaSchema,
  artifactDeltaSchema,
  streamErrorSchema,
  toolCallSchema,
  toolResultSchema,
  thoughtEventSchema,
  adkEventSchema,
  responsePlanDeltaSchema,
  type JainaStreamEvent,
  type ProgressEventData,
  type ReportPayload,
  type StateDeltaEventData,
  type ArtifactDeltaEventData,
  type ToolCallEventData,
  type ToolResultEventData,
  type PlanStep,
} from "./schemas";
import type { JainaPlan } from "@/components/paid-media/jaina/types";

export type JainaStreamStatus = "idle" | "starting" | "streaming" | "complete" | "error";

export type JainaProgressEntry = {
  stage: string;
  at: string;
  detail?: string;
  data: any;
};

export type JainaStreamState = {
  status: JainaStreamStatus;
  reportJson: string;
  responseText: string;
  report: ReportPayload | null;
  plan: JainaPlan | null;
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
  lastEventType?: string;
};

export function createInitialJainaStreamState(): JainaStreamState {
  return {
    status: "idle",
    reportJson: "",
    responseText: "",
    report: null,
    plan: null,
    progress: [],
    toolCalls: [],
    toolResults: [],
    stateDeltas: [],
    artifacts: {},
  };
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

export function parseJainaStreamEvent(line: string): JainaStreamEvent | null {
  try {
    const json = JSON.parse(line);
    const parsed = jainaStreamEventSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }
    console.warn("Invalid Jaina stream event schema:", parsed.error, "Line:", line);
  } catch (error) {
    console.error("Failed to parse Jaina stream event JSON:", error, "Line:", line);
  }
  return null;
}

export function reduceJainaStreamEvent(
  state: JainaStreamState,
  event: JainaStreamEvent
): JainaStreamState {
  const nextBase: JainaStreamState = {
    ...state,
    status: state.status === "idle" ? "streaming" : state.status,
    lastEventType: event.type,
  };

  switch (event.type) {
    case "response.plan.delta": {
      const parsed = responsePlanDeltaSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.plan.delta event" };
      }

      const currentPlan: JainaPlan = state.plan || {
        id: parsed.data.id || "plan-1",
        title: parsed.data.title || "Execution Plan",
        description: parsed.data.description || "Review the plan below.",
        status: (parsed.data.status as any) || "pending",
        steps: [],
      };

      const newSteps = parsed.data.steps
        ? parsed.data.steps.map((s) => ({
            title: s.title,
            description: s.description,
            status: (s.status as any) || "pending",
          }))
        : currentPlan.steps;

      return {
        ...nextBase,
        plan: {
          ...currentPlan,
          id: parsed.data.id || currentPlan.id,
          title: parsed.data.title || currentPlan.title,
          description: parsed.data.description || currentPlan.description,
          status: (parsed.data.status as any) || currentPlan.status,
          steps: newSteps,
        },
      };
    }
    case "response.created": {
      const parsed = responseCreatedSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.created event" };
      }
      return { ...nextBase, responseId: parsed.data.id };
    }
    case "response.output_item.added": {
      const parsed = responseOutputItemSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.output_item.added event" };
      }
      return { ...nextBase, itemId: parsed.data.item.id, outputItemId: parsed.data.item.id };
    }
    case "response.content_part.added": {
      const parsed = responseContentPartSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.content_part.added event" };
      }
      return {
        ...nextBase,
        itemId: parsed.data.item_id,
        partId: parsed.data.part.id,
      };
    }
    case "response.progress": {
      const parsed = progressEventSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.progress event" };
      }
      const detail = buildProgressDetail(parsed.data);
      return {
        ...nextBase,
        progress: [
          ...state.progress,
          { stage: parsed.data.stage, at: new Date().toISOString(), detail, data: parsed.data },
        ],
      };
    }
    case "thought": {
      const parsed = thoughtEventSchema.safeParse(event.data ?? {});
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
      const parsed = adkEventSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return nextBase;
      }
      
      let newState = { ...nextBase };
      const author = parsed.data.author;

      const lastAuthorEntry = [...state.progress]
        .reverse()
        .find((p) => p.data && typeof p.data === "object" && "author" in p.data && p.data.author);
      const lastAuthor = lastAuthorEntry?.data?.author;

      if (author && lastAuthor && author !== lastAuthor) {
        newState = {
          ...newState,
          progress: [
            ...newState.progress,
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
          const text = part.text;
          const detail = formatThoughtDetail(text);
          newState = {
            ...newState,
            progress: [
              ...newState.progress,
              {
                stage: "thinking",
                at: new Date().toISOString(),
                detail,
                data: { ...parsed.data, author },
              },
            ],
          };
        } else if ("functionCall" in part) {
          const call = part.functionCall;
          const toolCall = {
            id: call.id,
            name: call.name,
            args: call.args,
            metadata: {},
          };
          newState = {
            ...newState,
            toolCalls: [...newState.toolCalls, toolCall],
            progress: [
              ...newState.progress,
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
        } else if ("functionResponse" in part) {
          const res = part.functionResponse;
          const isError = res.response && typeof res.response === "object" && "error" in res.response;
          const toolResult = {
            id: res.id,
            name: res.name,
            ok: !isError,
            cached: false,
            output: res.response,
            error: isError ? String((res.response as any).error) : undefined,
          };
          newState = {
            ...newState,
            toolResults: [...newState.toolResults, toolResult],
            progress: [
              ...newState.progress,
              {
                stage: "tool_complete",
                at: new Date().toISOString(),
                detail: `Finished tool: ${formatToolLabel(res.name)}`,
                data: {
                  stage: "tool_complete",
                  tool_name: res.name,
                  tool_call_id: res.id,
                  author,
                },
              },
            ],
          };
        }
      }
      return newState;
    }
    case "response.output_json.delta": {
      const parsed = outputJsonDeltaSchema.safeParse(event.data ?? {});
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
      const parsed = outputTextDeltaSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed response.output_text.delta event" };
      }
      // Track the item_id from delta if not already set
      const itemId = parsed.data.item_id;
      const nextReportJson = `${state.reportJson}${parsed.data.delta}`;
      const parsedReport =
        parseReportFromAccumulatedText(nextReportJson) ??
        parsePartialReportFromAccumulatedText(nextReportJson);
      return {
        ...nextBase,
        ...(itemId && !nextBase.outputItemId ? { outputItemId: itemId } : {}),
        reportJson: nextReportJson,
        responseText: `${state.responseText || ""}${parsed.data.delta}`,
        report: pickRicherReport(state.report, parsedReport),
      };
    }
    case "tool.call": {
      const parsed = toolCallSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed tool.call event" };
      }
      return { ...nextBase, toolCalls: [...state.toolCalls, parsed.data] };
    }
    case "tool.result": {
      const parsed = toolResultSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed tool.result event" };
      }
      return { ...nextBase, toolResults: [...state.toolResults, parsed.data] };
    }
    case "state.delta": {
      const parsed = stateDeltaSchema.safeParse(event.data ?? {});
      if (!parsed.success) {
        return { ...nextBase, status: "error", error: "Malformed state.delta event" };
      }
      return { ...nextBase, stateDeltas: [...state.stateDeltas, parsed.data] };
    }
    case "artifact.delta": {
      const parsed = artifactDeltaSchema.safeParse(event.data ?? {});
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
    case "error": {
      const parsed = streamErrorSchema.safeParse(event.data ?? {});
      const message = parsed.success ? parsed.data.message : "Stream error";
      return { ...nextBase, status: "error", error: message };
    }
    case "response.output_item.done": {
      const parsed = responseOutputItemDoneSchema.safeParse(event.data ?? {});
      if (parsed.success) {
        if (parsed.data.item_id !== state.outputItemId) {
          return nextBase;
        }
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
      if (!state.reportJson.trim()) {
        return { ...nextBase, status: "complete" };
      }
      const parsedReport = parseReportFromAccumulatedText(state.reportJson);
      if (parsedReport) {
        return { ...nextBase, status: "complete", report: parsedReport };
      }
      return { ...nextBase, status: "complete" };
    }
    case undefined: {
      const eventData = event as Record<string, unknown>;
      const content = eventData.content as Record<string, unknown> | undefined;
      const parts = content?.parts as Array<Record<string, unknown>> | undefined;
      if (!parts) {
        return nextBase;
      }
      for (const part of parts) {
        const text = part.text as string | undefined;
        if (text?.trim().startsWith("{") && text.trim().endsWith("}")) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.specialist_insights || parsed.performance_summary || parsed.key_insights) {
              return {
                ...nextBase,
                reportJson: text,
                responseText: parsed.thought || parsed.user_query || "",
              };
            }
          } catch {}
        }
      }
      return nextBase;
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
