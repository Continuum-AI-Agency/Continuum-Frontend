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
  type JainaStreamEvent,
  type ProgressEventData,
  type ReportPayload,
  type StateDeltaEventData,
  type ToolCallEventData,
  type ToolResultEventData,
} from "./schemas";

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
      return {
        ...nextBase,
        progress: [
          ...state.progress,
          {
            stage: "thinking",
            at: new Date().toISOString(),
            detail: parsed.data.text,
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
      const text = parsed.data.content?.parts?.[0]?.text;
      if (text) {
        return {
          ...nextBase,
          progress: [
            ...state.progress,
            {
              stage: "thinking",
              at: new Date().toISOString(),
              detail: text,
              data: parsed.data,
            },
          ],
        };
      }
      return nextBase;
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
    return `Running tool: ${String(data.tool_name ?? "unknown").replace(
      /_/g,
      " "
    )}`;
  }
  if (data.stage === "tool_complete") {
    return `Finished tool: ${String(data.tool_name ?? "unknown").replace(
      /_/g,
      " "
    )}`;
  }
  return undefined;
}
