// The Frontend path the canvas e2e bench drives, shared by the bench (Bun) and its browser
// entry so both read a captured payload the same way: the UI parts the Backend's chunk adapter
// produced → the chat projection (`toJainaChatMessage`) → the one campaign model. Nothing here
// re-reads a payload of its own; it only calls the production functions in order.

import { formatMoney, type JainaUIMessage, paidScaffoldPlanSchema } from '@continuum/contracts';
import { buildHydratedCanvasGraph, type HydratedCanvasGraph } from '@/lib/campaign-canvas/hydrate';
import { minorFromWordedMoney } from '@/lib/campaign-canvas/lectura';
import { toJainaChatMessage } from '@/lib/jaina/uiMessageProjection';
import type { CanvasScaffoldRead } from '@/lib/paid-media/jaina-activity-client';
import { toNodeRow } from '@/lib/paid-media/scaffold-tree-client';

export type Row = Record<string, unknown>;

/** A live change preview as captured: the frame, and the parts the client received. */
export type LiveChangeCapture = {
  capturedAt: string;
  toolName: string;
  frame: Row;
  parts: Row[];
};

/** A duplicate proposal as captured: its parts, and its rows as the store saved them. */
export type DuplicateCapture = {
  capturedAt: string;
  sourceCampaign: { id: string; name: string };
  frames: Row[];
  parts: Row[];
  rows: Row[];
  version: Row;
};

/** The assistant message the chat projects from the parts one turn streamed. */
export const projectTurn = (id: string, parts: Row[]) =>
  toJainaChatMessage(
    {
      id,
      role: 'assistant',
      parts: parts.filter((part) => part.type !== 'start'),
    } as unknown as JainaUIMessage,
    { isStreaming: false },
  );

/**
 * What the canvas hydrates from (`fetchCanvasScaffoldRead`), built from the saved rows: the
 * production row reader (`toNodeRow`) and the plan schema. The network read itself is the hop
 * this replaces — the rows were saved on a local Postgres, not the hosted project.
 */
export const canvasReadOf = (capture: DuplicateCapture): CanvasScaffoldRead => {
  const version = capture.version;
  const rows = capture.rows.map(toNodeRow);
  const parsed = paidScaffoldPlanSchema.safeParse(
    (version.manifest as Row | undefined)?.plan ?? null,
  );
  const scaffoldId = String(version.scaffold_id);
  const versionId = String(version.id);
  const summary = {
    id: versionId,
    version: Number(version.version ?? 1),
    lifecycle: String(version.lifecycle ?? 'proposed'),
    createdAt: capture.capturedAt,
  };
  return {
    scaffold: {
      id: scaffoldId,
      name: capture.sourceCampaign.name,
      adAccountId: 'act_bench',
      currentVersionId: versionId,
      createdAt: capture.capturedAt,
    },
    version: summary,
    versions: [summary],
    tree: { versionId, rows },
    gates: {},
    audiences: [],
    contentHash: String(version.content_hash ?? ''),
    plan: parsed.success ? parsed.data : null,
    assetKinds: {},
    specialAdCategories: [],
  };
};

export const hydratedCopyOf = (capture: DuplicateCapture): HydratedCanvasGraph =>
  buildHydratedCanvasGraph(canvasReadOf(capture));

// ---------------------------------------------------------------------------
// Portfolio and versions (phase 4b): threads COMPOSED from the real captures
// ---------------------------------------------------------------------------

/**
 * COMPOSED: one turn carrying two real live approvals on ITESO (pause an ad set, raise a budget)
 * and the real copy proposal of AV CAMACHO — the parts the Backend emitted, in one message, as a
 * multi-campaign turn would stream them. No real multi-campaign capture exists yet.
 */
export const composedPortfolioTurn = (
  live: Record<string, LiveChangeCapture>,
  copy: DuplicateCapture,
) =>
  projectTurn('msg_portfolio', [
    ...(live['pause-adset']?.parts ?? []),
    ...(live['raise-budget']?.parts ?? []),
    ...copy.parts,
  ]);

/**
 * COMPOSED: a thread proposing three real changes to ITESO in turn — v1 pause, v2 raise, v3 new
 * placements, each its own message. v2 carries a SYNTHETIC approval and an ok tool result (no
 * write happened anywhere), so the line has an "applied" step to show.
 */
export const composedLiveVersionThread = (live: Record<string, LiveChangeCapture>) => {
  const raise = live['raise-budget'];
  const raisePart = raise?.parts.find((part) => part.type === 'data-jaina-live-change')?.data as
    | { approvalId: string; toolCallId: string; toolName: string }
    | undefined;
  const v2 = projectTurn('msg_v2', raise?.parts ?? []);
  return [
    projectTurn('msg_v1', live['pause-adset']?.parts ?? []),
    raisePart
      ? {
          ...v2,
          resolvedApprovals: {
            [raisePart.approvalId]: {
              approvalId: raisePart.approvalId,
              toolCallId: raisePart.toolCallId,
              decision: 'approved' as const,
            },
          },
          toolResults: [
            { id: raisePart.toolCallId, name: raisePart.toolName, ok: true, cached: false },
          ],
        }
      : v2,
    projectTurn('msg_v3', live['new-placements']?.parts ?? []),
  ];
};

/**
 * DERIVED: the real copy's second version, as a correction in words would save it — its last
 * test ad set dropped (with its ads) and its first test ad set's budget × 1.5. Returns the
 * thread (real v1 message, derived v2 message) and what was derived, for the oracle.
 */
export const derivedCopyVersionThread = (copy: DuplicateCapture) => {
  const v1Message = projectTurn('msg_copy', copy.parts);
  const v1 = v1Message.campaignStructures?.find((entry) => entry.layout === 'diff');
  if (!v1?.diff) throw new Error('the copy capture carries no diff structure');
  const tests = v1.diff.entries
    .filter((entry) => entry.change === 'added' && entry.level === 'adset')
    .map((entry) => entry.path_key)
    .sort();
  const dropped = tests.at(-1) as string;
  const raised = tests[0] as string;
  let raisedTo = '';
  let raisedFrom = '';
  const nodes = v1.nodes
    .filter((node) => node.path_key !== dropped && node.parent_path_key !== dropped)
    .map((node) => {
      if (node.path_key !== raised) return node;
      return {
        ...node,
        fields: node.fields.map((field) => {
          if (field.key !== 'daily_budget_minor_units') return field;
          const money = minorFromWordedMoney(field.value);
          if (!money) return field;
          raisedFrom = String(field.value);
          raisedTo = formatMoney((money.minor * 1.5) / 100, money.currency);
          return { ...field, value: raisedTo };
        }),
      };
    });
  const v2 = {
    ...v1,
    scaffoldId: `${v1.scaffoldId}-v2-derived`,
    version: v1.version + 1,
    partId: `${v1.partId}:v2`,
    nodes,
  };
  return {
    thread: [v1Message, { id: 'msg_copy_v2', campaignStructures: [v2] }],
    parentScaffoldId: v1.parentScaffoldId ?? v1.scaffoldId,
    v1,
    v2,
    dropped,
    droppedAds: v1.nodes.filter((node) => node.parent_path_key === dropped).map((n) => n.path_key),
    raised,
    raisedFrom,
    raisedTo,
  };
};
