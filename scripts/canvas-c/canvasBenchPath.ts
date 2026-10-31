// The Frontend path the canvas e2e bench drives, shared by the bench (Bun) and its browser
// entry so both read a captured payload the same way: the UI parts the Backend's chunk adapter
// produced → the chat projection (`toJainaChatMessage`) → the one campaign model. Nothing here
// re-reads a payload of its own; it only calls the production functions in order.

import { type JainaUIMessage, paidScaffoldPlanSchema } from '@continuum/contracts';
import { buildHydratedCanvasGraph, type HydratedCanvasGraph } from '@/lib/campaign-canvas/hydrate';
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
