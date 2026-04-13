import type { ToolCallEventData, ToolResultEventData } from "@/lib/jaina/schemas";
import type { JainaProgressEntry } from "@/lib/jaina/stream";

export type ThinkingSegment =
  | { kind: "thought"; id: string; entries: JainaProgressEntry[] }
  | { kind: "tools"; id: string; toolRefs: string[] }
  | { kind: "handoff"; id: string; from: string | null; to: string; objective: string | null; status: "started" | "completed" | "failed" };

export type ResolvedToolEntry = {
  id: string;
  name: string;
  toolCall?: ToolCallEventData;
  toolResult?: ToolResultEventData;
  state: "output-available" | "error" | "running";
};

export type ToolCluster = {
  key: string;
  name: string;
  entries: ResolvedToolEntry[];
  completedCount: number;
  errorCount: number;
  runningCount: number;
};

export function formatToolLabel(toolName: string): string {
  return toolName === "router"
    ? "Consulting the Council"
    : toolName.replace(/_/g, " ");
}

export function formatAgentLabel(scope: string): string {
  if (scope === "router") return "Router";
  return scope
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toMarkdownDetail(detail: string | undefined): string | null {
  if (!detail) return null;

  const trimmed = detail.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const preferred = [
          record.reasoning,
          record.summary,
          record.message,
          record.flow,
          record.description,
        ].find((value) => typeof value === "string" && value.trim().length > 0);

        if (typeof preferred === "string") {
          return preferred;
        }
      }

      return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      return detail;
    }
  }

  return detail;
}

const NOISY_STAGE_PATTERNS = [
  "prefetch",
  "working_memory",
  "quick_path",
  "fallback",
  "memory_ready",
];

export function isNoisyStage(stage: string): boolean {
  const normalized = stage.trim().toLowerCase();
  return NOISY_STAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getProgressValueAsString(data: unknown, key: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function resolveToolProgressMetadata(entry: JainaProgressEntry) {
  const toolCallId =
    getProgressValueAsString(entry.data, "tool_call_id") ||
    getProgressValueAsString(entry.data, "call_id");
  const toolName = getProgressValueAsString(entry.data, "tool_name");
  return { toolCallId, toolName };
}

export function isToolProgressEntry(entry: JainaProgressEntry): boolean {
  if (entry.stage === "tool_start" || entry.stage === "tool_complete") {
    return true;
  }
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  return Boolean(toolCallId || toolName);
}

export function resolveToolRef(
  entry: JainaProgressEntry,
  toolCalls: ToolCallEventData[],
  usedCallIds: Set<string>
): string | null {
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  if (toolCallId) return `id:${toolCallId}`;
  if (!toolName) return null;

  const matchingCall = toolCalls.find(
    (toolCall) =>
      toolCall.name === toolName &&
      !usedCallIds.has(toolCall.id)
  );
  if (matchingCall) {
    usedCallIds.add(matchingCall.id);
    return `id:${matchingCall.id}`;
  }

  return `name:${toolName}`;
}

export function buildThinkingSegments(
  reasoning: JainaProgressEntry[],
  toolCalls: ToolCallEventData[]
): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  const currentThoughtEntries: JainaProgressEntry[] = [];
  const currentToolRefs: string[] = [];
  const usedCallIds = new Set<string>();

  const flushThoughts = () => {
    if (currentThoughtEntries.length === 0) return;
    segments.push({
      kind: "thought",
      id: `thought-${segments.length + 1}`,
      entries: [...currentThoughtEntries],
    });
    currentThoughtEntries.length = 0;
  };

  const flushTools = () => {
    if (currentToolRefs.length === 0) return;
    segments.push({
      kind: "tools",
      id: `tools-${segments.length + 1}`,
      toolRefs: [...currentToolRefs],
    });
    currentToolRefs.length = 0;
  };

  for (const entry of reasoning) {
    if (entry.stage === "handoff_start" || entry.stage === "handoff_complete") {
      flushThoughts();
      flushTools();
      const data = entry.data as Record<string, unknown> | undefined;
      segments.push({
        kind: "handoff",
        id: `handoff-${segments.length + 1}`,
        from: typeof data?.from_scope === "string" ? data.from_scope : null,
        to: typeof data?.to_scope === "string" ? data.to_scope : "unknown",
        objective: typeof data?.objective === "string" ? data.objective : null,
        status: entry.stage === "handoff_start"
          ? "started"
          : (data?.status === "failed" ? "failed" : "completed"),
      });
      continue;
    }

    if (isToolProgressEntry(entry)) {
      flushThoughts();
      const toolRef = resolveToolRef(entry, toolCalls, usedCallIds);
      if (toolRef && !currentToolRefs.includes(toolRef)) {
        currentToolRefs.push(toolRef);
      }
      continue;
    }

    if (entry.stage !== "thinking" || isNoisyStage(entry.stage)) {
      continue;
    }

    if (!toMarkdownDetail(entry.detail)) {
      continue;
    }

    flushTools();
    currentThoughtEntries.push(entry);
  }

  flushThoughts();
  flushTools();

  if (segments.length === 0 && toolCalls.length > 0) {
    return [
      {
        kind: "tools",
        id: "tools-1",
        toolRefs: toolCalls.map((toolCall) => `id:${toolCall.id}`),
      },
    ];
  }

  return segments;
}

export function resolveToolCallFromRef(
  toolRef: string,
  toolCalls: ToolCallEventData[]
): ToolCallEventData | undefined {
  if (toolRef.startsWith("id:")) {
    const id = toolRef.slice(3);
    return toolCalls.find((toolCall) => toolCall.id === id);
  }
  if (toolRef.startsWith("name:")) {
    const name = toolRef.slice(5);
    return toolCalls.find((toolCall) => toolCall.name === name);
  }
  return undefined;
}

export function resolveToolResultFromRef(
  toolRef: string,
  toolResults: ToolResultEventData[]
): ToolResultEventData | undefined {
  if (toolRef.startsWith("id:")) {
    const id = toolRef.slice(3);
    return toolResults.find((toolResult) => toolResult.id === id);
  }
  if (toolRef.startsWith("name:")) {
    const name = toolRef.slice(5);
    return toolResults.find((toolResult) => toolResult.name === name);
  }
  return undefined;
}

export function resolveToolEntries(
  toolRefs: string[],
  toolCalls: ToolCallEventData[],
  toolResults: ToolResultEventData[]
): ResolvedToolEntry[] {
  return toolRefs.map((toolRef, index) => {
    const toolCall = resolveToolCallFromRef(toolRef, toolCalls);
    const toolResult = resolveToolResultFromRef(toolRef, toolResults);
    const name = toolCall?.name || toolResult?.name || toolRef.replace(/^name:/, "");
    const state: "output-available" | "error" | "running" = toolResult
      ? toolResult.ok
        ? "output-available"
        : "error"
      : "running";

    return {
      id: `${toolRef}-${toolCall?.id ?? toolResult?.id ?? index}`,
      name,
      toolCall,
      toolResult,
      state,
    };
  });
}

export function clusterToolEntries(entries: ResolvedToolEntry[]): ToolCluster[] {
  const order: string[] = [];
  const groups = new Map<string, ToolCluster>();

  for (const entry of entries) {
    const key = entry.name || "tool";
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, {
        key,
        name: entry.name || "tool",
        entries: [],
        completedCount: 0,
        errorCount: 0,
        runningCount: 0,
      });
    }
    const group = groups.get(key);
    if (!group) continue;

    group.entries.push(entry);
    if (entry.state === "output-available") group.completedCount += 1;
    if (entry.state === "error") group.errorCount += 1;
    if (entry.state === "running") group.runningCount += 1;
  }

  return order
    .map((key) => groups.get(key))
    .filter((group): group is ToolCluster => Boolean(group));
}
