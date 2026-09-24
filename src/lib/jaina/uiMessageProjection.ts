// Project an AI SDK UI message onto the shapes the Jaina transcript renders.
//
// This is a GROUPING, not a fold, and the difference is the whole point of the migration. The old
// path ran a 4,000-line reducer that accumulated state frame by frame: a report block arrived as a
// delta, then again inside the final checkpoint, and the client had to decide which copy was newer
// — which is what the `retain blocks` / `preserve streamed blocks` / `retain completed answers`
// commits were all working around.
//
// The Backend now emits each domain object as a typed `data-*` part addressed by a stable id, and
// the SDK REPLACES a part when the same id arrives again. By the time parts reach here the
// reconciliation has already happened, so this file only has to collect them by kind. There is no
// ordering question left to get wrong, and nothing here may reintroduce one.
//
// Everything is a PURE function of `message.parts`. No clocks, no counters, no module state: the
// surface re-projects on every streaming frame, so an impure projection would hand `React.memo` a
// new object for a message that cannot have changed and put every finished report back into every
// frame's render.

import {
  type AgentDelegatedFrameData,
  agentDelegatedFrameDataSchema,
  JAINA_UI_DATA_PART,
  type JainaHyperframeSet,
  type JainaOptimizerCard,
  type JainaPaidCreativeRenderPayload,
  type JainaToolApprovalRequiredPayload,
  type JainaToolApprovalResolvedPayload,
  type JainaToolOutputDeniedPayload,
  type JainaUIMessage,
  jainaHyperframeSetSchema,
  jainaOptimizerCardSchema,
  jainaPaidCreativeRenderPayloadSchema,
  jainaToolApprovalRequiredPayloadSchema,
  paidScaffoldProgressPayloadSchema,
  paidScaffoldProposedPayloadSchema,
  paidScaffoldReceiptPayloadSchema,
} from '@continuum/contracts';
import type { PlanStatus } from '@/components/ai-elements/plan';
import {
  pickRenderableContent,
  resolveReportSignal,
} from '@/components/paid-media/jaina/jainaUtils';
import type {
  JainaChatMessage,
  JainaPlan,
  JainaProgressEntry,
} from '@/components/paid-media/jaina/types';
import { interpretCheckpointReportPayload } from '@/lib/jaina/reportPayload';
import type { JainaScaffoldState } from '@/lib/jaina/scaffoldTypes';
import {
  type ArtifactDeltaEventData,
  artifactDeltaSchema,
  hasReportContent,
  type JainaObjective,
  jainaObjectiveSchema,
  type ReportPayload,
  type ResponseReportArtifactJobStartedEventData,
  responseReportArtifactJobStartedSchema,
  type ToolCallEventData,
  type ToolResultEventData,
} from '@/lib/jaina/schemas';

type DataPart = { type: string; id?: string; data?: unknown };

/** One tool part as the SDK models it, including the native approval state machine. */
type ToolPart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const partsOfType = (message: JainaUIMessage, type: string): Record<string, unknown>[] =>
  (message.parts as DataPart[])
    .filter((part) => part.type === type)
    .map((part) => asRecord(part.data))
    .filter((data): data is Record<string, unknown> => data !== null);

/** Concatenated text of the assistant's answer, in part order. */
export const textOf = (message: JainaUIMessage): string =>
  (message.parts as { type: string; text?: string }[])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

/**
 * The stage a `data-jaina-delegation` row belongs to, keyed `kind:phase`.
 *
 * These stage names are not decoration: `buildThinkingSegments` groups on exactly these five
 * strings, so a row that carries one renders and a row that does not is silently dropped.
 */
const DELEGATION_STAGE: Record<string, string> = {
  'handoff:started': 'handoff_start',
  'handoff:progress': 'handoff_start',
  'handoff:complete': 'handoff_complete',
  'worker:started': 'agent_spawn',
  'worker:progress': 'agent_narration',
  'worker:complete': 'agent_complete',
};

/**
 * Sub-agent activity, as the progress entries the thinking window already renders.
 *
 * `data-jaina-delegation` collapses SEVEN Backend events into ONE part type, and only the
 * `cross_agent` ones are a delegation card. `delegationsOf` is right to refuse the other two
 * kinds — an intra-Jaina scope like `adset` is not an `agentKind`, so "Jaina asked adset" would
 * be a lie — but refusing them left the handoff and worker rows with no reader at all. They had
 * one before the native wire: `state.progress`, rendered by the thinking window. So they go back
 * there, under the stages that window already groups on.
 *
 * No dedup here, deliberately. Every row is addressed `${runId}:delegation:${callId}`, so the SDK
 * has ALREADY replaced a call's `started` part with its `complete` — one part per call reaches us.
 */
const delegationEntriesOf = (data: Record<string, unknown>): JainaProgressEntry[] => {
  const kind = data.kind;
  if (kind !== 'handoff' && kind !== 'worker') return [];

  const phase = getNonEmptyString(data.phase) ?? 'progress';
  const label = getNonEmptyString(data.label) ?? getNonEmptyString(data.callId) ?? 'unknown';
  const status = getNonEmptyString(data.status) ?? 'running';
  const objective = getNonEmptyString(data.objective) ?? getNonEmptyString(data.query);

  // `agent.envelope` arrives as a handoff `progress` row and is the one source that states its
  // own direction. The Backend's `kind` overwrites the envelope's on the spread, so `event` is
  // the only field left that knows whether this is an opening or a closing.
  const envelopeEvent =
    kind === 'handoff' && phase === 'progress' ? getNonEmptyString(data.event) : undefined;
  const stage = envelopeEvent
    ? envelopeEvent === 'start'
      ? 'handoff_start'
      : 'handoff_complete'
    : DELEGATION_STAGE[`${kind}:${phase}`];
  if (!stage) return [];

  const agentId = getNonEmptyString(data.agent_id) ?? getNonEmptyString(data.callId) ?? label;

  // Narration lines are INCREMENTS of a worker's findings and each one is its own thought. The
  // payload is kept NARROW on purpose: a stray `name` key would make `isToolProgressEntry` claim
  // the entry as a tool row and the prose would never reach the trace.
  if (stage === 'agent_narration') {
    return (Array.isArray(data.lines) ? data.lines : []).flatMap((line) => {
      const record = asRecord(line);
      const detail = getNonEmptyString(record?.text);
      if (!detail) return [];
      return [
        {
          stage,
          at: '',
          detail,
          data: { stage, agent_id: agentId, display_name: label, field: record?.field },
        },
      ];
    });
  }

  const detail =
    stage === 'agent_spawn'
      ? (objective ?? `Agent ${label} spawned`)
      : stage === 'agent_complete'
        ? `Agent ${label} ${status}`
        : stage === 'handoff_start'
          ? `Handoff to ${label}`
          : `Handoff to ${label} ${status}`;

  return [
    {
      stage,
      at: '',
      detail,
      // `display_name` is NOT aliased from `label`: `isInternalCoreHandoff` suppresses the
      // unnamed `core` handoff by the absence of one, and inventing it would put that noise back.
      data: {
        ...data,
        stage,
        agent_id: agentId,
        to_scope: getNonEmptyString(data.to_scope) ?? getNonEmptyString(data.scope) ?? label,
        ...(objective ? { objective } : {}),
        ...(stage === 'agent_spawn' && objective ? { task_description: objective } : {}),
      },
    },
  ];
};

/**
 * The transcript's progress stream: thinking, plus the sub-agent activity that rides beside it.
 *
 * Walked in PART ORDER rather than filtered per kind, because that order is the only record of
 * when a handoff happened relative to the thought that caused it.
 *
 * `at` is empty because neither the SDK's reasoning parts nor the delegation parts carry
 * timestamps. `formatThoughtDuration` drops non-finite dates, so this renders as thinking without
 * a duration rather than "NaNs".
 */
export const reasoningEntriesOf = (message: JainaUIMessage): JainaProgressEntry[] =>
  (message.parts as (DataPart & { text?: string })[]).flatMap((part) => {
    if (part.type === 'reasoning') {
      const detail = (part.text ?? '').trim();
      if (!detail) return [];
      return [{ stage: 'thinking', at: '', detail, data: { stage: 'thinking' } }];
    }
    if (part.type === JAINA_UI_DATA_PART.delegation) {
      const data = asRecord(part.data);
      return data ? delegationEntriesOf(data) : [];
    }
    return [];
  });

/**
 * The report, reassembled from its blocks.
 *
 * Blocks arrive as individual parts precisely so a 19KB report is never re-sent to update one
 * section. The final checkpoint carries the report's metadata under its own part, so this joins
 * the two back into the shape the renderer already accepts.
 */
export const reportOf = (message: JainaUIMessage): Record<string, unknown> | undefined => {
  const streamed = partsOfType(message, JAINA_UI_DATA_PART.reportBlock);
  const meta = partsOfType(message, JAINA_UI_DATA_PART.reportMeta).at(-1);
  if (streamed.length === 0 && !meta) return undefined;

  // Before the final report lands there is no meta. The progressive V2 `_meta` below is what
  // lets the streamed blocks parse as V2. Without it they fell to the v1 normalizer and rendered
  // under its internal "Checkpoint Blocks" heading.
  if (!meta) {
    return {
      blocks: streamed,
      _meta: {
        schema_version: '2',
        block_count: streamed.length,
        has_charts: streamed.some((block) => block.category === 'chart'),
        has_media: false,
        primary_scope: typeof streamed[0]?.scope === 'string' ? streamed[0].scope : '',
      },
    };
  }

  // Until the final report lands, the reader sees blocks as they stream, in arrival order. Once it
  // lands and names its blocks, it is authoritative: exactly those, in its order. A part is never
  // removed, so without this a block streamed under an id the final checkpoint re-composed away
  // stays on screen beside its replacement — measured on real runs as 4 blocks shown for a
  // 2-block report, and a turn that renders differently live than it does after a reload.
  const { block_order: blockOrder, ...rest } = meta;
  const order = Array.isArray(blockOrder)
    ? blockOrder.filter((id): id is string => typeof id === 'string')
    : [];
  if (order.length === 0) return { ...rest, blocks: streamed };

  const byId = new Map(streamed.map((block) => [block.block_id, block]));
  const blocks = order
    .map((id) => byId.get(id))
    .filter((block): block is Record<string, unknown> => block !== undefined);
  return { ...rest, blocks };
};

export const reportArtifactJobOf = (
  message: JainaUIMessage,
): ResponseReportArtifactJobStartedEventData | undefined => {
  const data = partsOfType(message, JAINA_UI_DATA_PART.reportArtifactJob).at(-1);
  if (!data) return undefined;
  const parsed = responseReportArtifactJobStartedSchema.safeParse({
    type: 'response.report_artifact_job.started',
    data,
  });
  return parsed.success ? parsed.data.data : undefined;
};

export const objectivesOf = (message: JainaUIMessage): JainaObjective[] =>
  partsOfType(message, JAINA_UI_DATA_PART.objective).flatMap((data) => {
    const parsed = jainaObjectiveSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });

/**
 * CROSS-AGENT calls only. `AgentDelegatedCard` renders "X asked Y", so a row whose caller or
 * callee is not an `agentKind` is refused by the schema rather than rendered as a lie — the
 * `handoff` and `worker` rows sharing this part type reach the reader through
 * `reasoningEntriesOf` instead. Do not loosen this.
 */
export const delegationsOf = (message: JainaUIMessage): AgentDelegatedFrameData[] =>
  partsOfType(message, JAINA_UI_DATA_PART.delegation).flatMap((data) => {
    const parsed = agentDelegatedFrameDataSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });

/** The row a progress frame belongs to — `pathKey` is the only stable node identity. */
const scaffoldProgressKey = (progress: {
  pathKey?: string;
  step: string;
  index?: number;
}): string => progress.pathKey ?? `${progress.step}#${progress.index ?? 0}`;

/**
 * A card for a version this message has no proposal for. Only `paid_scaffold_propose` emits a
 * proposal, so a gate run in a LATER turn (propose, then "build it") carries progress and a
 * receipt for a version it never proposed — and a reload replays the receipt without the
 * approval. The version id is all the card needs: the tree comes from Postgres.
 */
export const seededScaffoldState = (scaffoldId: string): JainaScaffoldState => ({
  scaffoldId,
  adAccountId: null,
  approvalId: null,
  plan: null,
  progressByNode: {},
  lastProgress: null,
  receipt: null,
});

/**
 * The scaffold, folded across every scaffold part on the message. The Backend gives the three
 * `paid.scaffold_*` events their own part ids (`uiMessageChunks.ts`), so the fold sees each one.
 * A frame for a DIFFERENT version than the one already folded is ignored; a frame with nothing
 * folded yet seeds the card rather than being dropped.
 */
export const scaffoldOf = (message: JainaUIMessage): JainaScaffoldState | undefined => {
  let scaffold: JainaScaffoldState | undefined;

  for (const data of partsOfType(message, JAINA_UI_DATA_PART.scaffold)) {
    if ('step' in data) {
      const progress = paidScaffoldProgressPayloadSchema.safeParse(data);
      if (!progress.success) continue;
      if (scaffold && scaffold.scaffoldId !== progress.data.scaffoldId) continue;
      const base = scaffold ?? seededScaffoldState(progress.data.scaffoldId);
      scaffold = {
        ...base,
        progressByNode: {
          ...base.progressByNode,
          [scaffoldProgressKey(progress.data)]: {
            step: progress.data.step,
            status: progress.data.status,
            entityId: progress.data.entityId ?? null,
            message: progress.data.message ?? null,
            ...(progress.data.index === undefined ? {} : { index: progress.data.index }),
            ...(progress.data.total === undefined ? {} : { total: progress.data.total }),
          },
        },
        lastProgress: {
          ...(progress.data.index === undefined ? {} : { index: progress.data.index }),
          ...(progress.data.total === undefined ? {} : { total: progress.data.total }),
        },
      };
      continue;
    }

    if ('created' in data || 'completedAt' in data || ('status' in data && !('plan' in data))) {
      const receipt = paidScaffoldReceiptPayloadSchema.safeParse(data);
      if (!receipt.success) continue;
      if (scaffold && scaffold.scaffoldId !== receipt.data.scaffoldId) continue;
      scaffold = {
        ...(scaffold ?? seededScaffoldState(receipt.data.scaffoldId)),
        receipt: receipt.data,
      };
      continue;
    }

    const proposal = paidScaffoldProposedPayloadSchema.safeParse(data);
    if (!proposal.success) continue;
    const sameScaffold = scaffold?.scaffoldId === proposal.data.scaffoldId;
    scaffold = {
      scaffoldId: proposal.data.scaffoldId,
      ...(proposal.data.parentScaffoldId
        ? { parentScaffoldId: proposal.data.parentScaffoldId }
        : {}),
      ...(proposal.data.brandId ? { brandId: proposal.data.brandId } : {}),
      adAccountId: proposal.data.adAccountId ?? null,
      approvalId: proposal.data.approvalId ?? null,
      plan: proposal.data.plan,
      ...(proposal.data.summary ? { summary: proposal.data.summary } : {}),
      progressByNode: sameScaffold ? (scaffold?.progressByNode ?? {}) : {},
      lastProgress: sameScaffold ? (scaffold?.lastProgress ?? null) : null,
      receipt: sameScaffold ? (scaffold?.receipt ?? null) : null,
    };
  }

  return scaffold ?? scaffoldFromGateInput(message);
};

/**
 * The last resort: a scaffold tool's own input names the version, whatever state its
 * approval is in. A denied later-turn gate has no frame at all — no proposal, no progress,
 * no receipt — and without this the card, and the "Declined" it owes the reader, vanish.
 * `tool.call` is replayed on reload, so this holds after a refresh too.
 */
const scaffoldFromGateInput = (message: JainaUIMessage): JainaScaffoldState | undefined => {
  for (const part of toolPartsOf(message)) {
    const toolName = part.toolName ?? part.type.replace(/^tool-/, '');
    if (!toolName.startsWith('paid_scaffold_')) continue;
    const input = part.input as { scaffold_version_id?: unknown } | undefined;
    if (typeof input?.scaffold_version_id === 'string' && input.scaffold_version_id) {
      return seededScaffoldState(input.scaffold_version_id);
    }
  }
  return undefined;
};

export const clarificationOf = (
  message: JainaUIMessage,
): JainaChatMessage['pendingClarification'] => {
  const data = partsOfType(message, JAINA_UI_DATA_PART.clarification).at(-1);
  if (!data) return undefined;
  const question =
    [data.question, data.prompt, data.message].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ) ?? 'Clarification needed.';
  return {
    ...(typeof data.id === 'string' ? { id: data.id } : {}),
    question: question.trim(),
  };
};

/** Generated creatives and images, concatenated across every artifact part. */
export const artifactsOf = (message: JainaUIMessage): ArtifactDeltaEventData =>
  partsOfType(message, JAINA_UI_DATA_PART.artifact).reduce<ArtifactDeltaEventData>(
    (accumulated, data) => {
      const parsed = artifactDeltaSchema.safeParse(data);
      if (!parsed.success) return accumulated;
      return {
        creatives: [...(accumulated.creatives ?? []), ...(parsed.data.creatives ?? [])],
        images: [...(accumulated.images ?? []), ...(parsed.data.images ?? [])],
      };
    },
    {},
  );

export const paidCreativeRendersOf = (message: JainaUIMessage): JainaPaidCreativeRenderPayload[] =>
  partsOfType(message, JAINA_UI_DATA_PART.creativeRender).flatMap((data) => {
    const parsed = jainaPaidCreativeRenderPayloadSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });

/**
 * The optimizer cards this turn cited, in the order Jaina cited them.
 *
 * `safeParse` and not `parse`, and the line between what it keeps and what it drops is the
 * whole point of the schema living in contracts:
 *
 *   a payload that does not type — an extra numeric field, four candidate ids — is DROPPED.
 *   `.strict()` is the digit gate, and a card that found somewhere to put a figure must not
 *   reach a renderer that would draw it.
 *
 *   a payload that types but whose size and count disagree — a `strip` naming one candidate —
 *   is KEPT and handed on. `OptimizerCardBlock` says so on screen; swallowing it here would
 *   render as Jaina having cited nothing, which hides the bug instead of showing it.
 */
export const optimizerCitationsOf = (message: JainaUIMessage): JainaOptimizerCard[] =>
  partsOfType(message, JAINA_UI_DATA_PART.optimizerCard).flatMap((data) => {
    const parsed = jainaOptimizerCardSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });

/** Canvas actions the run proposed. Read by the surface's canvas effect, not by a message card. */
/**
 * Compiled optimizer cards, in the order they were emitted.
 *
 * Parsed here as well as on the emit side because a part can arrive from a replayed run log
 * the emitter never touched — and what this parse guards is a POINTER the surface is about to
 * sign and load, not a figure.
 */
export const optimizerHyperframesOf = (message: JainaUIMessage): JainaHyperframeSet[] =>
  partsOfType(message, JAINA_UI_DATA_PART.optimizerHyperframe).flatMap((data) => {
    const parsed = jainaHyperframeSetSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });

export const canvasActionsOf = (message: JainaUIMessage): Record<string, unknown>[] =>
  partsOfType(message, JAINA_UI_DATA_PART.canvasActions);

/** `{ summary, source }` — what the transcript reads out of a `state.delta`. */
export const checkpointSummaryOf = (
  message: JainaUIMessage,
): JainaChatMessage['checkpointSummary'] => {
  const data = partsOfType(message, JAINA_UI_DATA_PART.checkpointSummary).at(-1);
  if (!data || typeof data.summary !== 'string') return undefined;
  const source =
    data.source === 'synthesis' || data.source === 'tool_fallback'
      ? data.source
      : 'default_unavailable';
  return { summary: data.summary, source };
};

/** The run is parked awaiting a human — neither an error nor a finish. */
export const isGatedOn = (message: JainaUIMessage): boolean =>
  partsOfType(message, JAINA_UI_DATA_PART.gate).length > 0;

const toolPartsOf = (message: JainaUIMessage): ToolPart[] =>
  (message.parts as ToolPart[]).filter(
    (part) => part.type === 'dynamic-tool' || part.type.startsWith('tool-'),
  );

/** Dynamic tool parts, in the shape the transcript's tool rows already expect. */
export const toolsOf = (
  message: JainaUIMessage,
): {
  toolCallId: string;
  name: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
}[] =>
  toolPartsOf(message).flatMap((part) => {
    if (!part.toolCallId) return [];
    return [
      {
        toolCallId: part.toolCallId,
        name: part.toolName ?? 'tool',
        ...(part.state ? { state: part.state } : {}),
        input: part.input,
        output: part.output,
        ...(part.errorText ? { error: part.errorText } : {}),
      },
    ];
  });

export const toolCallsOf = (message: JainaUIMessage): ToolCallEventData[] =>
  toolPartsOf(message).flatMap((part) => {
    if (!part.toolCallId) return [];
    return [
      {
        id: part.toolCallId,
        name: part.toolName ?? 'tool',
        args: asRecord(part.input) ?? {},
        metadata: {},
      },
    ];
  });

/**
 * A tool ROW, which only exists once the call has an outcome.
 *
 * `cached` and `duration_ms` are not on the wire — the SDK's tool part carries the call, not our
 * execution bookkeeping — so `cached` reports the truth it can: false.
 */
export const toolResultsOf = (message: JainaUIMessage): ToolResultEventData[] =>
  toolPartsOf(message).flatMap((part): ToolResultEventData[] => {
    if (!part.toolCallId) return [];
    const name = part.toolName ?? 'tool';
    if (part.state === 'output-available') {
      return [{ id: part.toolCallId, name, ok: true, cached: false, output: part.output }];
    }
    if (part.state === 'output-error') {
      return [
        {
          id: part.toolCallId,
          name,
          ok: false,
          cached: false,
          error: part.errorText ?? 'The tool call failed.',
        },
      ];
    }
    return [];
  });

/**
 * The human-in-the-loop gate, joined from the two halves it legitimately has.
 *
 * The SDK's approval chunks address a TOOL CALL and carry an id — a uuid on a card is consent to
 * nothing. The before → after the gate refuses on rides beside them on `data-jaina-approval`, so
 * the pending entry is the tool part's state machine joined to that preview. The part state is the
 * authority on WHETHER an approval is still open; the data part is the authority on what it says.
 */
export const approvalsOf = (
  message: JainaUIMessage,
): {
  pending: JainaToolApprovalRequiredPayload[];
  resolved: Record<string, JainaToolApprovalResolvedPayload>;
  denied: JainaToolOutputDeniedPayload[];
} => {
  const previews = new Map<string, JainaToolApprovalRequiredPayload>();
  for (const data of partsOfType(message, JAINA_UI_DATA_PART.approval)) {
    const parsed = jainaToolApprovalRequiredPayloadSchema.safeParse(data);
    if (parsed.success) previews.set(parsed.data.approvalId, parsed.data);
  }

  const pending: JainaToolApprovalRequiredPayload[] = [];
  const resolved: Record<string, JainaToolApprovalResolvedPayload> = {};
  const denied: JainaToolOutputDeniedPayload[] = [];

  for (const part of toolPartsOf(message)) {
    const approval = part.approval;
    if (!approval || !part.toolCallId) continue;
    const toolName = part.toolName ?? 'tool';

    if (part.state === 'approval-requested') {
      const preview = previews.get(approval.id);
      pending.push({
        ...(preview ?? {}),
        approvalId: approval.id,
        toolCallId: part.toolCallId,
        toolName,
        input: preview?.input ?? part.input,
        // Absent until the preview part lands. `Date.parse('')` is NaN, so the card reads
        // "awaiting your approval" rather than falsely expiring a live gate.
        expiresAt: preview?.expiresAt ?? '',
      });
      continue;
    }

    const isDenied = approval.approved === false;
    resolved[approval.id] = {
      approvalId: approval.id,
      toolCallId: part.toolCallId,
      toolName,
      decision: isDenied ? 'denied' : 'approved',
      ...(approval.reason ? { reason: approval.reason } : {}),
    };

    if (part.state === 'output-denied') {
      denied.push({
        toolCallId: part.toolCallId,
        toolName,
        approvalId: approval.id,
        ...(approval.reason ? { reason: approval.reason } : {}),
      });
    }
  }

  return { pending, resolved, denied };
};

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
//
// The planner's structured plan arrives as `data-jaina-plan`. Its markdown rendering stays off the
// wire: carried as reasoning, it was the last thought, which `pickRenderableContent` falls back to,
// so the whole plan printed as the answer.

const getNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

function planFromRecord(record: Record<string, unknown>): JainaPlan {
  const stepsRaw = Array.isArray(record.steps)
    ? record.steps
    : Array.isArray(record.objectives)
      ? record.objectives
      : [];
  const steps = stepsRaw.flatMap((step): JainaPlan['steps'] => {
    const item = asRecord(step);
    if (!item) return [];
    const title =
      getNonEmptyString(item.title) ??
      getNonEmptyString(item.task) ??
      getNonEmptyString(item.objective);
    if (!title) return [];
    return [
      {
        title,
        description:
          getNonEmptyString(item.description) ??
          getNonEmptyString(item.success_criteria) ??
          getNonEmptyString(item.summary),
        status:
          typeof item.status === 'string'
            ? (item.status as JainaPlan['steps'][number]['status'])
            : 'pending',
      },
    ];
  });

  return {
    id: getNonEmptyString(record.id) ?? getNonEmptyString(record.plan_id) ?? 'plan-1',
    title:
      getNonEmptyString(record.chat_title) ??
      getNonEmptyString(record.chatTitle) ??
      getNonEmptyString(record.title) ??
      'Execution Plan',
    description:
      getNonEmptyString(record.description) ??
      getNonEmptyString(record.summary) ??
      'Review this execution plan.',
    status: typeof record.status === 'string' ? (record.status as JainaPlan['status']) : 'pending',
    steps,
  };
}

/** The plan this turn's planner produced, or undefined when it produced none. */
export const planOf = (message: JainaUIMessage): JainaPlan | undefined => {
  const data = partsOfType(message, JAINA_UI_DATA_PART.plan).at(-1);
  return data ? planFromRecord(data) : undefined;
};

// ---------------------------------------------------------------------------

const STATUS_BY_METADATA: Record<string, JainaChatMessage['status']> = {
  completed: 'done',
  cancelled: 'done',
  failed: 'error',
};

/**
 * One UI message as the transcript's message model.
 *
 * `status` prefers the Backend's own terminal verdict (`message.metadata.status`) and falls back to
 * the SDK's view of whether this message is the one still streaming. A THIRD source of "is this
 * turn finished" is what let a stale snapshot overwrite a live answer, so there is not one.
 *
 * `createdAt` is threaded in rather than read off a clock: it is only the transcript minimap's
 * anchor label, and a `new Date()` here would make the projection impure (see the file header).
 */
export const toJainaChatMessage = (
  message: JainaUIMessage,
  options: { isStreaming: boolean; createdAt?: string },
): JainaChatMessage => {
  const role = message.role === 'user' ? 'user' : 'assistant';
  // The run's own terminal verdict WINS over the caller's `isStreaming`, and the reason is that
  // `messageMetadata.status` is emitted on the terminal chunk and nowhere else — never on `start`.
  // Its presence is therefore proof the run ended, whether this reader watched it live or joined a
  // replay midway. Letting `isStreaming` override it would leave a finished turn rendering as
  // in-progress for whoever asked while the transport was still open, and would render a FAILED
  // run as a cheerful spinner.
  const terminal = message.metadata?.status
    ? STATUS_BY_METADATA[message.metadata.status]
    : undefined;
  const status: JainaChatMessage['status'] =
    terminal ?? (options.isStreaming ? 'streaming' : 'done');

  const base: JainaChatMessage = {
    id: message.id,
    role,
    content: textOf(message),
    createdAt: options.createdAt ?? '',
    status,
    ...(message.metadata?.runId ? { runId: message.metadata.runId } : {}),
  };

  // A user message carries text and nothing else; running the whole projection over it would
  // invent assistant furniture for a turn that has none.
  if (role === 'user') return base;

  const interpreted = interpretCheckpointReportPayload(reportOf(message));
  const report: ReportPayload | undefined = interpreted?.report;

  const reasoning = reasoningEntriesOf(message);
  const objectives = objectivesOf(message);
  const delegations = delegationsOf(message);
  const scaffold = scaffoldOf(message);
  const artifacts = artifactsOf(message);
  const paidCreativeRenders = paidCreativeRendersOf(message);
  const toolCalls = toolCallsOf(message);
  const toolResults = toolResultsOf(message);
  const approvals = approvalsOf(message);
  const pendingClarification = clarificationOf(message);
  const checkpointSummary = checkpointSummaryOf(message);
  const reportArtifactJob = reportArtifactJobOf(message);
  const optimizerCitations = optimizerCitationsOf(message);
  const optimizerHyperframes = optimizerHyperframesOf(message);
  const plan = planOf(message);

  // Mirrors the surface's completion rule: a report renders AS a report when it has content, is
  // not a direct answer, is not superseded by a question back to the user, and either something
  // asked for a report or a canonical report part actually arrived.
  const renderAsReport = Boolean(
    !pendingClarification &&
      report &&
      !('type' in report && report.type === 'direct_answer') &&
      hasReportContent(report) &&
      (resolveReportSignal(reasoning, reportSignalRecordsOf(message)) || Boolean(interpreted)),
  );

  return {
    ...base,
    content: pickRenderableContent({
      pendingClarification: pendingClarification ?? null,
      responseText: base.content,
      report: report ?? null,
      reportV2: interpreted?.reportV2 ?? null,
      ...(checkpointSummary
        ? {
            latestCheckpointSummary: checkpointSummary.summary,
            checkpointSummarySource: checkpointSummary.source,
          }
        : {}),
      plan: plan ?? null,
    }),
    ...(status === 'error' ? { title: 'Jaina error' } : {}),
    renderAsReport,
    ...(reasoning.length > 0 ? { reasoning } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(toolResults.length > 0 ? { toolResults } : {}),
    ...(report ? { report } : {}),
    ...(interpreted?.reportV2 ? { reportV2: interpreted.reportV2 } : {}),
    ...(reportArtifactJob ? { reportArtifactJob } : {}),
    ...(plan ? { plan } : {}),
    ...(artifacts.creatives?.length || artifacts.images?.length ? { artifacts } : {}),
    ...(paidCreativeRenders.length > 0 ? { paidCreativeRenders } : {}),
    ...(optimizerCitations.length > 0 ? { optimizerCitations } : {}),
    ...(optimizerHyperframes.length > 0 ? { optimizerHyperframes } : {}),
    ...(pendingClarification ? { pendingClarification } : {}),
    ...(objectives.length > 0 ? { objectives } : {}),
    ...(delegations.length > 0 ? { delegations } : {}),
    ...(scaffold ? { scaffold } : {}),
    ...(checkpointSummary ? { checkpointSummary } : {}),
    pendingToolApprovals: approvals.pending,
    resolvedApprovals: approvals.resolved,
    deniedToolOutputs: approvals.denied,
  };
};

export type TranscriptProjectionInputs = {
  /** True only for the turn the SDK is still writing. */
  isStreaming: boolean;
  /** Plan verdicts submitted but not yet echoed back by the run. */
  optimisticPlanStatusById: Readonly<Record<string, PlanStatus>>;
  /** Whether the reader watched this turn arrive or loaded it; assistant turns only. */
  deliverySource: NonNullable<JainaChatMessage['deliverySource']>;
};

type TranscriptProjectionEntry = {
  isStreaming: boolean;
  projected: JainaChatMessage;
  planStatus?: PlanStatus;
  deliverySource?: JainaChatMessage['deliverySource'];
  value: JainaChatMessage;
};

export type TranscriptProjectionCache = WeakMap<JainaUIMessage, TranscriptProjectionEntry>;

/**
 * `toJainaChatMessage` plus the surface's overlays, returning the SAME object while nothing it
 * shows has changed.
 *
 * The SDK replaces only the streaming message on a chunk and keeps every other message object, so
 * keying on the message object is what lets `React.memo` skip the rest of the conversation. The
 * key must cover every input, or a finished turn keeps a stale status, plan or source.
 */
export const projectTranscriptMessage = (
  cache: TranscriptProjectionCache,
  message: JainaUIMessage,
  inputs: TranscriptProjectionInputs,
): JainaChatMessage => {
  const cached = cache.get(message);
  const projected =
    cached && cached.isStreaming === inputs.isStreaming
      ? cached.projected
      : toJainaChatMessage(message, { isStreaming: inputs.isStreaming });
  const planStatus = projected.plan
    ? inputs.optimisticPlanStatusById[projected.plan.id]
    : undefined;
  const deliverySource = projected.role === 'assistant' ? inputs.deliverySource : undefined;
  if (
    cached?.projected === projected &&
    cached.planStatus === planStatus &&
    cached.deliverySource === deliverySource
  ) {
    return cached.value;
  }

  const withPlan =
    planStatus && projected.plan
      ? { ...projected, plan: { ...projected.plan, status: planStatus } }
      : projected;
  const value = deliverySource ? { ...withPlan, deliverySource } : withPlan;
  cache.set(message, {
    isStreaming: inputs.isStreaming,
    projected,
    planStatus,
    deliverySource,
    value,
  });
  return value;
};

/**
 * The part payloads worth scanning for a `render_as: 'report'` signal.
 *
 * The raw `state.delta` array this used to read is gone from the wire on purpose. These are the
 * records that survive it and can carry the flag.
 */
export const reportSignalRecordsOf = (message: JainaUIMessage): Record<string, unknown>[] => [
  ...partsOfType(message, JAINA_UI_DATA_PART.reportMeta),
  ...partsOfType(message, JAINA_UI_DATA_PART.checkpointSummary),
];
