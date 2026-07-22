import type { CanvasRunOutputKind, CanvasRunResult } from '@continuum/contracts';

// Pure + dependency-injected core for the collaborative run path. The MCP
// `studio_workflow run` tool inserts a canvas_run_requests row; the open canvas
// picks it up over Realtime, executes the requested nodes, and writes a compact
// summary back. Keeping the orchestration here (DB ops behind RunRequestStore,
// execution behind an injected `execute`) makes the claim/skip + result-shaping
// logic unit-testable without Supabase or the network.

export interface RunNode {
  id: string;
  type?: string;
  data?: unknown;
}

// Generation/transform node types whose run we summarize. Used to approximate the
// executed set for a full-graph run (node_ids omitted).
const RUNNABLE_NODE_TYPES = new Set([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'videoEditor',
  'timelineEditor',
  'string',
  'videoDecode',
]);

function nodeData(node: RunNode): Record<string, unknown> {
  return node.data && typeof node.data === 'object' ? (node.data as Record<string, unknown>) : {};
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

export function classifyNodeKind(node: RunNode): CanvasRunOutputKind | null {
  const d = nodeData(node);
  if (
    nonEmptyString(d.generatedVideo) ||
    nonEmptyString(d.generatedVideoUrl) ||
    nonEmptyString(d.generatedVideoStoragePath)
  ) {
    return 'video';
  }
  if (
    nonEmptyString(d.generatedImage) ||
    nonEmptyString(d.generatedImageUrl) ||
    nonEmptyString(d.generatedImageStoragePath)
  ) {
    return 'image';
  }
  if (nonEmptyString(d.value)) {
    return 'text';
  }
  return null;
}

// The node ids to summarize: the requested subset (filtered to ones that exist) or,
// for a full-graph run, every runnable node currently on the canvas.
export function resolveRunNodeIds(nodes: RunNode[], requestedNodeIds: string[] | null): string[] {
  if (requestedNodeIds && requestedNodeIds.length > 0) {
    const present = new Set(nodes.map((n) => n.id));
    return requestedNodeIds.filter((id) => present.has(id));
  }
  return nodes.filter((n) => RUNNABLE_NODE_TYPES.has(n.type ?? '')).map((n) => n.id);
}

export function buildCanvasRunResult(nodes: RunNode[], executedIds: string[]): CanvasRunResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const executed_node_ids = executedIds.filter((id) => byId.has(id));

  const outputs: CanvasRunResult['outputs'] = [];
  const failed: NonNullable<CanvasRunResult['failed']> = [];

  for (const id of executed_node_ids) {
    const node = byId.get(id)!;
    const d = nodeData(node);
    if (nonEmptyString(d.error)) {
      failed.push({ node_id: id, error: d.error as string });
      continue;
    }
    const kind = classifyNodeKind(node);
    if (kind) outputs.push({ node_id: id, kind });
  }

  return failed.length > 0
    ? { executed_node_ids, outputs, failed }
    : { executed_node_ids, outputs };
}

// DB boundary for a run request, kept behind an interface so the orchestration is
// testable and the Supabase-specific calls live in one adapter (see the hook).
export interface RunRequestStore {
  // Atomically claim a pending request (pending -> running). Returns false when
  // another open canvas already claimed it, so only one client executes.
  claim(runRequestId: string): Promise<boolean>;
  markDone(runRequestId: string, result: CanvasRunResult): Promise<void>;
  markError(runRequestId: string, error: string): Promise<void>;
}

export interface RunCanvasRequestParams {
  store: RunRequestStore;
  runRequestId: string;
  requestedNodeIds: string[] | null;
  roomId: string;
  brandId?: string;
  getNodes: () => RunNode[];
  execute: (opts: { targetNodeId?: string; roomId?: string; brandId?: string }) => Promise<void>;
}

export async function runCanvasRequest(params: RunCanvasRequestParams): Promise<void> {
  const { store, runRequestId, requestedNodeIds, roomId, brandId, getNodes, execute } = params;

  const claimed = await store.claim(runRequestId);
  if (!claimed) return;

  try {
    const ids = requestedNodeIds && requestedNodeIds.length > 0 ? requestedNodeIds : null;
    if (ids) {
      for (const nodeId of ids) {
        await execute({ targetNodeId: nodeId, roomId, brandId });
      }
    } else {
      await execute({ roomId, brandId });
    }
    const result = buildCanvasRunResult(getNodes(), resolveRunNodeIds(getNodes(), ids));
    await store.markDone(runRequestId, result);
  } catch (err) {
    await store.markError(runRequestId, err instanceof Error ? err.message : String(err));
  }
}
