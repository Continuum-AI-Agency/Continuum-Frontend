import type { ToolCallEventData, ToolResultEventData } from '@/lib/jaina/schemas';
import type { JainaProgressEntry } from '@/lib/jaina/stream';

export type AgentLifecycleSegment = {
  kind: 'agent_lifecycle';
  id: string;
  agentId: string;
  agentLabel: string;
  taskDescription?: string;
  spawnTs?: number;
  completeStatus?: 'completed' | 'failed' | 'cancelled' | 'partial';
  durationMs?: number;
  error?: string;
  workerToolRefs?: string[];
};

export type ThinkingSegment =
  | { kind: 'thought'; id: string; entries: JainaProgressEntry[] }
  | { kind: 'tools'; id: string; toolRefs: string[] }
  | {
      kind: 'handoff';
      id: string;
      from: string | null;
      to: string;
      objective: string | null;
      status: 'started' | 'completed' | 'failed';
    }
  | AgentLifecycleSegment;

export type ResolvedToolEntry = {
  id: string;
  name: string;
  toolCall?: ToolCallEventData;
  toolResult?: ToolResultEventData;
  state: 'output-available' | 'error' | 'running';
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
  return toolName === 'router' ? 'Consulting the Council' : toolName.replace(/_/g, ' ');
}

// Human-readable labels for the backend progress stages the run emits. Used for
// both the collapsed-window stage pill and the always-visible live status line.
export const STAGE_LABELS: Record<string, string> = {
  thinking: 'Thinking',
  context_loaded: 'Context loaded',
  tool_start: 'Gathering data',
  tool_complete: 'Reviewing data',
  delegation_start: 'Delegating',
  delegation_complete: 'Delegation complete',
  handoff_start: 'Delegating',
  handoff_complete: 'Handoff complete',
  agent_spawn: 'Sub-agent working',
  agent_complete: 'Sub-agent complete',
  synthesis_start: 'Writing report',
  synthesis_complete: 'Report ready',
  assembly_start: 'Assembling report',
  report_ready: 'Report ready',
  canvas_start: 'Updating canvas',
  canvas_complete: 'Canvas updated',
};

// Wall-clock span of a finished run's reasoning, surfaced as the collapsed
// "Thought for Ns" header (mirrors ChatGPT's reasoning summary). Spans the first
// to the last progress entry, so it includes tool/delegation time, not just the
// model's thinking. Returns null when the span is under a second or unknowable,
// letting the caller fall back to a plain "Reasoning trace" label.
export function formatThoughtDuration(reasoning: JainaProgressEntry[]): string | null {
  const timestamps = reasoning
    .map((entry) => Date.parse(entry.at))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length < 2) return null;

  const elapsedMs = Math.max(...timestamps) - Math.min(...timestamps);
  if (elapsedMs < 1000) return null;

  return `Thought for ${Math.round(elapsedMs / 1000)}s`;
}

export function humanizeStage(stage: string): string {
  const normalized = stage.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Working';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function stageEntryToLiveLabel(entry: JainaProgressEntry): string | null {
  const stage = entry.stage;
  if (!stage) return null;
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const toolName = typeof data.tool_name === 'string' ? data.tool_name : undefined;
  if ((stage === 'tool_start' || stage === 'tool_complete') && toolName) {
    const friendly = formatToolLabel(toolName);
    return stage === 'tool_start' ? `Pulling ${friendly}` : `Reviewing ${friendly}`;
  }
  return STAGE_LABELS[stage] ?? humanizeStage(stage);
}

// The most recent meaningful activity, surfaced as the live status line. Reads
// the latest progress entry so the label tracks what Jaina is doing right now
// (a tool name, a delegation, "Writing report") instead of a generic spinner.
export function deriveLiveStatusLabel(reasoning: JainaProgressEntry[]): string | null {
  for (let i = reasoning.length - 1; i >= 0; i -= 1) {
    const label = stageEntryToLiveLabel(reasoning[i]);
    if (label) return label;
  }
  return null;
}

const KNOWN_AGENT_LABELS: Record<string, string> = {
  l2_worker_agent: 'Worker Agent',
  strategist: 'Strategist',
  canvas_agent: 'Canvas Agent',
  synthesis_agent: 'Synthesis',
  routing_agent: 'Router',
};

export function formatAgentLabel(scope: string): string {
  const normalized = scope.startsWith('Jaina_') ? scope.slice('Jaina_'.length) : scope;
  if (normalized in KNOWN_AGENT_LABELS) return KNOWN_AGENT_LABELS[normalized];
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toMarkdownDetail(detail: string | undefined): string | null {
  if (!detail) return null;

  const trimmed = detail.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const preferred = [
          record.reasoning,
          record.summary,
          record.message,
          record.flow,
          record.description,
        ].find((value) => typeof value === 'string' && value.trim().length > 0);

        if (typeof preferred === 'string') {
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
  'prefetch',
  'working_memory',
  'quick_path',
  'fallback',
  'memory_ready',
];

export function isNoisyStage(stage: string): boolean {
  const normalized = stage.trim().toLowerCase();
  return NOISY_STAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function getProgressValueAsString(data: unknown, key: string): string {
  if (!data || typeof data !== 'object') return '';
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveToolProgressMetadata(entry: JainaProgressEntry) {
  const toolCallId =
    getProgressValueAsString(entry.data, 'tool_call_id') ||
    getProgressValueAsString(entry.data, 'call_id') ||
    getProgressValueAsString(entry.data, 'id');
  const toolName =
    getProgressValueAsString(entry.data, 'tool_name') ||
    getProgressValueAsString(entry.data, 'name');
  return { toolCallId, toolName };
}

export function isToolProgressEntry(entry: JainaProgressEntry): boolean {
  if (entry.stage === 'tool_start' || entry.stage === 'tool_complete') {
    return true;
  }
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  return Boolean(toolCallId || toolName);
}

export function resolveToolRef(
  entry: JainaProgressEntry,
  toolCalls: ToolCallEventData[],
  usedCallIds: Set<string>,
): string | null {
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  if (toolCallId) return `id:${toolCallId}`;
  if (!toolName) return null;

  const matchingCall = toolCalls.find(
    (toolCall) => toolCall.name === toolName && !usedCallIds.has(toolCall.id),
  );
  if (matchingCall) {
    usedCallIds.add(matchingCall.id);
    return `id:${matchingCall.id}`;
  }

  return `name:${toolName}`;
}

function getToolAgentId(entry: JainaProgressEntry): string | null {
  const data = entry.data;
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const agentId = record.agent_id;
  if (typeof agentId === 'string' && agentId.trim()) return agentId;
  const parentAgentId = record.parent_agent_id;
  return typeof parentAgentId === 'string' && parentAgentId.trim() ? parentAgentId : null;
}

function isInternalCoreHandoff(data: Record<string, unknown> | undefined) {
  const toScope = typeof data?.to_scope === 'string' ? data.to_scope : '';
  const displayName = typeof data?.display_name === 'string' ? data.display_name : '';
  const name = typeof data?.name === 'string' ? data.name : '';
  return toScope.toLowerCase() === 'core' && !displayName.trim() && !name.trim();
}

export function buildThinkingSegments(
  reasoning: JainaProgressEntry[],
  toolCalls: ToolCallEventData[],
): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  const currentThoughtEntries: JainaProgressEntry[] = [];
  const currentToolRefs: string[] = [];
  const usedCallIds = new Set<string>();
  const agentSegmentIndex = new Map<string, number>();

  const flushThoughts = () => {
    if (currentThoughtEntries.length === 0) return;
    segments.push({
      kind: 'thought',
      id: `thought-${segments.length + 1}`,
      entries: [...currentThoughtEntries],
    });
    currentThoughtEntries.length = 0;
  };

  const flushTools = () => {
    if (currentToolRefs.length === 0) return;
    segments.push({
      kind: 'tools',
      id: `tools-${segments.length + 1}`,
      toolRefs: [...currentToolRefs],
    });
    currentToolRefs.length = 0;
  };

  for (const entry of reasoning) {
    if (entry.stage === 'agent_spawn') {
      flushThoughts();
      flushTools();
      const data = entry.data as Record<string, unknown> | undefined;
      const agentId = typeof data?.agent_id === 'string' ? data.agent_id : 'unknown';
      const agentLabel =
        typeof data?.display_name === 'string'
          ? data.display_name
          : typeof data?.name === 'string'
            ? data.name
            : formatAgentLabel(agentId);
      agentSegmentIndex.set(agentId, segments.length);
      segments.push({
        kind: 'agent_lifecycle',
        id: `agent-${segments.length + 1}`,
        agentId,
        agentLabel,
        taskDescription:
          typeof data?.task_description === 'string' ? data.task_description : undefined,
        spawnTs: typeof data?.spawn_ts === 'number' ? data.spawn_ts : undefined,
        workerToolRefs: [],
      });
      continue;
    }

    if (entry.stage === 'agent_complete') {
      flushThoughts();
      flushTools();
      const data = entry.data as Record<string, unknown> | undefined;
      const agentId = typeof data?.agent_id === 'string' ? data.agent_id : 'unknown';
      const existingIndex = [...segments]
        .reverse()
        .findIndex((s) => s.kind === 'agent_lifecycle' && s.agentId === agentId);
      if (existingIndex !== -1) {
        const realIndex = segments.length - 1 - existingIndex;
        const existing = segments[realIndex] as AgentLifecycleSegment;
        segments[realIndex] = {
          ...existing,
          completeStatus:
            data?.status === 'failed'
              ? 'failed'
              : data?.status === 'cancelled'
                ? 'cancelled'
                : data?.status === 'partial'
                  ? 'partial'
                  : 'completed',
          durationMs: typeof data?.duration_ms === 'number' ? data.duration_ms : undefined,
          error: typeof data?.error === 'string' ? data.error : undefined,
        };
      } else {
        segments.push({
          kind: 'agent_lifecycle',
          id: `agent-${segments.length + 1}`,
          agentId,
          agentLabel:
            typeof data?.display_name === 'string'
              ? data.display_name
              : typeof data?.name === 'string'
                ? data.name
                : formatAgentLabel(agentId),
          completeStatus:
            data?.status === 'failed'
              ? 'failed'
              : data?.status === 'cancelled'
                ? 'cancelled'
                : data?.status === 'partial'
                  ? 'partial'
                  : 'completed',
          durationMs: typeof data?.duration_ms === 'number' ? data.duration_ms : undefined,
          error: typeof data?.error === 'string' ? data.error : undefined,
        });
      }
      continue;
    }

    if (entry.stage === 'handoff_start' || entry.stage === 'handoff_complete') {
      flushThoughts();
      flushTools();
      const data = entry.data as Record<string, unknown> | undefined;
      if (isInternalCoreHandoff(data)) {
        continue;
      }
      const toLabel =
        typeof data?.display_name === 'string' && data.display_name.trim()
          ? data.display_name
          : typeof data?.name === 'string' && data.name.trim()
            ? data.name
            : typeof data?.to_scope === 'string'
              ? data.to_scope
              : 'unknown';
      segments.push({
        kind: 'handoff',
        id: `handoff-${segments.length + 1}`,
        from: typeof data?.from_scope === 'string' ? data.from_scope : null,
        to: toLabel,
        objective: typeof data?.objective === 'string' ? data.objective : null,
        status:
          entry.stage === 'handoff_start'
            ? 'started'
            : data?.status === 'failed'
              ? 'failed'
              : 'completed',
      });
      continue;
    }

    if (isToolProgressEntry(entry)) {
      flushThoughts();
      const toolRef = resolveToolRef(entry, toolCalls, usedCallIds);
      if (toolRef) {
        const agentId = getToolAgentId(entry);
        const workerIdx = agentId ? agentSegmentIndex.get(agentId) : undefined;
        if (workerIdx !== undefined) {
          const seg = segments[workerIdx] as AgentLifecycleSegment;
          const refs = seg.workerToolRefs ?? [];
          if (!refs.includes(toolRef)) {
            segments[workerIdx] = { ...seg, workerToolRefs: [...refs, toolRef] };
          }
        } else if (!currentToolRefs.includes(toolRef)) {
          currentToolRefs.push(toolRef);
        }
      }
      continue;
    }

    if (entry.stage !== 'thinking' || isNoisyStage(entry.stage)) {
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
        kind: 'tools',
        id: 'tools-1',
        toolRefs: toolCalls.map((toolCall) => `id:${toolCall.id}`),
      },
    ];
  }

  return segments;
}

export function resolveToolCallFromRef(
  toolRef: string,
  toolCalls: ToolCallEventData[],
): ToolCallEventData | undefined {
  if (toolRef.startsWith('id:')) {
    const id = toolRef.slice(3);
    return toolCalls.find((toolCall) => toolCall.id === id);
  }
  if (toolRef.startsWith('name:')) {
    const name = toolRef.slice(5);
    return toolCalls.find((toolCall) => toolCall.name === name);
  }
  return undefined;
}

export function resolveToolResultFromRef(
  toolRef: string,
  toolResults: ToolResultEventData[],
): ToolResultEventData | undefined {
  if (toolRef.startsWith('id:')) {
    const id = toolRef.slice(3);
    return toolResults.find((toolResult) => toolResult.id === id);
  }
  if (toolRef.startsWith('name:')) {
    const name = toolRef.slice(5);
    return toolResults.find((toolResult) => toolResult.name === name);
  }
  return undefined;
}

export function resolveToolEntries(
  toolRefs: string[],
  toolCalls: ToolCallEventData[],
  toolResults: ToolResultEventData[],
): ResolvedToolEntry[] {
  return toolRefs.map((toolRef, index) => {
    const toolCall = resolveToolCallFromRef(toolRef, toolCalls);
    const toolResult = resolveToolResultFromRef(toolRef, toolResults);
    const name = toolCall?.name || toolResult?.name || toolRef.replace(/^name:/, '');
    const state: 'output-available' | 'error' | 'running' = toolResult
      ? toolResult.ok
        ? 'output-available'
        : 'error'
      : 'running';

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
    const key = entry.name || 'tool';
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, {
        key,
        name: entry.name || 'tool',
        entries: [],
        completedCount: 0,
        errorCount: 0,
        runningCount: 0,
      });
    }
    const group = groups.get(key);
    if (!group) continue;

    group.entries.push(entry);
    if (entry.state === 'output-available') group.completedCount += 1;
    if (entry.state === 'error') group.errorCount += 1;
    if (entry.state === 'running') group.runningCount += 1;
  }

  return order
    .map((key) => groups.get(key))
    .filter((group): group is ToolCluster => Boolean(group));
}
