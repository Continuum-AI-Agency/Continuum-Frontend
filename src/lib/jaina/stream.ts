import {
  jainaStreamEventSchema,
  outputJsonDeltaSchema,
  progressEventSchema,
  responseContentPartSchema,
  responseCreatedSchema,
  responseOutputItemSchema,
  reportPayloadSchema,
  stateDeltaSchema,
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
  report: ReportPayload | null;
  plan: JainaPlan | null;
  error?: string;
  responseId?: string;

  itemId?: string;
  partId?: string;
  progress: JainaProgressEntry[];
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
  stateDeltas: StateDeltaEventData[];
  lastEventType?: string;
};

export function createInitialJainaStreamState(): JainaStreamState {
  return {
    status: "idle",
    reportJson: "",
    report: null,
    plan: null,
    progress: [],
    toolCalls: [],
    toolResults: [],
    stateDeltas: [],
  };
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
      return { ...nextBase, itemId: parsed.data.item.id };
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
      return {
        ...nextBase,
        reportJson: `${state.reportJson}${parsed.data.delta}`,
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
    case "error": {
      const parsed = streamErrorSchema.safeParse(event.data ?? {});
      const message = parsed.success ? parsed.data.message : "Stream error";
      return { ...nextBase, status: "error", error: message };
    }
    case "response.content_part.done":
    case "response.output_item.done": {
      if (!state.reportJson.trim() || state.report) {
        return nextBase;
      }
      try {
        const parsedReport = reportPayloadSchema.safeParse(
          JSON.parse(state.reportJson)
        );
        if (parsedReport.success) {
          return { ...nextBase, report: parsedReport.data };
        }
      } catch {
        return nextBase;
      }
      return nextBase;
    }
    case "response.done": {
      if (!state.reportJson.trim()) {
        return { ...nextBase, status: "complete" };
      }
      try {
        const parsedReport = reportPayloadSchema.safeParse(
          JSON.parse(state.reportJson)
        );
        if (!parsedReport.success) {
          return {
            ...nextBase,
            status: "error",
            error: "Invalid report schema",
          };
        }
        return { ...nextBase, status: "complete", report: parsedReport.data };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid report payload";
        return { ...nextBase, status: "error", error: message };
      }
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
