import { z } from 'zod';
import {
  coerceNodeConfig,
  createNodeData,
  type GraphEdgeLike,
  type GraphNodeLike,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  isTimelineMediaHandle,
  isValidConnection,
  STUDIO_NODE_TYPES,
  type StudioNodeType,
  TIMELINE_MEDIA_INPUT_HANDLE,
  type TimelineItemSpec,
  timelineItemSpecSchema,
  type WorkflowMediaKind,
} from './workflow-graph';

// Construct + surgically edit AI Studio workflow graphs from a structured spec,
// auto-resolving valid handles, laying out positions, and validating against the
// canonical canvas rules in workflow-graph.ts.

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  style?: Record<string, number>;
  width?: number;
  height?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
}

// Fixed empty space between adjacent node boxes. The columns/rows themselves are
// sized cumulatively from each node's own width/height (below), so a wide node
// or tall generator no longer overlaps its neighbours the way a
// flat 360/220 grid did once a node exceeded those constants.
const LAYOUT_GUTTER = 80;
// Fallbacks for nodes with no style box — prompt/string nodes carry no default
// width/height, so laying them out at 0 would stack them on the origin.
const DEFAULT_NODE_WIDTH = 320;
const DEFAULT_NODE_HEIGHT = 180;

const nodeBoxWidth = (node: WorkflowNode): number =>
  node.style?.width ?? node.width ?? DEFAULT_NODE_WIDTH;

const nodeBoxHeight = (node: WorkflowNode): number =>
  node.style?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

const isStudioNodeType = (type: string): type is StudioNodeType =>
  (STUDIO_NODE_TYPES as readonly string[]).includes(type);

function inferDataType(sourceHandle?: string | null): string {
  switch (sourceHandle) {
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return sourceHandle;
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// Connection resolution
// ---------------------------------------------------------------------------

export type ResolveResult =
  | { ok: true; sourceHandle: string; targetHandle: string }
  | { ok: false; reason: string };

/**
 * Rank the target handles a role hint could mean, most-likely first.
 *
 * An exact name match and a same-family match score the SAME, so the sort stays
 * stable and the canvas's own handle order breaks the tie. That order is
 * authoritative: `getAllowedTargetHandles` lists the handle each node actually
 * renders first. Scoring an exact match higher instead would send `role: 'prompt'`
 * on a video generator to `prompt` — legal by the rules, but VideoGenBlock /
 * VeoFastBlock / OmniGenBlock only render `prompt-in`, so the edge would land on a
 * handle that does not exist on screen.
 */
function orderCandidates(candidates: string[], roleHint?: string): string[] {
  if (!roleHint) return candidates;
  const inSameFamily = (handle: string): boolean =>
    handle === roleHint || handle.includes(roleHint) || roleHint.includes(handle);
  return [...candidates].sort((a, b) => Number(inSameFamily(b)) - Number(inSameFamily(a)));
}

export function resolveConnection(
  sourceNode: GraphNodeLike,
  targetNode: GraphNodeLike,
  opts: { roleHint?: string; edges?: GraphEdgeLike[] } = {},
): ResolveResult {
  const sourceHandles = getAllowedSourceHandles(sourceNode);
  if (sourceHandles.length === 0) {
    return { ok: false, reason: `node ${sourceNode.id} (${sourceNode.type}) produces no output` };
  }
  const sourceHandle = sourceHandles[0];
  const candidates = orderCandidates(getAllowedTargetHandles(targetNode), opts.roleHint);
  const edges = opts.edges ?? [];

  for (const targetHandle of candidates) {
    const valid = isValidConnection(
      { source: sourceNode.id, sourceHandle, target: targetNode.id, targetHandle },
      edges,
      [sourceNode, targetNode],
    );
    if (valid) return { ok: true, sourceHandle, targetHandle };
  }

  return {
    ok: false,
    reason: `no compatible handle from ${sourceNode.type ?? '?'} to ${targetNode.type ?? '?'}${opts.roleHint ? ` (role ${opts.roleHint})` : ''}`,
  };
}

function makeEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): WorkflowEdge {
  return {
    id: `e:${source}:${target}:${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'dataType',
    className: 'studio-edge',
    data: { dataType: inferDataType(sourceHandle), pathType: 'button' },
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function autoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const layer = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
      const next = (layer.get(edge.source) ?? 0) + 1;
      if (next > (layer.get(edge.target) ?? 0)) {
        layer.set(edge.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Group nodes by layer (column), preserving their original order within each.
  const byLayer = new Map<number, WorkflowNode[]>();
  for (const node of nodes) {
    const depth = layer.get(node.id) ?? 0;
    const column = byLayer.get(depth) ?? [];
    column.push(node);
    byLayer.set(depth, column);
  }

  // Column x-offsets: each column starts past the widest box of every column
  // before it, plus one gutter — so no node ever reaches into the next column.
  const maxDepth = byLayer.size === 0 ? 0 : Math.max(...byLayer.keys());
  const columnX = new Map<number, number>();
  let x = 0;
  for (let depth = 0; depth <= maxDepth; depth += 1) {
    columnX.set(depth, x);
    const column = byLayer.get(depth) ?? [];
    const widest = column.reduce((max, node) => Math.max(max, nodeBoxWidth(node)), 0);
    x += (widest || DEFAULT_NODE_WIDTH) + LAYOUT_GUTTER;
  }

  // Row y-offsets: stack each node below the cumulative height of the ones above
  // it in the same column, plus a gutter.
  const positionById = new Map<string, { x: number; y: number }>();
  for (const [depth, column] of byLayer) {
    let y = 0;
    for (const node of column) {
      positionById.set(node.id, { x: columnX.get(depth) ?? 0, y });
      y += nodeBoxHeight(node) + LAYOUT_GUTTER;
    }
  }

  return nodes.map((node) => ({
    ...node,
    position: positionById.get(node.id) ?? node.position,
  }));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface NodeSpec {
  ref: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface ConnectSpec {
  from_ref: string;
  to_ref: string;
  role?: string;
}

export interface BuildResult {
  graph: WorkflowGraph;
  warnings: string[];
  errors: string[];
}

function makeNode(
  id: string,
  type: string,
  dataOverrides: Record<string, unknown> = {},
): WorkflowNode {
  const { data, style } = createNodeData(type as StudioNodeType, dataOverrides);
  const node: WorkflowNode = { id, type, position: { x: 0, y: 0 }, data };
  if (style) {
    node.style = style;
    node.width = style.width;
    node.height = style.height;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Prompt presence
// ---------------------------------------------------------------------------
//
// A generator with no prompt — neither its own prompt text nor a wired prompt
// source — renders as an empty node the user cannot run. The agent has always
// been *told* to write prompts (prompts.ts), but nothing checked, so a dropped
// prompt landed silently on the canvas. These predicates are the check.

/** Generator types and the own-data field carrying their prompt. */
const PROMPT_FIELD_BY_GENERATOR: Record<string, string> = {
  nanoGen: 'positivePrompt',
  videoGen: 'prompt',
  veoDirector: 'prompt',
  veoFast: 'prompt',
  omniGen: 'prompt',
  hyperframesAgent: 'prompt',
};

const PROMPT_TARGET_HANDLES = new Set(['prompt', 'prompt-in']);

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

const hasWiredPrompt = (nodeId: string, edges: GraphEdgeLike[]): boolean =>
  edges.some(
    (edge) => edge.target === nodeId && PROMPT_TARGET_HANDLES.has(edge.targetHandle ?? ''),
  );

/**
 * True when this node needs a prompt to produce anything and has none.
 *
 * A generator is satisfied by either its own prompt field or a wired prompt
 * source; a `string` node is satisfied by its own `value` or by any incoming
 * edge (its text is produced upstream).
 */
export function nodeIsMissingPrompt(node: GraphNodeLike, edges: GraphEdgeLike[]): boolean {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const promptField = PROMPT_FIELD_BY_GENERATOR[node.type ?? ''];
  if (promptField) {
    return !hasText(data[promptField]) && !hasWiredPrompt(node.id, edges);
  }
  if (node.type === 'string') {
    return !hasText(data.value) && !edges.some((edge) => edge.target === node.id);
  }
  return false;
}

const missingPromptMessage = (node: GraphNodeLike): string =>
  node.type === 'string'
    ? `prompt node "${node.id}" has no text and nothing feeding it`
    : `${node.type} "${node.id}" has no prompt and no prompt input wired to it`;

export function buildWorkflowGraph(
  nodeSpecs: NodeSpec[],
  connectSpecs: ConnectSpec[] = [],
  opts: { metadata?: Record<string, unknown> } = {},
): BuildResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes: WorkflowNode[] = [];
  const seen = new Set<string>();

  for (const spec of nodeSpecs) {
    if (seen.has(spec.ref)) {
      errors.push(`duplicate node ref "${spec.ref}"`);
      continue;
    }
    if (!isStudioNodeType(spec.type)) {
      errors.push(`unknown node type "${spec.type}" for ref "${spec.ref}"`);
      continue;
    }
    seen.add(spec.ref);
    nodes.push(makeNode(spec.ref, spec.type, spec.data));
  }

  const edges: WorkflowEdge[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const spec of connectSpecs) {
    const from = nodeById.get(spec.from_ref);
    const to = nodeById.get(spec.to_ref);
    if (!from || !to) {
      errors.push(`connection references missing node: ${spec.from_ref} → ${spec.to_ref}`);
      continue;
    }
    const resolved = resolveConnection(from, to, { roleHint: spec.role, edges });
    if (!resolved.ok) {
      errors.push(resolved.reason);
      continue;
    }
    edges.push(makeEdge(from.id, resolved.sourceHandle, to.id, resolved.targetHandle));
  }

  for (const node of nodes) {
    if (nodeIsMissingPrompt(node, edges)) warnings.push(missingPromptMessage(node));
  }

  const graph: WorkflowGraph = { nodes: autoLayout(nodes, edges), edges };
  if (opts.metadata) graph.metadata = opts.metadata;
  return { graph, warnings, errors };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function lowestFreeY(nodes: WorkflowNode[]): number {
  if (nodes.length === 0) return 0;
  // A string/prompt node has no `height`; falling back to 0 (the old behaviour)
  // let incoming nodes land on top of it. Use the sane min-height fallback so the
  // merge always drops new work clear of existing nodes.
  const bottom = Math.max(...nodes.map((n) => n.position.y + nodeBoxHeight(n)));
  return bottom + LAYOUT_GUTTER;
}

/**
 * Fold `incoming` into `base` additively. A node the base already carries keeps
 * its position — the user arranged it — but takes the incoming data; anything
 * new is dropped below the base so it never lands on top of existing work.
 *
 * Additive is the only safe merge when a human may be editing the same canvas:
 * replacing the graph wholesale reads to the browser's realtime merge as a
 * remote deletion of everything omitted, and the user's work disappears.
 */
export function mergeGraphs(base: WorkflowGraph, incoming: WorkflowGraph): WorkflowGraph {
  const basePositions = new Map(base.nodes.map((n) => [n.id, n.position]));
  const offsetY = lowestFreeY(base.nodes);

  const nodes = new Map(base.nodes.map((n) => [n.id, n]));
  for (const node of incoming.nodes) {
    const existing = basePositions.get(node.id);
    nodes.set(node.id, {
      ...node,
      position: existing ?? { x: node.position.x, y: node.position.y + offsetY },
    });
  }

  const edges = new Map(base.edges.map((e) => [e.id, e]));
  for (const edge of incoming.edges) edges.set(edge.id, edge);

  const graph: WorkflowGraph = { nodes: [...nodes.values()], edges: [...edges.values()] };
  if (base.metadata || incoming.metadata) {
    graph.metadata = { ...(base.metadata ?? {}), ...(incoming.metadata ?? {}) };
  }
  return graph;
}

// ---------------------------------------------------------------------------
// Surgical edits
// ---------------------------------------------------------------------------

export interface AttachMediaInput {
  /** media.assets id, when the media came from the Library. Persisted on the node
   *  so the generation it feeds can be traced back to it. */
  assetId?: string;
  bucket: string;
  storagePath: string;
  fileName?: string;
  mediaKind: WorkflowMediaKind;
  referenceType?: string;
}

export type WorkflowEditOp =
  | { op: 'add_node'; ref: string; type: string; data?: Record<string, unknown> }
  | { op: 'remove_node'; id: string }
  | { op: 'update_node'; id: string; data: Record<string, unknown> }
  | { op: 'connect'; from: string; to: string; role?: string }
  | { op: 'disconnect'; from?: string; to?: string; targetHandle?: string }
  | { op: 'rewire'; from: string; to: string; role?: string }
  | { op: 'attach_media'; id: string; media: AttachMediaInput }
  | { op: 'detach_media'; id: string }
  | { op: 'rename'; id: string; label: string }
  | { op: 'set_timeline'; id: string; items: TimelineItemSpec[] };

export interface ApplyResult {
  graph: WorkflowGraph;
  errors: string[];
}

const REFERENCE_NODE_KIND: Record<string, WorkflowMediaKind> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
};

// `assetId` is part of the media, not decoration: it is the only durable link
// from a node back to the Library asset it holds, and register-canvas reads it
// off the persisted graph to answer "what did this generation come from". A
// detach that left it behind would credit the next generation to media the node
// no longer carries.
const MEDIA_DATA_KEYS = [
  'assetId',
  'sourcePath',
  'bucket',
  'sourceUrl',
  'fileName',
  'referenceType',
];

export function applyOps(graph: WorkflowGraph, ops: WorkflowEditOp[]): ApplyResult {
  let nodes: WorkflowNode[] = [...graph.nodes];
  let edges: WorkflowEdge[] = [...graph.edges];
  const errors: string[] = [];

  const replaceNode = (id: string, mutate: (node: WorkflowNode) => WorkflowNode): boolean => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index === -1) return false;
    nodes = nodes.map((n, i) => (i === index ? mutate({ ...n, data: { ...n.data } }) : n));
    return true;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'add_node': {
        if (nodes.some((n) => n.id === op.ref)) {
          errors.push(`node "${op.ref}" already exists`);
          break;
        }
        if (!isStudioNodeType(op.type)) {
          errors.push(`unknown node type "${op.type}"`);
          break;
        }
        nodes = [...nodes, makeNode(op.ref, op.type, op.data)];
        break;
      }
      case 'remove_node': {
        if (!nodes.some((n) => n.id === op.id)) {
          errors.push(`node "${op.id}" not found`);
          break;
        }
        nodes = nodes.filter((n) => n.id !== op.id);
        edges = edges.filter((e) => e.source !== op.id && e.target !== op.id);
        break;
      }
      case 'update_node': {
        // Timeline placements have their own validated op. Letting update_node
        // write `items` raw invites exactly one failure mode: an agent mimicking
        // the read-projection's compact strings, which renders three empty clips.
        const target = nodes.find((n) => n.id === op.id);
        if (target?.type === 'timelineEditor' && 'items' in op.data) {
          errors.push(`set "${op.id}" timeline items with the set_timeline op, not update_node`);
          break;
        }
        // add_node coerces via createNodeData; without this an update_node was the one
        // way an illegal enum-shaped config reached the node and sat there until Run.
        const coerced = target
          ? coerceNodeConfig(target.type as StudioNodeType, op.data, target.data ?? {})
          : { data: op.data, changes: [] };
        errors.push(...coerced.changes.map((change) => `node "${op.id}": ${change}`));
        if (!replaceNode(op.id, (n) => ({ ...n, data: { ...n.data, ...coerced.data } }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
      case 'rename': {
        if (!replaceNode(op.id, (n) => ({ ...n, data: { ...n.data, label: op.label } }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
      case 'connect': {
        const result = connectNodes(nodes, edges, op.from, op.to, op.role);
        if (!result.ok) errors.push(result.reason);
        else {
          edges = [...edges, result.edge];
        }
        break;
      }
      case 'rewire': {
        edges = edges.filter((e) => e.source !== op.from);
        const result = connectNodes(nodes, edges, op.from, op.to, op.role);
        if (!result.ok) errors.push(result.reason);
        else {
          edges = [...edges, result.edge];
        }
        break;
      }
      case 'disconnect': {
        if (op.from === undefined && op.to === undefined && op.targetHandle === undefined) {
          errors.push('disconnect requires at least one of from / to / targetHandle');
          break;
        }
        edges = edges.filter(
          (e) =>
            !(
              (op.from === undefined || e.source === op.from) &&
              (op.to === undefined || e.target === op.to) &&
              (op.targetHandle === undefined || e.targetHandle === op.targetHandle)
            ),
        );
        break;
      }
      case 'attach_media': {
        const node = nodes.find((n) => n.id === op.id);
        if (!node) {
          errors.push(`node "${op.id}" not found`);
          break;
        }
        const expected = REFERENCE_NODE_KIND[node.type];
        if (!expected) {
          errors.push(`node "${op.id}" (${node.type}) cannot hold an attached asset`);
          break;
        }
        if (expected !== op.media.mediaKind) {
          errors.push(`cannot attach ${op.media.mediaKind} to a ${node.type} node`);
          break;
        }
        replaceNode(op.id, (n) => ({
          ...n,
          data: {
            ...n.data,
            // Written even when undefined: attaching different media to a node
            // that already held a Library asset must not leave the old id behind.
            assetId: op.media.assetId,
            sourcePath: op.media.storagePath,
            bucket: op.media.bucket,
            fileName: op.media.fileName,
            ...(node.type === 'image'
              ? { referenceType: op.media.referenceType ?? 'default' }
              : {}),
          },
        }));
        break;
      }
      case 'detach_media': {
        if (!replaceNode(op.id, (n) => ({ ...n, data: dropKeys(n.data, MEDIA_DATA_KEYS) }))) {
          errors.push(`node "${op.id}" not found`);
        }
        break;
      }
      case 'set_timeline': {
        const node = nodes.find((n) => n.id === op.id);
        if (!node) {
          errors.push(`node "${op.id}" not found`);
          break;
        }
        if (node.type !== 'timelineEditor') {
          errors.push(`node "${op.id}" (${node.type}) has no timeline; only timelineEditor does`);
          break;
        }

        // Wiring a clip into the pool is what makes it placeable. An item naming a
        // node that is not connected to `media-in` renders nothing at all — and
        // renders nothing SILENTLY, which is the worst way for this to fail.
        const pooled = new Set(
          edges
            .filter((e) => e.target === op.id && isTimelineMediaHandle(e.targetHandle))
            .map((e) => e.source),
        );
        const orphans = op.items.filter((item) => !pooled.has(item.sourceNodeId));
        if (orphans.length > 0) {
          const names = [...new Set(orphans.map((o) => o.sourceNodeId))].join(', ');
          errors.push(
            `cannot place ${names} on "${op.id}": connect each clip to its ${TIMELINE_MEDIA_INPUT_HANDLE} handle first`,
          );
          break;
        }

        const items = [...op.items]
          .sort((a, b) => a.order - b.order)
          .map((item, index) => ({
            ...item,
            id: `ti:${op.id}:${index}:${item.sourceNodeId}`,
            order: index,
          }));
        // `committed: false` re-arms the manual gate: the human opens the editor,
        // reviews the cut the agent laid down, and presses Render & Continue.
        replaceNode(op.id, (n) => ({ ...n, data: { ...n.data, items, committed: false } }));
        break;
      }
    }
  }

  const graphOut: WorkflowGraph = { nodes, edges };
  if (graph.metadata) graphOut.metadata = graph.metadata;
  return { graph: graphOut, errors };
}

function connectNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  fromId: string,
  toId: string,
  role?: string,
): { ok: true; edge: WorkflowEdge } | { ok: false; reason: string } {
  const from = nodes.find((n) => n.id === fromId);
  const to = nodes.find((n) => n.id === toId);
  if (!from || !to)
    return { ok: false, reason: `connect references missing node: ${fromId} → ${toId}` };
  const resolved = resolveConnection(from, to, { roleHint: role, edges });
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return {
    ok: true,
    edge: makeEdge(from.id, resolved.sourceHandle, to.id, resolved.targetHandle),
  };
}

function dropKeys(data: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...data };
  for (const key of keys) delete next[key];
  return next;
}

// ---------------------------------------------------------------------------
// Whole-graph validation
// ---------------------------------------------------------------------------

export interface GraphIssue {
  code: 'unknown_node_type' | 'dangling_edge' | 'invalid_connection' | 'missing_prompt';
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: GraphIssue[];
}

export function validateWorkflowGraph(graph: {
  nodes: GraphNodeLike[];
  edges: GraphEdgeLike[];
}): ValidationResult {
  const issues: GraphIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const node of graph.nodes) {
    if (!node.type || !(STUDIO_NODE_TYPES as readonly string[]).includes(node.type)) {
      issues.push({
        code: 'unknown_node_type',
        message: `unknown node type "${node.type}"`,
        nodeId: node.id,
      });
      continue;
    }
    if (nodeIsMissingPrompt(node, graph.edges)) {
      issues.push({
        code: 'missing_prompt',
        message: missingPromptMessage(node),
        nodeId: node.id,
      });
    }
  }

  graph.edges.forEach((edge, index) => {
    const edgeId = edge.id ?? `edge[${index}]`;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        code: 'dangling_edge',
        message: `edge ${edgeId} references a missing node`,
        edgeId,
      });
      return;
    }
    const others = graph.edges.filter((e) => e !== edge);
    if (!isValidConnection(edge, others, graph.nodes)) {
      issues.push({
        code: 'invalid_connection',
        message: `edge ${edgeId} (${edge.source} → ${edge.target}.${edge.targetHandle ?? '?'}) is not a valid connection`,
        edgeId,
      });
    }
  });

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Wire schemas
// ---------------------------------------------------------------------------
//
// The specs an agent emits. Defined here, next to the functions that consume
// them, so the MCP `studio_workflow` tool and the in-app Canvas Composer share one
// action space instead of each hand-rolling a slightly different zod union.

const dataRecordSchema = z.record(z.string(), z.unknown());

export const nodeSpecSchema = z
  .object({
    ref: z.string().min(1).describe('Your name for this node; also becomes its id.'),
    type: z.string().min(1).describe('One of the canvas node types.'),
    data: dataRecordSchema.optional().describe('Config overrides, e.g. { model, positivePrompt }.'),
  })
  .strict();

export const connectSpecSchema = z
  .object({
    from_ref: z.string().min(1),
    to_ref: z.string().min(1),
    role: z
      .string()
      .optional()
      .describe('What the input is for — "prompt", "negative", "first-frame", "ref-images".'),
  })
  .strict();

export const attachMediaSchema = z
  .object({
    assetId: z
      .string()
      .optional()
      .describe('media.assets id when the media comes from the Library; keeps the usage trail.'),
    bucket: z.string(),
    storagePath: z.string(),
    fileName: z.string().optional(),
    mediaKind: z.enum(['image', 'video', 'audio', 'document']),
    referenceType: z.string().optional(),
  })
  .strict();

export const workflowEditOpSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('add_node'),
      ref: z.string(),
      type: z.string(),
      data: dataRecordSchema.optional(),
    })
    .strict(),
  z.object({ op: z.literal('remove_node'), id: z.string() }).strict(),
  z.object({ op: z.literal('update_node'), id: z.string(), data: dataRecordSchema }).strict(),
  z
    .object({
      op: z.literal('connect'),
      from: z.string(),
      to: z.string(),
      role: z.string().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('disconnect'),
      from: z.string().optional(),
      to: z.string().optional(),
      targetHandle: z.string().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('rewire'),
      from: z.string(),
      to: z.string(),
      role: z.string().optional(),
    })
    .strict(),
  z.object({ op: z.literal('attach_media'), id: z.string(), media: attachMediaSchema }).strict(),
  z.object({ op: z.literal('detach_media'), id: z.string() }).strict(),
  z.object({ op: z.literal('rename'), id: z.string(), label: z.string() }).strict(),
  z
    .object({
      op: z.literal('set_timeline'),
      id: z.string(),
      items: z.array(timelineItemSpecSchema).max(40),
    })
    .strict(),
]);
